# House Mix Desktop — estabilidade e sincronização

Este PR organiza o escopo de correções identificado durante o primeiro teste local do instalador. É um PR de acompanhamento (draft): **não contém ainda as correções funcionais**.

## Itens para investigar e validar

- [ ] Corrigir renovação/validação de sessão ao editar e salvar programas.
- [ ] Sincronizar e recuperar logos dos programas no banco local.
- [ ] Conferir importação dos dados existentes: participantes, programas, citações, logos, batalha musical e enquetes.
- [ ] Corrigir e validar Cenário Interativo e Relatórios.
- [ ] Relacionar cadastro de clientes às logos cadastradas e recuperar a logo da empresa.
- [ ] Exibir estado da sincronização: banco local OK, baixando do online ou enviando ao online.
- [ ] Gerar e servir XMLs localmente no modo offline, sem depender de URLs online.
- [ ] Validar cada item com dados reais e teste no Windows antes de gerar novo instalador.

## Critérios de segurança

- Não fazer merge nem deploy de produção por este PR.
- Não apagar nem sobrescrever dados locais ou online durante a investigação.
- Registrar evidências e testes por item; só marcar como concluído após validação.
