!macro NSIS_HOOK_PREINSTALL
  ; Tauri's offlineInstaller downloader performs a HEAD request that Microsoft's
  ; redirect endpoint may reject. The release orchestrator downloads the same
  ; official x64 installer with Windows curl and exposes its cached path here.
  ${If} $UpdateMode <> 1
    ${If} ${RunningX64}
      ReadRegStr $4 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
    ${Else}
      ReadRegStr $4 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
    ${EndIf}
    ${If} $4 == ""
      ReadRegStr $4 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
    ${EndIf}

    ${If} $4 == ""
      Delete "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
      File "/oname=$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe" "$%MXTOOLS_WEBVIEW2_OFFLINE_INSTALLER%"
      DetailPrint "$(installingWebview2)"
      ExecWait '"$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe" ${WEBVIEW2INSTALLERARGS} /install' $1
      Delete "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
      ${If} $1 = 0
        DetailPrint "$(webview2InstallSuccess)"
      ${Else}
        DetailPrint "$(webview2InstallError)"
        Abort "$(webview2AbortError)"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
