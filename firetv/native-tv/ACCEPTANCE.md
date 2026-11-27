# Aceite da migração — PR #327

Referência: [especificação obrigatória](NEXO_TV_ESPECIFICACAO_NATIVA.md). Esta matriz é um registro de validação, não uma lista de funções certificadas. Só marcar após anexar evidência real.

- [ ] Splash frio: captura referência/nativo, logo, texto, pontos e saída; teste de rede ruim e timeout.
- [ ] Entrada, perfis, QR Google e sessão real.
- [ ] Home: foco, mini-player, No Ar, foto, banner, patrocinador, clima, vidro.
- [ ] Áudio: continuidade, capa, espectro real, idle 5 s e retorno.
- [ ] Vídeo: tela cheia, canais, controles, ausência de áudio duplo.
- [ ] Grade de sete dias, detalhes, foco e rolagem.
- [ ] On Demand, busca, teclado, retorno.
- [ ] Interatividade: letra, enquete, batalha, chat, tempo, CEP, histórico e curtidas.
- [ ] Smart Sync, Smart Break e pré-roll.
- [ ] Skeletons, pré-carregamento, recuperação de rede, testes prolongados.
- [ ] Comparação 1920×1080 e 720p, Positiva e Interativa, hardware real.
- [ ] Assinatura/atualização e aprovação final do usuário.

Nenhum item possui evidência integral neste commit. O APK gerado pelo CI permanece piloto de desenvolvimento. Não publicar como final nem fazer merge até a validação.

## Correção de entrada v0.1.3
Fluxo frio Splash → escolha de visitante → Home; pré-buffer silencioso e reprodução somente após a escolha. Edição local de visitante. Build, captura física e paridade visual pendentes. Conta Google e perfis autenticados ainda não concluídos: a função tv-pair-redeem não consta na referência Git, não confiar em dados de claim como sessão autenticada. Nenhuma mudança de banco neste commit.

## Lote 0.1.4 — ajustes de TV física
Alterações de código: recorte circular/cápsula, menu em overlay, busca modal de canais/programas/apresentadores/histórico (catálogo de vídeos e destinos específicos ainda parciais), clima/CEP, espectro PCM, cards de interatividade, histórico vertical e fallback iTunes, letra, setas entre canais ao vivo, retratos 56u, ícones/banners por flavor, logo Nexo no splash e leitura dominantColor/homeAccent. Não validados em TV física. Enquete, votação/curtidas, chat, batalha, sessão Google segura, pré-roll e assinatura permanente continuam pendentes. Não considerar os 16 ajustes concluídos.

## 0.1.5 — integrações nativas
Implementação inicial de pré-roll, resgate seguro de pareamento via nexo-tv-device, sessão Keystore, RPC de enquete/batalha, curtidas e chat por QR. A publicação das Edge Functions/migrações existentes e validação de RLS, RPCs e campanhas reais no ambiente oficial são necessárias. Perfis secundários, relatório de impressões e fidelidade visual dos novos painéis ainda não certificados. Assinatura permanente exige secret NEXO_TV_KEYSTORE_B64 (keystore de piloto com alias androiddebugkey e senha android); cache não garante estabilidade. Não marcar como pronto apenas pelo build.

## 0.1.7 — retorno da TV física
Reprodução ao vivo não aguarda API de campanha: pré-roll somente com campanha elegível já carregada, retomada em falha, reinício de stream idle/ended e fallback Media3 padrão em erro de decoder/audio sink. Pareamento usa contrato de produção (code UUID, displayCode 4 dígitos, proof, tv-pair-redeem e verify OTP). Não publicar versões antigas de tv-pair-create/status/claim por cima do servidor. CEP com teclado compacto nativo, seta superior nos painéis e mensagens, programação escondida durante interatividade, sem patrocinador no vídeo, menu com curva e tempos do CSS aprovado. Ícones por densidade e banners por flavor com inspeção do APK no CI. Fire OS pode não mostrar artwork de Appstore em sideload; verificar em hardware. Assinatura estável ainda depende do secret protegido. Não certificado em TV física.

