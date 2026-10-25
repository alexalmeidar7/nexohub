# House Mix Desktop

Aplicativo Windows baseado em Electron.

## Gerenciador de clientes

Ao abrir o aplicativo sem argumentos, o usuário vê o gerenciador local de ambientes. É possível cadastrar rádios e abrir cada um em uma janela/processo independente.

Cada cliente recebe um perfil Electron exclusivo em:

```
%APPDATA%/House Mix Desktop/clients/<client-id>/
```

Cookies, sessão, Local Storage, IndexedDB e cache do Chromium ficam isolados por perfil. O cadastro local fica em `%APPDATA%/NexoBrasil/HouseMix/client-registry.json`.

O identificador é gerado a partir do nome, normalizado e validado para impedir traversal de diretório. O gerenciador só abre IDs presentes no cadastro local. É possível manter mais de um cliente aberto simultaneamente.

## Limites importantes

Esta etapa separa os perfis e as sessões do Electron, mas ainda **não cria nem conecta um banco de dados local por cliente**. Também não substitui autenticação, pareamento ou autorização do servidor. A próxima etapa deve provisionar o armazenamento local e as credenciais por cliente, validando o tenant recebido do servidor antes de abrir dados.

A aplicação ainda usa os serviços remotos existentes na interface. Nenhuma conexão LAN é ativada por esta entrega.

## Segurança

- Context isolation, sandbox e Node integration desabilitada.
- Preload do gerenciador expõe apenas três operações específicas (listar, cadastrar e abrir).
- O renderer não recebe acesso genérico a filesystem, processos, rede ou Electron.
- Navegação da janela principal limitada ao conteúdo empacotado (ou localhost:8080 em desenvolvimento).
- Links externos aceitos somente para HTTPS e mailto.

## Desenvolvimento e build

```bash
npm install
npm run desktop:dev
npm run desktop:build
npm run desktop:package
```

O instalador Windows é gerado em `release/`. Antes da distribuição, validar login, OAuth, rotas, integração vMix e instalação limpa.
