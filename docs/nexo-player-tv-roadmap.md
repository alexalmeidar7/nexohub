# Nexo Player TV — Plano de produção

## Objetivo
Evoluir a experiência de rádio para Smart TVs com foco em navegação por controle remoto, conteúdo ao vivo, interação pelo celular e monetização, sem interromper o House Mix nem substituir o player web existente.

## Regras de segurança do projeto
- Preservar `/player` e o fluxo web atual.
- Não migrar nem substituir o backend Lovable Cloud existente.
- Não executar migrações de banco nem publicar funções em produção sem revisão e validação explícitas.
- Implementar a experiência de TV em rota/módulo isolado, reaproveitando serviços existentes quando compatíveis.
- Não expor segredos, tokens de sessão ou credenciais em QR Codes, URLs ou logs.
- Conteúdo publicitário, chat e notificações devem respeitar autenticação, consentimento e configuração da emissora.

## Fases e critérios de conclusão

### Fase 0 — Auditoria e mapa de dependências
- Mapear rotas atuais do player, autenticação, catálogo, canais, streaming, notícias, clima, programação e campanhas.
- Identificar componentes reutilizáveis e dependências exclusivas de desktop/mobile.
- Documentar o que já existe e o que precisa ser criado.
**Concluída quando:** há inventário de código, riscos e pontos de integração, sem alteração de produção.

### Fase 1 — Fundação da interface TV
- Criar rota TV isolada e layout 16:9 para controle remoto.
- Navegação por foco/teclas direcionais, Enter e Voltar.
- Estados de carregamento, erro, rede instável e retomada.
- Reutilizar identidade e serviços existentes sem alterar o player atual.
**Concluída quando:** a rota funciona em navegador desktop com simulação de controle remoto e os fluxos existentes permanecem intactos.

### Fase 2 — Rádio e canais ao vivo
- Reprodução da rádio e estado “tocando agora”.
- Catálogo de canais e podcasts; canal temporário de transmissão ao vivo quando disponível.
- Retomada segura de reprodução e tratamento de falhas de stream.
**Concluída quando:** rádio e conteúdo autorizado passam por testes de início, pausa, falha e reconexão.

### Fase 3 — Conexão TV + celular
- Pareamento por QR com código temporário, expiração, confirmação no celular e revogação.
- Sessão da TV separada e limitada; nunca colocar tokens permanentes no QR.
- Base para chat digitado no celular e sincronizado na TV, com controles de moderação.
**Concluída quando:** pareamento é testado com código expirado, reutilização, desconexão e conta não autorizada.

### Fase 4 — Conteúdo e retorno do ouvinte
- Curtir música, notícias com QR para leitura no celular, clima, grade de programação e lembretes.
- Preferências de notificações configuráveis; mensagens discretas e acessíveis na TV.
**Concluída quando:** cada módulo tem estado vazio/erro, dados validados e testes de permissões.

### Fase 5 — Monetização
- Inventário de banners e espaços promocionais.
- Regras configuráveis para pre-roll/mid-roll, frequência, duração e exclusões.
- Eventos de impressão/interação para relatórios, com privacidade e consentimento.
**Concluída quando:** anúncios de teste são servidos em ambiente de validação, com limites de frequência e sem bloquear controles essenciais.

### Fase 6 — Compatibilidade e lançamento gradual
- Validar primeiro no navegador e Android TV/Google TV.
- Depois avaliar Samsung Tizen e LG webOS com empacotamento e testes específicos.
- Testar foco, desempenho, codecs, reprodução longa, rede instável e recuperação após suspensão.
- Publicar por etapas, com plano de reversão e monitoramento.
**Concluída quando:** matriz de dispositivos testados, limitações documentadas e aprovação explícita antes de qualquer lançamento.

## Ordem de prioridade
1. Auditoria do código atual e mapa de dependências.
2. Rota TV isolada e navegação por controle remoto.
3. Rádio e canais ao vivo.
4. Pareamento seguro com celular.
5. Notícias, clima, programação e lembretes.
6. Chat e curtidas.
7. Publicidade e relatórios.
8. Empacotamento e expansão para fabricantes.

## Fora do escopo inicial
- Alterar ou substituir o backend atual.
- Migrar banco de dados.
- Alterar o comportamento de produção de `/player`.
- Prometer publicação em lojas de Smart TV antes de testes reais e requisitos de cada fabricante.
