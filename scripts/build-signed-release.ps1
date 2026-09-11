$ErrorActionPreference = 'Stop'
$signingDirectory = Join-Path $env:USERPROFILE '.tauri\mxtools'
$keyPath = Join-Path $signingDirectory 'updater.key'
$passwordPath = Join-Path $signingDirectory 'password.dpapi'
if (!(Test-Path -LiteralPath $keyPath) -or !(Test-Path -LiteralPath $passwordPath)) {
    throw 'Local signing key is not configured. Use the signed GitHub release workflow or restore your key backup.'
}
$config = Get-Content 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json
if ((Get-Content ($keyPath + '.pub') -Raw).Trim() -ne $config.plugins.updater.pubkey) {
    throw 'Local key does not match the public key committed in tauri.conf.json.'
}
$previousKey = $env:TAURI_SIGNING_PRIVATE_KEY
$previousPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
try {
    $secure = (Get-Content -LiteralPath $passwordPath -Raw) | ConvertTo-SecureString
    $env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content -LiteralPath $keyPath -Raw).Trim()
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Net.NetworkCredential]::new('', $secure).Password
    & npm.cmd run 'build window release'
    if ($LASTEXITCODE -ne 0) { throw 'Signed release build failed.' }
} finally {
    $env:TAURI_SIGNING_PRIVATE_KEY = $previousKey
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $previousPassword
}
