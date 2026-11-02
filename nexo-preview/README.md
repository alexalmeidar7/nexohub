# Nexo Preview

Aplicativo desktop Windows para pré-visualizar interfaces web de TV, celular e tablet durante o desenvolvimento.

## Executar no Windows

1. Instale Node.js LTS.
2. Abra um terminal nesta pasta.
3. Execute `npm install`.
4. Execute `npm run dev`.

## Gerar instalador

Execute `npm run dist`. O instalador NSIS será criado na pasta `release/`.

## Usar com o Nexo Player

1. Inicie o servidor de desenvolvimento do projeto (por exemplo, `npm run dev -- --host 0.0.0.0`).
2. Informe no Nexo Preview a URL local, como `http://localhost:8080/positivafm/player/tv`.
3. Selecione TV, celular ou tablet e o perfil de resolução.
4. Com Vite HMR, alterações no código aparecem automaticamente dentro da prévia. O botão de atualizar continua disponível.

## Limites importantes

- Android TV e Fire TV: o modo de tela é uma prévia de layout; testes de APK, APIs nativas, DRM, codecs e controle real precisam do Android Emulator ou dispositivo físico.
- LG webOS e Samsung Tizen: os perfis ajustam viewport e proporção, mas não substituem os simuladores oficiais nem reproduzem APIs e versões específicas do sistema.
- iPhone: a prévia cobre viewport e proporções. O simulador iOS oficial exige macOS e Xcode.
- A prévia universal funciona melhor com aplicações web/HTML/React. APK, IPK e WGT não são executados diretamente dentro do Nexo Preview.

O Nexo Preview não modifica nem empacota os aplicativos testados; ele apenas os carrega por uma URL de desenvolvimento.
