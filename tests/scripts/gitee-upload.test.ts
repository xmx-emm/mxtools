import {describe, expect, it} from 'vitest';
import {readFile, access} from 'node:fs/promises';
// @ts-expect-error release automation intentionally remains dependency-free JavaScript
import {uploadGiteeAttachment} from '../../scripts/gitee-upload.mjs';

const url = 'https://gitee.com/api/v5/repos/mengxin_code/mxtools/releases/17/attach_files';
const form = () => {
  const data = new FormData();
  data.set('file', new Blob(['installer bytes']), 'MxTools_setup.exe');
  return data;
};

describe('Gitee multipart upload transport', () => {
  it('preserves file bytes, sends credentials through stdin only and removes the temporary file', async () => {
    let temporaryFile = '';
    const runCurl = async (args: string[], config: string) => {
      expect(args.join(' ')).not.toContain('secret-token');
      expect(config).toBe('header = "Authorization: Bearer secret-token"\n');
      const value = args[args.indexOf('--form') + 1];
      temporaryFile = value.match(/^file=@"(.*?)";/)![1].replaceAll('\\\\', '\\');
      expect(await readFile(temporaryFile, 'utf8')).toBe('installer bytes');
      expect(value).toContain('filename="MxTools_setup.exe"');
      expect(args).not.toContain('--location');
      return {code: 0, stdout: '{"id":23}\n201 123'};
    };
    expect(await uploadGiteeAttachment(url, form(), 'secret-token', runCurl)).toEqual({id: 23});
    await expect(access(temporaryFile)).rejects.toThrow();
  });

  it('reports bounded diagnostics without exposing a remote error body', async () => {
    await expect(uploadGiteeAttachment(url, form(), 'secret-token', async () =>
      ({code: 28, stdout: 'secret-token\n000 123'}))).rejects.toThrow('curl 28, HTTP 0, sent 123 bytes');
    await expect(uploadGiteeAttachment('https://other.test/upload', form(), 'secret-token')).rejects.toThrow('endpoint');
  });
});
