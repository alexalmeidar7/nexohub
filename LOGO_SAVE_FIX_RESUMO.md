# 🔧 Problema: Logo da Empresa Não Salva

## ❌ Erro Reportado
```
"falha ao salvar no banco: invalid input syntax for type date"
```

## 🔍 Investigação

### Problema 1: Formato de Data (✅ FIXADO)
- **Coluna**: `cliente_desde` é tipo `DATE` no banco, não `TEXT`
- **Erro**: Postgres rejeita strings vazias (`""`) em DATE columns
- **Mensagem**: `invalid input syntax for type date: ""`
- **Causado por**: Linha 454 enviava `cliente_desde || ""` quando vazio

### Problema 2: RLS Policy (⚠️ PENDENTE)
- **Erro**: `42501 - new row violates row-level security policy`
- **Causa**: `empresa_config` table tem RLS habilitada e policies muito restritivas
- **Bloqueio**: SELECT OK, mas INSERT/UPDATE retornam 42501
- **Solução**: Aplicar migration que libera operações para `auth.uid() = user_id`

## ✅ Solução Implementada

### Parte 1: Codificação (PRONTO)
Arquivo: [`src/components/ConfiguracoesPage.tsx`](./src/components/ConfiguracoesPage.tsx)

**Antes** (linha 454):
```typescript
cliente_desde: newConfig.clienteDesde || "",
```

**Depois**:
```typescript
const clienteDesdeValue = newConfig.clienteDesde?.trim();
// ...
cliente_desde: clienteDesdeValue ? clienteDesdeValue : null,
```

**Por quê**: 
- Envia `null` ao invés de string vazia
- Postgres aceita `null` para DATE columns
- Data válida em ISO format (ex: "2024-01-15") também é aceita

### Parte 2: RLS Policy (FALTA APLICAR)
Arquivo: [`supabase/migrations/20261106_fix_empresa_config_rls.sql`](./supabase/migrations/20261106_fix_empresa_config_rls.sql)

**O que faz**:
1. Habilita RLS na tabela
2. Remove policies antigas (se existem)
3. Cria 3 policies novas:
   - **SELECT**: Usuário vê apenas sua config (`auth.uid() = user_id`)
   - **INSERT**: Usuário cria apenas sua config
   - **UPDATE**: Usuário atualiza apenas sua config

**Como aplicar**:
```bash
# Opção 1: Via Supabase Dashboard
# 1. Go to SQL Editor
# 2. Copy/paste o conteúdo de supabase/migrations/20261106_fix_empresa_config_rls.sql
# 3. Click "Run"

# Opção 2: Via CLI (quando sincronizado)
npx supabase db push --remote=qazvgmgdidjhbvcuinpy

# Opção 3: Manualmente via Edge Function
# A função em supabase/functions/fix-empresa-config-rls/ pode ser invocada
```

## 🧪 Testes Realizados

### ✅ Test 1: Formato de data vazio
```bash
npx tsx debug-date-format.ts
```
Resultado: ✅ Null funciona, empty string falha

### ✅ Test 2: UPSERT com admin
```bash
npx tsx debug-logo-issue.ts
```
Resultado: ✅ Admin consegue (SUPABASE_SERVICE_ROLE_KEY), anon não (RLS bloqueado)

### ✅ Test 3: Date format específico
```bash
npx tsx test-null-date.ts
```
Resultado: ❌ RLS policy bloqueia (erro 42501)

## 📊 Status

| Item | Status | Nota |
|------|--------|------|
| Fix código (cliente_desde null) | ✅ PRONTO | Commit 7eeedc674 |
| Build/Deploy frontend | ⏳ PENDENTE | Requer `npm run build` + deploy |
| Fix RLS policy | ⏳ PENDENTE | Requer execução de SQL no dashboard |
| Teste end-to-end | ⏳ PENDENTE | Depois que RLS for fixado |

## 🚀 Próximos Passos

### 1. Aplicar Migration RLS (URGENTE)
```sql
-- Abrir Supabase Dashboard → SQL Editor → colar este SQL:

ALTER TABLE empresa_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own config" ON empresa_config;
DROP POLICY IF EXISTS "Users can update their own config" ON empresa_config;
DROP POLICY IF EXISTS "Users can insert their own config" ON empresa_config;

CREATE POLICY "Users can view their own config"
ON empresa_config FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own config"
ON empresa_config FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own config"
ON empresa_config FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

### 2. Testar Logo Save
1. Abrir http://localhost:8080
2. Navegar para Configurações
3. Tentar salvar a logo da empresa
4. Deve aparecer "Configurações salvas com sucesso!"
5. Recarregar página → logo deve permanecer (salvo no banco)

### 3. Deploy
```bash
npm run build
npx supabase functions deploy --yes
# Push para produção
```

## ⚠️ Importante

**NÃO DELETE DADOS**: A migration só CRIA ou ALTERA policies, nunca deleta dados da tabela empresa_config. Seguro aplicar.

## 📝 Referências

- Postgres DATE type: https://www.postgresql.org/docs/current/datatype-datetime.html
- Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security
- Erro 42501: https://www.postgresql.org/docs/current/errcodes-appendix.html

---

**Criado em**: 2026-11-06  
**Versão**: 1.0  
**Prioridade**: 🔴 CRÍTICA - Bloqueia salvamento de configurações
