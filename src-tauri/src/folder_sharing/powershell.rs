use super::{
    FolderSharingError, NtfsAclPreview, PrivilegedOperation, PrivilegedResult, RemoveShareResult,
    RepairResult, ShareAccessSummary, ShareAccount, ShareApplyResult, ShareDetails,
    ShareExecutionRequest, ShareHealthReport, SmbActivity,
};
#[cfg(test)]
use super::{HealthStatus, NetworkProfile, ShareHealthCheck};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::process::{Command, Stdio};

const PS_HEADER: &str = r#"
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
$requestJson = [Console]::In.ReadToEnd()
$req = $requestJson | ConvertFrom-Json
function Resolve-ErrorCode($errorRecord) {
  $id = [string]$errorRecord.FullyQualifiedErrorId
  $message = [string]$errorRecord.Exception.Message
  if ($id -match 'AccessDenied|UnauthorizedAccess' -or $message -match 'Access is denied|拒绝访问') { return 'access_denied' }
  if ($id -match 'NoMatchingMSFT_SMBShare|ObjectNotFound') { return 'share_not_found' }
  if ($id -match 'AlreadyExists' -or $message -match 'already exists|已经存在') { return 'share_exists' }
  if ($message -match 'being used|open files|正在使用') { return 'share_in_use' }
  return 'powershell_operation_failed'
}
function Write-Success($data) {
  @{ ok = $true; data = $data } | ConvertTo-Json -Depth 12 -Compress
}
function Write-Failure($errorRecord) {
  @{ ok = $false; code = (Resolve-ErrorCode $errorRecord); message = [string]$errorRecord.Exception.Message } | ConvertTo-Json -Depth 6 -Compress
}
"#;

const ACCOUNTS_BODY: &str = r#"
try {
  $accounts = @()
  foreach ($user in @(Get-LocalUser -ErrorAction Stop)) {
    $sid = [string]$user.SID
    try {
      $accountName = (New-Object System.Security.Principal.SecurityIdentifier($sid)).Translate([System.Security.Principal.NTAccount]).Value
    } catch {
      $accountName = $env:COMPUTERNAME + '\' + [string]$user.Name
    }
    $isGuest = $sid -match '-501$'
    $isSystem = $sid -in @('S-1-5-18', 'S-1-5-19', 'S-1-5-20')
    $accounts += [pscustomobject]@{
      accountName = [string]$accountName
      displayName = [string]$user.Name
      sid = $sid
      enabled = [bool]$user.Enabled
      source = [string]$user.PrincipalSource
      passwordRequired = [bool]$user.PasswordRequired
      selectable = [bool]$user.Enabled -and -not $isGuest -and -not $isSystem
      wellKnown = $false
    }
  }
  $authenticatedSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-11')
  try { $authenticatedName = $authenticatedSid.Translate([System.Security.Principal.NTAccount]).Value } catch { $authenticatedName = 'NT AUTHORITY\Authenticated Users' }
  $accounts += [pscustomobject]@{
    accountName = [string]$authenticatedName
    displayName = 'Authenticated Users'
    sid = 'S-1-5-11'
    enabled = $true
    source = 'WellKnown'
    passwordRequired = $true
    selectable = $true
    wellKnown = $true
  }
  Write-Success @($accounts | Sort-Object @{ Expression = { -not $_.wellKnown } }, displayName)
} catch {
  Write-Failure $_
  exit 1
}
"#;

const PREVIEW_ACL_BODY: &str = r#"
try {
  $prepared = Get-PreparedAcl ([string]$req.path) $req.managedAcl
  $acl = $prepared.acl
  $before = [string]$prepared.beforeSddl
  $changes = @()
  foreach ($principal in @($req.principals)) {
    $changes += Add-MinimumNtfsAccess $acl $principal
  }
  $after = $acl.GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::All)
  Write-Success ([pscustomobject]@{
    path = [string]$req.path
    beforeSddl = $before
    afterSddl = $after
    changes = @($changes)
  })
} catch {
  Write-Failure $_
  exit 1
}
"#;

