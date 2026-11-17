# NexoHub Bridge integrado ao HMD

O instalador do HMD inclui NexoHubBridge.exe, o runtime oficial NDI x64 e seus avisos. O HMD inicia `--ndi-only` oculto e encerra o processo ao sair. Não exige pareamento, NDI Tools ou NDI Webcam para descoberta e preview.

`GET http://127.0.0.1:8765/ndi/sources` lista fontes reais da rede. O finder permanece ativo para atualizar fontes que aparecem depois. `GET /ndi/preview?source=<nome>` recebe diretamente a fonte selecionada e entrega MJPEG ao preview. Há no máximo um receptor, com largura máxima de 640 px e até 10 quadros/s; ocultar o preview interrompe a recepção. A descoberta não adiciona inputs nem altera o vMix.

O worker escuta apenas em loopback. O instalador reserva essa URL para usuários locais, sem exigir execução do HMD como administrador. Apenas origens autorizadas podem abrir o preview.

O modo standalone sem `--ndi-only` mantém o relay remoto e o pareamento existentes. O worker empacotado é atualizado junto do HMD e não executa o atualizador standalone.

Para empacotar: `./scripts/bundle-ndi-bridge.ps1`. O build baixa o redistribuível oficial, verifica a assinatura do fornecedor e inclui DLL e licenças. Em desenvolvimento, `-RuntimeDirectory` pode apontar para um runtime oficial já instalado.

NDI® é marca registrada de Vizrt NDI AB. Tecnologia e distribuição: https://ndi.video/ e https://docs.ndi.video/all/developing-with-ndi/sdk/software-distribution
