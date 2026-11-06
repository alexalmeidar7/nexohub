# ✋ PAROU AQUI - PRÓXIMA AÇÃO: APLICAR RLS NO SUPABASE

## 🚨 Situação Atual
- ✅ Problema diagnosticado
- ✅ Código corrigido
- ✅ Build pronto
- ⏳ **FALTA**: Aplicar mudança no banco de dados

## 🎯 O Que Você Precisa Fazer

### Passo 1️⃣: Abrir Dashboard Supabase
Clique neste link:
```
https://supabase.com/dashboard/project/qazvgmgdidjhbvcuinpy/sql/new
```

Ou:
1. Vá para supabase.com/dashboard
2. Projeto: "NexoHub Produção"
3. Menu esquerdo: "SQL Editor"

### Passo 2️⃣: Copiar SQL
Copie TUDO isso abaixo (sem comentários se quiser):

```sql
ALTER TABLE empresa_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own config" ON empresa_config;
DROP POLICY IF EXISTS "Users can update their own config" ON empresa_config;
DROP POLICY IF EXISTS "Users can insert their own config" ON empresa_config;
CREATE POLICY "Users can view their own config" ON empresa_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own config" ON empresa_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own config" ON empresa_config FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### Passo 3️⃣: Executar
1. Cole o SQL no editor
2. Clique "Run" (ou Ctrl+Enter)
3. Espere mensagem: "Queries completed successfully"

### Passo 4️⃣: Pronto! ✅
Volte ao app e tente salvar a logo novamente. Deve funcionar!

---

## ✋ ESPERA - SE VOCÊ QUER ENTENDER ANTES

Leia os arquivos de documentação (cada um leva 2-5 minutos):

| Arquivo | Leia se... | Tempo |
|---------|-----------|-------|
| [README_LOGO_FIX.md](./README_LOGO_FIX.md) | Quer resumo rápido | 2 min |
| [PROXIMA_ACAO.md](./PROXIMA_ACAO.md) | Quer passo a passo | 3 min |
| [LOGO_SAVE_FIX_RESUMO.md](./LOGO_SAVE_FIX_RESUMO.md) | Quer detalhes técnicos | 5 min |
| [INVESTIGACAO_RESULTADO_FINAL.md](./INVESTIGACAO_RESULTADO_FINAL.md) | Quer ver toda a investigação | 10 min |

---

## 🔍 O Que Mudou no Código

**Arquivo**: `src/components/ConfiguracoesPage.tsx`  
**Linha**: 449-450  

**Antes**:
```typescript
cliente_desde: newConfig.clienteDesde || "",
```

**Depois**:
```typescript
const clienteDesdeValue = newConfig.clienteDesde?.trim();
cliente_desde: clienteDesdeValue ? clienteDesdeValue : null,
```

**Por quê**: O banco rejeita strings vazias em colunas DATE. Agora envia `null`.

---

## 🎓 Resumo Técnico (Mínimo)

1. **Erro Original**: `"invalid input syntax for type date: """`
2. **Causa**: Campo `cliente_desde` é DATE, recebeu string vazia
3. **Código Fixado**: Agora envia `null` (que DATE aceita)
4. **Novo Erro**: RLS policy bloqueia INSERT (erro 42501)
5. **Solução**: Aplicar SQL para liberar RLS
6. **Resultado**: Logo salva normalmente ✅

---

## ⏱️ Tempo Total

| Atividade | Tempo |
|-----------|-------|
| Ler este arquivo | 2 min |
| Copiar SQL | 1 min |
| Executar no Supabase | 1 min |
| Testar no app | 2 min |
| **TOTAL** | **6 min** |

---

## ✅ Checklist para Você

- [ ] Li `README_LOGO_FIX.md`
- [ ] Entendi que tem 2 problemas (1 fixado no código, 1 no banco)
- [ ] Copiei o SQL da Seção "Passo 2️⃣"
- [ ] Abri Supabase Dashboard SQL Editor
- [ ] Colei e executei o SQL
- [ ] Vi mensagem "Queries completed successfully"
- [ ] Testei no app: tentei salvar logo
- [ ] Vejo "Configurações salvas com sucesso!"
- [ ] Recarreguei página e logo permaneceu ✅

---

## 🆘 Erro? Contate Suporte

Se tiver erro, anote:
- Mensagem de erro exata
- Horário que tentou
- Seu usuário: `jornal@jornalradio.com.br`

E abra issue no repositório ou contate Alex.

---

## 💡 Bônus: Script de Teste

Se quiser validar após aplicar o SQL:

```bash
npx tsx test-after-rls-fix.ts
```

Deve retornar: `All tests completed!` ✅

---

**Última atualização**: 2026-11-06 16:35  
**Status**: 🟡 Aguardando ação do usuário  
**Tempo estimado para conclusão**: 6 minutos
