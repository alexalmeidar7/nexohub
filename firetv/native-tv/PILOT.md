# APK nativo — primeira integração executável

Base remota da PR #326; nenhuma edição no checkout local ou no aplicativo legado. Este piloto tem IDs separados para testar sem substituir Positiva/Interativa instaladas. Não é release comercial nem paridade com o Preview.

- Compose, Activity nativa, Media3 para áudio e vídeo HLS, um ExoPlayer, consultas públicas House Mix e polling com backoff.
- Home/áudio/vídeo e lista de programação iniciais; não reproduzem ainda o layout final aprovado.
- Sem acesso de escrita no banco nem sessão de usuário inventada.
- A verificar: build CI, reprodução real em ambas as rádios, resolução/foco, credenciais públicas, streams HTTPS e compatibilidade de codecs.
- Pendências: splash e pré-buffer, perfis, QR e sessão autenticada segura, grade completa, On Demand, anúncios e Smart Break, Smart Sync, interatividade, histórico/capas, clima/relógio, animações e identidade visual, controle remoto completo, ícones/banner e atualização assinada.
- Não substituir o APK atual nem publicar em produção até a comparação visual e funcional completa.
