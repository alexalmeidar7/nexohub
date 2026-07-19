# Redesign — Player de Áudio (`/player` — modo áudio)

Layout novo baseado no mockup anexado. Substitui a tela atual do player de áudio (`src/pages/Player.tsx` no modo audio) mantendo `PlayerHome`, `WelcomeScreen` e demais telas intactas.

## Estrutura visual

```text
┌───────────────────────────────────────────────────────────────────────┐
│ ▲▼ canal            [ao vivo][chat][karaoke][músicas tocadas]   LOGO │
│    Cultura FM Áudio                                              CANAL│
│                                                                       │
│   ┌─────┐┌─────┐┌─────┐┌──────────────────┐                          │
│   │23:22││23:22││23:17││ no ar        ♥   │  a seguir                │
│   │tocou││tocou││tocou││                  │  top 20 da cultura       │
│   │ ... ││ ... ││ ... ││  [FOTO LOCUTOR]  │  17:00/18:00             │
│   └─────┘└─────┘└─────┘│                  │       ⊕ (grade)          │
│  ← carrossel 50 últimas│  no ar           │                          │
│                        │  sabadão cultura │                          │
│                        │  12:00/17:00     │                          │
│                        │  ▓▓▓▓▓▓▓░░░░     │                          │
│                        └──────────────────┘                          │
│                                                            [ao vivo] │
│ ▓▓▓▓▓▓▓▓▓▓●─────────────────────────────────────────────────────────  │
│                          ▶ / ❚❚                              ? nexo  │
└───────────────────────────────────────────────────────────────────────┘
```

## Componentes / arquivos

- `src/pages/player/AudioPlayerScreen.tsx` (novo) — tela completa do player de áudio.
- `src/components/player/audio/ChannelSwitcher.tsx` — botões ▲▼ + label do canal atual.
- `src/components/player/audio/TopActions.tsx` — pills "ao vivo / chat / karaoke / músicas tocadas".
- `src/components/player/audio/NowPlayingCard.tsx` — card central: foto locutor, gradiente extraído da foto (2 cores via `coverPalette`), nome do programa, horários, progresso.
- `src/components/player/audio/HistoryCarousel.tsx` — carrossel horizontal empilhado à esquerda com últimas 50 músicas (capa + nome + horário) com animação de "empurrar" a cada nova música.
- `src/components/player/audio/UpNextPanel.tsx` — "a seguir" + botão ⊕ que abre `PlayerGradeDialog`.
- `src/components/player/audio/TimeshiftBar.tsx` — barra inferior com scrubbing dos últimos 5 min + botão play/pause central + pill "ao vivo".
- `src/hooks/useAudioTimeshift.ts` — buffer rolling de 5 min via `MediaSource` + `SourceBuffer` do HLS.js (grava segmentos em memória; permite `currentTime` retroativo até 300 s).
- Reutilizar: `useGlobalMusicSync`, `fetch-artist-image` (via `artistImageCache`), `coverPalette.extractPaletteFromImage`, `PlayerGradeDialog`, chat/karaoke/músicas tocadas já existentes.

## Dados

- Últimas 50 músicas: query em `music_history` do owner do canal (edge `public-player-data` já retorna histórico; ampliar `limit` para 50).
- Programa no ar + a seguir: já vem de `programas` / grade atual usada em `PlayerHome`.
- Foto locutor: `apresentadores.foto_url` do programa atual.
- Palette do gradiente: `extractPaletteFromImage(fotoLocutor)` → CSS `linear-gradient(135deg, c1, c2)`.

## Timeshift 5 min (áudio)

- HLS.js configurado com `backBufferLength: 300` já mantém segmentos em memória.
- Scrubbing: setar `audio.currentTime = liveEdge - offset` (0–300 s).
- Botão "ao vivo" volta para `liveSyncPosition`.
- Se o stream não permitir seek retroativo (algumas origens rejeitam), esconder a parte "-5 min" e manter só barra "ao vivo" (fallback silencioso).

## Navegação

- Teclado espacial já existente é aplicado nos elementos com `data-focusable`: switcher, cada pill, card no ar, painel a seguir, ⊕, timeshift, play/pause.
- Carrossel de histórico avança sozinho quando nova música entra (animação slide + fade da nova capa entrando da direita, empurrando as antigas para a esquerda).

## Fora de escopo

- Não altero `WelcomeScreen`, `PlayerHome`, nem player de vídeo.
- Não crio novo bucket/edge para gravar áudio no servidor — o timeshift usa buffer client-side do HLS (5 min é o que o HLS mantém em memória sem custo de storage). Deixo comentário no código explicando o trade-off caso queira depois virar server-side.
