import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const source = readFileSync(fileURLToPath(new URL(
  './ApexSemiAutomaticDownloadLanguage.vue',
  import.meta.url,
)), 'utf8');

describe('Apex Miles download clipboard contract', () => {
  it('binds copied feedback to the command that was actually copied', () => {
    expect(source).toContain('const copied_command = ref<string | null>(null);');
    expect(source).toContain('const command = apex_store.download_language_depot_command;');
    expect(source).toContain('await writeText(command);');
    expect(source).toContain('copied_command.value = command;');
  });

  it('hides stale copied feedback when the current depot command changes', () => {
    expect(source).toContain('const is_code_copied = computed(() => (');
    expect(source).toContain('copied_command.value === apex_store.download_language_depot_command');
    expect(source).toContain('copied_command.value = null;');
    expect(source).toContain('v-if="is_code_copied"');
    expect(source).not.toContain('written_to_clipboard');
  });
});
