import {describe, expect, it} from 'vitest';
import {createGitHubIssueUrl} from './github_issue.ts';

const baseUrl = 'https://github.com/xmx-emm/mxtools/issues/new';

describe('createGitHubIssueUrl', () => {
  it('preserves a body that fits in the encoded URL limit', () => {
    const url = createGitHubIssueUrl({
      baseUrl,
      title: '[Feedback] Example',
      body: 'Short description',
      truncatedNotice: '\n\n...(logs truncated)',
      maxUrlLength: 500,
    });

    const params = new URL(url).searchParams;
    expect(params.get('title')).toBe('[Feedback] Example');
    expect(params.get('body')).toBe('Short description');
  });

  it('caps the final encoded URL without splitting Unicode characters', () => {
    const notice = '\n\n...(日志已截断)';
    const url = createGitHubIssueUrl({
      baseUrl,
      title: '[反馈] URL 过长',
      body: '日志😀中文'.repeat(1000),
      truncatedNotice: notice,
      maxUrlLength: 600,
    });

    const body = new URL(url).searchParams.get('body');
    expect(url.length).toBeLessThanOrEqual(600);
    expect(body?.endsWith(notice)).toBe(true);
    expect(body).not.toContain('\uFFFD');
  });
});
