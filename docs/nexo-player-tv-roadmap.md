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


## Auditoria inicial do repositório (17/10/2026)

Arquivos verificados na branch `main`:
- `src/App.tsx`: já existem rotas `/player`, `/player/watch`, `/player/catalog`, `/player/app` e rotas por emissora `/:userSlug/player` e `/:userSlug/player/tv`.
- `src/pages/Player.tsx`: player existente e extenso, com áudio/HLS, autenticação, dados da emissora e diversos componentes de interface. Deve ser tratado como fluxo legado a preservar.
- `src/pages/player/PlayerHub.tsx`: hub de entrada já tem modo convidado por `?tvGuest=1`, passos de login/splash/welcome/home e hook de foco para TV. É um ponto de reaproveitamento, mas precisa de revisão antes de ser expandido.
- `src/pages/player/PlayerCatalog.tsx`: catálogo existente consulta canais em `streaming_channels` e busca conteúdo de playlists.
- `src/pages/player/AccessScreen.tsx`: fluxo de autenticação já existente; QR pairing seguro será um fluxo complementar, não substituição improvisada do login.

### Implicações
1. Não criar uma segunda experiência paralela sem antes entender o hub e as rotas atuais.
2. Fazer o primeiro protótipo como rota TV isolada, com sinalização explícita de experimento e sem alterar o comportamento de `/player`.
3. Antes de QR login/chat/notificações, identificar os serviços e políticas de acesso existentes no Lovable Cloud; não criar tabelas ou funções de produção nesta etapa.
4. Validar foco com controle remoto, foco visível, navegação por setas/Enter/Voltar, e comportamento em telas 16:9.
5. A auditoria é parcial: ainda faltam mapear o schema/políticas de dados, serviços de notícias/clima/programação e a estratégia de empacotamento por fabricante.
