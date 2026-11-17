# NexoHub Bridge integrado ao HMD

O instalador do HMD inclui NexoHubBridge.exe, o runtime oficial NDI x64 e seus avisos. O HMD inicia `--ndi-only` oculto e encerra o processo ao sair. Não exige pareamento, NDI Tools ou NDI Webcam para descoberta e preview.

`GET http://127.0.0.1:8765/ndi/sources` lista fontes reais da rede. O finder permanece ativo para atualizar fontes que aparecem depois. `GET /ndi/preview?source=<nome>` recebe diretamente a fonte selecionada e entrega MJPEG ao preview. Há no máximo um receptor, com largura máxima de 640 px e até 10 quadros/s; ocultar o preview interrompe a recepção. A descoberta não adiciona inputs nem altera o vMix.

O worker escuta apenas em loopback. O instalador reserva essa URL para usuários locais, sem exigir execução do HMD como administrador. Apenas origens autorizadas podem abrir o preview.

O modo standalone sem `--ndi-only` mantém o relay remoto e o pareamento existentes. O worker empacotado é atualizado junto do HMD e não executa o atualizador standalone.

Para empacotar: `./scripts/bundle-ndi-bridge.ps1`. O build baixa o redistribuível oficial, verifica a assinatura do fornecedor e inclui DLL e licenças. Em desenvolvimento, `-RuntimeDirectory` pode apontar para um runtime oficial já instalado.

NDI® é marca registrada de Vizrt NDI AB. Tecnologia e distribuição: https://ndi.video/ e https://docs.ndi.video/all/developing-with-ndi/sdk/software-distribution

## Retorno remoto de referencia

O HMD da radio controla o botao Habilitar/Desligar envio em /automation. O envio comeca desligado, nao e salvo como autorizado e exige a selecao do video NDI e da fonte NDI de audio da mesa. Sem operador assistindo, nao existe captura de audio ou codificacao WebRTC para a internet. Fechar o preview, trocar de estudio, sair da tela ou desligar o envio encerra a sessao.

O video de referencia usa canvas de 640x360, ate 10 fps e perfis de teto 300/500/900 Kbps (padrao 500). O audio e Opus com teto de 64 Kbps. Esses valores sao limites de midia; a rede inclui overhead de transporte. A midia usa WebRTC; o canal privado existente do estudio leva apenas sinalizacao. Os comandos de corte nao dependem do retorno.

O Bridge fornece /ndi/audio via WebSocket somente para origens autorizadas em loopback. Ele recebe a fonte NDI de audio em PCM e o HMD codifica Opus para o operador, sem capturar microfone, webcam ou som do desktop. Apenas um operador recebe o retorno por vez, para limitar o upload da radio.

A funcao vmix-preview-ice autentica o usuario e verifica acesso ao estudio antes de entregar a configuracao de rede. Sem relay, funciona apenas quando as redes permitem conexao direta. Para redes restritivas, foi preparada integracao com Open Relay / Metered no plano gratuito. Configurar VMIX_METERED_DOMAIN e VMIX_METERED_API_KEY como secrets da Edge Function; nunca no frontend. Usar somente conta Free sem cartao, plano pago, recarga automatica ou upgrade. O fornecedor anuncia franquia gratuita de 20 GB/mes; nao ha promessa de trafego ilimitado ou SLA. Nenhum cadastro, assinatura, recarga ou troca de plano e feito pelo codigo.

Provedor: https://www.metered.ca/tools/openrelay/
