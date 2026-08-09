import fs from 'node:fs';
import http from 'node:http';
import {spawn, spawnSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const DEV_PORT = 14200;
const DEV_SERVER_PROOF_FILES = [
    'package.json',
    'README.md',
    'src-tauri/tauri.conf.json',
];
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const TAURI_CLI = path.join(
    PROJECT_ROOT,
    'node_modules',
    '@tauri-apps',
    'cli',
    'tauri.js',
);

const normalizeWindowsText = (value) => String(value ?? '')
    .replaceAll('/', '\\')
    .toLowerCase();

const processId = (entry) => Number(entry.ProcessId ?? entry.processId);
const parentProcessId = (entry) => Number(
    entry.ParentProcessId ?? entry.parentProcessId,
);

const processName = (entry) => normalizeWindowsText(
    entry.Name ?? entry.name,
);

const executablePath = (entry) => normalizeWindowsText(
    entry.ExecutablePath ?? entry.executablePath,
);

const commandLine = (entry) => normalizeWindowsText(
    entry.CommandLine ?? entry.commandLine,
);

const isDevChainProcess = (entry) => new Set([
    'cargo.exe',
    'cmd.exe',
    'mxtools.exe',
    'node.exe',
    'tauri.exe',
]).has(processName(entry));

/**
 * Select only stale processes whose executable or command line proves that
 * they belong to this repository. Ancestors and descendants are included only
 * after that proof, while the currently running npm process tree is protected.
 */
export function selectStaleProjectProcessIds(
    processes,
    projectRoot,
    currentProcessId,
) {
    const root = normalizeWindowsText(path.resolve(projectRoot)).replace(/\\+$/, '');
    const debugExecutable = `${root}\\src-tauri\\target\\debug\\mxtools.exe`;
    const projectMarkers = [
        `${root}\\node_modules\\@tauri-apps\\cli\\`,
        `${root}\\node_modules\\vite\\`,
        // npm may launch Vite through the local .bin shim. The command line
        // then contains `node_modules\\.bin\\..\\vite`, so the direct Vite
        // marker above is not present even though the process is ours.
        `${root}\\node_modules\\.bin\\`,
        `${root}\\scripts\\tauri-dev.mjs`,
        debugExecutable,
    ];
    const byId = new Map(
        processes
            .map((entry) => [processId(entry), entry])
            .filter(([id]) => Number.isInteger(id) && id > 0),
    );

    const protectedIds = new Set();
    let protectedId = Number(currentProcessId);
    while (byId.has(protectedId) && !protectedIds.has(protectedId)) {
        protectedIds.add(protectedId);
        protectedId = parentProcessId(byId.get(protectedId));
    }

    const selectedIds = new Set();
    for (const [id, entry] of byId) {
        if (protectedIds.has(id) || !isDevChainProcess(entry)) {
            continue;
        }

        const executable = executablePath(entry);
        const command = commandLine(entry);
        const isProjectProcess = executable === debugExecutable
            || projectMarkers.some((marker) => (
                executable.startsWith(marker) || command.includes(marker)
            ));
        if (isProjectProcess) {
            selectedIds.add(id);
        }
    }

    // A proven project process makes its contiguous Node/Tauri/Cargo/cmd
    // ancestors part of the same stale development invocation.
    for (const seedId of [...selectedIds]) {
        let ancestorId = parentProcessId(byId.get(seedId));
        while (
            byId.has(ancestorId)
            && !protectedIds.has(ancestorId)
            && isDevChainProcess(byId.get(ancestorId))
        ) {
            selectedIds.add(ancestorId);
            ancestorId = parentProcessId(byId.get(ancestorId));
        }
    }

    // Include descendants such as cargo and the debug executable even when
    // their own command lines do not contain the repository path.
    let changed = true;
    while (changed) {
        changed = false;
        for (const [id, entry] of byId) {
            if (
                !selectedIds.has(id)
                && !protectedIds.has(id)
                && selectedIds.has(parentProcessId(entry))
                && isDevChainProcess(entry)
            ) {
                selectedIds.add(id);
                changed = true;
            }
        }
    }

    return [...selectedIds].sort((left, right) => left - right);
}

function runPowerShell(source, extraEnv = {}) {
    return spawnSync(
        'powershell.exe',
        [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            source,
        ],
        {
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
            env: {...process.env, ...extraEnv},
            maxBuffer: 16 * 1024 * 1024,
            windowsHide: true,
        },
    );
}

function parsePowerShellJson(result, description) {
    if (result.error || result.status !== 0) {
        const reason = result.stderr?.trim() || result.error?.message || 'unknown error';
        throw new Error(`${description}: ${reason}`);
    }

    const output = result.stdout.trim();
    return output ? JSON.parse(output) : [];
}

function queryWindowsProcessesViaWmi() {
    const result = runPowerShell(`
$ErrorActionPreference = 'Stop'
@(
    Get-CimInstance Win32_Process |
        Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine
) | ConvertTo-Json -Compress
`);
    const value = parsePowerShellJson(result, '无法读取 Windows 进程信息');
    return Array.isArray(value) ? value : [value];
}

function queryWindowsProcesses() {
    try {
        return queryWindowsProcessesViaWmi();
    } catch (error) {
        // Some Windows sessions deny WMI access to elevated processes. Keep
        // the launcher usable with the metadata Get-Process can still expose;
        // command-line ownership is confirmed by the loopback Vite probe.
        const fallback = runPowerShell(`
$ErrorActionPreference = 'SilentlyContinue'
@(
    Get-Process |
        Select-Object Id, ProcessName, Path |
        ForEach-Object {
            $name = [string]$_.ProcessName
            if ($name -notmatch '\\.exe$') {
                $name = "$name.exe"
            }
            [pscustomobject]@{
                ProcessId = $_.Id
                ParentProcessId = 0
                Name = $name
                ExecutablePath = $_.Path
                CommandLine = ''
            }
        }
) | ConvertTo-Json -Compress
`);
        if (!fallback.error && fallback.status === 0) {
            try {
                const value = parsePowerShellJson(fallback, '无法读取 Windows 进程信息');
                console.warn('[tauri-dev] 无法读取完整 Windows 进程信息，已切换到保守进程列表');
                return Array.isArray(value) ? value : [value];
            } catch {
                // The caller will conservatively treat any port owner as foreign.
            }
        }

        console.warn(`[tauri-dev] 无法读取 Windows 进程信息: ${error.message}`);
        return [];
    }
}

function queryDevPortOwnersViaNet() {
    const result = runPowerShell(`
@(
    Get-NetTCPConnection -LocalPort ${DEV_PORT} -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
) | ConvertTo-Json -Compress
`);
    const value = parsePowerShellJson(result, `无法检查端口 ${DEV_PORT}`);
    return (Array.isArray(value) ? value : [value])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0);
}

