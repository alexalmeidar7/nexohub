# Corrigir ajuste e visualização de logos

## Alterações
- Mostrar uma porcentagem progressiva durante o ajuste, com etapas claras até a conclusão real.
- Reforçar o processamento para preservar letras, símbolos e recortes da logo, remover somente o fundo e entregar todos os elementos em branco puro sobre PNG transparente.
- Validar a saída final em 1080×1080 e rejeitar resultados que sejam apenas um retângulo ou fundo preenchido.
- Manter a seção “Logos Excluídas” clara e aplicar o fundo escuro somente em cada box onde a logo aparece.

## Validação
- Testar o fluxo completo com uma logo real, conferir transparência, cor branca e detalhes.
- Conferir a seção de excluídas no computador e verificar que apenas os boxes das imagens são escuros.
- Confirmar que a página continua sem erros.

## Detalhes técnicos
- O progresso exibido será estimado durante o processamento e chegará a 100% somente quando a imagem final estiver pronta.
- O serviço de imagem continuará isolado no servidor e usará o modelo configurado para edição de imagem.
