import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

describe('Apex launcher routing', () => {
  it('routes EA through native IPC and Steam through its URL handler', () => {
    const source = readFileSync('src/components/game/apex/launch/ApexStart.vue', 'utf8');
    expect(source).toContain('active_account_is_steam || apex_store.active_account_is_ea');
    expect(source).toContain('startApexEa(account.user.id)');
    expect(source).toContain('openUrl(apex_store.open_apex_url)');
    expect(source).not.toContain('origin://');
  });
});
