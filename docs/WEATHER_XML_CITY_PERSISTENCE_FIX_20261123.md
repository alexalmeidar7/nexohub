# Correção — Tempo XML vazio apesar da cidade escolhida

- `PrevisaoTempo` salvava a cidade no localStorage e disparava uma chamada `update(user_settings)` sem verificar se o servidor realmente gravou. O toast de sucesso era exibido antes do resultado, mesmo em erro de RLS/rede.
- `update-weather-xml` lê exclusivamente `user_settings.weather_city`, por isso não gerava `xml-tempo-<user_id>.xml` para a Interativa, embora a tela mostrasse uma cidade local.
- A partir deste ajuste, selecionar/remover a cidade principal espera a persistência em `user_settings`, verifica que pelo menos uma linha foi afetada, tenta `upsert` se não houver linha e avisa em caso de falha.
- O cache do painel é secundário e não pode bloquear o XML; a alteração emite `weather:city-saved` após gravar para agendar um refresh local pontual.
- A configuração oficial da Interativa estava vazia na coluna `weather_city`; ela foi restaurada na produção para Goiânia utilizando o endereço da emissora como confirmação, sem alterar as outras rádios.
- A função cron `update-weather-xml-60s` já estava ativa e funcionando para outras emissoras; nenhum agendamento adicional foi criado.
- **Validar**: conferir que o XML do Supabase deixa de responder 404, verificar o arquivo local HMD e testar falha de rede durante o salvamento (não deve aparecer sucesso falso).
