import {access, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';

const run = promisify(execFile);
const root = process.cwd();
const tauriDir = path.join(root, 'src-tauri');
const releaseDir = path.join(tauriDir, 'target', 'release');
const conf = JSON.parse(await readFile(
  path.join(tauriDir, 'tauri.conf.json'),
  'utf8',
));
const {productName, version} = conf;
const defaultOutput = path.join(
  releaseDir,
  'bundle',
  'nsis',
  `${productName}_${version}_x64-portable.exe`,
);
const scriptPath = path.join(tauriDir, 'target', 'portable-sfx.nsi');

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (index >= 0 && (!value || value.startsWith('--'))) {
    throw new Error(`Missing value after ${name}`);
  }
  return value;
}

const source = path.resolve(root, argumentValue('--source') ?? path.join(releaseDir, `${productName}.exe`));
const output = path.resolve(root, argumentValue('--output') ?? defaultOutput);
const cacheDirectoryArgument = argumentValue('--cache-dir');
const dictionarySizeMb = Number(argumentValue('--dict-mb') ?? 8);
if (![1, 2, 4, 8, 16, 32, 64].includes(dictionarySizeMb)) {
  throw new Error(`Unsupported LZMA dictionary size: ${dictionarySizeMb} MB`);
}

function nsisString(value) {
  if (value.includes('\r') || value.includes('\n')) {
    throw new Error(`NSIS path contains a newline: ${value}`);
  }
  return value.replaceAll('$', '$$').replaceAll('"', '$\\"');
}

async function findMakensis() {
  const candidates = [
    process.env.MAKENSIS_EXE,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'tauri', 'NSIS', 'makensis.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'tauri', 'NSIS', 'Bin', 'makensis.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'NSIS', 'makensis.exe'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'NSIS', 'makensis.exe'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next standard Tauri or NSIS location.
    }
  }

  throw new Error('makensis.exe not found; run the Tauri NSIS build first or set MAKENSIS_EXE');
}

await access(source);
await mkdir(path.dirname(output), {recursive: true});
await rm(output, {force: true});
const sourceContents = await readFile(source);
const sourceBytes = sourceContents.byteLength;
const sourceHash = createHash('sha256').update(sourceContents).digest('hex');
const cacheDirectory = cacheDirectoryArgument
  ? nsisString(path.resolve(root, cacheDirectoryArgument))
  : `$LOCALAPPDATA\\mxtools\\portable-cache\\${nsisString(version)}`;

const script = `
!include "FileFunc.nsh"

Unicode true
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
CRCCheck force
SetCompress force
SetCompressor /FINAL /SOLID lzma
SetCompressorDictSize ${dictionarySizeMb}
SetDatablockOptimize on

Name "${nsisString(`${productName} ${version} Portable`)}"
OutFile "${nsisString(output)}"
Icon "${nsisString(path.join(tauriDir, 'icons', 'icon.ico'))}"

Var CacheDir
Var CacheHash
Var CacheSize
Var ChildArgs

Section
  SetShellVarContext current
  StrCpy $CacheDir "${cacheDirectory}"
  IfFileExists "$CacheDir\\mxtools-portable.exe" 0 extract
  FileOpen $0 "$CacheDir\\mxtools-portable.exe" r
  IfErrors extract
  FileSeek $0 0 END $CacheSize
  FileClose $0
  IntCmp $CacheSize ${sourceBytes} 0 extract extract
  IfFileExists "$CacheDir\\source.sha256" 0 extract
  FileOpen $0 "$CacheDir\\source.sha256" r
  FileRead $0 $CacheHash
  FileClose $0
  StrCmp $CacheHash "${sourceHash}" launch

extract:
  ClearErrors
  CreateDirectory "$CacheDir"
  IfErrors cache_error
  SetOutPath "$CacheDir"
  IfErrors cache_error
  Delete "$CacheDir\\mxtools-portable.tmp"
  ClearErrors
  File /oname=mxtools-portable.tmp "${nsisString(source)}"
  IfErrors cache_error
  Delete "$CacheDir\\mxtools-portable.exe"
  ClearErrors
  Rename "$CacheDir\\mxtools-portable.tmp" "$CacheDir\\mxtools-portable.exe"
  IfErrors cache_error
  FileOpen $0 "$CacheDir\\source.sha256" w
  IfErrors cache_error
  FileWrite $0 "${sourceHash}"
  FileClose $0

launch:
  \${GetParameters} $ChildArgs
  SetOutPath "$EXEDIR"
  ClearErrors
  ExecWait '"$CacheDir\\mxtools-portable.exe" $ChildArgs' $0
  IfErrors 0 +2
    StrCpy $0 1
  SetErrorLevel $0
  Quit

cache_error:
  MessageBox MB_ICONSTOP|MB_OK "Unable to prepare the portable cache at:$\\r$\\n$CacheDir"
  SetErrorLevel 1
SectionEnd
`.trimStart();

// UTF-8 BOM lets NSIS handle non-ASCII workspace paths deterministically.
await writeFile(scriptPath, `\uFEFF${script}`, 'utf8');
const makensis = await findMakensis();
await run(makensis, ['/V2', scriptPath], {maxBuffer: 10 * 1024 * 1024});

const bytes = (await stat(output)).size;
console.log(`缓存式自解压便携版已生成 (${bytes} bytes, LZMA ${dictionarySizeMb} MiB): ${output}`);
