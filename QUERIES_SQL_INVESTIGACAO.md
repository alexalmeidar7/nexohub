# 🔧 QUERIES SQL - Investigação do Banco de Dados

Use as consultas abaixo no **Supabase Dashboard → SQL Editor** para investigar os problemas

---

## 📊 QUERY 1: Verificar Formato de Imagens dos Apresentadores

```sql
-- Verificar qual formato as fotos estão sendo salvas
-- Resultado esperado: URL (https://...) ou Base64 (data:image/...)

SELECT 
  id,
  nome,
  CASE 
    WHEN foto LIKE 'data:image/%' THEN 'BASE64'
    WHEN foto LIKE 'http%' THEN 'URL'
    WHEN foto LIKE 'file://%' THEN 'FILE_PATH'
    WHEN foto LIKE '/%' THEN 'RELATIVE_PATH'
    WHEN foto = '' THEN 'VAZIO'
    ELSE 'DESCONHECIDO'
  END as formato_foto,
  LENGTH(COALESCE(foto, '')) as tamanho_bytes,
  ativo,
  SUBSTRING(foto, 1, 50) as preview
FROM apresentadores
WHERE user_id = '9cab6c46-c32a-4c19-94db-773dcfaf7632'  -- Interativa FM
ORDER BY created_at DESC
LIMIT 20;

-- 🔍 O que procurar:
-- - Muitas fotos em BASE64 → Problema confirmado
-- - Muitas VAZIAS → Problema crítico
-- - Mix de URL e BASE64 → Inconsistência
```

---

## 📊 QUERY 2: Verificar Logo dos Programas

```sql
-- Verificar formato de logos/selos dos programas

SELECT 
  id,
  nome,
  CASE 
    WHEN selo LIKE 'data:image/%' THEN 'SELO_BASE64'
    WHEN selo LIKE 'http%' THEN 'SELO_URL'
    WHEN thumb LIKE 'data:image/%' THEN 'THUMB_BASE64'
    WHEN thumb LIKE 'http%' THEN 'THUMB_URL'
    ELSE 'SEM_IMAGEM'
  END as formato_imagem,
  LENGTH(COALESCE(selo, '')) as selo_bytes,
  LENGTH(COALESCE(thumb, '')) as thumb_bytes,
  horario_inicio,
  horario_fim,
  ativo
FROM programas
WHERE user_id = '9cab6c46-c32a-4c19-94db-773dcfaf7632'  -- Interativa FM
ORDER BY horario_inicio
LIMIT 20;

-- 🔍 O que procurar:
-- - Programas em horário on-air com imagem vazia
-- - Logos em BASE64 (problema)
-- - Logos em URL (OK)
```

---

## 📊 QUERY 3: Verificar Logo da Empresa

```sql
-- Verificar se logo da empresa foi salva no banco

SELECT 
  user_id,
  nome,
  CASE 
    WHEN logo LIKE 'data:image/%' THEN 'BASE64'
    WHEN logo LIKE 'http%' THEN 'URL'
    WHEN logo = '' THEN 'VAZIO'
    WHEN logo IS NULL THEN 'NULL'
    ELSE 'DESCONHECIDO'
  END as formato_logo,
  LENGTH(COALESCE(logo, '')) as tamanho_bytes,
  SUBSTRING(logo, 1, 100) as preview_logo,
  updated_at
FROM empresa_config
WHERE user_id IN (
  '9cab6c46-c32a-4c19-94db-773dcfaf7632',  -- Interativa FM
  '452ebd1e-61a0-42dd-bf80-231a3f426c83',  -- Positiva FM
  '98365ea6-0ebf-496d-83e9-69b38089586d',  -- Jornal FM
  'b67436c6-ede1-4438-881d-18b9e923adda'   -- Cultura FM
)
ORDER BY updated_at DESC;

-- 🔍 O que procurar:
-- - VAZIO ou NULL → Logo não foi salva
-- - BASE64 → Tamanho muito grande (2MB+)
-- - URL → OK
-- - updated_at recente → Se foi alterado recentemente
```

---

## 📊 QUERY 4: Verificar Música Atual (Capa)

```sql
-- Verificar formato de capas de músicas

-- Opção A: Se houver tabela music_history com campo capa
SELECT 
  id,
  musica,
  artista,
  CASE 
    WHEN capa LIKE 'data:image/%' THEN 'BASE64'
    WHEN capa LIKE 'http%' THEN 'URL'
    ELSE 'VAZIO'
  END as formato_capa,
  LENGTH(COALESCE(capa, '')) as tamanho_bytes,
  user_id,
  created_at
FROM music_history
WHERE user_id = '9cab6c46-c32a-4c19-94db-773dcfaf7632'  -- Interativa FM
ORDER BY created_at DESC
LIMIT 10;

-- Opção B: Se houver tabela musicas_reproducao
SELECT 
  id,
  musica,
  artista,
  CASE 
    WHEN capa LIKE 'data:image/%' THEN 'BASE64'
    WHEN capa LIKE 'http%' THEN 'URL'
    ELSE 'VAZIO'
  END as formato_capa
FROM musicas_reproducao
WHERE user_id = '9cab6c46-c32a-4c19-94db-773dcfaf7632'
ORDER BY data_reproducao DESC
LIMIT 10;

-- 🔍 O que procurar:
-- - Capas BASE64 → Problema
-- - Capas VAZIAS → Problema
-- - Capas URL → OK
```

