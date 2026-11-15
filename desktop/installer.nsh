!macro customInstall
  CreateDirectory "$INSTDIR\arquivos_locais\xmls"
  CreateDirectory "$INSTDIR\arquivos_locais\imagens\apresentadores"
  CreateDirectory "$INSTDIR\arquivos_locais\imagens\banners"
  CreateDirectory "$INSTDIR\arquivos_locais\imagens\fundos"
  CreateDirectory "$INSTDIR\arquivos_locais\imagens\programas"
  CreateDirectory "$INSTDIR\arquivos_locais\imagens\logos"
  CreateDirectory "$INSTDIR\arquivos_locais\imagens\geral"
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$INSTDIR\arquivos_locais" /grant *S-1-5-32-545:(OI)(CI)M'
!macroend
