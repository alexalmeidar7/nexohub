# Plano: Agendamento do roteiro Podcast

## Alterações
- Quando o estúdio selecionado for **PODCAST**, trocar “Título da Tarja” por dois campos: **Título** e **Subtítulo**.
- Remover do corpo do formulário a seção “Agendar publicação no XML”.
- Manter apenas o botão **Agendar e salvar** no rodapé do formulário Podcast; os outros estúdios continuam com o fluxo atual.
- Ao clicar, abrir um pop-up no padrão visual do site para escolher data e horário.
- No pop-up, usar o botão **Salvar e agendar** para gravar o roteiro e criar o agendamento.
- Após a confirmação, limpar/fechar o formulário e atualizar imediatamente a lista **Roteiros Agendados**.

## Detalhes técnicos
- Guardar título e subtítulo dentro dos dados estruturados do roteiro, preservando compatibilidade com roteiros antigos.
- Incluir os dois campos no XML do Podcast e na leitura dos XMLs existentes.
- Reutilizar o fluxo atual de persistência no banco, sem apagar ou alterar registros antigos.
- Aplicar os componentes e cores já usados pelo sistema no formulário e no pop-up.

## Verificação
- Selecionar PODCAST, preencher título/subtítulo e demais dados.
- Abrir o pop-up pelo botão único, definir data e horário e confirmar.
- Confirmar que os dados persistiram, que o formulário fechou e que o item apareceu em Roteiros Agendados.
- Confirmar que o XML contém título e subtítulo e que os demais estúdios não foram afetados.