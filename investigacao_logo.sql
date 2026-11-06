-- Investigação do problema: Logo da empresa não salva no banco

-- 1. Ver estrutura da tabela empresa_config
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'empresa_config'
ORDER BY ordinal_position;

-- 2. Ver RLS policies na tabela
SELECT 
  schemaname,
  tablename, 
  policyname, 
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'empresa_config'
ORDER BY policyname;

-- 3. Verificar dados da Jornal FM (UUID: 98365ea6-0ebf-496d-83e9-69b38089586d)
SELECT 
  user_id,
  nome,
  logo,
  background_url,
  updated_at,
  created_at
FROM empresa_config
WHERE user_id = '98365ea6-0ebf-496d-83e9-69b38089586d';

-- 4. Ver todos os usuarios com empresa_config (para debug)
SELECT 
  COUNT(*) as total_configs,
  COUNT(CASE WHEN logo IS NOT NULL THEN 1 END) as com_logo,
  COUNT(CASE WHEN logo IS NULL THEN 1 END) as sem_logo
FROM empresa_config;

-- 5. Ver sample de dados (primeiros 3)
SELECT 
  user_id,
  nome,
  CASE WHEN logo IS NULL THEN 'NULL' ELSE LEFT(logo, 80) || '...' END as logo_preview,
  updated_at
FROM empresa_config
LIMIT 3;

-- 6. Ver constraints da tabela
SELECT 
  constraint_name, 
  constraint_type,
  table_name
FROM information_schema.table_constraints
WHERE table_name = 'empresa_config';

-- 7. Verificar se há índices com constraint UNIQUE
SELECT 
  indexname, 
  indexdef
FROM pg_indexes
WHERE tablename = 'empresa_config';

-- 8. Testar UPSERT simulado (com user_id de teste)
-- DESCOMENTE APENAS PARA TESTAR!
-- INSERT INTO empresa_config (user_id, nome, logo, updated_at)
-- VALUES ('98365ea6-0ebf-496d-83e9-69b38089586d', 'Test Logo', 'https://test.com/logo.png', NOW())
-- ON CONFLICT (user_id) DO UPDATE SET 
--   logo = EXCLUDED.logo,
--   updated_at = EXCLUDED.updated_at;

-- 9. Ver últimas atualizações (para confirmar que algo foi salvo)
SELECT 
  user_id,
  nome,
  updated_at
FROM empresa_config
ORDER BY updated_at DESC
LIMIT 10;

-- 10. Verificar auth.users para o user_id em questão
SELECT 
  id,
  email,
  created_at
FROM auth.users
WHERE id = '98365ea6-0ebf-496d-83e9-69b38089586d';