const SHARE_HELPERS: &str = r#"
function Get-SidValue($identity) {
  try { return $identity.Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { return '' }
}
function Resolve-AccountFromSid($sidText, $fallback) {
  try {
    $sid = New-Object System.Security.Principal.SecurityIdentifier([string]$sidText)
    return $sid.Translate([System.Security.Principal.NTAccount]).Value
  } catch {
    return [string]$fallback
  }
}
function Get-PreparedAcl($path, $managedAcl) {
  $acl = Get-Acl -LiteralPath $path
  $currentSddl = $acl.GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::All)
  $beforeSddl = $currentSddl
  if ($null -ne $managedAcl -and $currentSddl -eq [string]$managedAcl.afterSddl) {
    $acl.SetSecurityDescriptorSddlForm([string]$managedAcl.beforeSddl, [System.Security.AccessControl.AccessControlSections]::All)
    $beforeSddl = $acl.GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::All)
  }
  return [pscustomobject]@{ acl = $acl; beforeSddl = $beforeSddl }
}
function Get-ShareAccessData($shareName) {
  $items = @()
  foreach ($entry in @(Get-SmbShareAccess -Name $shareName -ErrorAction Stop)) {
    $identity = New-Object System.Security.Principal.NTAccount([string]$entry.AccountName)
    $items += [pscustomobject]@{
      accountName = [string]$entry.AccountName
      sid = (Get-SidValue $identity)
      accessRight = [string]$entry.AccessRight
      accessControlType = [string]$entry.AccessControlType
    }
  }
  return @($items)
}
function Get-LocalShareData($share) {
  return [pscustomobject]@{
    name = [string]$share.Name
    path = [string]$share.Path
    description = [string]$share.Description
    uncPath = '\\' + $env:COMPUTERNAME + '\' + [string]$share.Name
    currentUsers = [uint32]$share.CurrentUsers
    special = [bool]$share.Special
    temporary = [bool]$share.Temporary
    diskShare = $true
  }
}
function Add-MinimumNtfsAccess($acl, $principal) {
  $sid = New-Object System.Security.Principal.SecurityIdentifier([string]$principal.sid)
  $required = if ([string]$principal.permission -eq 'change') {
    [System.Security.AccessControl.FileSystemRights]::Modify
  } else {
    [System.Security.AccessControl.FileSystemRights]::ReadAndExecute
  }
  $alreadyGranted = $false
  foreach ($rule in @($acl.Access)) {
    try { $ruleSid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { continue }
    if ($ruleSid -eq $sid.Value -and
        $rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
        (($rule.FileSystemRights -band $required) -eq $required)) {
      $alreadyGranted = $true
      break
    }
  }
  if (-not $alreadyGranted) {
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
      $sid,
      $required,
      ([System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit),
      [System.Security.AccessControl.PropagationFlags]::None,
      [System.Security.AccessControl.AccessControlType]::Allow
    )
    [void]$acl.AddAccessRule($rule)
  }
  return [pscustomobject]@{
    accountName = [string]$principal.accountName
    sid = $sid.Value
    permission = [string]$principal.permission
    requiredRights = [string]$required
    willAdd = -not $alreadyGranted
  }
}
function Set-DesiredShareAccess($shareName, $principals) {
  $adminSid = 'S-1-5-32-544'
  $desired = @{}
  $desired[$adminSid] = [pscustomobject]@{
    sid = $adminSid
    account = (Resolve-AccountFromSid $adminSid 'BUILTIN\Administrators')
    right = 'Full'
  }
  foreach ($principal in @($principals)) {
    $account = Resolve-AccountFromSid ([string]$principal.sid) ([string]$principal.accountName)
    $desired[[string]$principal.sid] = [pscustomobject]@{
      sid = [string]$principal.sid
      account = $account
      right = if ([string]$principal.permission -eq 'change') { 'Change' } else { 'Read' }
    }
  }
  foreach ($current in @(Get-SmbShareAccess -Name $shareName -ErrorAction Stop)) {
    if ([string]$current.AccessControlType -ne 'Allow') { continue }
    $identity = New-Object System.Security.Principal.NTAccount([string]$current.AccountName)
    $sid = Get-SidValue $identity
    if ($sid -ne '' -and -not $desired.ContainsKey($sid)) {
      Revoke-SmbShareAccess -Name $shareName -AccountName ([string]$current.AccountName) -Force -ErrorAction Stop | Out-Null
    }
  }
  foreach ($item in $desired.Values) {
    $existing = @(Get-SmbShareAccess -Name $shareName -ErrorAction Stop | Where-Object {
      if ([string]$_.AccessControlType -ne 'Allow') { return $false }
      try {
        $entrySid = (New-Object System.Security.Principal.NTAccount([string]$_.AccountName)).Translate([System.Security.Principal.SecurityIdentifier]).Value
        return $entrySid -eq [string]$item.sid
      } catch { return $false }
    })
    if ($existing.Count -gt 0 -and [string]$existing[0].AccessRight -ne [string]$item.right) {
      Revoke-SmbShareAccess -Name $shareName -AccountName ([string]$item.account) -Force -ErrorAction Stop | Out-Null
      $existing = @()
    }
    if ($existing.Count -eq 0) {
      Grant-SmbShareAccess -Name $shareName -AccountName ([string]$item.account) -AccessRight ([string]$item.right) -Force -ErrorAction Stop | Out-Null
    }
  }
}
"#;

const APPLY_SHARE_BODY: &str = r#"
try {
  $isUpdate = $null -ne $req.originalName -and [string]$req.originalName -ne ''
  if ($isUpdate) {
    $existingShare = Get-SmbShare -Name ([string]$req.originalName) -ErrorAction Stop
    if ([string]$existingShare.Path -ne [string]$req.path) { throw 'Share path cannot be changed in place.' }
    $shareName = [string]$req.originalName
  } else {
    if ($null -ne (Get-SmbShare -Name ([string]$req.name) -ErrorAction SilentlyContinue)) { throw 'A share with this name already exists.' }
    $shareName = [string]$req.name
  }

  $prepared = Get-PreparedAcl ([string]$req.path) $req.managedAcl
  $acl = $prepared.acl
  $beforeSddl = [string]$prepared.beforeSddl
  $changes = @()
  foreach ($principal in @($req.principals)) {
    $changes += Add-MinimumNtfsAccess $acl $principal
  }
  Set-Acl -LiteralPath ([string]$req.path) -AclObject $acl -ErrorAction Stop
  $afterAcl = Get-Acl -LiteralPath ([string]$req.path)
  $afterSddl = $afterAcl.GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::All)

  try {
    if ($isUpdate) {
      Set-SmbShare -Name $shareName -Description ([string]$req.description) -Force -ErrorAction Stop | Out-Null
      Set-DesiredShareAccess $shareName @($req.principals)
    } else {
      $adminAccount = Resolve-AccountFromSid 'S-1-5-32-544' 'BUILTIN\Administrators'
      $readAccounts = @()
      $changeAccounts = @()
      foreach ($principal in @($req.principals)) {
        $account = Resolve-AccountFromSid ([string]$principal.sid) ([string]$principal.accountName)
        if ([string]$principal.permission -eq 'change') { $changeAccounts += $account } else { $readAccounts += $account }
      }
      $parameters = @{
        Name = [string]$req.name
        Path = [string]$req.path
        Description = [string]$req.description
        FullAccess = @($adminAccount)
      }
      if ($readAccounts.Count -gt 0) { $parameters.ReadAccess = @($readAccounts) }
      if ($changeAccounts.Count -gt 0) { $parameters.ChangeAccess = @($changeAccounts) }
      New-SmbShare @parameters -ErrorAction Stop | Out-Null
      $shareName = [string]$req.name
    }
  } catch {
    $rollback = Get-Acl -LiteralPath ([string]$req.path)
    $rollback.SetSecurityDescriptorSddlForm($beforeSddl, [System.Security.AccessControl.AccessControlSections]::All)
    Set-Acl -LiteralPath ([string]$req.path) -AclObject $rollback -ErrorAction SilentlyContinue
    throw
  }

  $share = Get-SmbShare -Name $shareName -ErrorAction Stop
  $data = [pscustomobject]@{
    share = (Get-LocalShareData $share)
    access = @(Get-ShareAccessData $shareName)
    acl = [pscustomobject]@{
      path = [string]$req.path
      beforeSddl = $beforeSddl
      afterSddl = $afterSddl
      changes = @($changes)
    }
  }
  Write-Success $data
} catch {
  Write-Failure $_
  exit 1
}
"#;

