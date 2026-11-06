# 🚀 PRÓXIMA AÇÃO: Aplicar Fix de RLS

## 📋 Sumário
Encontramos **2 problemas** no salvamento de logo:

1. ✅ **FIXADO**: Formato de data vazio causava erro `invalid input syntax for type date`
2. ⏳ **FALTA FAZER**: RLS policy bloqueia INSERT/UPDATE com erro `42501`

## 🎯 Ação Necessária (5 minutos)

### Passo 1: Abrir Supabase Dashboard
Vá para: https://supabase.com/dashboard/project/qazvgmgdidjhbvcuinpy/sql/new

(Se estiver logado, clique em "SQL Editor" no menu lateral)

### Passo 2: Copiar e Executar SQL

Copie este SQL completo abaixo:

```sql
-- ===============================================
-- Fix RLS Policy for empresa_config table
-- Permite que cada usuário salve sua própria configuração
-- ===============================================

ALTER TABLE empresa_config ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas (se existem)
DROP POLICY IF EXISTS "Users can view their own config" ON empresa_config;
DROP POLICY IF EXISTS "Users can update their own config" ON empresa_config;
DROP POLICY IF EXISTS "Users can insert their own config" ON empresa_config;

-- Criar policies novas
CREATE POLICY "Users can view their own config"
ON empresa_config
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own config"
ON empresa_config
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own config"
ON empresa_config
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Verificar se funcionou
SELECT
  tablename,
  policyname,
  permissive,
  roles
FROM pg_policies
WHERE tablename = 'empresa_config'
ORDER BY policyname;
```

### Passo 3: Colar e Executar
1. Abra Supabase SQL Editor
2. Cole o SQL acima
3. Clique no botão **"Run"** (ou Ctrl+Enter)
4. Espere a confirmação "Queries completed successfully"

### Passo 4: Testar no App
1. Abra http://localhost:8080
2. Vá para "Configurações"
3. Tente salvar a logo da empresa
4. Deve aparecer: **"Configurações salvas com sucesso!"**
5. Recarregue a página - logo deve permanecer

## ✅ Pronto!
Após executar o SQL, o problema estará resolvido.

---

## 🆘 Se tiver erro

### Erro: "Parse error"
→ Verifique se copiou todo o SQL corretamente

### Erro: "Policy already exists"
→ É normal, o `DROP POLICY IF EXISTS` já trata isso

### Erro: "Table doesn't exist"
→ Contacte support - algo está errado com o schema

### Ainda não funciona?
Execute este script de teste:
```bash
npm run test:logo-after-fix
```

---

**Tempo estimado**: 2-3 minutos  
**Risco**: Nenhum - só modifica políticas de segurança, não deleta dados  
**Resultado**: Logo será salva no banco normalmente ✅