## 0.1.8 — retorno de campo
Restaurado ExoPlayer padrão da versão anterior ao processador PCM customizado; espectro real temporariamente substituído por indicador play/pause, sem simulação. HLS explícito para .m3u8, retomada limitada e logs NexoPlayback. Pré-roll não repete em cada tentativa e libera stream após desmontagem da publicidade. CEP aceita country Brasil/Brazil e country_code BR, valida cidade/UF e fallback de geocodificação. Foco direcionado, modal sem foco nos controles de fundo e timeout de 8s. Capas/mipmaps já conferidos visualmente no repositório; logs NexoLauncher e manifesto no CI permitem distinguir recurso local de bug de launcher do Fire OS. A capa horizontal da Appstore depende da listagem Amazon; sideload não garante a capa. Não validado em TV física.

## 0.1.10 — correções de campo
Fade de áudio e perfis, espectro PCM com fallback de renderer, foto de artista atualizada com faixa, rotação de locutores, foco de programação/banner/curtida/interatividade, clima, letras, fotos de batalha, pré-roll 15s, Smart Sync via relógio HLS, Smart Break via campanha e prazo de duração. Lembretes locais por perfil. Requer validação em TV física; nenhuma alteração na chave de assinatura.

## 0.1.12 — reprodução e Home
Media3 padrão, conexão HTTPS com timeouts explícitos, reconstrução de media item após falhas e diagnóstico LIVE_FAILURE. Espectro PCM temporariamente suspenso para isolar regressão de playback (sem animação simulada). Background ads independente: 60s após entrar, 10s de publicidade, 60s sem publicidade, rotação e fade. Avatar para banner; QR lateral sem modal, alternável por clique e encerrado por mudança de foco; margem QR padrão de quatro módulos. Ícones climáticos vetoriais brancos animados. Sem mudanças de assinatura ou launcher. Requer teste físico, especialmente streaming e QR.

## 0.1.13 — ajustes de campo
Retorno de foco à interatividade; transição de apresentador/banner na publicidade de fundo; pré-cálculo da grade e spinner; informações do programa opacas; CEP centralizado; QR de anúncios compacto e sempre visível, Smart Break com retorno à Home e explicação/contato; chat com rolagem ao fim e QR central sobre mensagens; histórico com deduplicação de registros próximos e cache de capas; batalha horizontal; capas originais dos canais Positiva. YouTube não é URL Media3: canal Cast exige implementação de reprodução compatível ou fonte direta. Assinatura e streaming da versão anterior preservados. Validar em TV física.

## 0.1.14 — Smart Sync nativo
Fila de faixas por timestamp; prioridade HLS/PDT, metadados temporizados ICY/ID3 quando correspondem à faixa, e calibração opcional local por estação/canal. Sem referência temporal, mantém a última faixa conhecida até obter referência ou calibração. Consulta leve a cada 2s (como WebView), arte enriquecida fora da consulta. Smart Break usa o relógio sincronizado. Nenhum atraso universal; sem alterações de assinatura, endpoints, engine de reprodução ou WebView. Validar latências diferentes, troca de canal, pausa/reconexão e streams sem timestamp em TV física.

## 0.1.15 — Smart Audio, Home e pré-roll
Smart Audio padrão por sessão Android (compressor de faixa única, compensação moderada e limitador; sem captura de microfone nem alteração do renderer). API 28+ com suporte ao efeito; fallback para reprodução original quando indisponível ou com erro. Não é medição BS.1770/LUFS nem normalização de arquivo no cadastro. Home: entrada/transição do No Ar, programa, horário e locutor; rodapé de patrocinador 283 unidades, banner centralizado e interatividade alinhada; patrocinador cede espaço ao QR lateral quando aberto. Pré-roll: primeira oportunidade independente por áudio/vídeo, cooldown de 15 min por tipo mantendo regra de retorno Home, só conta quando reproduziu; espera inicial limitada para campanhas; logs por placement; HTTP do Media3 e fade de comerciais. Sem alterações no WebView, Smart Sync, assinatura ou Supabase. Validar efeitos de áudio, vídeo e layout em TV física.
