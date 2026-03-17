

## Plano: Integração Google Calendar com OAuth por Usuário

### Pré-requisito: Credenciais Google Cloud

Antes de começar a implementação, você precisará criar as credenciais no Google Cloud Console:

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um projeto (ou use um existente)
3. Ative a **Google Calendar API** em "APIs & Services → Library"
4. Configure a **Tela de Consentimento OAuth** (OAuth Consent Screen):
   - Tipo: External
   - Adicione os escopos: `https://www.googleapis.com/auth/calendar.readonly`
   - Adicione os domínios autorizados: `lovable.app`
5. Crie credenciais **OAuth 2.0 Client ID** (tipo: Web Application):
   - **Authorized redirect URIs**: `https://zzjfzxxvxbspbdkodoix.supabase.co/functions/v1/google-calendar-callback`
6. Anote o **Client ID** e **Client Secret** — vou pedir para configurá-los como secrets

### Arquitetura

```text
┌─────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│  AgendaPage │────▸│  Edge Functions (3)  │────▸│  Google Calendar │
│  (frontend) │     │  google-calendar-*   │     │  API v3          │
└─────────────┘     └─────────────────────┘     └──────────────────┘
       │                     │
       ▼                     ▼
  agenda_eventos      google_calendar_tokens
  (internal events)   (OAuth tokens per user)
```

### O que será criado

#### 1. Tabela `google_calendar_tokens`
Armazena tokens OAuth por usuário (access_token, refresh_token, expiry). RLS: cada usuário gerencia apenas seus próprios tokens.

#### 2. Três Edge Functions
- **`google-calendar-auth`** — Gera a URL de autorização OAuth do Google e redireciona o usuário
- **`google-calendar-callback`** — Recebe o código de autorização, troca por tokens, salva na tabela
- **`google-calendar-events`** — Busca eventos do Google Calendar do usuário (com refresh automático de token expirado)

#### 3. Atualização da AgendaPage
- Botão "Conectar Google Calendar" (quando não conectado)
- Badge "Google conectado" com opção de desconectar
- Eventos do Google Calendar exibidos junto aos internos com diferenciação visual:
  - **Eventos internos**: ícone de calendário azul marinho (atual)
  - **Eventos Google**: ícone do Google Calendar em verde com borda esquerda verde
- Filtragem unificada por data funciona para ambos os tipos

#### 4. Secrets necessários
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### Diferenciação visual dos eventos

| Tipo | Cor da borda esquerda | Ícone | Badge |
|------|----------------------|-------|-------|
| Interno | azul marinho | CalendarIcon | — |
| Google | verde (#34A853) | Globe/ExternalLink | "Google" em verde |

