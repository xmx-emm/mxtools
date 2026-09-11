$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Publish through the validated GitHub release workflow.' }
$config = Get-Content 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json
$tag = "v$($config.version)"
$directory = "src-tauri/target/release/$($config.version)/publish"
$existingJson = & gh release view $tag --json isDraft 2>$null
if ($LASTEXITCODE -eq 0) {
    if (!(($existingJson | ConvertFrom-Json).isDraft)) { throw 'This version is already published; never overwrite release artifacts.' }
} else {
    & gh release create $tag --draft --target $env:GITHUB_SHA --title "萌新工具箱 $($config.version)" --notes-file "docs/releases/$($config.version).md"
    if ($LASTEXITCODE -ne 0) { throw 'Draft release creation failed.' }
}
# No --clobber: a partially uploaded draft must be reviewed before replacing files.
$assets = @(
    "$directory/MxTools_$($config.version)_x64_setup.exe#萌新工具箱 $($config.version) 安装版",
    "$directory/MxTools_$($config.version)_x64_portable.exe#萌新工具箱 $($config.version) 便携版",
    "$directory/MxTools_$($config.version)_x64_offline.exe#萌新工具箱 $($config.version) 离线 WebView2 版",
    "$directory/MxTools_$($config.version)_x64_setup.exe.sig",
    "$directory/MxTools_$($config.version)_x64_portable.exe.sig",
    "$directory/latest.json"
)
& gh release upload $tag @assets
if ($LASTEXITCODE -ne 0) { throw 'Release asset upload failed; the release remains a draft.' }
& gh release edit $tag --draft=false --latest
if ($LASTEXITCODE -ne 0) { throw 'Release publication failed.' }
