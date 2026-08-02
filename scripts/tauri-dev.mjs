import {spawn, spawnSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const DEV_PORT = 14200;
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

function queryWindowsProcesses() {
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

function queryDevPortOwners() {
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
    if (result.error || result.status !== 0) {
        const reason = result.stderr?.trim() || result.error?.message || 'unknown error';
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
    const staleIds = selectStaleProjectProcessIds(
        processes,
        PROJECT_ROOT,
        process.pid,
    );
    const staleIdSet = new Set(staleIds);
    const foreignPortOwners = queryDevPortOwners().filter(
        (id) => !staleIdSet.has(id),
    );

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
