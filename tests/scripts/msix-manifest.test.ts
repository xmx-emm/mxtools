import {describe, expect, it} from 'vitest';
import {DEFAULT_IDENTITY, msixVersion, renderAppxManifest} from '../../scripts/msix-manifest.mjs';

const base = {
  version: '0.1.3',
  executable: 'mxtools.exe',
  displayName: '萌新工具箱',
  description: 'Apex & PUBG',
};

describe('msix manifest', () => {
  it('uses a four-part version with a zero revision', () => {
    expect(msixVersion('0.1.3')).toBe('0.1.3.0');
    expect(() => msixVersion('0.1.3-beta')).toThrow();
    expect(() => msixVersion('70000.0.0')).toThrow();
  });

  it('declares a full-trust app with Store-owned identity and no write virtualization', () => {
    const xml = renderAppxManifest({
      ...base,
      identity: {name: 'Publisher.MxTools', publisher: 'CN=ABCD-1234', publisherDisplayName: 'emm'},
    });
    expect(xml).toContain('Name="Publisher.MxTools"');
    expect(xml).toContain('Publisher="CN=ABCD-1234"');
    expect(xml).toContain('Version="0.1.3.0"');
    expect(xml).toContain('Executable="mxtools.exe" EntryPoint="Windows.FullTrustApplication"');
    expect(xml).toContain('<rescap:Capability Name="runFullTrust" />');
    expect(xml).toContain('<rescap:Capability Name="allowElevation" />');
    expect(xml).toContain('<rescap:Capability Name="unvirtualizedResources" />');
    expect(xml).toContain('<desktop6:FileSystemWriteVirtualization>disabled</desktop6:FileSystemWriteVirtualization>');
    expect(xml).toContain('<desktop6:RegistryWriteVirtualization>disabled</desktop6:RegistryWriteVirtualization>');
  });

  it('escapes text and rejects malformed identities', () => {
    expect(renderAppxManifest({...base, description: 'A & <B>'})).toContain('A &amp; &lt;B&gt;');
    expect(() => renderAppxManifest({...base, identity: {...DEFAULT_IDENTITY, publisher: 'emm'}})).toThrow();
    expect(() => renderAppxManifest({...base, identity: {...DEFAULT_IDENTITY, name: 'bad name'}})).toThrow();
  });
});
