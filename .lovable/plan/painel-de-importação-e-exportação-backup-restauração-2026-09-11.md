# Painel de Importação e Exportação (Backup / Restauração)

Nova tela dentro do menu **Ferramentas**, chamada **Backup / Importar**, com um cartão para cada conjunto de dados. Cada cartão tem dois botões: **Exportar** e **Importar**.

## Cartões e formatos

| Cartão | Exportar | Importar |
|---|---|---|
| Citações cadastradas | Planilha .xlsx | Planilha .xlsx |
| Promoções cadastradas | Planilha .xlsx (colunas `banner` e `banner L` com o endereço da imagem) | Planilha .xlsx (usa o endereço da imagem direto, sem reenviar arquivo) |
| Logos cadastradas | Arquivo .zip com uma subpasta por programa, contendo as logos | Arquivo .zip na mesma estrutura (pasta = programa) |
| Batalha musical | Planilha .xlsx | Planilha .xlsx |
| Enquete | Planilha .xlsx | Planilha .xlsx |

## Colunas das planilhas

- Citações: Texto, Programas, Início, Fim
- Promoções: Nome, Texto, Oferecimento, banner, banner L, Botão (link), Programas, Início, Fim
- Batalha: Artista 1, Música 1, % 1, Imagem 1, Artista 2, Música 2, % 2, Imagem 2, Data, Início, Fim
- Enquete: Pergunta, Resposta 1..4, Resposta correta, Data, Início, Fim

Programas são gravados/lidos por **nome** (separados por vírgula) e convertidos para os registros internos; nomes desconhecidos são ignorados e relatados.

## Comportamento da importação

- Pré-visualização: mostra quantas linhas foram lidas e quantas serão criadas antes de confirmar.
- Datas aceitas em formato brasileiro (dd/mm/aaaa) e formato de planilha; horários em HH:MM.
- Linhas sem os campos obrigatórios são ignoradas e listadas no resumo final.
- Importação adiciona registros (não apaga o que já existe).
- Logos: cada imagem do ZIP é enviada ao armazenamento e vinculada ao programa cuja pasta a contém; a data final recebe 180 dias a partir da importação quando o ZIP não traz essa informação (arquivo opcional `dados.csv` dentro do ZIP preserva nome e validade no ciclo exportar → importar).

## Detalhes técnicos

- Novo componente `src/components/BackupPage.tsx` (padrão de formulário Nexo: pílulas cyan `#00BFF0` / lime `#C6F03C`, fundo `#D6F4FB`, Montserrat), registrado em `Dashboard.tsx` como página `backup` no grupo `ferramentas` e adicionado em `PermissoesSection.tsx`.
- Planilhas via `xlsx` (já no projeto); ZIP via `jszip` (nova dependência).
- Leitura/escrita nas tabelas `testemunhais`, `promocoes`, `logos_patrocinadores`, `batalhas_agendadas`, `enquetes_agendadas`, sempre com `user_id = effectiveUserId` (respeita subusuários).
- Upload de logos no bucket `comercial`, caminho `<auth.uid()>/logos/...`, preservando PNG (sem compressão), conforme a regra atual de logos.
- Downloads dos arquivos gerados direto no navegador.
