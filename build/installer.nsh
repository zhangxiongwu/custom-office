!macro customInstall
  WriteRegStr HKCU "Software\Classes\customOffice" "" "URL:Custom Office Protocol"
  WriteRegStr HKCU "Software\Classes\customOffice" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\customOffice\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\customOffice\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\customOffice"
!macroend
