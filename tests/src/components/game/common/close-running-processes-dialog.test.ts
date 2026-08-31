import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../../../../src/components/game/common/CloseRunningProcessesDialog.vue', import.meta.url)),
  'utf8',
);

describe('close running processes dialog contract', () => {
  it('uses process-aware singular and plural copy', () => {
    expect(source).toContain("props.processes.length > 1");
    expect(source).toContain("t('apex.closeProcesses.multipleTitle'");
    expect(source).toContain("t('apex.closeProcesses.singleTitle'");
    expect(source).toContain("t('apex.closeProcesses.multipleMessage'");
    expect(source).toContain("t('apex.closeProcesses.singleMessage'");
    expect(source).toContain("t('apex.closeProcesses.forceCloseAll')");
    expect(source).toContain("t('apex.forceClose')");
  });

  it('allows long titles and messages to wrap', () => {
    expect(source).toMatch(/\.close-processes-card :deep\(\.v-card-title\)[^{]*\{[^}]*white-space: normal;/s);
    expect(source).toMatch(/\.close-processes-message\s*\{[^}]*white-space: normal;/s);
  });

  it('stays closed at startup until a workflow supplies detected processes', () => {
    expect(source).toContain(
      'computed(() => props.modelValue && props.processes.length > 0)',
    );
    expect(source).toContain(':model-value="isDialogOpen"');
    expect(source).toContain("if (!value) emit('update:modelValue', false)");
    expect(source).not.toContain("@update:model-value=\"emit('update:modelValue', $event)\"");
  });
});
