import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import permissions from '../../../src-tauri/capabilities/permissions.json';

const routerSource = readFileSync(new URL('../../../src/router.ts', import.meta.url), 'utf8');
const restoreHashSource = readFileSync(
  new URL('../../../src/utils/restore-last-route-hash.ts', import.meta.url),
  'utf8',
);
const windowsSource = readFileSync(new URL('../../../src/utils/windows.ts', import.meta.url), 'utf8');

describe('auxiliary window capabilities', () => {
  it('allows independent tool windows to initialize and use their title bars', () => {
    expect(permissions.windows).toContain('apex-quick-preset-window');
    expect(permissions.windows).toContain('repair-store-window');
    expect(permissions.windows).toContain('repair-onedrive-window');
    expect(permissions.windows).toContain('repair-icon-cache-window');
    expect(permissions.windows).toContain('repair-network-window');
    expect(permissions.windows).toContain('repair-apex-launch-window');
  });

  it('maps network repair to an independent non-restored window route', () => {
    expect(routerSource).toContain("'/repair-network': 'network'");
    expect(routerSource).toContain("path: '/repair-network', component: NetworkRepairPage");
    expect(restoreHashSource).toContain("'/repair-network'");
    expect(windowsSource).toContain("route: 'repair-network'");
  });

  it('maps Apex launch repair to an independent non-restored window route', () => {
    expect(routerSource).toContain("'/repair-apex-launch': 'apex-launch'");
    expect(routerSource).toContain("path: '/repair-apex-launch'");
    expect(restoreHashSource).toContain("'/repair-apex-launch'");
    expect(windowsSource).toContain("route: 'repair-apex-launch'");
  });
});
