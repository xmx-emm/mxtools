import {spawnSync} from 'node:child_process';
import process from 'node:process';
import {fileURLToPath, URL} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const build = spawnSync(process.platform === 'win32' ? 'cargo.exe' : 'cargo', [
  'test', '--lib', '--no-run', '--message-format=json-render-diagnostics',
], {
  cwd: path.join(root, 'src-tauri'), encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true, maxBuffer: 32 * 1024 * 1024,
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
const executable = build.stdout.split(/\r?\n/).filter(line => line.startsWith('{'))
  .map(line => JSON.parse(line))
  .find(message => message.reason === 'compiler-artifact'
    && message.target?.name === 'mxtools_lib' && message.profile?.test && message.executable)
  ?.executable;
if (!executable) throw new Error('Cargo did not return the Apex native test executable');

// Finish building before launching the bridge: Windows cannot relink a test
// executable while Vitest is running it.
const tests = spawnSync(process.execPath, [
  path.join(root, 'node_modules/vitest/vitest.mjs'), 'run',
  'tests/src/stores/game/apex/quick_preset_video_native.test.ts',
  'tests/src/stores/game/apex/reset_preset_native.test.ts',
], {
  cwd: root, env: {...process.env, MXTOOLS_APEX_VIDEO_TEST_EXE: executable},
  stdio: 'inherit', windowsHide: true,
});
if (tests.error) throw tests.error;
process.exit(tests.status ?? 1);
