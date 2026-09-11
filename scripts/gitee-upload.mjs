import {execFile} from 'node:child_process';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Buffer} from 'node:buffer';

function curl(args, config) {
  return new Promise(resolve => {
    const child = execFile(process.platform === 'win32' ? 'curl.exe' : 'curl', args,
      {timeout: 930_000, maxBuffer: 2_000_000, windowsHide: true},
      (error, stdout) => resolve({code: error ? error.code : 0, stdout}));
    // Credentials stay off command lines, disk and logs. Never enable curl tracing.
    child.stdin.on('error', () => {});
    child.stdin.end(config);
  });
}

export async function uploadGiteeAttachment(url, form, token, runCurl = curl) {
  if (!/^https:\/\/gitee\.com\/api\/v5\/repos\/mengxin_code\/mxtools\/releases\/\d+\/attach_files$/.test(url)) {
    throw new Error('Unexpected Gitee upload endpoint');
  }
  if (!token || /[\r\n]/.test(token)) throw new Error('Missing or invalid Gitee token');
  const file = form.get('file');
  if (!file?.name || /[\r\n]/.test(file.name)) throw new Error('Missing upload file');
  const dir = await mkdtemp(path.join(tmpdir(), 'mxtools-gitee-upload-'));
  try {
    const filename = path.join(dir, 'attachment.bin');
    await writeFile(filename, Buffer.from(await file.arrayBuffer()));
    const escape = value => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    const args = ['--config', '-', '--silent', '--http1.1', '--proto', '=https',
      '--connect-timeout', '20', '--max-time', '900', '--speed-limit', '1024', '--speed-time', '30',
      '--header', 'Accept: application/json', '--header', 'Expect:',
      '--form', `file=@"${escape(filename)}";filename="${escape(file.name)}"`,
      '--write-out', '\n%{http_code} %{size_upload}', url];
    const result = await runCurl(args, `header = "Authorization: Bearer ${escape(token)}"\n`);
    const boundary = result.stdout.lastIndexOf('\n');
    const metrics = result.stdout.slice(boundary + 1).match(/^(\d{3}) (\d+)$/);
    const status = metrics ? Number(metrics[1]) : 0;
    if (result.code !== 0 || status < 200 || status >= 300) {
      const code = Number.isInteger(result.code) ? result.code : 'unavailable';
      throw new Error(`Gitee upload failed (curl ${code}, HTTP ${status}, sent ${metrics?.[2] || 0} bytes); rerun to resume`);
    }
    try { return JSON.parse(result.stdout.slice(0, boundary)); }
    catch { throw new Error('Gitee upload returned an invalid response; rerun to discover any accepted attachment'); }
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}
