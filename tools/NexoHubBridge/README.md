# NexoHub Bridge — aplicativo Windows

Aplicativo de configuração simples para conectar o House Mix ao vMix deste computador.

## Primeiro uso

1. Extraia o ZIP em uma pasta permanente no computador onde o vMix está instalado.
2. Execute `NexoHubBridge.exe`.
3. Informe o IP do vMix (por exemplo `192.168.1.50:8088`; no mesmo computador, `127.0.0.1:8088`).
4. No House Mix, abra **vMix Control → Ponte remota**, gere um código temporário e cole-o no campo de pareamento.
5. Marque **Iniciar com Windows** se quiser que o Bridge abra automaticamente ao iniciar a sessão.
6. Clique em **Salvar e conectar**. Depois do pareamento, a credencial fica guardada no perfil do usuário Windows; não é preciso editar JSON.
7. Fechar ou minimizar a janela mantém o Bridge na bandeja do Windows, ao lado do relógio. Use o menu do ícone para abrir, verificar a conexão ou encerrar.

## Descoberta local NDI

- Endpoint local: `http://127.0.0.1:8765/ndi/sources`.
- Instale o NDI Runtime oficial x64 no computador do vMix para listar fontes reais.
- A descoberta de fontes e o preview de vídeo são recursos separados; o preview depende de inputs já carregados no vMix.

## Segurança

- O Bridge só executa caminhos sob `/api/` no host/porta configurado.
- A conexão com a nuvem usa HTTPS.
- Não compartilhe a configuração em `%APPDATA%\NexoBrasil\NexoHubBridge\appsettings.json`: ela contém uma credencial secreta.
- Não exponha diretamente a porta 8088 do vMix à internet.
- O relay remoto depende das funções e da migração do Supabase implantadas e do fluxo de comandos do House Mix integrado.
