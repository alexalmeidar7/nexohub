# INSTRUÇÕES DO PROJETO — NEXOHUB / HOUSE MIX

## REGRA PRINCIPAL

Execute somente o que foi solicitado.

Não faça melhorias, refatorações ou correções adicionais por iniciativa própria.

Prioridade:
1. Resolver exatamente o problema solicitado.
2. Alterar o menor número possível de arquivos.
3. Preservar tudo que já funciona.
4. Parar quando a tarefa estiver concluída.

---

## ECONOMIA DE CRÉDITOS

Este projeto deve ser trabalhado com o mínimo possível de consumo de tokens e ferramentas.

Para tarefas simples:
- Não explore o projeto inteiro.
- Não leia arquivos que não tenham relação com a tarefa.
- Não faça análise geral do sistema.
- Não procure problemas adicionais.
- Não faça refatoração preventiva.
- Não reescreva componentes inteiros quando uma alteração pontual resolver.
- Não crie novos componentes, hooks, serviços ou arquivos sem necessidade.
- Não execute ferramentas/comandos desnecessários.
- Não faça múltiplas tentativas diferentes quando uma correção objetiva for suficiente.

Se o arquivo responsável já estiver identificado, trabalhe diretamente nele.

Se não estiver identificado:
- localize somente o arquivo/componente relacionado à solicitação;
- depois altere somente o necessário.

---

## ESCOPO

Antes de editar, identifique claramente:

- O que precisa mudar.
- Onde precisa mudar.
- O que NÃO deve mudar.

Não altere código fora do escopo.

Uma solicitação visual deve permanecer uma solicitação visual.

Não altere:
- banco de dados;
- Supabase;
- APIs;
- autenticação;
- integrações;
- XML;
- automações;
- vMix;
- outras telas;

a menos que isso seja explicitamente solicitado.

---

## ALTERAÇÕES VISUAIS

Para mudanças de layout/UI:

1. Localize o componente responsável.
2. Preserve a estrutura existente.
3. Reutilize componentes, estados e dados existentes.
4. Faça a menor alteração possível.
5. Não altere lógica de negócio.
6. Não altere integrações.
7. Não crie funcionalidades adicionais.

Não "melhore" outros elementos da interface por conta própria.

---

## CORREÇÃO DE BUG

Quando for solicitado um bug:

1. Localize a causa.
2. Corrija a causa.
3. Não refatore partes não relacionadas.
4. Não altere comportamentos existentes que não estejam relacionados ao bug.
5. Não tente corrigir outros erros encontrados incidentalmente.

Se encontrar outro problema durante a investigação, ignore-o e continue somente com a tarefa atual, salvo se ele impedir diretamente a correção solicitada.

---

## VIZUALIZAÇÃO / CENÁRIO / VMIX

Ao trabalhar em telas relacionadas a Cenário, vMix, Broadcast ou Preview:

- Preserve conexões existentes.
- Não altere mecanismos de comunicação com o vMix sem solicitação.
- Não altere URLs, endpoints ou integrações sem solicitação.
- Não remova funcionalidades existentes.
- Não altere automações existentes por causa de uma mudança visual.
- Mudanças de posição, tamanho, texto, animação ou aparência devem permanecer restritas à camada visual.

---

## DADOS EXISTENTES

Quando uma informação já existe no sistema, reutilize a fonte existente.

Não crie dados duplicados.

Não crie mock, fallback ou informação fixa para substituir dados reais sem autorização.

Não altere banco ou estrutura de dados para resolver uma questão que possa ser resolvida no frontend.

---

## IMAGENS / LOGOS / MÍDIA

Preserve os caminhos e URLs existentes sempre que funcionarem.

Não substitua formatos, URLs ou fontes de imagens sem necessidade.

Não altere o sistema de upload/download para resolver apenas um problema visual.

---

## XML

Quando a tarefa envolver XML:

- altere somente o XML solicitado;
- preserve o formato e estrutura existentes;
- não altere outros XML;
- não altere banco ou frontend sem necessidade;
- valide somente o XML relacionado à tarefa.

Se houver vários XML com problemas diferentes, trate somente aquele solicitado.

---

## GIT / PR

Não crie vários PRs para uma única alteração.

Quando a tarefa for uma correção única:
- faça a alteração;
- valide;
- mantenha a mudança consolidada.

Não crie commits ou PRs adicionais para melhorias não solicitadas.

Não faça merge, push ou deploy automaticamente, salvo quando explicitamente solicitado.

---

## VALIDAÇÃO

Depois da alteração:

- valide somente o comportamento solicitado;
- verifique se não existe erro óbvio causado pela mudança;
- não faça auditoria geral do projeto.

Se a tarefa estiver resolvida, PARE.

Não continue procurando coisas para melhorar.

---

## SE A SOLICITAÇÃO FOR AMBÍGUA

Não faça várias alterações tentando adivinhar.

Se a ambiguidade puder causar alteração estrutural ou funcional, faça uma pergunta objetiva antes de modificar.

Para pequenas decisões visuais, prefira manter o padrão existente do projeto.

---

## CONTROLE DE ESCOPO

Se durante a execução você perceber que está prestes a:

- alterar muitos arquivos;
- criar novos componentes;
- alterar banco;
- alterar API;
- refatorar código;
- modificar funcionalidades não mencionadas;
- executar muitos comandos;
- investigar partes não relacionadas;

PARE e verifique se isso é realmente necessário para a solicitação.

Se não for indispensável, NÃO FAÇA.

---

## RESPOSTA FINAL

Ao terminar, responda de forma curta:

### Alterado
- arquivo(s) modificados;
- o que foi corrigido.

### Validação
- resultado da verificação.

Não apresente uma lista de melhorias não solicitadas.

Não descreva uma investigação longa.

Não repita o código inteiro.

---

## REGRA FINAL

É melhor fazer uma alteração pequena e correta do que uma grande alteração "melhorando" o sistema.

NÃO INVENTE TRABALHO.
NÃO AMPLIE O ESCOPO.
NÃO REFAÇA O QUE JÁ FUNCIONA.
RESOLVA O PEDIDO E PARE.