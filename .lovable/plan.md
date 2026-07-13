
# Chatbot WhatsApp — NexoHub

Sistema completo de WhatsApp integrado à Meta Cloud API oficial, plugado na seção **Chatbot** do NexoHub.

## Arquitetura

```text
Ouvinte (WhatsApp)
      │
      ▼
Meta Cloud API  ──webhook──►  edge fn: whatsapp-webhook
                                      │
                                      ├─► grava em wa_messages
                                      ├─► roda automação ativa (wa_flows)
                                      └─► envia resposta via edge fn: whatsapp-send

NexoHub / Chatbot UI
      ├─ Caixa de Entrada (Realtime) ──► whatsapp-send
      ├─ Construtor de Automações  ──► wa_flows
      └─ Disparo em Massa          ──► whatsapp-broadcast
```

## Credenciais Meta (a pedir depois que o webhook estiver no ar)

1. `WHATSAPP_ACCESS_TOKEN` — token permanente do App Business
2. `WHATSAPP_PHONE_NUMBER_ID` — ID do número
3. `WHATSAPP_VERIFY_TOKEN` — string aleatória que gero para o handshake do webhook
4. `WHATSAPP_APP_SECRET` — para validar assinatura das requisições

Fluxo: **primeiro** publico o edge function `whatsapp-webhook`, **depois** te passo a URL + Verify Token para você colar no painel da Meta, **depois** peço os 3 secrets restantes.

## Banco de dados (Lovable Cloud)

Tabelas novas (todas com RLS por `user_id` + GRANTs):

- **wa_contacts** — `id, user_id, phone, name, profile_name, ouvinte_id (fk ouvintes), tags[], last_message_at, unread_count, blocked`
- **wa_messages** — `id, user_id, contact_id, direction (in/out), type (text/image/audio/template), body, media_url, wa_message_id, status (sent/delivered/read/failed), automation_id, created_at`
- **wa_flows** — `id, user_id, name, trigger (keyword/first_contact/any), trigger_value, steps (jsonb), active, created_at`
- **wa_broadcasts** — `id, user_id, name, template_or_text, audience_filter (jsonb), scheduled_at, status, sent_count, total_count, created_at`

Ligação com **ouvintes** existente: `wa_contacts.ouvinte_id` referencia `ouvintes.id`. Quando a automação de cadastro completa, cria/atualiza registro em `ouvintes` e amarra ao contato.

## Edge Functions

1. **whatsapp-webhook** (`verify_jwt=false`)
   - GET: responde `hub.challenge` validando `WHATSAPP_VERIFY_TOKEN`
   - POST: valida assinatura HMAC com `WHATSAPP_APP_SECRET`, grava mensagem, executa automação
2. **whatsapp-send** — envia texto/mídia via Graph API, grava outbound em `wa_messages`
3. **whatsapp-broadcast** — dispara em lote respeitando rate-limit da Meta (fila com pausa)
4. **whatsapp-flow-runner** (interno, chamado pelo webhook) — executa passo atual da automação e persiste estado no contato

## Automação de Cadastro do Ouvinte

Fluxo fixo (sem IA), executado no primeiro contato ou pela palavra-chave `cadastrar`:

```text
1. "Olá! 👋 Sou o assistente da rádio. Qual seu *nome completo*?"
2. "Prazer, {nome}! Qual sua *cidade*?"
3. "Qual sua *data de nascimento*? (dd/mm/aaaa)"
4. "Qual seu *e-mail*?"
5. "Qual sua *música* ou *artista favorito*?"
6. Confirma resumo → salva em `ouvintes` + amarra `wa_contacts.ouvinte_id`
7. Menu: [1] Pedir música  [2] Participar de promoção  [3] Falar com locutor
```

Estado do fluxo guardado em `wa_contacts.flow_state (jsonb)`. Validação server-side de cada resposta (email, data, tamanho). Fora do fluxo: responde "Um humano irá te responder em breve" e marca `unread`.

## UI — `src/components/ChatbotHome.tsx` (substitui placeholder)

Layout com 4 abas (pills no estilo NexoHub existente):

- **Caixa de Entrada** — split view: lista de conversas à esquerda com badge de não lidas, painel de chat à direita com histórico + composer. Atualização via Supabase Realtime na `wa_messages`. Botão "Assumir humano" pausa automação para aquele contato.
- **Automações** — lista de fluxos + editor visual simples (passos sequenciais: pergunta → validação → salvar campo). Toggle ativo/inativo. Fluxo "Cadastro de Ouvinte" já vem pré-criado.
- **Disparo em Massa** — form: nome, mensagem, seletor de público (todos / por cidade / por tag), agendar ou enviar agora, barra de progresso.
- **Contatos** — tabela dos `wa_contacts` com filtros, link para o ouvinte cadastrado, exportação CSV.

Design segue o padrão `nexo-form-design-system` já em memória (pill cyan/lime, Montserrat, bg #D6F4FB).

## Ordem de execução

1. Criar migrações (tabelas + RLS + GRANT) e gerar `WHATSAPP_VERIFY_TOKEN`
2. Publicar `whatsapp-webhook` (GET handshake pronto)
3. **Pausa** → te entrego a URL do webhook + Verify Token para você colar na Meta e configurar o app
4. Você me passa `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` via secrets seguros
5. Publico `whatsapp-send`, `whatsapp-broadcast` e o runner de fluxo
6. Substituo `ChatbotHome.tsx` pelas 4 abas funcionais
7. Testes: envio/recebimento, automação de cadastro completa até salvar em `ouvintes`, disparo em massa para 2-3 números

## Riscos / observações

- Meta exige **template aprovado** para iniciar conversa depois de 24h sem resposta do usuário. Mensagens dentro da janela de 24h são livres. O disparo em massa para usuários "frios" precisará de template aprovado no Business Manager — sinalizo isso no UI.
- Número precisa estar verificado no Meta Business e o app fora do modo dev para atingir usuários fora da lista de teste.
- Rate limit inicial da Meta: 250 conversas/24h (Tier 1). Escala automaticamente.

Confirma que posso seguir por aí? Assim que aprovar eu começo pelo banco + webhook e te aviso quando for hora de configurar na Meta.