const SHARE_DETAILS_BODY: &str = r#"
try {
  $share = Get-SmbShare -Name ([string]$req.name) -ErrorAction Stop
  $acl = Get-Acl -LiteralPath ([string]$share.Path)
  $sddl = $acl.GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::All)
  Write-Success ([pscustomobject]@{
    share = (Get-LocalShareData $share)
    access = @(Get-ShareAccessData ([string]$share.Name))
    acl = [pscustomobject]@{
      path = [string]$share.Path
      beforeSddl = $sddl
      afterSddl = $null
      changes = @()
    }
  })
} catch {
  Write-Failure $_
  exit 1
}
"#;

const SHARE_ACCESS_SUMMARIES_BODY: &str = r#"
try {
  $summaries = @()
  foreach ($name in @($req.names)) {
    $share = Get-SmbShare -Name ([string]$name) -ErrorAction Stop
    if ([bool]$share.Special) { continue }
    $summaries += [pscustomobject]@{
      name = [string]$share.Name
      access = @(Get-ShareAccessData ([string]$share.Name))
    }
  }
  Write-Success @($summaries)
} catch {
  Write-Failure $_
  exit 1
}
"#;

const REMOVE_SHARE_BODY: &str = r#"
try {
  $share = Get-SmbShare -Name ([string]$req.name) -ErrorAction Stop
  if ([bool]$share.Special) { throw 'System-managed shares cannot be removed.' }
  if ([uint32]$share.CurrentUsers -gt 0 -and -not [bool]$req.force) {
    @{ ok = $false; code = 'share_in_use'; message = 'The share has active connections.' } | ConvertTo-Json -Compress
    exit 1
  }
  $path = [string]$share.Path
  Remove-SmbShare -Name ([string]$req.name) -Force -Confirm:$false -ErrorAction Stop
  $aclCleaned = $false
  $aclCleanupSkipped = $false
  if ($null -ne $req.cleanupAcl) {
    $acl = Get-Acl -LiteralPath $path
    $currentSddl = $acl.GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::All)
    if ($currentSddl -eq [string]$req.cleanupAcl.afterSddl) {
      $acl.SetSecurityDescriptorSddlForm([string]$req.cleanupAcl.beforeSddl, [System.Security.AccessControl.AccessControlSections]::All)
      try {
        Set-Acl -LiteralPath $path -AclObject $acl -ErrorAction Stop
        $aclCleaned = $true
      } catch {
        $aclCleanupSkipped = $true
      }
    } else {
      $aclCleanupSkipped = $true
    }
  }
  Write-Success ([pscustomobject]@{
    name = [string]$req.name
    path = $path
    aclCleaned = $aclCleaned
    aclCleanupSkipped = $aclCleanupSkipped
  })
} catch {
  Write-Failure $_
  exit 1
}
"#;

const ACTIVITY_BODY: &str = r#"
try {
  $sessions = @()
  foreach ($item in @(Get-SmbSession -ErrorAction Stop)) {
    $sessions += [pscustomobject]@{
      sessionId = [string]$item.SessionId
      clientComputerName = [string]$item.ClientComputerName
      clientUserName = [string]$item.ClientUserName
      numOpens = [uint32]$item.NumOpens
      dialect = [string]$item.Dialect
      encrypted = [bool]$item.Encrypted
      signed = [bool]$item.Signed
      secondsIdle = [uint64]$item.SecondsIdle
      secondsExists = [uint64]$item.SecondsExists
    }
  }
  $files = @()
  foreach ($item in @(Get-SmbOpenFile -ErrorAction Stop)) {
    $files += [pscustomobject]@{
      fileId = [string]$item.FileId
      sessionId = [string]$item.SessionId
      clientComputerName = [string]$item.ClientComputerName
      clientUserName = [string]$item.ClientUserName
      path = [string]$item.Path
      shareRelativePath = [string]$item.ShareRelativePath
      permissions = [string]$item.Permissions
      locks = [uint32]$item.Locks
    }
  }
  Write-Success ([pscustomobject]@{ sessions = @($sessions); openFiles = @($files) })
} catch {
  Write-Failure $_
  exit 1
}
"#;

