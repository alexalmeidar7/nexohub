# Redesign Player — Estilo Apple TV

Refatoração visual completa das 3 telas do fluxo `/player` (Splash → Boas-vindas → Home), seguindo os mockups anexados. Tipografia global do player passa a ser **Lufga**. Toda a paleta, raios, sombras e degrades ficam confinados ao escopo do player (não afeta o resto do app).

## 1. Tipografia Lufga (global do player)

- Adicionar `@font-face` para Lufga (Regular 400, Medium 500, SemiBold 600, Bold 700) em `src/index.css` sob um seletor escopado (`.player-scope { font-family: 'Lufga', ...}`).
- Arquivos das fontes hospedados via `lovable-assets` a partir de `/mnt/user-uploads/` se o usuário anexar depois; enquanto isso uso `Lufga` com fallback CDN (`fontshare`) para não quebrar. Se falhar, cai para `-apple-system, "SF Pro Display"` — mesmo espírito Apple TV.
- Wrapper `<div className="player-scope">` no `PlayerHub` para não vazar em outras páginas.
- Todo texto em lowercase quando o mockup mostra (títulos, labels de card, nav).

## 2. Tela 1 — Splash Video Loading

Ajustes em `SplashScreen.tsx`:
- Mantém o vídeo em background full-cover.
- **Novo loader**: círculo aberto ~48px, stroke fino branco com um arco degradê branco→transparente girando (idêntico ao print). Substitui o `ElegantLoader` lime **apenas** dentro do splash. Componente novo `SplashRingLoader`.
- Posição do loader inalterada (12vh do bottom, centralizado).
- Fallback visual mantém logo Nexo Player.

## 3. Tela 2 — Boas-vindas (`WelcomeScreen.tsx`)

Reescrita para bater com o mockup:
- **Background**: `thumb` do canal (campo `empresa_config.thumb` / `capa` — uso o que existir; hoje o `PlayerHub` já busca `logo` e `nome`, vou estender `public-player-data` e a query autenticada para trazer também `thumb`). Cover, sem blur, com leve overlay escuro `linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.55))` para legibilidade.
- **Canto sup. esquerdo**: texto `"bem vindo de volta"` em Lufga bold, lowercase, ~40px, branco.
- **Abaixo do texto**: card do avatar — thumbnail 3D estilo memoji (mantém o avatar do perfil se houver, senão placeholder 3D genérico), rótulo com nome + estrelas (rank já existente) + pontos.
- **Hover no avatar**: aparece ícone lápis flutuante no canto sup. direito do card + botão "sair" abaixo (como no mockup).
- **Se não logado**: mesmo card mostra CTA "entrar com google" (usa `lovable.auth.signInWithOAuth('google')` já existente no `AccessScreen`). Nesse caso não há auto-avanço.
- **Auto-avanço**: se logado e sem interação por 3s, mostra no canto inf. esquerdo o pill `entrando automático em 3…2…1` (Lufga medium, fundo `rgba(255,255,255,.08)`, radius 10px, padding 10x14). Ao zerar, `onContinue()`. Qualquer hover/click no avatar cancela o timer.
- Cantos arredondados dos cards: **28px** (bate com Apple TV / mockup).

## 4. Tela 3 — Home Player (`PlayerHome.tsx`)

Reestruturação completa da home:

### Header
- Nav lowercase Lufga: `home · streamings · on demand · buscar` alinhado à esquerda, item ativo com sublinhado fino branco.
- Campo `buscar` como pill com borda `rgba(255,255,255,.25)` + ícone lupa.
- Canto sup. direito: avatar do usuário + logo do canal (empresa).

### Background
- `thumb` do canal ocupa a viewport (mesmo overlay do welcome).

### Linha de cards (regra: **sempre 1 linha visível**)
Container flex horizontal, gap 20px, altura fixa (~230px), cards com radius 28px.

1. **Card OUVIR** (streaming áudio)
   - Fundo: degradê gerado a partir de **2 cores dominantes da foto do locutor no ar** (uso `src/lib/coverPalette.ts` que já existe — extraio 2 amostras e faço `linear-gradient(135deg, c1, c2)`).
   - Chip `ouvir` no topo esquerdo.
   - Foto do locutor recortada à direita (mask com fade suave para a esquerda).
   - Texto: `no ar` / `<nome do programa>` (bold) / `HH:MM/HH:MM`.
2. **Card ASSISTIR** (streaming vídeo)
   - Fundo: imagem do artista tocando agora, tratada P&B + `opacity: .64` sobre base preta.
   - Chip `assistir` topo esquerdo.
   - `tocando` / `<nome música>` (bold) / `<artista>`.
3. **Card MINHA PLAYLIST** (condicional: logado **e** com músicas curtidas)
   - Fundo azul acinzentado com ícone 3D de notas musicais (uso ícone já existente ou emoji `🎵` estilizado 3D — se necessário gero um asset PNG transparente).
   - Label `minha playlist`.

### Navegação por linhas
- Mostrar sempre **uma** linha por vez. As outras linhas (streamings/on demand/etc já existentes no `PlayerHome` atual) viram "páginas verticais" que trocam via:
  - Scroll wheel (debounced, 1 troca por ~500ms).
  - Setas ↑ ↓ do teclado para trocar de linha.
  - Setas ← → para focar entre os cards da linha atual (com anel de foco sutil).
- Transição: crossfade + translateY(24px) 400ms cubic-bezier(.22,1,.36,1).
- Indicador de linha discreto na lateral direita (bolinhas verticais).

### Logo Nexo Player
- PNG anexado (`user-uploads://LOGO_-_NEXO_PLAYER.png`) importado via lovable-assets.
- Fixo no canto inferior direito, `opacity: .40`, altura ~40px, junto do botão `?` de ajuda existente.

## 5. Dados adicionais necessários

- `public-player-data` (edge function) e a query autenticada devem retornar `empresa.thumb` (se não existir a coluna, uso `capa` ou `logo` como fallback). **Não** crio migration nova a menos que confirme falta da coluna — checo `types.ts` antes.
- Reaproveita `useGlobalMusicSync` (música/artista tocando) e `EPG` atual (programa no ar + horários).

## 6. Escopo e não-escopo

**Dentro**: `SplashScreen.tsx`, `WelcomeScreen.tsx`, `PlayerHome.tsx` (header + primeira linha + navegação entre linhas), Lufga global no scope do player, logo Nexo Player, novo loader do splash, extração de paleta para o card Ouvir.

**Fora** (mantém como está): telas `Streamings`, `On Demand`, `Catálogo`, Player em execução (bottom bar), Chat, Grade EPG, Shopping — só os cards de entrada da Home mudam.

## Arquivos previstos

- `src/index.css` — @font-face Lufga + escopo `.player-scope`.
- `src/pages/player/SplashScreen.tsx` — novo `SplashRingLoader`.
- `src/pages/player/WelcomeScreen.tsx` — reescrita seguindo mockup.
- `src/pages/player/PlayerHome.tsx` — novo header + linhas paginadas + navegação teclado/scroll.
- `src/pages/player/PlayerHub.tsx` — wrapper `.player-scope` + fetch de `thumb`.
- `src/pages/player/hooks/useRowPager.ts` — novo hook para navegação vertical entre linhas.
- `src/assets/nexo-player-logo.png.asset.json` — logo via lovable-assets.
- `supabase/functions/public-player-data/index.ts` — incluir `thumb` no retorno (só se ainda não vier).

Confirma que posso seguir? Se sim, implemento tudo de uma vez.
