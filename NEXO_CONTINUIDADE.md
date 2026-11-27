
# Nexo Player TV — passagem de trabalho

## 26/11/2026 — estado relatado no encerramento da sessão

**Base:** código local em `nexohub-git`, incluindo as últimas mudanças do Codex na Home. O snapshot remoto e os ZIPs anteriores não comprovam o estado atual do PC. Confirmar localmente antes de alterar.

**P0 — próxima sessão:** identificar a divergência real Preview × Fire TV (rota, componente, CSS, asset servido, parâmetros de TV e cache). Houve uso comprovado de build antigo `artifacts/positiva-debug-webview` em 8080 nesta sessão; depois foi orientado usar `dist`. Não presumir que a divergência atual seja a mesma causa. Conferir em ambos os dispositivos antes de outras correções.

**Pendentes relatados pelo usuário:**
- Blink na Home permanece, mesmo após correção do Codex da atualização de hora certa. Preservar a correção existente e capturar o problema real.
- Ícones do tempo: Rounded Bold, branco, flat, animados e maiores; opção 02 aprovada, ainda visualmente incorreta.
- Popup de programa: Preview e Fire TV exibem layouts diferentes; unificar implementação e preservar respiros, botão Voltar e foto.
- Pre-Roll: botão Pular não apareceu no Preview nem com 2 s restantes; deve surgir nos últimos 5 s, à direita do contador, com foco transferido do QR. Decidir elegibilidade antes de mostrar canal.
- Borda de perfil já foi reportada cortada/duplicada; confirmar estado atual. Apenas contorno externo branco afastado, sem recorte.

**Regressões a proteger (não declarar validadas sem teste):**
- Navegação ↑↓ confinada ao menu lateral; → Grade/Home Banner; na tela de áudio Play/Pause ↑↓ para setas superior/inferior; → botão à direita mais próximo. Na tela de vídeo, foco inicial Play/Pause ao reaparecerem controles.
- Áudio sem cortes ou duplicação entre Splash/Perfis/Home/Ouvir; ao voltar de vídeo, áudio preparado em espera silenciosa, quando suportado. Vídeo inicia automaticamente e recupera falhas sem repetir anúncios. Preparar dados e imagens durante Splash sem bloquear tarefas opcionais.
- Grade e popup animados, navegação vertical suave, fotos pré-carregadas, banner mantido montado atrás da grade e durante interatividade.
- Fundo mantém imagem anterior até próxima pronta; ciclo 20 s artista / 10 s gradiente. Smart Sync e cache preservados, sem consultas extras.

**Testes:** Codex relatou build, tipos e testes isolados na Fire TV; o usuário voltou a observar blink. Portanto não está resolvido. Não há validação independente da versão atualmente em execução neste registro.

**Próximo registro:** adicionar data, base local, alterações efetivas, resultados e pendências aqui.


## 27/11/2026 — Nexo TV nativo, 0.1.16 (PR #327)

Base remota: a5aa947 (0.1.15); correções no módulo firetv/native-tv, sem alteração de HMD/HMO, WebView ou banco. Transições de perfis e áudio, capa clicável para curtidas, patrocinador 283×283u, bandeja de vídeo abaixo do Agora com elevação por foco, contorno da publicidade, pré-carga do banner e redução de recomposição do mini-player. Smart Sync rejeita timestamps anteriores e usa dados ao vivo explicitamente não sincronizados quando não há referência temporal; Smart Audio tenta efeito de plataforma alternativo se DynamicsProcessing falhar. Adicionado teste de regressão de recuperação de metadados. Build e teste físico ainda não confirmados. Conferir na TV banners reais, sincronismo audível, nivelamento e foco antes de merge; alternativa LoudnessEnhancer não comprova paridade de normalização entre fontes.

## 27/11/2026 — Nexo TV 0.1.17 (PR #327)

Base ee68d38, build 0.1.16 aprovado; usuário reportou banner, diferenças de volume, Smart Break, histórico e navegação. Alterações nativas: seleção de programa pela grade local, banner fora do container animado, nivelamento PCM RMS comum, Smart Break sem bloqueio por relógio indisponível, grade sobreposta, histórico quadrado com anúncio a cada cinco faixas, teclado de busca interno, curtida de vídeo e selo de canal. Smart Sync automático desde splash; sem garantia de alinhamento para stream sem relógio ou metadados. CI e testes físicos pendentes. Nenhuma alteração de dados ou backend.

## 27/11/2026 — Nexo TV 0.1.18 (PR #327)

Base a25b5a5, build 0.1.17 aprovado. Home: ocultar programa, patrocinador, interatividade e degradê durante background ads; animar banner e escurecer interatividade. Pre-roll: botão pular ao lado da publicidade com seta. Smart Break: arte fornecida pelo usuário empacotada em WebP; popup com texto à direita e QR deslizante; contador e encerramento usam music_start_time e music_current_duration do House Mix via API existente (sem inventar horário quando ausente). Teste de build e TV pendentes; sem alterações no HMD/HMO/Supabase/WebView.

## 27/11/2026 — Nexo TV 0.1.19 (PR #327)

A função public-player-data em produção omitia music_current_duration do objeto musicData apesar do valor existir no banco. Corrigida em produção (v6) preservando JWT, consultas e demais contratos; mantido o mesmo campo no GitHub com fallback legado. No Smart Break: controles no canto superior esquerdo, contador no direito com indicação --:-- se dados ausentes, botão Voltar menor e recuado, CTA no rodapé, QR sem botão adicional e foco mantido no CTA ao alternar. Build e teste físico pendentes.
