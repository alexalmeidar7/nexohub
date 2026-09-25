# Corrigir ajuste automático de logos

## Objetivo
Fazer o ajuste funcionar sem o modelo antigo e preservar a logo completa — texto, símbolos, cores, contornos e detalhes — ao receber PNG, JPG, WEBP, PDF ou captura de tela.

## Alterações
- Trocar a função online do modelo removido pelo modelo de imagem atual, usando edição da imagem original e fundo transparente.
- Enviar o arquivo real ao serviço de imagem, sem transformar antecipadamente toda a arte em uma silhueta branca.
- Reforçar as instruções para recortar somente a logo da foto/captura, remover apenas o fundo e manter fielmente textos, cores e detalhes.
- Aceitar PDF no seletor e converter a primeira página em imagem antes do ajuste.
- Remover o processamento local destrutivo que transforma todos os pixels visíveis em branco; em falhas, preservar a imagem original enquadrada em PNG, sem apresentar uma silhueta como resultado válido.
- Exibir no aviso o erro seguro retornado pelo serviço e impedir aprovação de uma transformação que falhou.

## Validação
- Conferir PNG transparente, JPG com fundo, captura de tela e PDF.
- Confirmar prévia completa em 1080×1080 e salvamento no programa já selecionado.
- Verificar a tela em computador e celular, sem tela branca ou erros.

## Detalhes técnicos
- Gateway de imagens: `openai/gpt-image-2.5-sunburst`, endpoint de edição multipart, saída PNG transparente e qualidade alta.
- A função continuará isolada no servidor; nenhuma chave será enviada ao navegador.
