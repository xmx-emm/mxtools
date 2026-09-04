import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const dialogSource = readFileSync(
  new URL('../../../../src/components/common/AppConfirmationDialog.vue', import.meta.url),
  'utf8',
);

describe('AppConfirmationDialog visual contract', () => {
  it('renders the optional navigation action with the shared navigation icon', () => {
    expect(dialogSource).toContain('v-if="appConfirmationState.actionText"');
    expect(dialogSource).toContain('append-icon="mdi-arrow-right-thin"');
    expect(dialogSource).toContain(':disabled="appConfirmationState.actionRunning"');
    expect(dialogSource).toContain('@click="runAppConfirmationAction()"');
    expect(dialogSource).toContain('{{ appConfirmationState.actionText }}');
  });
});
