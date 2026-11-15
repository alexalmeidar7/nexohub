# House Mix Desktop - Atualizações automáticas

O aplicativo usa `electron-updater` com GitHub Releases. A checagem ocorre na
abertura e a cada quatro horas enquanto o HMD estiver aberto. O download é
automático; a instalação acontece ao fechar o aplicativo. Se não houver internet
ou a verificação falhar, o HMD continua abrindo normalmente.

## Publicação

O workflow `.github/workflows/housemix-desktop-release.yml` roda depois que o
workflow `Verificar build` conclui com sucesso em um push para `main`. Ele calcula
uma versão patch maior que a versão do código e a última GitHub Release, então
publica o instalador, `latest.yml` e os arquivos de atualização no GitHub Releases.
O HMD instalado baixa a nova versão automaticamente e aplica ao fechar o app.
Builds locais não publicam nem criam uma Release.

## Limite atual

O mecanismo de atualização não instala alterações de schema no banco local. Uma
versão que exigir migration precisa oferecer migration aditiva e compatível com
versões anteriores antes de ser publicada.


Teste do auto update: publicar a proxima versao patch para validar a notificacao no HMD.
