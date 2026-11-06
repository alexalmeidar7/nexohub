# 🌦️ Por Que a Previsão de Tempo Está Vazia?

## Problema
No XML `geral.xml`, essas linhas aparecem vazias:

```xml
<previsao_tempo_cidade>Não informada</previsao_tempo_cidade>
<previsao_tempo_atual_disponivel>0</previsao_tempo_atual_disponivel>
<previsao_tempo_atual_temperatura></previsao_tempo_atual_temperatura>
<previsao_tempo_atual_descricao></previsao_tempo_atual_descricao>
<previsao_tempo_atual_minima></previsao_tempo_atual_minima>
<previsao_tempo_atual_maxima></previsao_tempo_atual_maxima>
<previsao_tempo_atual_umidade></previsao_tempo_atual_umidade>
<previsao_tempo_atual_vento></previsao_tempo_atual_vento>
<previsao_tempo_atual_icone_url></previsao_tempo_atual_icone_url>
```

## Causa Raiz

O arquivo `xml-tempo-{user_id}.xml` não existe no storage.

Por quê?

1. **Arquivo não foi gerado**: A função `update-weather-xml` é um job que roda a cada 10 minutos
2. **Coordenadas não foram configuradas**: A tabela `user_settings` não tem `weather_city`, `weather_lat`, `weather_lon` para a estação Jornal FM/Transmissão

## Solução (2 Opções)

### ✅ Opção 1: Via Interface (Recomendado - 1 minuto)

1. Abra: http://localhost:8080/home?page=promocoes
2. Clique em **"Previsão do Tempo"**
3. Na caixa de busca, procure por **"Goiânia"** (ou a cidade desejada)
4. Clique para selecionar
5. **Pronto!** ✅ O XML será gerado em até 10 minutos

### 🔧 Opção 2: Via SQL (Imediato - 2 minutos)

1. Abra: https://supabase.com/dashboard/project/qazvgmgdidjhbvcuinpy/sql/new
2. Cole este SQL:

```sql
-- Update weather settings for Jornal FM
INSERT INTO user_settings (user_id, weather_city, weather_lat, weather_lon)
VALUES ('98365ea6-0ebf-496d-83e9-69b38089586d', 'Goiânia', -15.7942, -48.0676)
ON CONFLICT (user_id) DO UPDATE SET
  weather_city = 'Goiânia',
  weather_lat = -15.7942,
  weather_lon = -48.0676;
```

3. Clique **"Run"**
4. Pronto! ✅

## O Que Acontece Depois

Após salvar a cidade:

1. A tabela `user_settings` é atualizada com as coordenadas
2. A função `update-weather-xml` (cron job) detecta as novas coordenadas
3. Chama a API **Open-Meteo** para buscar a previsão de tempo
4. Gera o arquivo `xml-tempo-98365ea6-0ebf-496d-83e9-69b38089586d.xml`
5. Salva no storage Supabase
6. A função `serve-xml-geral` lê este arquivo e preenche o XML com os dados

## Status Atual

| Item | Status |
|------|--------|
| Arquivo XML | ❌ Não existe |
| Coordenadas configuradas | ❌ Não |
| Função `update-weather-xml` | ✅ Pronta |
| API Open-Meteo | ✅ Pronta |
| Precisão de Tempo | ⏳ Aguardando coordenadas |

## 🎯 Próxima Ação

**Escolha uma das 2 opções acima e execute. Leva menos de 2 minutos!**

Após isso, acesse o XML em http://localhost:8080/xml/transmissao/geral.xml e verá:

```xml
<previsao_tempo_cidade>Goiânia - GO</previsao_tempo_cidade>
<previsao_tempo_atual_disponivel>1</previsao_tempo_atual_disponivel>
<previsao_tempo_atual_temperatura>28ºC</previsao_tempo_atual_temperatura>
<previsao_tempo_atual_descricao>Parcialmente nublado</previsao_tempo_atual_descricao>
<!-- ... outros campos preenchidos ... -->
```

---

**Dúvidas?**  
- A função `update-weather-xml` é um cronjob que roda a cada 10 minutos em produção
- Em desenvolvimento local, pode levar um pouco mais
- Se não atualizar em 15 minutos, verifique se o `weather_city` foi realmente salvo na tabela `user_settings`
