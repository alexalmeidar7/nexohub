# House Mix — XML geral e guia XPath (v1)

## Endereço da função

O endpoint de origem do XML geral é a Edge Function `serve-xml-geral` do projeto Supabase ativo. A URL pública definitiva por emissora será publicada somente depois que o domínio e o roteamento de produção forem configurados e testados.

Durante a validação, a forma técnica do endpoint é:

```text
https://<PROJECT_REF>.supabase.co/functions/v1/serve-xml-geral?slug=<SLUG_DA_EMISSORA>
```

Não fixe um Project Ref de ambiente de cópia nem use o slug `default` em produção. Cada emissora deve ter um slug cadastrado e único.

## Feeds específicos

- Clima por emissora: `/functions/v1/serve-xml-tempo?user_id=<ID_DA_EMISSORA>`.
- O endpoint lê exclusivamente `xml-tempo-<user_id>.xml`; não existe arquivo compartilhado entre emissoras.
- XML geral: clima é incorporado somente quando existe previsão individual disponível.

## Regras de atualização

- O XML é gerado sob demanda; respostas usam cabeçalhos sem cache.
- Horários e dia da semana devem considerar `America/Sao_Paulo`.
- O roteiro geral só é marcado como ativo quando existe registro cuja `data_programa` corresponde ao dia local atual.
- `atualizado_em` informa a última edição no banco; `publicado_em` informa `xml_pushed_at`, quando disponível.
- Ausência de roteiro ou clima deve ser representada como indisponibilidade/campos vazios, nunca por conteúdo fictício.
- As URLs antigas de feeds específicos permanecem válidas; este guia não substitui seus endpoints.

## XPath — XML geral

Raiz: `/geral`

| Campo | XPath |
|---|---|
| Nome da emissora | `/geral/estacao/nome` |
| Slug da emissora | `/geral/estacao/slug` |
| Cidade | `/geral/estacao/cidade` |
| Frequência | `/geral/estacao/frequencia` |
| Logo da emissora | `/geral/estacao/logo_url` |
| Fuso horário | `/geral/estacao/timezone` |
| Música atual — título | `/geral/no_ar/musica_atual/titulo` |
| Música atual — artista | `/geral/no_ar/musica_atual/artista` |
| Capa da música | `/geral/no_ar/musica_atual/capa_url` |
| Programa atual | `/geral/no_ar/programa_atual/nome` |
| Locutor atual | `/geral/no_ar/apresentador_atual/nome` |
| Foto do locutor | `/geral/no_ar/apresentador_atual/foto_url` |
| Próximo programa | `/geral/no_ar/a_seguir/programa_nome` |
| Clima disponível | `/geral/previsao_tempo/atual/disponivel` |
| Temperatura | `/geral/previsao_tempo/atual/temperatura` |
| Ícone do clima | `/geral/previsao_tempo/atual/icone_url` |
| Roteiro ativo | `/geral/roteiro/@ativo` |
| Nome do programa do roteiro | `/geral/roteiro/programa` |
| Data do roteiro | `/geral/roteiro/data` |
| Última edição do roteiro | `/geral/roteiro/atualizado_em` |
| Participantes | `/geral/roteiro/participantes/participante` |
| Título da escalada | `/geral/roteiro/escalada/item/titulo` |
| Blocos do roteiro | `/geral/roteiro/blocos/bloco` |
| Notícias por bloco | `/geral/roteiro/blocos/bloco/noticia` |
| Podcast ativo | `/geral/roteiro/podcast/ativo` |
| Perguntas do podcast | `/geral/roteiro/podcast/perguntas/pergunta` |
| Batalha ativa | `/geral/interatividade/batalha/@ativa` |
| Enquete ativa | `/geral/interatividade/enquete/@ativa` |
| Quiz ativo | `/geral/interatividade/quiz/@ativo` |
| Patrocinadores | `/geral/patrocinadores/patrocinador` |

## Observações para vMix

- Para ler o texto de um campo, use o XPath completo da tabela como origem do campo XML.
- Para listas repetidas (participantes, notícias, perguntas e patrocinadores), configure o elemento repetidor/índice no vMix conforme a necessidade da cena.
- Os atributos `ativa` e `ativo` são atributos XML: use `/geral/interatividade/batalha/@ativa`, por exemplo.
- Não use `//nome` genérico quando houver campos com o mesmo nome em várias seções; prefira sempre o caminho absoluto.

## Pendências antes de publicar o endereço permanente

1. Confirmar o Project Ref de produção usado pelo deploy.
2. Implantar e testar a Edge Function no projeto confirmado.
3. Configurar o proxy/roteamento do domínio `housemix.nexobrasil.net` para `/<slug>/geral.xml`.
4. Validar HTTPS, isolamento entre emissoras, resposta XML, atualização após salvar e compatibilidade com URLs antigas.
5. Só então divulgar a URL permanente de cada emissora.
