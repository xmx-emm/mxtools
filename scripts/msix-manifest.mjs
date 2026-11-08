// AppxManifest for the Microsoft Store MSIX build.
//
// Identity values must match the product reserved in Partner Center
// (Product identity page): Package/Identity/Name, Package/Identity/Publisher
// and Package/Properties/PublisherDisplayName. The Store re-signs the package
// on upload, so the Publisher only has to match, not be backed by a cert.
// These values are public (they ship in every installed package manifest).

export const DEFAULT_IDENTITY = Object.freeze({
  name: 'E07AF1E3.32085AA70E6E3',
  publisher: 'CN=F6867E07-8222-4811-89A6-2D342305EFCF',
  publisherDisplayName: '小萌新',
});

// MSIX needs four numeric parts; the Store requires the revision to be 0.
export function msixVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) throw new Error(`Unsupported app version for MSIX: ${version}`);
  for (const part of match.slice(1)) {
    if (Number(part) > 65535) throw new Error(`MSIX version part out of range: ${version}`);
  }
  return `${match[1]}.${match[2]}.${match[3]}.0`;
}

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderAppxManifest({
  version,
  executable,
  displayName,
  description,
  identity = DEFAULT_IDENTITY,
}) {
  if (!/^CN=/.test(identity.publisher)) {
    throw new Error('MSIX publisher must be a distinguished name starting with CN=');
  }
  if (!/^[A-Za-z0-9.-]{3,50}$/.test(identity.name)) {
    throw new Error(`Invalid MSIX identity name: ${identity.name}`);
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"
  xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
  xmlns:desktop6="http://schemas.microsoft.com/appx/manifest/desktop/windows10/6"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap uap3 desktop desktop6 rescap">
  <Identity
    Name="${xml(identity.name)}"
    Publisher="${xml(identity.publisher)}"
    Version="${msixVersion(version)}"
    ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>${xml(displayName)}</DisplayName>
    <PublisherDisplayName>${xml(identity.publisherDisplayName)}</PublisherDisplayName>
    <Logo>Assets\\StoreLogo.png</Logo>
    <!-- The app edits game configs under %LOCALAPPDATA% and HKCU settings
         that other programs read; virtualized writes would be invisible to them. -->
    <desktop6:FileSystemWriteVirtualization>disabled</desktop6:FileSystemWriteVirtualization>
    <desktop6:RegistryWriteVirtualization>disabled</desktop6:RegistryWriteVirtualization>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.18362.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Resources>
    <Resource Language="zh-CN" />
    <Resource Language="en-US" />
  </Resources>
  <Applications>
    <Application Id="MxTools" Executable="${xml(executable)}" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="${xml(displayName)}"
        Description="${xml(description)}"
        BackgroundColor="transparent"
        Square150x150Logo="Assets\\Square150x150Logo.png"
        Square44x44Logo="Assets\\Square44x44Logo.png" />
      <Extensions>
        <uap3:Extension Category="windows.appExecutionAlias" Executable="${xml(executable)}" EntryPoint="Windows.FullTrustApplication">
          <uap3:AppExecutionAlias>
            <desktop:ExecutionAlias Alias="${xml(executable)}" />
          </uap3:AppExecutionAlias>
        </uap3:Extension>
      </Extensions>
    </Application>
  </Applications>
  <Capabilities>
    <Capability Name="internetClient" />
    <rescap:Capability Name="runFullTrust" />
    <!-- Sensitive pages relaunch through UAC (runas). -->
    <rescap:Capability Name="allowElevation" />
    <!-- Required by the desktop6 write-virtualization opt-outs above. -->
    <rescap:Capability Name="unvirtualizedResources" />
  </Capabilities>
</Package>
`;
}
