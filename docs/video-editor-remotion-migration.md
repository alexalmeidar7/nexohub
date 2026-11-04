# House Mix Video Editor — simplificação sem custo de licença

## Objetivo
Entregar um editor simples e específico para cortes de entrevistas/podcasts, sem adotar Remotion ou bibliotecas com licença que possa criar obrigações para o produto comercial.

## Escopo do editor
- Importar um vídeo de entrevista e cortar/remover trechos.
- Inserir no máximo um texto sobre o vídeo.
- Sobrepor uma máscara PNG com transparência alfa.
- Acrescentar um vídeo de assinatura no final.
- Exportar MP4 H.264 com vídeo a 5 Mbps e áudio AAC a 96 kbps.
- Legenda automática fica fora do escopo inicial; só será considerada depois se houver uma opção sem custo de serviço e viável para o navegador/infraestrutura.

## Base técnica verificada
- Componente principal: `src/components/CortesVideoPage.tsx`.
- O projeto já utiliza `@ffmpeg/ffmpeg@0.12.10` e `@ffmpeg/util@0.12.1`; não é necessário comprar licença para iniciar os ajustes na implementação atual.
- A prévia usa canvas e a exportação grava um WebM com `MediaRecorder`, depois transcodifica para MP4 no FFmpeg do navegador.
- A biblioteca de mídias usa a tabela `video_editor_assets` e o bucket `video-editor-media` do Supabase/Lovable Cloud.
- O código declara um limite de biblioteca de 50 MiB.
- A renderização atual já foi relatada como travando perto de 66–69%; é necessário testar e corrigir essa etapa, sem afirmar estabilidade antes de validar.

## Primeira alteração nesta branch
- A janela do editor foi ampliada para ocupar quase toda a área útil abaixo do menu.
- O painel opaco do editor cobre os widgets flutuantes da página enquanto estiver aberto, deixando a área de edição livre da capa/nome/artista da música e do programa no ar, sem alterar os dados desses widgets.
- Alteração feita em branch isolada; ainda não é merge nem implantação em produção.

## Próximas etapas
1. Simplificar a interface para o fluxo podcast: vídeo, texto único, máscara PNG, assinatura final e exportação.
2. Manter o banco, autenticação, biblioteca e armazenamento atuais.
3. Testar cortes e composições de vídeo com mídia real, incluindo sobreposições PNG e vídeo final.
4. Diagnosticar a renderização por etapas e corrigir progresso, timeout e tratamento de falhas; preservar o formato MP4 e os parâmetros definidos.
5. Manter o caminho antigo disponível até validar o fluxo simplificado.

## Restrições
- Sem compra de licença ou serviço de renderização por enquanto.
- Sem migração de banco de dados.
- Sem implantação em produção nesta etapa.
- Não alterar rotas nem comportamento do player público.
