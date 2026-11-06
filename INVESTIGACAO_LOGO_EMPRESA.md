# Investigação do Problema: Logo da Empresa Não Salva

## Problema
Usuario salva logo da empresa em ConfiguracoesPage, mas recebe erro "As alterações ficaram no navegador..." indicando que o upsert no banco falhou, mesmo salvando em localStorage.

## Diagnóstico Passo a Passo

### 1. Verificar RLS Policy da Tabela empresa_config

```sql
-- Ver todas as policies na tabela
SELECT * FROM pg_policies WHERE tablename = 'empresa_config';

-- Se houver resultado, mostrar detalhes
SELECT * FROM pg_policies 
WHERE tablename = 'empresa_config' 
ORDER BY policyname;
```

**O que procurar:**
- Policies que bloqueiam UPSERT?
- Policies que requerem função específica?
- Policies que filtram por user_id?

### 2. Verificar Coluna 'logo' Existe

```sql
-- Ver estrutura da tabela
\d empresa_config;

-- Ou
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'empresa_config' 
ORDER BY ordinal_position;
```

**Procurar:**
- Coluna `logo` EXISTS?
- Tipo: TEXT, VARCHAR, bytea?
- Nullable: SIM ou NÃO?
- Constraint UNIQUE ou CHECK?

### 3. Verificar Dados Salvos (Usuario de Teste)

```sql
-- Usuario de teste para Jornal FM
-- UUID: 98365ea6-0ebf-496d-83e9-69b38089586d

SELECT 
  user_id,
  nome,
  logo,
  updated_at,
  created_at
FROM empresa_config
WHERE user_id = '98365ea6-0ebf-496d-83e9-69b38089586d';
```

**O que analisar:**
- Linha existe?
- Logo está vazio?
- Logo tem valor?
- Data updated_at é recente?
- Se logo existe, qual é o valor? (URL ou base64?)

### 4. Testar UPSERT Manual

```sql
-- Simular o upsert que a aplicação faz
-- (MAS ALTERE O user_id PARA UM DE TESTE!)

INSERT INTO empresa_config (
  user_id,
  nome,
  logo,
  updated_at
) VALUES (
  '98365ea6-0ebf-496d-83e9-69b38089586d',
  'Jornal FM Test',
  'https://example.com/logo.png',
  NOW()
) ON CONFLICT (user_id) DO UPDATE SET
  nome = EXCLUDED.nome,
  logo = EXCLUDED.logo,
  updated_at = EXCLUDED.updated_at;
```

**Se houver erro:**
- Role name? 
- Permission denied?
- Constraint violation?

### 5. Verificar User Autenticação

```sql
-- Ver se o auth.uid() retorna corretamente
-- (Esto debe ser ejecutado como authenticated user)

-- Na applicação, antes de fazer upsert:
console.log("user.id =", user?.id);
console.log("saveId =", saveId);
console.log("user_id que será salvo =", JSON.stringify({ user_id: saveId }));
```

### 6. Validar Função RPC (se houver)

```sql
-- Se houver RPC para salvar config, verificar:
SELECT * FROM pg_proc 
WHERE proname LIKE '%config%' 
AND pronargs > 0;

-- Ver código da função
\df+ nome_da_funcao;
```

## Hipóteses Prováveis

### Hipótese 1: RLS Policy Bloqueando UPSERT
- **Sintoma:** Error 42501 "permission denied"
- **Causa:** Policy permite SELECT/DELETE mas não INSERT/UPDATE
- **Solução:** Ajustar policy para permitir UPSERT

### Hipótese 2: Coluna 'logo' com DEFAULT NULL e NOT NULL Constraint
- **Sintoma:** Error 23502 "not null violation"
- **Causa:** Coluna logo não permite NULL
- **Solução:** Remover NOT NULL ou sempre fornecer valor

### Hipótese 3: Constraint UNIQUE ou CHECK
- **Sintoma:** Error 23505 "unique violation" ou 23514 "check violation"
- **Causa:** Valor viola constraint
- **Solução:** Validar dados antes ou remover constraint

### Hipótese 4: foreignkey Constraint
- **Sintoma:** Error 23503 "foreign key violation"
- **Causa:** user_id não existe em tabela auth.users
- **Solução:** Verificar autenticação do usuário

### Hipótese 5: Tabela não em Public Schema
- **Sintoma:** 42P01 "relation does not exist"
- **Causa:** Tabela em schema diferente
- **Solução:** Qualificar com schema: schema.empresa_config

## Solução Rápida (Se Confirmar RLS)

Se o problema for RLS policy, a política provavelmente está assim:

```sql
-- ANTIGA (BLOQUEANDO)
CREATE POLICY "Users can only access their own config" ON empresa_config
FOR SELECT USING (auth.uid()::text = user_id);
-- Esta policy só permite SELECT, não INSERT/UPDATE!
```

Deve ser mudado para:

```sql
-- NOVA (PERMITINDO UPSERT)
CREATE POLICY "Users can manage their own config" ON empresa_config
FOR ALL USING (auth.uid()::text = user_id);
-- Ou mais permissivo:
FOR INSERT WITH CHECK (auth.uid()::text = user_id)
FOR UPDATE USING (auth.uid()::text = user_id)
FOR SELECT USING (auth.uid()::text = user_id)
FOR DELETE USING (auth.uid()::text = user_id);
```

## Próximos Passos

1. **Executar os queries acima** no Supabase SQL Editor
2. **Anotar os resultados**
3. **Identificar a hipótese que combina**
4. **Aplicar a solução apropriada**
5. **Testar no frontend:**
   ```bash
   1. Abrir DevTools > Application > LocalStorage
   2. Limpar entrada "EMPRESA_EXTRA_KEY_*"
   3. Salvar logo novamente
   4. Verificar se erro aparece
   5. Verificar se banco foi atualizado
   ```

---

**Documento criado:** 2026-11-06
**Prioridade:** 🔴 ALTA (bloqueia persistência de dados)
**Responsável:** Verificar RLS e estrutura do banco
