# House Mix Desktop

Shell Windows baseado em Electron para empacotar a interface atual do House Mix.

## Segurança nesta etapa

- Context isolation habilitado, Node integration desabilitada e sandbox habilitado.
- Navegação interna limitada à página empacotada (ou localhost:8080 em desenvolvimento).
- Links HTTPS e mailto são encaminhados ao navegador padrão; outras janelas são bloqueadas.
- O preload expõe somente metadados do aplicativo.
- Não há acesso do renderer ao filesystem, credenciais, rede local ou banco de dados.
- O aplicativo continua usando a autenticação e os serviços remotos já existentes na interface web.

## Estado da integração Offline First

A biblioteca .NET de transporte seguro já existe em `infra/offline-first/desktop-client`, mas ainda não é iniciada por este shell. A ponte Electron ↔ processo local .NET, o fluxo de pareamento na interface e a validação do certificado precisam de uma etapa própria, com testes. Nenhuma conexão LAN é habilitada por esta entrega.

## Desenvolvimento

```bash
npm install
npm run desktop:dev
```

## Build e instalador Windows

```bash
npm run desktop:build
npm run desktop:package
```

O instalador é gerado em `release/`. Antes de distribuir, validar login, OAuth, rotas, impressão/exportação, uploads/downloads, integração vMix e instalação em máquina limpa.
