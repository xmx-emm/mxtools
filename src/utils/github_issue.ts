export const MAX_GITHUB_ISSUE_URL_LENGTH = 6000;

type GitHubIssueUrlOptions = {
  baseUrl: string;
  title: string;
  body: string;
  truncatedNotice: string;
  maxUrlLength?: number;
};

function encodeIssueUrl(baseUrl: string, title: string, body: string): string {
  const params = new URLSearchParams({title, body});
  return `${baseUrl}?${params.toString()}`;
}

export function createGitHubIssueUrl({
  baseUrl,
  title,
  body,
  truncatedNotice,
  maxUrlLength = MAX_GITHUB_ISSUE_URL_LENGTH,
}: GitHubIssueUrlOptions): string {
  const fullUrl = encodeIssueUrl(baseUrl, title, body);
  if (fullUrl.length <= maxUrlLength) return fullUrl;

  const bodyCharacters = Array.from(body);
  let low = 0;
  let high = bodyCharacters.length;
  let bestUrl = encodeIssueUrl(baseUrl, title, truncatedNotice);

  if (bestUrl.length > maxUrlLength) {
    throw new Error('GitHub Issue URL limit is too small for the required fields');
  }

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidateBody = bodyCharacters.slice(0, middle).join('') + truncatedNotice;
    const candidateUrl = encodeIssueUrl(baseUrl, title, candidateBody);

    if (candidateUrl.length <= maxUrlLength) {
      bestUrl = candidateUrl;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return bestUrl;
}
