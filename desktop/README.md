# House Mix Desktop — base inicial

Este diretório contém o shell Electron do aplicativo Windows.

## Estado atual
- Empacota a interface Vite em uma janela própria.
- Context isolation ativo e Node integration desativada.
- Navegação externa é encaminhada ao navegador padrão.
- O frontend continua usando o backend Lovable Cloud configurado no projeto.
- Não migra, cria ou altera o banco de dados.
- Não instala serviço Windows nem configura inicialização automática nesta fase.
- O atualizador automático ainda não está habilitado; será implementado após validar login, rotas, arquivos locais e integração com o vMix.

## Desenvolvimento
`npm install`
`npm run dev`
Em outro terminal: `npx electron desktop/main.cjs`

## Pacote Windows
`npm run desktop:package`

Antes de distribuir, testar login/autenticação, rotas, uploads/downloads, impressão/exportações, integração local com vMix e funcionamento em computador limpo. OAuth e autenticação do Lovable Cloud podem exigir ajuste de redirect para o protocolo desktop; não contornar isso incorporando chaves privilegiadas no aplicativo.
