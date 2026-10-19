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
