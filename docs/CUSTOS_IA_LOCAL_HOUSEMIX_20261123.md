# House Mix — serviços gratuitos e IA local (fase 1, 23/11/2026)

**Railway está fora da arquitetura.** A conta conectada não possui projetos Railway. A única referência no repositório estava em um comentário de exemplo legado do Deepgram; ela foi substituída. Nenhum serviço Railway foi criado, e nenhuma assinatura externa foi cancelada.

## IA de texto do HMD (Windows)
A interface Desktop redireciona `get-music-curiosity`, `summarize-news` e `generate-enquetes` para o Ollama na máquina (`http://127.0.0.1:11434/api/chat`). O navegador HMO **não** usa esse endpoint local e continua com suas integrações atuais.

Passos de configuração manual em cada HMD:
1. Instale Ollama de sua fonte oficial: https://ollama.com/download/windows .
2. Baixe um modelo de texto livre e adequado à sua máquina, exemplo `ollama pull qwen2.5:3b` (considere licença do modelo antes de uso comercial).
3. Mantenha o Ollama iniciado; opcionalmente defina `HOUSEMIX_OLLAMA_MODEL` (padrão `qwen2.5:3b`).

Ollama NÃO é instalado, executado ou baixado pelo House Mix automaticamente. Sem o modelo, a geração local exibe erro explícito, **sem fallback pago**. Não use hospedagem de Ollama na internet sem autenticação. O endpoint é sempre o loopback.

## Transcrição local do HMD
A tela `Monitor de Transcrição do Streaming` usa executáveis locais **ffmpeg** e **whisper.cpp** quando executada no HMD. Ela **não chama** a Edge Function `transcribe-stream`/ElevenLabs nesse modo e guarda somente o texto de cada trecho no perfil local do Windows. O histórico local é separado por rádio e o download TXT continua disponível.

Instalação manual:
1. Instale `ffmpeg`, deixando `ffmpeg.exe` no PATH ou configurando `HOUSEMIX_FFMPEG_PATH`.
2. Baixe e compile a CLI do whisper.cpp (https://github.com/ggml-org/whisper.cpp), salvando `whisper-cli.exe`.
3. Baixe um modelo multilíngue ggml (não use o sufixo `.en` para português).
4. Configure, no Windows, caminhos absolutos:
   - `HOUSEMIX_WHISPER_CLI_PATH=C:\\Ferramentas\\whisper.cpp\\whisper-cli.exe`
   - `HOUSEMIX_WHISPER_MODEL_PATH=C:\\Ferramentas\\whisper.cpp\\models\\ggml-small.bin`
   - `HOUSEMIX_FFMPEG_PATH=C:\\Ferramentas\\ffmpeg\\bin\\ffmpeg.exe` (opcional se houver PATH)
5. Reinicie o aplicativo HMD depois das variáveis.

Capturas de 15 segundos podem demorar para processar em máquinas lentas; somente uma execução local por vez. Se faltar o modelo/binário, é exibido erro local e **não há fallback para ElevenLabs**. O HMD ainda consulta a lista de canais em nuvem quando não houver cache, uma vez por até 24 horas; para funcionar sem internet, os canais precisam ter sido carregados antes.

O histórico local fica em `%APPDATA%\\<pasta do app>\\housemix-transcriptions\\`, sem upload automático. Ele não é compartilhado via LAN, não possui criptografia própria adicional, e exige plano de backup/retensão e proteção do Windows. A integração total HMD offline e compartilhamento LAN permanecem pendentes.

## HMO e custos externos (não substituídos neste PR)
- OpenAI API: as Edge Functions do HMO ainda possuem caminhos de chamada pagos. Próximo estágio é migrar essas funções para um provedor com cota gratuita validada, como Gemini API, usando **chave server-side** e limites rígidos. O modelo gratuito e o acesso ao free tier dependem da conta do provedor; não criar/chavear plano com billing sem orçamento explícito.
- ElevenLabs: o HMO ainda usa `transcribe-stream` via Supabase. O HMD usa Whisper.cpp.
- Resend: mantido como opcional no envio de e-mails, com plano gratuito conforme disponibilidade/limites da conta; sem cobranças novas neste PR. Para SMTP Hostinger, é necessário verificar limites da assinatura e implantar transporte servidor autenticado (não no navegador).
- Supabase Pro e Hostinger continuam ativos. Não cancelar, pausar nem desativar a infraestrutura atual até validação do HMO e HMD.

## Testes de segurança/custo
`node --test desktop/local-free-ai.test.cjs desktop/local-whisper.test.cjs desktop/local-transcription-store.test.cjs`

`bunx vitest run src/lib/desktopFreeAi.test.ts`

Testes devem confirmar: sem chamadas pagas pelo HMD nas funcionalidades migradas, isolamento por rádio, erros quando binários ausentes, histórico persistente e esquema de mensagens válido. A PR não publica instalador nem alteração em produção.
