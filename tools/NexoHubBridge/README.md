# NexoHub Bridge — aplicativo Windows

Aplicativo para conectar o House Mix ao vMix instalado neste computador, com configuração visual e funcionamento em segundo plano.

## Instalação e primeiro uso

1. Extraia o ZIP em uma pasta permanente no computador do vMix.
2. Execute `NexoHubBridge.exe`.
3. Confirme o nome do estúdio e o endereço local da API do vMix (normalmente `http://127.0.0.1:8088`).
4. No House Mix, abra **vMix Control → Ponte remota** e gere um código temporário.
5. Cole o código na janela do Bridge e clique em **Salvar e conectar**.
6. Opcionalmente, marque **Iniciar o NexoHub Bridge junto com o Windows**.
7. Ao fechar a janela, o Bridge permanece ativo na bandeja do sistema, ao lado do relógio. Clique duas vezes no ícone para abrir; use o menu de contexto para verificar conexão ou encerrar.

Não é necessário editar arquivos JSON manualmente. As configurações e a credencial do pareamento ficam no perfil do usuário do Windows, em `%APPDATA%\NexoBrasil\NexoHubBridge\appsettings.json`.

## Descoberta local de NDI

- Endpoint local: `http://127.0.0.1:8765/ndi/sources`.
- A lista usa o NDI Finder API do NDI Runtime instalado; não inventa nomes de fontes.
- Instale o NDI Runtime oficial x64 no computador do vMix. Se o runtime estiver ausente, o endpoint retorna um erro explícito.
- O endpoint de descoberta escuta apenas em loopback. O preview de vídeo é separado da descoberta e depende de inputs já adicionados ao vMix.

## Segurança e requisitos de produção

- O Bridge só executa caminhos sob `/api/` no host/porta configurado em `VmixUrl`.
- A conexão com a nuvem usa HTTPS.
- Não compartilhe o arquivo de configuração do usuário: ele contém uma credencial secreta.
- Não exponha a porta 8088 do vMix diretamente à internet.
- O relay remoto depende das funções e da migração do Supabase estarem implantadas e do fluxo de comandos do House Mix integrado.