const CLOSE_SESSION_BODY: &str = r#"
try {
  Close-SmbSession -SessionId ([uint64]$req.sessionId) -Force -Confirm:$false -ErrorAction Stop
  Write-Success ([pscustomobject]@{ closed = $true })
} catch {
  Write-Failure $_
  exit 1
}
"#;

const CLOSE_FILE_BODY: &str = r#"
try {
  Close-SmbOpenFile -FileId ([uint64]$req.fileId) -Force -Confirm:$false -ErrorAction Stop
  Write-Success ([pscustomobject]@{ closed = $true })
} catch {
  Write-Failure $_
  exit 1
}
"#;

const HEALTH_BODY: &str = r#"
try {
  function Get-RegistryDword($paths, $name) {
    foreach ($path in @($paths)) {
      try {
        $item = Get-ItemProperty -LiteralPath ([string]$path) -ErrorAction Stop
        $property = $item.PSObject.Properties[[string]$name]
        if ($null -ne $property -and $null -ne $property.Value) { return [int]$property.Value }
      } catch {}
    }
    return $null
  }
  $profiles = @()
  try {
    foreach ($profile in @(Get-NetConnectionProfile -ErrorAction Stop)) {
      $profiles += [pscustomobject]@{
        interfaceIndex = [uint32]$profile.InterfaceIndex
        name = [string]$profile.Name
        category = [string]$profile.NetworkCategory
        ipv4Connectivity = [string]$profile.IPv4Connectivity
      }
    }
  } catch {}
  $addresses = @()
  try {
    $addresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object {
      $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*'
    } | Select-Object -ExpandProperty IPAddress -Unique)
  } catch {}
  $checks = @()
  $privateProfile = @($profiles | Where-Object { $_.category -eq 'Private' -or $_.category -eq 'DomainAuthenticated' }).Count -gt 0
  $checks += [pscustomobject]@{
    id = 'network_profile'
    status = if ($privateProfile) { 'pass' } elseif ($profiles.Count -gt 0) { 'warning' } else { 'unknown' }
    value = if ($profiles.Count -gt 0) { (@($profiles | ForEach-Object { $_.name + ': ' + $_.category }) -join '; ') } else { 'Unavailable' }
    repairAction = $null
  }
  foreach ($serviceSpec in @(
    @{ id = 'lanman_server'; name = 'LanmanServer'; repair = 'start_lanman_server' },
    @{ id = 'fdphost'; name = 'fdPHost'; repair = 'start_fdphost' },
    @{ id = 'fdrespub'; name = 'FDResPub'; repair = 'start_fdrespub' },
    @{ id = 'ssdp'; name = 'SSDPSRV'; repair = 'start_ssdp' },
    @{ id = 'upnp'; name = 'upnphost'; repair = 'start_upnp' }
  )) {
    try {
      $service = Get-Service -Name $serviceSpec.name -ErrorAction Stop
      $running = $service.Status -eq 'Running'
      $checks += [pscustomobject]@{
        id = $serviceSpec.id
        status = if ($running) { 'pass' } else { 'warning' }
        value = [string]$service.Status
        repairAction = if ($running) { $null } else { $serviceSpec.repair }
      }
    } catch {
      $checks += [pscustomobject]@{ id = $serviceSpec.id; status = 'unknown'; value = 'Unavailable'; repairAction = $null }
    }
  }
  try {
    $smb = Get-SmbServerConfiguration -ErrorAction Stop
    $checks += [pscustomobject]@{
      id = 'smb2'
      status = if ([bool]$smb.EnableSMB2Protocol) { 'pass' } else { 'error' }
      value = if ([bool]$smb.EnableSMB2Protocol) { 'Enabled' } else { 'Disabled' }
      repairAction = if ([bool]$smb.EnableSMB2Protocol) { $null } else { 'enable_smb2' }
    }
    $checks += [pscustomobject]@{
      id = 'smb1'
      status = if ([bool]$smb.EnableSMB1Protocol) { 'warning' } else { 'pass' }
      value = if ([bool]$smb.EnableSMB1Protocol) { 'Enabled' } else { 'Disabled' }
      repairAction = $null
    }
    $checks += [pscustomobject]@{
      id = 'signing'
      status = 'pass'
      value = if ([bool]$smb.RequireSecuritySignature) { 'Required' } else { 'Supported' }
      repairAction = $null
    }
  } catch {
    $serverPaths = @(
      'HKLM:\SOFTWARE\Policies\Microsoft\Windows\LanmanServer\Parameters',
      'HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters'
    )
    $smb2Value = Get-RegistryDword $serverPaths 'SMB2'
    $smb2Enabled = $null -eq $smb2Value -or $smb2Value -ne 0
    $checks += [pscustomobject]@{
      id = 'smb2'
      status = if ($smb2Enabled) { 'pass' } else { 'error' }
      value = if ($smb2Enabled) { 'Enabled' } else { 'Disabled' }
      repairAction = if ($smb2Enabled) { $null } else { 'enable_smb2' }
    }
    $smb1Value = Get-RegistryDword $serverPaths 'SMB1'
    $smb1Enabled = if ($null -ne $smb1Value) {
      $smb1Value -ne 0
    } elseif (-not (Test-Path (Join-Path $env:SystemRoot 'System32\drivers\mrxsmb10.sys')) -and
              -not (Test-Path (Join-Path $env:SystemRoot 'System32\drivers\srv.sys'))) {
      $false
    } else {
      $null
    }
    $checks += [pscustomobject]@{
      id = 'smb1'
      status = if ($null -eq $smb1Enabled) { 'unknown' } elseif ($smb1Enabled) { 'warning' } else { 'pass' }
      value = if ($null -eq $smb1Enabled) { 'Unavailable' } elseif ($smb1Enabled) { 'Enabled' } else { 'Disabled' }
      repairAction = $null
    }
    $serverSigning = Get-RegistryDword $serverPaths 'RequireSecuritySignature'
    $checks += [pscustomobject]@{
      id = 'signing'
      status = 'pass'
      value = if ($null -ne $serverSigning -and $serverSigning -ne 0) { 'Required' } else { 'Supported' }
      repairAction = $null
    }
  }
  try {
    $firewallPolicy = New-Object -ComObject HNetCfg.FwPolicy2
    $fileRule = @($firewallPolicy.Rules | Where-Object {
      [bool]$_.Enabled -and [int]$_.Direction -eq 1 -and [int]$_.Protocol -eq 6 -and
      ([string]$_.LocalPorts) -match '(^|,)\s*445\s*(,|$)' -and
      (([int]$_.Profiles -band 3) -ne 0) -and (([int]$_.Profiles -band 4) -eq 0)
    })
    $checks += [pscustomobject]@{
      id = 'firewall_file_sharing'
      status = if ($fileRule.Count -gt 0) { 'pass' } else { 'warning' }
      value = if ($fileRule.Count -gt 0) { 'Private network enabled' } else { 'Private network disabled' }
      repairAction = if ($fileRule.Count -gt 0) { $null } else { 'enable_private_file_sharing' }
    }
  } catch {
    $checks += [pscustomobject]@{ id = 'firewall_file_sharing'; status = 'unknown'; value = 'Unavailable'; repairAction = $null }
  }
  try {
    if ($null -eq $firewallPolicy) { $firewallPolicy = New-Object -ComObject HNetCfg.FwPolicy2 }
    $discoveryRules = @($firewallPolicy.Rules | Where-Object {
      [bool]$_.Enabled -and [int]$_.Direction -eq 1 -and
      [string]$_.Grouping -eq '@FirewallAPI.dll,-32752' -and
      (([int]$_.Profiles -band 3) -ne 0) -and (([int]$_.Profiles -band 4) -eq 0)
    })
    $checks += [pscustomobject]@{
      id = 'firewall_discovery'
      status = if ($discoveryRules.Count -gt 0) { 'pass' } else { 'warning' }
      value = if ($discoveryRules.Count -gt 0) { 'Private network enabled' } else { 'Private network disabled' }
      repairAction = if ($discoveryRules.Count -gt 0) { $null } else { 'enable_private_discovery' }
    }
  } catch {
    $checks += [pscustomobject]@{ id = 'firewall_discovery'; status = 'unknown'; value = 'Unavailable'; repairAction = $null }
  }
  try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $listening = $false
    try {
      $connectTask = $tcpClient.ConnectAsync('127.0.0.1', 445)
      if ($connectTask.Wait(1200)) { $listening = [bool]$tcpClient.Connected }
    } catch {
      $listening = $false
    } finally {
      $tcpClient.Dispose()
    }
    $checks += [pscustomobject]@{
      id = 'port_445'
      status = if ($listening) { 'pass' } else { 'warning' }
      value = if ($listening) { 'Listening' } else { 'Not listening' }
      repairAction = if ($listening) { $null } else { 'start_lanman_server' }
    }
  } catch {
    $checks += [pscustomobject]@{ id = 'port_445'; status = 'unknown'; value = 'Unavailable'; repairAction = $null }
  }
  try {
    $client = Get-SmbClientConfiguration -ErrorAction Stop
    $checks += [pscustomobject]@{
      id = 'client_signing'
      status = 'pass'
      value = if ([bool]$client.RequireSecuritySignature) { 'Required' } else { 'Supported' }
      repairAction = $null
    }
    $checks += [pscustomobject]@{
      id = 'insecure_guest'
      status = if ([bool]$client.EnableInsecureGuestLogons) { 'warning' } else { 'pass' }
      value = if ([bool]$client.EnableInsecureGuestLogons) { 'Enabled' } else { 'Disabled' }
      repairAction = $null
    }
  } catch {
    $clientPaths = @(
      'HKLM:\SOFTWARE\Policies\Microsoft\Windows\LanmanWorkstation',
      'HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters'
    )
    $clientSigning = Get-RegistryDword $clientPaths 'RequireSecuritySignature'
    $checks += [pscustomobject]@{
      id = 'client_signing'
      status = 'pass'
      value = if ($null -ne $clientSigning -and $clientSigning -ne 0) { 'Required' } else { 'Supported' }
      repairAction = $null
    }
    $insecureGuest = Get-RegistryDword $clientPaths 'AllowInsecureGuestAuth'
    $guestEnabled = $null -ne $insecureGuest -and $insecureGuest -ne 0
    $checks += [pscustomobject]@{
      id = 'insecure_guest'
      status = if ($guestEnabled) { 'warning' } else { 'pass' }
      value = if ($guestEnabled) { 'Enabled' } else { 'Disabled' }
      repairAction = $null
    }
  }
  Write-Success ([pscustomobject]@{
    computerName = [string]$env:COMPUTERNAME
    addresses = @($addresses)
    profiles = @($profiles)
    checks = @($checks)
  })
} catch {
  Write-Failure $_
  exit 1
}
"#;

