$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'Installer smoke tests are restricted to disposable GitHub Windows runners.'
}
$config = Get-Content 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json
$installDirectory = Join-Path $env:RUNNER_TEMP 'mxtools-upgrade-test'
$oldInstaller = Join-Path $env:RUNNER_TEMP 'MxTools_0.0.7_x64_setup.exe'
Invoke-WebRequest 'https://github.com/xmx-emm/mxtools/releases/download/v0.0.7/MxTools_0.0.7_x64_setup.exe' -OutFile $oldInstaller
if ((Get-FileHash $oldInstaller -Algorithm SHA256).Hash -ne '449E64A73B350FA1555F5AE3C97EB1BEBC6FF8F3F3C98D9E49C6FD9AB1486115') {
    throw 'Bootstrap installer hash mismatch.'
}
$process = Start-Process -FilePath $oldInstaller -ArgumentList @('/S', "/D=$installDirectory") -Wait -PassThru -WindowStyle Hidden
if ($process.ExitCode -ne 0) { throw 'Bootstrap installation failed.' }
$exe = Join-Path $installDirectory 'mxtools.exe'
if (!(Test-Path $exe) -or !(Get-Item $exe).VersionInfo.ProductVersion.StartsWith('0.0.7')) {
    throw 'Bootstrap installation could not be verified.'
}
$env:MXTOOLS_VERIFY_RELEASE_DIR = Join-Path (Get-Location) "src-tauri/target/release/$($config.version)/publish"
$env:MXTOOLS_RUN_INSTALL_TEST = '1'
$env:MXTOOLS_INSTALL_TEST_MARKER = Join-Path $env:RUNNER_TEMP 'mxtools-signature-verified.txt'
& cargo test --manifest-path src-tauri/Cargo.toml --lib app_update::tests::verify_release_installer_and_upgrade -- --ignored --exact --nocapture
if ($LASTEXITCODE -ne 0 -or !(Test-Path $env:MXTOOLS_INSTALL_TEST_MARKER)) {
    throw 'Native updater signature verification or install launch failed.'
}
$deadline = (Get-Date).AddMinutes(3)
$started = $null
do {
    Start-Sleep -Seconds 2
    $version = if (Test-Path $exe) { (Get-Item $exe).VersionInfo.ProductVersion } else { '' }
    $started = Get-Process mxtools -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }
} until (($version.StartsWith($config.version) -and $started) -or (Get-Date) -gt $deadline)
if (!$version.StartsWith($config.version) -or !$started) { throw 'Upgraded application did not restart from the expected installation.' }
Start-Sleep -Seconds 10
$running = Get-Process mxtools -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }
if (!$running) { throw 'Upgraded application exited during the startup smoke check.' }
$running | Stop-Process
Write-Output "Verified old installation, signed download, tamper rejection, NSIS update and $($config.version) restart."
