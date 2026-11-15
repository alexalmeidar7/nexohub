!macro customInstall
  CreateDirectory "$INSTDIR\arquivos_locais"
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$INSTDIR\arquivos_locais" /grant *S-1-5-32-545:(OI)(CI)M'
!macroend
