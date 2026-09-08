import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

describe('Apex launcher routing', () => {
  it('routes EA through the tested desktop Shell and keeps Steam unchanged', () => {
    const source = readFileSync('src/components/game/apex/launch/ApexStart.vue', 'utf8');
    expect(source).toContain('active_account_is_steam || apex_store.active_account_is_ea');
    expect(source).toContain('startApexEa(account.user.id)');
    expect(source).toContain('openUrl(apex_store.open_apex_url)');
    expect(source).not.toContain('origin://');
    const native = readFileSync('src-tauri/src/game/apex.rs', 'utf8');
    expect(native).toContain('Shell.Application');
    expect(native).toContain('FindWindowSW(0,0,8,[ref]$h,1)');
    expect(native).toContain('$desktop.Document.Application.ShellExecute');
    expect(native).toContain("'origin://launchgame/194908'");
    expect(native).toContain("'open',7");
    expect(native).not.toContain('root.join("start_protected_game.exe")');
  });
});