const REPAIR_BODY: &str = r#"
try {
  $results = @()
  foreach ($action in @($req.actions)) {
    try {
      switch -Regex ([string]$action) {
        '^start_lanman_server$' { Set-Service -Name 'LanmanServer' -StartupType Automatic; Start-Service -Name 'LanmanServer'; break }
        '^start_fdphost$' { Set-Service -Name 'fdPHost' -StartupType Automatic; Start-Service -Name 'fdPHost'; break }
        '^start_fdrespub$' { Set-Service -Name 'FDResPub' -StartupType Automatic; Start-Service -Name 'FDResPub'; break }
        '^start_ssdp$' { Set-Service -Name 'SSDPSRV' -StartupType Automatic; Start-Service -Name 'SSDPSRV'; break }
        '^start_upnp$' { Set-Service -Name 'upnphost' -StartupType Automatic; Start-Service -Name 'upnphost'; break }
        '^enable_private_file_sharing$' { Set-NetFirewallRule -Name 'FPS-SMB-In-TCP' -Enabled True -Profile Private -ErrorAction Stop; break }
        '^enable_private_discovery$' { Set-NetFirewallRule -Name 'NETDIS-*' -Enabled True -Profile Private -ErrorAction Stop; break }
        '^enable_smb2$' { Set-SmbServerConfiguration -EnableSMB2Protocol $true -Force -Confirm:$false -ErrorAction Stop | Out-Null; break }
        '^set_profile_private:(\d+)$' { Set-NetConnectionProfile -InterfaceIndex ([uint32]$Matches[1]) -NetworkCategory Private -ErrorAction Stop; break }
        default { throw 'Unsupported repair action.' }
      }
      $results += [pscustomobject]@{ action = [string]$action; success = $true; message = '' }
    } catch {
      $results += [pscustomobject]@{ action = [string]$action; success = $false; message = [string]$_.Exception.Message }
    }
  }
  Write-Success @($results)
} catch {
  Write-Failure $_
  exit 1
}
"#;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PsEnvelope<T> {
    ok: bool,
    data: Option<T>,
    code: Option<String>,
    message: Option<String>,
}

