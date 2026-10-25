# House Mix Desktop

Shell Windows baseado em Electron para empacotar a interface atual do House Mix.

## Isolamento por cliente

Cada cliente usa um perfil Electron exclusivo em:

```
%APPDATA%/House Mix Desktop/clients/<client-id>/
```

O perfil separa os dados persistidos pelo Chromium/Electron, incluindo cookies, sessão web, Local Storage, IndexedDB e cache. O identificador é validado e não pode conter caminhos ou caracteres que permitam sair da pasta de clientes.

Para iniciar um perfil específico:

```powershell
& "C:\Program Files\House Mix Desktop\House Mix Desktop.exe" --client-id=radio-positiva
& "C:\Program Files\House Mix Desktop\House Mix Desktop.exe" --client-id=radio-cidade
```

Cada comando abre uma instância com armazenamento independente. Sem argumento, o aplicativo usa o perfil `default`; não use esse perfil compartilhado para operar clientes diferentes.

**Importante:** esta etapa isola o perfil do Electron. A seleção visual de clientes, a associação autenticada entre ID e tenant e os bancos locais separados serão conectados nas próximas etapas. Não considere o identificador informado na linha de comando como prova de identidade/autorização. O banco local ainda não é criado por esta PR.

## Segurança nesta etapa

- Context isolation habilitado, Node integration desabilitada e sandbox habilitado.
- Navegação interna limitada à página empacotada (ou localhost:8080 em desenvolvimento).
- Links HTTPS e mailto são encaminhados ao navegador padrão; outras janelas são bloqueadas.
- O preload expõe somente metadados do aplicativo e o ID de perfil selecionado.
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