---

## 📊 QUERY 5: Verificar Arquivo de Tempo no Storage

```sql
-- Verificar se arquivo de tempo existe no Storage
-- ⚠️ Esta query pode não funcionar (Storage não é SQL)
-- Use o painel Supabase → Storage → xml-files

-- Alternativa: Verificar se há dados de previsão no banco
SELECT 
  *
FROM previsoes_tempo
WHERE user_id = '9cab6c46-c32a-4c19-94db-773dcfaf7632'  -- Interativa FM
ORDER BY created_at DESC
LIMIT 1;

-- Se tabela não existir, criar:
-- (execute se necessário)
-- CREATE TABLE IF NOT EXISTS previsoes_tempo (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
--   temperatura TEXT,
--   descricao TEXT,
--   minima TEXT,
--   maxima TEXT,
--   umidade TEXT,
--   vento TEXT,
--   icone_url TEXT,
--   created_at TIMESTAMP DEFAULT NOW(),
--   updated_at TIMESTAMP DEFAULT NOW()
-- );

-- 🔍 O que procurar:
-- - Tabela existe com dados recentes → OK
-- - Tabela vazia → Problema
-- - Tabela não existe → Precisa criar
```

---

## 📊 QUERY 6: Verificar Notícias (Ticker)

```sql
-- Verificar se há notícias cadastradas (para ticker)

SELECT 
  id,
  titulo,
  resumo,
  fonte,
  ativo,
  excluido,
  user_id,
  created_at,
  updated_at
FROM noticias
WHERE user_id = '98365ea6-0ebf-496d-83e9-69b38089586d'  -- Jornal FM
AND ativo = true
AND excluido = false
ORDER BY created_at DESC
LIMIT 10;

-- Se tabela não existir, será retornado erro
-- Nesse caso, precisa criar:
-- CREATE TABLE IF NOT EXISTS noticias (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id UUID NOT NULL REFERENCES auth.users(id),
--   titulo TEXT NOT NULL,
--   resumo TEXT,
--   fonte TEXT,
--   ativo BOOLEAN DEFAULT true,
--   excluido BOOLEAN DEFAULT false,
--   created_at TIMESTAMP DEFAULT NOW(),
--   updated_at TIMESTAMP DEFAULT NOW()
-- );

-- 🔍 O que procurar:
-- - Notícias cadastradas → OK
-- - Sem notícias → Ticker não terá dados
-- - Tabela não existe → Feature não implementada
```

---

## 📊 QUERY 7: Verificar RLS Policies da Tabela empresa_config

```sql
-- Verificar policies que podem estar bloqueando upsert

SELECT 
  p.schemaname,
  p.tablename,
  p.policyname,
  p.permissive,
  p.roles,
  p.qual as policy_definition,
  p.with_check
FROM pg_policies p
WHERE p.tablename = 'empresa_config'
ORDER BY p.policyname;

-- Se resultado for vazio ou restritivo, pode estar bloqueando
-- 🔍 O que procurar:
-- - UPDATE policy deve permitir upsert
-- - USING clause deve validar user_id
-- - WITH CHECK deve validar dados
```

---

## 📊 QUERY 8: Verificar Último Upsert em empresa_config

```sql
-- Verificar quando foi o último upsert bem-sucedido

SELECT 
  user_id,
  nome,
  logo,
  background_url,
  updated_at,
  CASE 
    WHEN updated_at > NOW() - INTERVAL '5 minutes' THEN '✅ Atualizado agora'
    WHEN updated_at > NOW() - INTERVAL '1 hour' THEN '⚠️ Atualizado há menos de 1 hora'
    WHEN updated_at > NOW() - INTERVAL '1 day' THEN '⚠️ Atualizado há menos de 1 dia'
    ELSE '❌ Não atualizado há muito tempo'
  END as status_atualizacao
FROM empresa_config
WHERE user_id IN (
  '9cab6c46-c32a-4c19-94db-773dcfaf7632',  -- Interativa FM
  '452ebd1e-61a0-42dd-bf80-231a3f426c83',  -- Positiva FM
  '98365ea6-0ebf-496d-83e9-69b38089586d',  -- Jornal FM
  'b67436c6-ede1-4438-881d-18b9e923adda'   -- Cultura FM
)
ORDER BY updated_at DESC;

-- 🔍 O que procurar:
-- - updated_at recente → Upsert está funcionando
-- - updated_at antigo → Upsert parou de funcionar
```