export function parseNetstatPortOwners(output, port = DEV_PORT) {
    const pattern = new RegExp(
        `^\\s*TCP\\s+\\S+:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`,
        'i',
    );
    return [...new Set(
        String(output ?? '')
            .split(/\r?\n/)
            .map((line) => line.match(pattern)?.[1])
            .filter(Boolean)
            .map(Number),
    )];
}

function queryDevPortOwners() {
    let owners = [];
    let queryError;
    try {
        owners = queryDevPortOwnersViaNet();
    } catch (error) {
        queryError = error;
        // Fall through to netstat, which remains available in restricted
        // sessions where Get-NetTCPConnection hides elevated listeners.
    }
    if (owners.length > 0) {
        return owners;
    }

    const fallback = runPowerShell('netstat -ano -p tcp');
    if (!fallback.error && fallback.status === 0) {
        return parseNetstatPortOwners(fallback.stdout);
    }
    if (queryError) {
        throw queryError;
    }
    return owners;
}

function readLocalDevFile(relativePath) {
    const localPath = path.join(PROJECT_ROOT, relativePath);
    let expected;
    try {
        expected = fs.readFileSync(localPath, 'utf8');
    } catch {
        return Promise.resolve(false);
    }

    const requestPath = encodeURI(
        `/@fs/${localPath.replaceAll('\\', '/')}`,
    );
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (!settled) {
                settled = true;
                resolve(value);
            }
        };
        const request = http.get({
            hostname: '127.0.0.1',
            port: DEV_PORT,
            path: requestPath,
            headers: {Connection: 'close'},
        }, (response) => {
            if (response.statusCode !== 200) {
                response.resume();
                finish(false);
                return;
            }

            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                body += chunk;
                if (body.length > expected.length + 4096) {
                    request.destroy();
                    finish(false);
                }
            });
            response.on('end', () => finish(body === expected));
        });
        request.setTimeout(1000, () => {
            request.destroy();
            finish(false);
        });
        request.on('error', () => finish(false));
    });
}

