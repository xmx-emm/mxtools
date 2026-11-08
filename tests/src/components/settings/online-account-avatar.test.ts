import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');
const source = read('src/components/settings/OnlineAccountSection.vue');
const commands = read('src/ipc/commands.ts');
const avatarNative = read('src-tauri/src/online/avatar.rs');
const authNative = read('src-tauri/src/online/auth.rs');
const lib = read('src-tauri/src/lib.rs');
const tauriConf = read('src-tauri/tauri.conf.json');

describe('online account avatar', () => {
  it('shows the signed-in avatar with an initial fallback', () => {
    expect(source).toContain('<v-avatar class="account-avatar"');
    expect(source).toContain('<v-img v-if="avatarSrc" :src="avatarSrc"');
    expect(source).toContain('{{ avatarInitial }}');
    expect(source).toContain('setAccount(result.account);');
    expect(source).toContain('setAccount(null);');
  });

  it('turns the avatar slot into a 登录 entry when signed out', () => {
    const loggedOut = source.slice(source.indexOf('<div v-else class="setting-row">'));
    expect(loggedOut).toContain('class="account-avatar account-avatar-login"');
    expect(loggedOut).toContain('@click="startLogin"');
    expect(loggedOut).toContain("{{ t('settings.onlineAccountLogin') }}");
  });

  it('downloads the avatar natively without widening img-src or accepting a WebView URL', () => {
    expect(commands).toContain("ipcInvoke<string | null>('online_auth_get_avatar');");
    expect(commands).not.toMatch(/online_auth_get_avatar',\s*\{/);
    expect(avatarNative).toContain('pub async fn online_auth_get_avatar() -> IpcResult<Option<String>>');
    expect(avatarNative).toContain('const MAX_AVATAR_BYTES');
    expect(avatarNative).not.toContain('"image/svg+xml"');
    expect(authNative).toContain('avatar::remember_avatar_url(account.avatar_url.as_deref());');
    expect(authNative).toContain('avatar::remember_avatar_url(None);');
    expect(lib).toContain('            online_auth_get_avatar,');
    expect(tauriConf).not.toContain('apex.0w0.online/avatar');
  });
});
