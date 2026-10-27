# NexoHub Bridge — aplicativo Windows

O NexoHub Bridge conecta o House Mix ao vMix instalado neste computador e pode permanecer ativo na bandeja do Windows.

## Primeiro uso

1. Extraia o pacote. O executável `NexoHubBridge.exe` fica na pasta principal.
2. Execute o Bridge e informe o IP/porta da API do vMix (no mesmo computador, normalmente `127.0.0.1:8088`).
3. No House Mix, abra **vMix Control → Ponte remota**, gere o código temporário e cole-o no campo de pareamento.
4. Marque **Iniciar com Windows** e clique em **Salvar e conectar**.
5. Ao fechar a janela, o Bridge continua ativo junto ao relógio do Windows. Use o menu do ícone para abrir ou encerrar.

## NDI Runtime

O Bridge verifica automaticamente se encontra o NDI Runtime. Se não estiver instalado, a interface mostra um aviso e o botão **Baixar NDI Runtime**, que abre o site oficial: https://ndi.video/tools/.

O endpoint local de descoberta é `http://127.0.0.1:8765/ndi/sources`. A detecção de instalação não garante, por si só, que a descoberta de fontes esteja funcionando; isso depende do runtime e da rede local.

## Arquivos de configuração

A subpasta **Configuração** contém o modelo `appsettings.example.json`, o guia e o ícone. O arquivo de exemplo é apenas uma referência para configuração manual. O aplicativo salva as configurações reais e a credencial em:

`%APPDATA%\NexoBrasil\NexoHubBridge\appsettings.json`

Não é necessário editar o JSON para usar a interface, e não compartilhe o arquivo real porque contém uma credencial secreta.

## Segurança e dependências

- A conexão com a nuvem usa HTTPS.
- O proxy Edge só acessa diretamente endereços IPv4 públicos literais. Nomes DNS e endereços IPv6 são encaminhados pelo Bridge pareado, evitando que uma resolução DNS diferente entre a validação e o `fetch` contorne a proteção contra SSRF/DNS rebinding.
- O Bridge só executa caminhos sob `/api/` no host/porta configurado.
- O token do Bridge, a senha do vMix e o código temporário de pareamento são protegidos pelo DPAPI do Windows para o usuário atual. Mover a configuração para outra conta do Windows exige parear novamente.
- Não exponha diretamente a porta 8088 do vMix à internet.
- O relay remoto depende das funções/migrações do Supabase e do fluxo de comandos do House Mix implantados e integrados.