fn script(parts: &[&str]) -> String {
    let mut value = String::with_capacity(parts.iter().map(|part| part.len()).sum());
    for part in parts {
        value.push_str(part);
    }
    value
}

fn run_script<T: DeserializeOwned, I: Serialize>(
    body: &str,
    input: &I,
) -> Result<T, FolderSharingError> {
    let mut child = Command::new("powershell.exe")
        .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", body])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|error| FolderSharingError::new("powershell_unavailable", error.to_string()))?;
    let input = serde_json::to_vec(input)
        .map_err(|error| FolderSharingError::new("powershell_input_failed", error.to_string()))?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(&input)?;
    }
    drop(child.stdin.take());
    let output = child.wait_with_output()?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let envelope: PsEnvelope<T> = serde_json::from_str(&stdout).map_err(|error| {
        FolderSharingError::new(
            "powershell_output_invalid",
            format!("{error}; stderr: {stderr}"),
        )
    })?;
    if envelope.ok {
        envelope.data.ok_or_else(|| {
            FolderSharingError::new("powershell_output_invalid", "PowerShell returned no data")
        })
    } else {
        Err(FolderSharingError::new(
            envelope
                .code
                .unwrap_or_else(|| "powershell_operation_failed".into()),
            envelope
                .message
                .filter(|message| !message.is_empty())
                .unwrap_or(stderr),
        ))
    }
}

#[cfg(windows)]
use std::os::windows::process::CommandExt;

pub fn list_share_accounts() -> Result<Vec<ShareAccount>, FolderSharingError> {
    run_script(&script(&[PS_HEADER, ACCOUNTS_BODY]), &serde_json::json!({}))
}

pub fn preview_acl(request: &ShareExecutionRequest) -> Result<NtfsAclPreview, FolderSharingError> {
    run_script(
        &script(&[PS_HEADER, SHARE_HELPERS, PREVIEW_ACL_BODY]),
        request,
    )
}

pub fn scan_health() -> Result<ShareHealthReport, FolderSharingError> {
    run_script(&script(&[PS_HEADER, HEALTH_BODY]), &serde_json::json!({}))
}

