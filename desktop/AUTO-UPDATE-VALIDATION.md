# House Mix Desktop - Atualizações automáticas

O aplicativo usa `electron-updater` com GitHub Releases. A checagem ocorre na
abertura e a cada quatro horas enquanto o HMD estiver aberto. O download é
automático; a instalação acontece ao fechar o aplicativo. Se não houver internet
ou a verificação falhar, o HMD continua abrindo normalmente.

## Publicação

O workflow `.github/workflows/housemix-desktop-release.yml` publica o instalador,
o manifesto `latest.yml` e os arquivos de atualização quando uma tag `v*.*.*` é
enviada. Cada versão publicada precisa ter um número maior que a instalada.
Assim, os usuários recebem as próximas versões sem baixar e executar o instalador
manualmente. A versão construída localmente não publica nem cria uma Release.

## Limite atual

O mecanismo de atualização não instala alterações de schema no banco local. Uma
versão que exigir migration precisa oferecer migration aditiva e compatível com
versões anteriores antes de ser publicada.