---

## 📊 QUERY 9: Investigação Profunda - Comparar LocalStorage vs Banco

```sql
-- Esta query ajuda a entender o que está no localStorage vs banco
-- Execute após testar a UI

-- Verificar audio_sources (onde localStorage é salvo)
SELECT 
  user_id,
  nome,
  (audio_sources ->> 'logo') as logo_no_banco,
  logo as logo_coluna_direta,
  updated_at
FROM empresa_config
WHERE user_id = '9cab6c46-c32a-4c19-94db-773dcfaf7632'  -- Interativa FM
LIMIT 1;

-- 🔍 O que procurar:
-- - logo_no_banco vs logo_coluna_direta
-- - Se são diferentes → Logo está em audio_sources, não em logo
-- - Se ambas vazias → Upsert falhou completamente
```

---

## 📊 QUERY 10: Auditoria - Listar Todos UUIDs de Estações

```sql
-- Listar todos os UUIDs das estações para referência

SELECT 
  user_id,
  nome,
  logo,
  updated_at,
  CASE 
    WHEN nome LIKE '%Interativa%' THEN 'Interativa FM'
    WHEN nome LIKE '%Positiva%' THEN 'Positiva FM'
    WHEN nome LIKE '%Jornal%' THEN 'Jornal FM'
    WHEN nome LIKE '%Cultura%' THEN 'Cultura FM'
    ELSE 'Outra'
  END as estacao
FROM empresa_config
ORDER BY nome;

-- 🔍 Copiar UUIDs corretos para usar nas queries acima
```

---

## 🔧 Como Usar Estas Queries

### 1. Abrir SQL Editor
- Ir para **Supabase Dashboard**
- Clicar em **SQL Editor**
- Clicar em **New Query**

### 2. Copiar Query
- Copiar uma das queries acima
- Colar no editor

### 3. Executar
- Clicar em **Run** (▶️)
- Aguardar resultado

### 4. Analisar Resultado
- Procurar pelos pontos de atenção (🔍)
- Anotar problemas encontrados

---

## 📝 Exemplo de Resultado Esperado vs Problema

### QUERY 1: Apresentadores

#### ✅ Esperado (OK)
```
id          | nome          | formato_foto | tamanho_bytes | preview
-----------|---------------|--------------|---------------|------------------
abc123     | João Silva   | URL          | 45678        | https://cdn.example.com/...
def456     | Maria Santos | URL          | 52341        | https://cdn.example.com/...
```

#### ❌ Problema
```
id          | nome          | formato_foto | tamanho_bytes | preview
-----------|---------------|--------------|---------------|------------------
abc123     | João Silva   | BASE64       | 1500000      | data:image/png;base64,iVBOR...
def456     | Maria Santos | VAZIO        | 0            | 
```

---

## 🚨 Ações Recomendadas por Resultado

### Se muitos BASE64 encontrados:
1. [ ] Implementar conversão para URL
2. [ ] Upload para Supabase Storage
3. [ ] Salvar URL no banco

### Se muitos VAZIOS encontrados:
1. [ ] Verificar se upload está funcionando
2. [ ] Verificar validação do formulário
3. [ ] Verificar se image picker está retornando dados

### Se RLS policies restritivas:
1. [ ] Revisar policies
2. [ ] Adicionar permissão UPDATE
3. [ ] Testar com user_id correto

### Se updated_at antigo:
1. [ ] Verificar se há erro no console
2. [ ] Testar upsert direto
3. [ ] Verificar autenticação

---

## 💡 Tips Úteis

### Buscar por padrão específico
```sql
-- Encontrar todas as imagens base64 grandes (>1MB)
SELECT * FROM apresentadores 
WHERE foto LIKE 'data:image/%' 
AND LENGTH(foto) > 1000000;
```

### Contar problemas
```sql
-- Contar quantas fotos estão em base64
SELECT COUNT(*) as total_base64
FROM apresentadores
WHERE foto LIKE 'data:image/%'
AND user_id = '9cab6c46-c32a-4c19-94db-773dcfaf7632';
```

### Backup antes de alterar
```sql
-- Backup de dados importantes antes de fazer alterações
SELECT * INTO apresentadores_backup FROM apresentadores 
WHERE user_id = '9cab6c46-c32a-4c19-94db-773dcfaf7632';
```

---

## ⚠️ Cuidado

**NUNCA execute UPDATE, DELETE ou DROP sem confirmar primeiro!**

Se precisar alterar dados, execute um SELECT antes para confirmar quais registros serão afetados.

---

## 📞 Se Não Souber SQL

1. Copie a query
2. Passe para alguém com experiência em SQL
3. Ou entre em contato com suporte do Supabase

---

**Última atualização:** 2026-11-06  
**Válido para:** Supabase PostgreSQL
