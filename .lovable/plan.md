## Objetivo

Criar `/:userSlug/player/tv` — versão TV do welcome sem seletor de perfil, com um código de 4 dígitos e QR code para o usuário fazer login pelo celular com Google. Quando o celular autenticar, a TV entra automaticamente logada como aquele usuário.

## Fluxo

```text
[TV]                                     [Celular]
1. Abre /:userSlug/player/tv
2. Edge gera código 4 dígitos único
3. Mostra QR + código na tela
4. Escuta Realtime aguardando "claimed"
                                         5. Usuário aponta câmera → abre
                                            /:userSlug/pair?code=1234
                                         6. Faz login Google (popup Lovable)
                                         7. Confirma "vincular esta TV?"
                                         8. Edge grava paired_user_id
9. Realtime dispara na TV
10. TV salva sessão do sub-perfil e
    navega para /:userSlug/player?step=home
```

## Tabela nova: `tv_pairing_codes`

Colunas:
- `code` text PK (4 dígitos, único e ativo por vez)
- `slug_user_id` uuid — dono da rádio (owner do slug)
- `user_slug` text
- `tv_session_id` text — id efêmero gerado pela TV
- `paired_user_id` uuid null — preenchido quando o celular autentica
- `paired_email` text null
- `paired_name` text null
- `status` text: `pending` | `claimed` | `expired`
- `created_at`, `expires_at` (15 min), `claimed_at`

RLS:
- `SELECT` permitido para `anon` e `authenticated` filtrando `code` (necessário para a TV public consultar seu próprio código).
- `INSERT/UPDATE` somente via edge function (service role).

## Edge functions

### `tv-pair-create` (público)
Body: `{ userSlug, tvSessionId }`.
- Resolve `slug_user_id` a partir do slug.
- Gera código 4 dígitos evitando colisão com pendings ativos (retry até 20x).
- Expira em 15 min.
- Retorna `{ code, expiresAt }`.

### `tv-pair-claim` (autenticado)
Body: `{ code }`.
- Usa a sessão do usuário autenticado (do celular).
- Valida code pending, não expirado, e slug coincidente.
- Marca `status='claimed'`, grava `paired_user_id`, `paired_email`, `paired_name`.
- Retorna `{ ok: true, userSlug }`.

Ambas retornam 200 com `{ ok: false, reason }` em erros (padrão do projeto).

## Frontend

### Nova rota: `/:userSlug/player/tv` → `PlayerTvWelcome.tsx`
Reaproveita layout do `WelcomeScreen` (mesmo hero/background do slug), mas:
- **Sem** seletor de perfis e sem botão `+`.
- Canto inferior esquerdo: bloco com texto `Bem vindo ao player da {Nome do usuário}, para uma melhor interação faça login no QR Code abaixo.` + QR code (biblioteca `qrcode`) apontando para `${origin}/{userSlug}/pair?code=1234`.
- Também exibe o código em fonte grande (`text-tv-*`) para digitação manual, com fallback caso a câmera não leia.
- Tokens de TV (`p-tv-safe`, `text-tv-*`, `antialiased`), alto contraste.
- `useEffect`: chama `tv-pair-create` → recebe código → assina Realtime em `tv_pairing_codes` filtrando pelo `code`. Ao receber `status='claimed'`, salva a sessão de sub-perfil no localStorage do slug (mesma chave usada pelo `WelcomeScreen` hoje) e navega para `/:userSlug/player?step=home`.
- Watchdog: se expirar, regenera automaticamente um novo código.

### Nova rota: `/:userSlug/pair` → `PairPage.tsx` (mobile-first)
- Lê `?code=1234` (também com input manual se ausente).
- Se não autenticado, mostra botão "Entrar com Google" usando `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.href })`.
- Após auth: mostra card "Vincular esta TV à sua conta?" com nome/email do usuário, botão **Vincular** e **Cancelar**.
- Ao vincular: chama `tv-pair-claim` → toast de sucesso → mensagem "Pode voltar para a TV. A tela vai carregar automaticamente."

## Segurança

- Código 4 dígitos + expiração 15 min + slug scoping tornam bruteforce inviável na prática, mas a claim exige auth e valida slug — nenhuma superfície pública grava dados sensíveis.
- Não expomos IDs de usuários no payload público da TV; a TV apenas vê `paired_email`/`paired_name` do próprio código.

## Arquivos

Novos:
- `supabase/migrations/<ts>_tv_pairing_codes.sql`
- `supabase/functions/tv-pair-create/index.ts`
- `supabase/functions/tv-pair-claim/index.ts`
- `src/pages/player/PlayerTvWelcome.tsx`
- `src/pages/PairPage.tsx`

Editados:
- `src/App.tsx` — rotas `/:userSlug/player/tv` e `/:userSlug/pair`.
- `package.json` — dep `qrcode` (se ainda não estiver).

## Confirmações rápidas

1. O login no celular deve ser **Google apenas** (padrão do projeto) — OK?
2. Expiração de 15 min por código está boa, ou prefere 5/10 min?
3. Após parear, a TV entra no player usando o **nome/foto do Google** do celular como "sub-perfil" da rádio, correto?

Posso seguir com esses defaults se não houver objeção.