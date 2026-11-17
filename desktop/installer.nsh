!macro customInstall
  ; A loopback-only reservation lets the bundled worker run without elevation.
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" http add urlacl url=http://127.0.0.1:8765/ sddl=D:(A;;GX;;;BU)'
  CreateDirectory "$INSTDIR\arquivos_locais"
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$INSTDIR\arquivos_locais" /grant *S-1-5-32-545:(OI)(CI)M'
!macroend
