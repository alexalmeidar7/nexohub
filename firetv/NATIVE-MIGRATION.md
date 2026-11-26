# Nexo Player TV nativo

O Nexo Preview é a referência visual e funcional. O módulo `native-tv` contém a base nativa em Kotlin e Compose. O módulo `app` ainda contém o lançador WebView legado. A migração ocorre em paralelo e a instalação final depende da validação de todas as telas.

## Arquitetura

- A interface usa Compose para TV e componentes próprios, com base nas dimensões do Preview em 1920 × 1080. O menor fator de escala entre largura e altura preserva proporções. A conversão para dp e sp considera a densidade física e mantém a tipografia proporcional à tela. A fonte é copiada diretamente de `public/fonts/Roboto.ttf` no build.
- O transporte usa a chave publicável existente e as mesmas APIs do House Mix. A TV consulta a emissora, o conteúdo ao vivo e o histórico nos endpoints públicos. Identidade autenticada e permissões de escrita dependem de uma sessão validada pelo servidor.
- O player de produção usará Media3 para áudio, vídeo e HLS. A camada de reprodução terá um único proprietário da mídia entre Home e Watch. Navegação, pausa deliberada, reconexão, atraso dos controles e restauração de foco seguem as regras do Preview.
- O pareamento atual devolve o estado e os dados do perfil, sem emitir uma sessão Supabase para a TV. O código de pareamento, o e-mail e o identificador do perfil não concedem acesso à conta. Para curtir, votar e acessar dados privados na TV após o pareamento, falta validar um fluxo de emissão de sessão autenticada e armazenamento seguro no Android Keystore.
- A tecla Home pertence ao sistema. As demais ações serão mapeadas no Compose com foco explícito para cada combinação de tela e estado.

## Cobertura para a instalação final

| Fluxo | Contrato atual | Validação obrigatória |
| --- | --- | --- |
| Entrada, perfis e QR | Player TV, `tv-pair-create`, `tv-pair-status` e login no celular | Visitante, sessão autenticada, expiração, volta e troca de perfil |
| Home e programação | `public-player-data` e programação da emissora | Programa no ar, apresentadores, cards e navegação |
| Áudio, vídeo e catálogo | Canais e serviços atuais do House Mix | Reprodução, mudo, reconexão, continuidade e transições |
| Interatividade | Chat, letra, previsão, enquete e histórico persistido | Foco, animações, dados carregados e retorno aos atalhos |
| Conta | Sessão do ouvinte, curtidas e pontuação | Identidade, lista persistida e proteção por conta |

O Fire TV verificado usa Android API 28, com 1920 × 1080 físicos e densidade 320. Os pacotes atuais da Positiva permanecem disponíveis para avaliação. A validação final também deve incluir Android TV ou Google TV e verificar assinatura compatível antes de atualizar o pacote instalado.

A base nativa exige API 26 para usar a fonte variável de referência. Execute `gradle -p firetv/native-tv testDebugUnitTest` com JDK 17, Gradle 8.9 e Android SDK 35. O pacote de biblioteca é independente da geração do APK legado.

## Comparação visual

1. Capture o Preview aprovado no mesmo tamanho de quadro a ser testado.
2. Congele dados variáveis em uma sessão de teste local, incluindo relógio, música, locutor e estado de rede. Capture o mesmo estado no Android TV.
3. Compare PNGs com `node firetv/qa/compare-screens.cjs <referencia.png> <android.png> <diferenca.png>`. Quadros de tamanhos diferentes falham antes da comparação. O resultado deve indicar cobertura e localizar os pixels divergentes.
4. Corrija a implementação nativa e repita com a mesma referência. Use os testes funcionais de foco e reprodução junto da comparação visual.
5. Gere o APK para instalação somente depois da revisão das telas, da paridade funcional e da comparação no dispositivo.

Referências oficiais para [Compose na TV](https://developer.android.com/training/tv/playback/compose), [Media3 na TV](https://developer.android.com/media/media3/ui/androidtv) e [testes por captura](https://developer.android.com/training/testing/ui-tests/screenshot).
