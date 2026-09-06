import type {DownloadJob} from '@/ipc/commands.ts';

export function downloadIndicator(jobs: readonly DownloadJob[]) {
  const active = jobs.find(job => !['queued', 'paused', 'done', 'error', 'cancelled'].includes(job.status));
  if (active) {
    const known = active.status === 'downloading' && active.progress.progressKnown === true
      && Number.isFinite(active.progress.percent);
    return {state: 'active', percent: known ? Math.min(100, Math.max(0, active.progress.percent)) : null};
  }
  if (jobs.some(job => job.status === 'queued')) return {state: 'queued', percent: null};
  if (jobs.some(job => job.status === 'paused')) return {state: 'paused', percent: null};
  if (jobs.some(job => job.status === 'error')) return {state: 'error', percent: null};
  return {state: 'idle', percent: null};
}