async function isCurrentProjectDevServer() {
    for (const relativePath of DEV_SERVER_PROOF_FILES) {
        if (!await readLocalDevFile(relativePath)) {
            return false;
        }
    }
    return true;
}

function stopProcesses(processIds) {
    if (processIds.length === 0) {
        return;
    }

    const result = runPowerShell(`
$ErrorActionPreference = 'Stop'
$ids = @($env:MXTOOLS_STALE_PROCESS_IDS -split ',' | ForEach-Object { [int]$_ })
foreach ($processId in $ids) {
    Stop-Process -Id $processId -ErrorAction SilentlyContinue
}
`, {
        MXTOOLS_STALE_PROCESS_IDS: processIds.join(','),
    });
    if (result.error) {
        const reason = result.stderr?.trim() || result.error?.message || 'unknown error';
        throw new Error(`无法停止本项目的残留开发进程: ${reason}`);
    }

    // Stopping a parent cmd/node process can make PowerShell report a
    // non-zero status even after every target has exited. The port check is
    // the authoritative result; only fail when the listener is still present.
    if (result.status !== 0 && queryDevPortOwners().length > 0) {
        const reason = result.stderr?.trim() || `exit code ${result.status}`;
        throw new Error(`无法停止本项目的残留开发进程: ${reason}`);
    }
}

const delay = (milliseconds) => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
});

async function waitForDevPortRelease(timeoutMilliseconds = 5000) {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
        if (queryDevPortOwners().length === 0) {
            return;
        }
        await delay(100);
    }
    throw new Error(`端口 ${DEV_PORT} 在清理后仍未释放`);
}

function launchTauri() {
    const child = spawn(process.execPath, [TAURI_CLI, 'dev'], {
        cwd: PROJECT_ROOT,
        env: process.env,
        stdio: 'inherit',
        windowsHide: false,
    });

    child.on('error', (error) => {
        console.error(`[tauri-dev] 无法启动 Tauri CLI: ${error.message}`);
        process.exitCode = 1;
    });
    child.on('exit', (code, signal) => {
        if (signal) {
            console.error(`[tauri-dev] Tauri 因信号 ${signal} 退出`);
            process.exitCode = 1;
            return;
        }
        process.exitCode = code ?? 1;
    });
}

async function main() {
    if (process.platform !== 'win32') {
        launchTauri();
        return;
    }

    const processes = queryWindowsProcesses();
    let staleIds = selectStaleProjectProcessIds(
        processes,
        PROJECT_ROOT,
        process.pid,
    );
    const portOwners = queryDevPortOwners();
    let staleIdSet = new Set(staleIds);
    let foreignPortOwners = portOwners.filter(
        (id) => !staleIdSet.has(id),
    );

    // If WMI hid the command line, prove a single listener is this project's
    // Vite server from loopback-served project files before treating it as
    // stale. Multiple listeners remain unresolved and are never auto-ended.
    if (
        foreignPortOwners.length === 1
        && foreignPortOwners[0] !== process.pid
        && await isCurrentProjectDevServer()
    ) {
        staleIds = [...new Set([...staleIds, foreignPortOwners[0]])];
        staleIdSet = new Set(staleIds);
        foreignPortOwners = portOwners.filter(
            (id) => !staleIdSet.has(id),
        );
        console.log(
            `[tauri-dev] 已通过本项目 Vite 文件校验确认端口 ${DEV_PORT} 的残留进程: ${staleIds.at(-1)}`,
        );
    }

    if (foreignPortOwners.length > 0) {
        throw new Error(
            `端口 ${DEV_PORT} 被无法确认属于当前项目的进程占用（PID: ${foreignPortOwners.join(', ')}），已拒绝自动结束它`,
        );
    }

    if (staleIds.length > 0) {
        console.log(`[tauri-dev] 正在清理本项目的残留开发进程: ${staleIds.join(', ')}`);
        stopProcesses(staleIds);
        await waitForDevPortRelease();
    }

    console.log(`[tauri-dev] 端口 ${DEV_PORT} 可用，正在启动 Tauri...`);
    launchTauri();
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
    main().catch((error) => {
        console.error(`[tauri-dev] ${error.message}`);
        process.exitCode = 1;
    });
}
