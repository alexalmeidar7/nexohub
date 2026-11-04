# Validação obrigatória antes de considerar uma entrega concluída

## Regra de conclusão

Uma solicitação só pode ser comunicada como concluída quando houver evidência para as quatro etapas:

1. **Implementação:** critérios de aceite objetivos e teste que cubra o comportamento pedido.
2. **Integração:** verificações obrigatórias da PR aprovadas (contrato de aceite, suíte de testes, build e validação das Edge Functions XML).
3. **Publicação:** workflow do ambiente correspondente concluído sem falhas.
4. **Produção:** verificação feita contra o domínio/endpoint real e confirmação do commit publicado ou resposta funcional esperada.

Merge, build verde ou upload FTP isolados não comprovam que o usuário final recebeu a correção.

## Site Hostinger

O workflow `.github/workflows/deploy-hostinger.yml` gera `dist/deploy-info.json` com o SHA exato do commit. Depois do FTP, consulta o domínio público e compara o SHA servido com o SHA esperado. Se a versão não corresponder, o job falha e a entrega fica **NÃO VALIDADA**.

## Supabase / Edge Functions

O workflow de publicação XML continua exigindo disparo manual e confirmação explícita do projeto de produção. Depois de publicar as funções, consulta o endpoint público `serve-xml-geral?slug=positiva` e exige HTTP 200 e declaração XML. Isso comprova o caminho real do XML geral da Positiva; não deve ser interpretado como teste de todos os slugs, tabelas ou feeds.

Alterações em outras Edge Functions, tabelas ou operações precisam incluir testes específicos para os comportamentos afetados. Não executar migrations ou deploys de banco automaticamente sem revisão e autorização próprias.

## Contrato obrigatório da PR

O template exige:
- solicitação original;
- critérios de aceite observáveis;
- passos de validação reproduzíveis;
- escopo de publicação;
- riscos/compatibilidade;
- evidências.

A verificação automática impede PR sem essas seções preenchidas. A existência do texto, por si só, não prova que os critérios foram atendidos: os testes funcionais e pós-publicação continuam obrigatórios.

## Como reportar o status

Usar somente estes estados:

- **EM DESENVOLVIMENTO:** implementação ainda não integrada.
- **AGUARDANDO PUBLICAÇÃO:** PR integrada, mas deploy não concluído.
- **PUBLICADO, NÃO VALIDADO:** upload/deploy concluído, teste real pendente ou falhou.
- **VALIDADO EM PRODUÇÃO:** comportamento esperado comprovado no ambiente real.

Nunca usar “resolvido” ou “concluído” apenas com base no merge.
