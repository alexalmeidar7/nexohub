# NexoHub Bridge — vMix e descoberta NDI

Agente Windows x64 para conexão local com o vMix e descoberta real de fontes NDI anunciadas na rede.

## Descoberta local
- O Bridge inicia um endpoint somente local em `http://127.0.0.1:8765/ndi/sources`.
- A lista é obtida pelo NDI Finder API do NDI Runtime instalado no computador; não usa sugestões ou nomes fictícios.
- Instale o NDI Runtime oficial (x64) no computador do vMix e reinicie o Bridge.
- O endpoint só permite CORS para o domínio House Mix e previews conhecidos do Lovable.
- Se o Runtime estiver ausente, o endpoint retorna erro explícito em vez de inventar fontes.

## Relay remoto vMix
O relay usa pareamento temporário e token do Supabase. Para o controle remoto funcionar, as funções e a migração do PR #23 precisam estar implantadas e o Bridge precisa ser pareado.

## Limitação do preview
A descoberta retorna fontes reais, mas o endpoint MJPEG do vMix só mostra inputs já adicionados ao vMix. O vMix HTTP API padrão não permite adicionar inputs NDI pela API. Para exibir no preview uma fonte de rede que ainda não esteja carregada no vMix, será necessário um receiver NDI local que retransmita vídeo para o navegador; a lista de descoberta e o preview de vídeo são partes distintas.

## Relay remoto vMix

# NexoHub Bridge (Windows x64)

Conector local para encaminhar comandos autorizados do NexoHub ao vMix pela rede local. O executável será publicado pelo workflow Build NexoHub Bridge (Windows) como artefato do GitHub Actions.

## Segurança
- O Bridge só executa caminhos sob `/api/` no host/porta configurado em `VmixUrl`.
- A conexão com a nuvem usa HTTPS.
- O token é secreto e deve ser tratado como credencial. Não publique nem compartilhe `appsettings.json`.
- Não abra a porta 8088 do vMix para a internet.

## Estado
O agente Windows é a base do conector. Para funcionar em produção, depende das funções de pareamento, fila de comandos e resultado no Supabase e da integração do Switcher com essa fila.
