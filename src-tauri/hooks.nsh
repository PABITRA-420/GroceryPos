; NSIS Hook to ensure WebView2Loader.dll is bundled and installed for GNU/MinGW targets
!macro NSIS_HOOK_POSTINSTALL
  !if /FileExists "..\..\WebView2Loader.dll"
    File "..\..\WebView2Loader.dll"
  !endif
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\WebView2Loader.dll"
!macroend
