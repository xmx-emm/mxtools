import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {mdiPathByName} from '@/icons/mdi-icons.ts';

const read = (path: string) => readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');
const navigation = read('src/components/Navigation.vue');
const popover = read('src/components/downloads/DownloadQueuePopover.vue');
const list = read('src/components/downloads/DownloadJobList.vue');
const page = read('src/pages/DownloadsPage.vue');

describe('Download queue popover contract', () => {
  it('opens a connected overlay instead of routing from the navigation entry', () => {
    expect(navigation).toContain('v-model="downloadPopoverOpen"');
    expect(navigation).toContain('location="end bottom"');
    expect(navigation).toContain(':close-on-content-click="false"');
    expect(navigation).not.toContain('to="/downloads"');
    expect(navigation).toContain("watch(() => route.fullPath, () => { downloadPopoverOpen.value = false; });");
    expect(popover).toContain("router.push('/downloads')");
    expect(mdiPathByName['mdi-arrow-expand']).toBeTruthy();
  });

  it('shows all queued and finished jobs within a bounded scrollable panel', () => {
    expect(popover).toContain('queuedJobs.length');
    expect(popover).toContain('finishedJobs.length');
    expect(popover).not.toContain('.slice(');
    expect(popover).toContain('height: min(440px, calc(100vh - 80px))');
    expect(popover).toContain('overflow-y: auto');
    expect(popover).toContain('downloads.emptyQueue');
    expect(popover).toContain('downloads.closePopover');
  });

  it('shares task controls and active-launcher stop confirmations with the full page', () => {
    expect(popover).toContain('<DownloadJobList v-else :jobs="jobs" compact/>');
    expect(page).toContain('<DownloadJobList :jobs="jobs"/>');
    expect(popover).not.toContain('downloads.control(');
    expect(list).toContain('v-model="confirmOpen"');
    expect(list).toContain("!['queued', 'paused'].includes(job.status)");
    expect(list).toContain("['applying', 'restoringLanguage', 'stopping'].includes(job.status)");
    expect(list).toContain("t('downloads.stopHint')");
    expect(list).toContain('catch (error) { showError(error); }');
  });

  it('uses registered icons throughout the affected family', () => {
    for (const source of [popover, list, page]) {
      for (const name of source.match(/mdi-[a-z0-9-]+/g) ?? []) {
        expect(mdiPathByName[name], name).toBeTruthy();
      }
    }
  });
});
