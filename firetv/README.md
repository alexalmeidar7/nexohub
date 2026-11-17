# Player online no Fire TV

A versão 1.1.0 executa o **mesmo Player publicado** em
`https://housemix.nexobrasil.net/positivafm/player`. Não mantém cópias Android
das telas de loading, login, perfil, home, catálogo ou `/player/watch`.
Atualizações do Player web passam a aparecer no aplicativo.

O Android fornece somente WebView em tela cheia, reprodução, tecla Voltar e
foco pelo controle remoto. O botão Google abre o fluxo web de QR da própria
rádio; o login continua pelo celular. Não abre OAuth dentro de WebView.
Cookies e armazenamento do Player permanecem privados ao aplicativo.

## Responsividade

O Fire TV informa resolução física e densidade. Por exemplo, 1920×1080 com
densidade 320 usa viewport CSS de 960×540. `src/styles/player-tv.css` adapta
fontes, espaçamentos e cards a essa viewport, sem ampliar a página com zoom ou
transform. O layout e os componentes continuam sendo os do Player online.
O controle respeita os handlers de navegação existentes e fornece foco espacial
somente onde o componente ainda não tratou a tecla. Listas e diálogos continuam
com rolagem interna quando necessária; o documento não ganha scroll horizontal.

## Build e instalação

Executar manualmente o workflow **Build Nexo Player Android Native APK**, com
`station=positiva`. A versão/nome do artefato vêm do Gradle.

```powershell
adb connect <IP_DO_FIRE_TV>:5555
adb -s <IP_DO_FIRE_TV>:5555 install -r Radio-Positiva-Fire-Android-TV-v1.1.0.apk
```

O app novo se chama **Positiva FM**, pacote
`br.com.nexobrasil.nexoplayer.positiva`. O app antigo **Positiva FM (Teste)**,
pacote terminado em `.teste`, é separado e seus dados não são apagados.
O workflow conserva a chave de debug em cache para atualizações de sideload;
distribuição em loja exige uma identidade de assinatura de release gerenciada.

## Arte do launcher

`app/src/positiva/res/drawable-nodpi/tv_launcher.png` é a capa 16:9 fornecida pelo
usuário, sem recorte ou redimensionamento destrutivo. A flavor Positiva usa essa
arte como ícone e banner; o Fire TV faz a redução para o tamanho do bloco.

## Validação no aparelho

Conferir loading/login, QR, entrada na home, áudio/vídeo em `/watch`, foco por
setas/OK, Voltar, retorno ao app e capa do launcher. Não desinstalar o pacote
antigo nem limpar dados para contornar eventual conflito de assinatura.
