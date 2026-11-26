
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

