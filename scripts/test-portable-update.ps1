$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$directory = Join-Path $root ('.codex/portable-update-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $directory
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw 'Portable update fixture command failed.' } }
& rustc tests/rust/fixtures/portable_payload.rs -C opt-level=z -o "$directory/old-payload.exe"
Check-Exit
& rustc tests/rust/fixtures/portable_payload.rs --cfg portable_next -C opt-level=z -o "$directory/new-payload.exe"
Check-Exit
& node scripts/build-portable-sfx.mjs --source "$directory/old-payload.exe" --output "$directory/old.exe" --cache-dir "$directory/old-cache"
Check-Exit
& node scripts/build-portable-sfx.mjs --source "$directory/new-payload.exe" --output "$directory/new.exe" --cache-dir "$directory/new-cache"
Check-Exit
# Ephemeral fixture key: never read or modify the production signing secrets.
& node node_modules/@tauri-apps/cli/tauri.js signer generate --ci --password '' --write-keys "$directory/test.key" | Out-Null
Check-Exit
& node node_modules/@tauri-apps/cli/tauri.js signer sign --private-key-path "$directory/test.key" --password '' "$directory/new.exe" | Out-Null
Check-Exit
$oldDirectory = $env:MXTOOLS_PORTABLE_TEST_DIR
$oldReport = $env:MXTOOLS_PORTABLE_FIXTURE_REPORT
try {
    $env:MXTOOLS_PORTABLE_TEST_DIR = $directory
    $env:MXTOOLS_PORTABLE_FIXTURE_REPORT = "$directory/restarted.txt"
    & cargo test --manifest-path src-tauri/Cargo.toml --lib portable_update::tests::signed_sfx_update_roundtrip -- --ignored --exact --nocapture
    Check-Exit
} finally {
    $env:MXTOOLS_PORTABLE_TEST_DIR = $oldDirectory
    $env:MXTOOLS_PORTABLE_FIXTURE_REPORT = $oldReport
}
Write-Output 'Verified signed portable launcher replacement, exit handshake, restart and subsequent launch in isolated directories.'