pub fn execute_privileged(
    operation: PrivilegedOperation,
) -> Result<PrivilegedResult, FolderSharingError> {
    match operation {
        PrivilegedOperation::ApplyShare(request) => {
            let body = script(&[PS_HEADER, SHARE_HELPERS, APPLY_SHARE_BODY]);
            run_script::<ShareApplyResult, _>(&body, &request).map(PrivilegedResult::ShareApplied)
        }
        PrivilegedOperation::GetShareDetails { name } => {
            let body = script(&[PS_HEADER, SHARE_HELPERS, SHARE_DETAILS_BODY]);
            run_script::<ShareDetails, _>(&body, &serde_json::json!({ "name": name }))
                .map(PrivilegedResult::ShareDetails)
        }
        PrivilegedOperation::GetShareAccessSummaries { names } => {
            let body = script(&[PS_HEADER, SHARE_HELPERS, SHARE_ACCESS_SUMMARIES_BODY]);
            run_script::<Vec<ShareAccessSummary>, _>(&body, &serde_json::json!({ "names": names }))
                .map(PrivilegedResult::ShareAccessSummaries)
        }
        PrivilegedOperation::RemoveShare {
            name,
            force,
            cleanup_acl,
        } => run_script::<RemoveShareResult, _>(
            &script(&[PS_HEADER, REMOVE_SHARE_BODY]),
            &serde_json::json!({
                "name": name,
                "force": force,
                "cleanupAcl": cleanup_acl,
            }),
        )
        .map(PrivilegedResult::ShareRemoved),
        PrivilegedOperation::GetActivity => run_script::<SmbActivity, _>(
            &script(&[PS_HEADER, ACTIVITY_BODY]),
            &serde_json::json!({}),
        )
        .map(PrivilegedResult::Activity),
        PrivilegedOperation::CloseSession { session_id } => {
            run_script::<serde_json::Value, _>(
                &script(&[PS_HEADER, CLOSE_SESSION_BODY]),
                &serde_json::json!({ "sessionId": session_id }),
            )?;
            Ok(PrivilegedResult::Closed)
        }
        PrivilegedOperation::CloseOpenFile { file_id } => {
            run_script::<serde_json::Value, _>(
                &script(&[PS_HEADER, CLOSE_FILE_BODY]),
                &serde_json::json!({ "fileId": file_id }),
            )?;
            Ok(PrivilegedResult::Closed)
        }
        PrivilegedOperation::Repair { actions } => run_script::<Vec<RepairResult>, _>(
            &script(&[PS_HEADER, REPAIR_BODY]),
            &serde_json::json!({ "actions": actions }),
        )
        .map(PrivilegedResult::Repairs),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::folder_sharing::{
        CleanupAclSnapshot, ShareMutationRequest, SharePermission, SharePrincipal,
    };

    fn expect_privileged(
        stage: &str,
        result: Result<PrivilegedResult, FolderSharingError>,
    ) -> PrivilegedResult {
        result.unwrap_or_else(|error| {
            panic!(
                "{stage} failed: code={}, message={}, win32={:?}",
                error.code, error.message, error.win32_code
            )
        })
    }

    #[test]
    fn parses_single_and_array_json_envelopes() {
        let one: PsEnvelope<ShareHealthCheck> = serde_json::from_str(
            r#"{"ok":true,"data":{"id":"smb2","status":"pass","value":"Enabled","repairAction":null},"code":null,"message":null}"#,
        )
        .unwrap();
        assert!(one.ok);
        assert!(matches!(one.data.unwrap().status, HealthStatus::Pass));

        let many: PsEnvelope<Vec<NetworkProfile>> = serde_json::from_str(
            r#"{"ok":true,"data":[{"interfaceIndex":7,"name":"LAN","category":"Private","ipv4Connectivity":"Internet"}]}"#,
        )
        .unwrap();
        assert_eq!(many.data.unwrap().len(), 1);
    }

    #[test]
    fn fixed_scripts_do_not_interpolate_requests() {
        let body = script(&[PS_HEADER, SHARE_HELPERS, APPLY_SHARE_BODY]);
        assert!(body.contains("[Console]::In.ReadToEnd()"));
        assert!(!body.contains("format!("));
    }

    #[test]
    fn unsafe_repairs_are_absent_from_repair_script() {
        assert!(!REPAIR_BODY.contains("EnableInsecureGuestLogons"));
        assert!(!REPAIR_BODY.contains("RequireSecuritySignature $false"));
        assert!(!REPAIR_BODY.contains("EnableSMB1Protocol $true"));
    }

    #[test]
    fn acl_rollback_is_guarded_by_exact_sddl() {
        assert!(SHARE_HELPERS.contains("$currentSddl -eq [string]$managedAcl.afterSddl"));
        assert!(REMOVE_SHARE_BODY.contains("$currentSddl -eq [string]$req.cleanupAcl.afterSddl"));
    }

    #[test]
    fn lists_accounts_as_an_array() {
        let accounts = list_share_accounts().unwrap();
        assert!(accounts.iter().any(|account| account.sid == "S-1-5-11"));
        assert!(accounts.iter().all(|account| !account.sid.is_empty()));
    }

    #[test]
    fn scans_core_health_checks_without_elevation() {
        let report = scan_health().unwrap();
        for id in [
            "smb2",
            "firewall_file_sharing",
            "firewall_discovery",
            "port_445",
            "client_signing",
            "insecure_guest",
        ] {
            let check = report
                .checks
                .iter()
                .find(|check| check.id == id)
                .unwrap_or_else(|| panic!("missing health check: {id}"));
            assert!(
                !matches!(check.status, HealthStatus::Unknown),
                "health check should not require elevation: {id}"
            );
        }
    }

    #[test]
    fn previews_unicode_acl_without_writing_it() {
        let request = ShareExecutionRequest {
            request: ShareMutationRequest {
                original_name: None,
                name: "UnicodePreview".into(),
                path: r"C:\mxtools-共享预览".into(),
                description: String::new(),
                principals: vec![SharePrincipal {
                    account_name: "NT AUTHORITY\\Authenticated Users".into(),
                    sid: "S-1-5-11".into(),
                    permission: SharePermission::Read,
                }],
            },
            managed_acl: None,
        };
        let body = script(&[PS_HEADER, SHARE_HELPERS, PREVIEW_ACL_BODY]);
        let input = serde_json::to_string(&request).unwrap();

        assert!(input.contains("共享预览"));
        assert!(body.contains("Get-PreparedAcl ([string]$req.path) $req.managedAcl"));
        assert!(body.contains("$changes += Add-MinimumNtfsAccess $acl $principal"));
        assert!(body.contains("$after = $acl.GetSecurityDescriptorSddlForm"));
        assert!(!body.contains("Set-Acl"));
    }

    #[test]
    #[ignore = "requires an elevated Windows process and creates a temporary SMB share"]
    fn elevated_share_lifecycle_preserves_folder_and_restores_acl() {
        assert!(
            crate::elevated::is_elevated(),
            "run ignored integration tests from an elevated terminal"
        );

        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let share_name = format!(
            "MxToolsTest{}{}",
            std::process::id(),
            suffix % 1_000_000_000
        );
        let path = std::env::temp_dir().join(&share_name);
        std::fs::create_dir_all(&path).expect("create integration test directory");
        std::fs::write(path.join("probe.txt"), "folder-sharing-integration")
            .expect("write integration test probe");

        struct CleanupGuard {
            share_name: Option<String>,
            path: std::path::PathBuf,
        }
        impl Drop for CleanupGuard {
            fn drop(&mut self) {
                if let Some(name) = self.share_name.take() {
                    let _ = execute_privileged(PrivilegedOperation::RemoveShare {
                        name,
                        force: true,
                        cleanup_acl: None,
                    });
                }
                let _ = std::fs::remove_dir_all(&self.path);
            }
        }
        let mut guard = CleanupGuard {
            share_name: Some(share_name.clone()),
            path: path.clone(),
        };

        let principal = |permission| SharePrincipal {
            account_name: "NT AUTHORITY\\Authenticated Users".into(),
            sid: "S-1-5-11".into(),
            permission,
        };
        let request = ShareMutationRequest {
            original_name: None,
            name: share_name.clone(),
            path: path.to_string_lossy().into_owned(),
            description: "MX Tools integration test".into(),
            principals: vec![principal(SharePermission::Read)],
        };
        eprintln!("folder-sharing integration: create {share_name}");
        let created = match expect_privileged(
            "create share",
            execute_privileged(PrivilegedOperation::ApplyShare(ShareExecutionRequest {
                request: request.clone(),
                managed_acl: None,
            })),
        ) {
            PrivilegedResult::ShareApplied(result) => result,
            other => panic!("unexpected create result: {other:?}"),
        };
        assert!(created.access.iter().any(|entry| {
            entry.sid == "S-1-5-11" && entry.access_right.eq_ignore_ascii_case("read")
        }));

        let computer = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "localhost".into());
        let unc_probe = format!(r"\\{}\{}\probe.txt", computer, share_name);
        eprintln!("folder-sharing integration: read {unc_probe}");
        assert_eq!(
            std::fs::read_to_string(&unc_probe)
                .unwrap_or_else(|error| panic!("read UNC probe {unc_probe}: {error}")),
            "folder-sharing-integration"
        );

        let update_request = ShareMutationRequest {
            original_name: Some(share_name.clone()),
            principals: vec![principal(SharePermission::Change)],
            ..request
        };
        eprintln!("folder-sharing integration: update permissions");
        let created_after_sddl = created
            .acl
            .after_sddl
            .clone()
            .expect("create result must include afterSddl");
        let updated = match expect_privileged(
            "update share",
            execute_privileged(PrivilegedOperation::ApplyShare(ShareExecutionRequest {
                request: update_request.clone(),
                managed_acl: Some(CleanupAclSnapshot {
                    before_sddl: created.acl.before_sddl.clone(),
                    after_sddl: created_after_sddl,
                }),
            })),
        ) {
            PrivilegedResult::ShareApplied(result) => result,
            other => panic!("unexpected update result: {other:?}"),
        };
        assert!(updated.access.iter().any(|entry| {
            entry.sid == "S-1-5-11" && entry.access_right.eq_ignore_ascii_case("change")
        }));

        let updated_after_sddl = updated
            .acl
            .after_sddl
            .clone()
            .expect("update result must include afterSddl");
        eprintln!("folder-sharing integration: remove and restore ACL");
        let removed = match expect_privileged(
            "remove share",
            execute_privileged(PrivilegedOperation::RemoveShare {
                name: share_name,
                // Accessing the local UNC path can keep an authenticated SMB
                // session alive after the file handle closes.
                force: true,
                cleanup_acl: Some(CleanupAclSnapshot {
                    before_sddl: updated.acl.before_sddl.clone(),
                    after_sddl: updated_after_sddl,
                }),
            }),
        ) {
            PrivilegedResult::ShareRemoved(result) => result,
            other => panic!("unexpected remove result: {other:?}"),
        };
        guard.share_name = None;
        assert!(removed.acl_cleaned);
        assert!(!removed.acl_cleanup_skipped);
        assert!(path.is_dir());

        let post_remove_preview = preview_acl(&ShareExecutionRequest {
            request: update_request,
            managed_acl: None,
        })
        .unwrap_or_else(|error| panic!("read restored ACL: {error}"));
        assert_eq!(post_remove_preview.before_sddl, created.acl.before_sddl);
    }
}
