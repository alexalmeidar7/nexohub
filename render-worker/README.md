# NexoHub — Render de vídeo no servidor

Este serviço troca a etapa de codificação FFmpeg WASM no navegador por FFmpeg nativo em um container Linux. O navegador ainda captura a composição da timeline para WebM; essa captura continua em tempo real nesta primeira etapa, mas a conversão H.264/AAC acontece no servidor e não fica presa ao Worker/WASM do navegador.

## Deploy Railway

Crie um serviço Railway apontando para este repositório e defina **Root Directory** como `render-worker`. O Dockerfile instala FFmpeg nativo.

Variáveis obrigatórias:
- `SUPABASE_URL`: URL do mesmo projeto Supabase usado pelo NexoHub.
- `SUPABASE_ANON_KEY`: chave publicável/anon desse mesmo projeto.
- `APP_ORIGINS`: origens permitidas separadas por vírgula; inclua `https://nexohub.lovable.app` e a origem real de produção.
- Configure `VITE_VIDEO_RENDER_API_URL` no build do frontend com a URL pública desse serviço (sem barra final).

Variáveis opcionais:
- `MAX_UPLOAD_MB` (padrão 300)
- `RENDER_TIMEOUT_MS` (padrão 1800000, 30 minutos)

## API

- `GET /health`: status básico.
- `POST /render`: requer `Authorization: Bearer <Supabase access token>` e multipart/form-data com o campo `video` (arquivo WebM). Retorna MP4 H.264/AAC.

O serviço valida o token com Supabase Auth, limita tamanho do upload, usa arquivos temporários por requisição e apaga os temporários ao terminar. Não configure a chave service-role no worker. Não publique o serviço com variáveis Supabase de outro projeto.

## Limitações da primeira etapa

O serviço codifica um WebM capturado pelo browser. Portanto, não acelera a captura inicial da timeline, que ainda percorre os quadros em tempo real. Para render muito mais rápido que a duração do vídeo, a próxima etapa é renderizar diretamente os arquivos originais e um manifesto da timeline no worker; isso exige traduzir os cortes, posicionamento, textos e trilhas do editor para comandos FFmpeg.
