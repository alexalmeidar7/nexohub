# 🎯 PLANO DE AÇÃO - Corrigir XML Geral

## 🔴 PRIORIDADE 1: URLs de Imagens Vazias
**Status:** CRÍTICO - Afeta todas as emissoras  
**Impacto:** vMix não consegue exibir imagens (música, programa, apresentador)

### 1.1 Problema
Na função `supabase/functions/serve-xml-geral/index.ts`, o código filtra imagens apenas se forem URLs:

```typescript
// Linha 295-305: FILTRO MUITO RESTRITIVO
.like("foto", "http%");  // ← Ignora base64 e paths relativos
```

### 1.2 Solução Proposta

**OPÇÃO A: Carregar fotos mesmo que sejam base64**
```typescript
// ANTES:
const { data: fotos } = await sb
  .from("apresentadores")
  .select("id, foto")
  .in("id", fotoIds)
  .like("foto", "http%");  // ❌ Muito restritivo

// DEPOIS:
const { data: fotos } = await sb
  .from("apresentadores")
  .select("id, foto")
  .in("id", fotoIds);  // ✅ Busca todas as fotos

(fotos || []).forEach((f: any) => {
  // Se for URL, usar direto
  if (f.foto && f.foto.startsWith("http")) {
    // ... usar como está
  } 
  // Se for base64, converter para PNG e fazer upload
  else if (f.foto && f.foto.startsWith("data:")) {
    // Fazer upload para storage e guardar URL
    // Por enquanto, usar base64 direto no XML (não ideal)
  }
});
```

**OPÇÃO B: Sempre fazer upload para Storage (RECOMENDADO)**
- Detectar base64
- Fazer upload para Supabase Storage
- Salvar URL no banco
- Retornar URL pública

**OPÇÃO C: Padrão futuro**
- No formulário de upload, já fazer upload para Storage
- Salvar apenas URL no banco
- Nunca mais aceitar base64

### 1.3 Código a Corrigir

**Arquivo:** `supabase/functions/serve-xml-geral/index.ts`

Linhas a modificar:
- **295-308:** Remover filtro `.like("foto", "http%")`
- **285-290:** Remover filtro `.like("selo", "http%")`
- **300-310:** Adicionar conversão de base64 para URL

### 1.4 Teste
```bash
# 1. Testar XML com apresentador que tem foto em base64
curl http://localhost:8080/xml/interativafm/geral.xml | grep apresentador_atual_foto_url

# 2. Verificar se URL aparece (não deveria estar vazia)
```

---

## 🔴 PRIORIDADE 2: Logo da Empresa Não Salva no Banco
**Status:** CRÍTICO - Afeta Jornal FM e outras emissoras  
**Impacto:** Logotipo não aparece no XML/vMix

### 2.1 Problema
Em `src/components/ConfiguracoesPage.tsx`, o `upsert` para `empresa_config` está falhando silenciosamente:

```typescript
// Linha 403-415
try {
  const { error: configSaveError } = await supabase.from("empresa_config").upsert({
    user_id: saveId,
    logo: newConfig.logo,  // ← Não está sendo salvo
    // ... outros campos
  });
  if (configSaveError) throw configSaveError;
} catch (err: any) {
  // ❌ Erro é apenas mostrado em toast, não tratado
  toast.error("As alterações ficaram no navegador...");
}
```

### 2.2 Solução

**PASSO 1:** Verificar RLS Policies
```sql
-- Verificar se há política bloqueando upsert
SELECT * FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'empresa_config';
```

**PASSO 2:** Validar UUID de Jornal FM
```sql
-- Verificar se user_id existe
SELECT user_id, nome FROM empresa_config 
WHERE user_id = '98365ea6-0ebf-496d-83e9-69b38089586d';
```

**PASSO 3:** Testar upsert direto
```javascript
// No console do navegador:
const { data, error } = await supabase.from("empresa_config").upsert({
  user_id: "9cab6c46-c32a-4c19-94db-773dcfaf7632",  // Interativa FM
  logo: "https://exemplo.com/logo.png",
}, { onConflict: "user_id" });

console.log("Error:", error);
console.log("Data:", data);
```

**PASSO 4:** Melhorar tratamento de erro
```typescript
// Em ConfiguracoesPage.tsx, linha 403-415:
catch (err: any) {
  console.error("❌ Upsert falhou:", err);
  toast.error("Logo não foi salva no banco: " + (err?.message || "erro desconhecido"));
  
  // Adicionar retry automático
  setTimeout(() => {
    supabase.from("empresa_config").upsert({ ... });
  }, 2000);
}
```

### 2.3 Teste
```bash
# 1. Salvar logo via interface
# 2. Verificar console para erro exato
# 3. Aguardar 2-3 segundos para retry
# 4. Verificar se foi salvo:
curl http://localhost:8080/xml/interativafm/geral.xml | grep estacao_logo_url
```

---

## 🟠 PRIORIDADE 3: Ticker Ausente
**Status:** ALTO - Afeta Jornal FM principalmente  
**Impacto:** Notícias não aparecem no broadcast

### 3.1 Problema
Não há seção `<ticker>` no XML geral. O ticker é crítico para:
- Jornal FM (feed de notícias)
- Crawl/rodapé de notícias
- Informações em tempo real

### 3.2 Solução

**PASSO 1:** Adicionar seção de ticker no XML
```xml
<ticker>
  <ativo>1</ativo>
  <noticias>
    <noticia>
      <ordem>1</ordem>
      <titulo>Título da notícia</titulo>
      <resumo>Resumo breve</resumo>
      <fonte>Fonte da notícia</fonte>
      <timestamp>2026-11-06T15:23:00Z</timestamp>
    </noticia>
    <!-- ... mais notícias -->
  </noticias>
</ticker>
```

**PASSO 2:** Adicionar query ao banco
```typescript
// Em serve-xml-geral/index.ts, após linha 160:
const tickerRes = await step("ticker", 
  sb.from("noticias")
    .select("id, titulo, resumo, fonte, created_at")
    .eq("user_id", ownerId)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(10)
);
```

**PASSO 3:** Gerar XML de ticker
```typescript
// Após interatividade (linha 550+):
xmlParts.push('  <ticker>');
const noticias = tickerRes.data || [];
if (noticias.length > 0) {
  xmlParts.push('    <ativo>1</ativo>');
  xmlParts.push('    <noticias>');
  noticias.forEach((n: any, idx: number) => {
    xmlParts.push('      <noticia>');
    xmlParts.push(`        <ordem>${idx + 1}</ordem>`);
    xmlParts.push(`        <titulo>${esc(n.titulo || "")}</titulo>`);
    xmlParts.push(`        <resumo>${esc(n.resumo || "")}</resumo>`);
    xmlParts.push(`        <fonte>${esc(n.fonte || "")}</fonte>`);
    xmlParts.push(`        <timestamp>${esc(n.created_at || "")}</timestamp>`);
    xmlParts.push('      </noticia>');
  });
  xmlParts.push('    </noticias>');
} else {
  xmlParts.push('    <ativo>0</ativo>');
}
xmlParts.push('  </ticker>');
```

### 3.3 Teste
```bash
curl http://localhost:8080/xml/jornal/geral.xml | grep -A 20 "<ticker>"
```

---

## 🟠 PRIORIDADE 4: Previsão de Tempo Incompleta
**Status:** ALTO - Não exibe temperatura, descrição, etc.  
**Impacto:** Dados de tempo não aparecem no vMix

### 4.1 Problema
O código tenta carregar `xml-tempo-{ownerId}.xml` do Storage, mas:
- Arquivo pode não existir
- Arquivo pode estar com estrutura errada
- Parsing pode falhar

### 4.2 Solução

**OPÇÃO A: Gerar dinamicamente (RECOMENDADO)**
```typescript
// Em serve-xml-geral/index.ts, remover:
let weatherXml = "";
try {
  const { data: wBlob } = await sb.storage
    .from("xml-files")
    .download(`xml-tempo-${ownerId}.xml`);
  if (wBlob) weatherXml = await wBlob.text();
} catch {}

// Substituir por:
let weatherData = { available: false };
try {
  // Buscar dados de tempo do banco
  const { data: weatherDb } = await sb
    .from("previsoes_tempo")
    .select("*")
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (weatherDb) {
    weatherData = {
      available: true,
      temperatura: weatherDb.temperatura,
      descricao: weatherDb.descricao,
      minima: weatherDb.minima,
      maxima: weatherDb.maxima,
      umidade: weatherDb.umidade,
      vento: weatherDb.vento,
      icone_url: weatherDb.icone_url,
    };
  }
} catch (err) {
  console.error("Erro ao carregar previsão de tempo:", err);
}
```

**OPÇÃO B: Integrar com API de Clima (OpenWeatherMap, INMET, etc.)**
```typescript
// Buscar latitude/longitude da emissora
// Fazer request à API
// Parsear resposta
// Retornar dados de tempo
```

**OPÇÃO C: Melhorar parsing do arquivo existente**
```typescript
// Se o arquivo ainda existe, melhorar parsing
if (weatherXml && weatherXml.includes("<temperatura>")) {
  // ... parsing atual funciona bem, apenas garantir que arquivo existe
} else {
  console.warn(`Arquivo xml-tempo-${ownerId}.xml não encontrado no Storage`);
  // Falhar graciosamente
}
```

### 4.3 Teste
```bash
curl http://localhost:8080/xml/interativafm/geral.xml | grep -A 15 "<previsao_tempo>"
# Deve mostrar: temperatura, descrição, mínima, máxima, umidade, vento, ícone_url
```

---

## 📋 CHECKLIST DE IMPLEMENTAÇÃO

### Fase 1: Críticos (essa semana)
- [ ] **Logo da Empresa:**
  - [ ] Verificar RLS policies de `empresa_config`
  - [ ] Validar UUID de Jornal FM
  - [ ] Testar upsert direto
  - [ ] Melhorar tratamento de erro
  - [ ] Implementar retry automático

- [ ] **URLs de Imagens:**
  - [ ] Remover filtro `.like("foto", "http%")` para apresentadores
  - [ ] Remover filtro `.like("selo", "http%")` para programas
  - [ ] Testar XML com base64
  - [ ] Implementar conversão para PNG se necessário

### Fase 2: Altos (próxima semana)
- [ ] **Ticker:**
  - [ ] Criar tabela `noticias` se não existir
  - [ ] Adicionar query no serve-xml-geral
  - [ ] Gerar XML de ticker
  - [ ] Testar com dados reais

- [ ] **Previsão de Tempo:**
  - [ ] Criar tabela `previsoes_tempo` se não existir
  - [ ] Reescrever lógica de carregamento
  - [ ] Escolher entre arquivo, banco ou API
  - [ ] Testar com dados reais

### Fase 3: Melhorias (futuro)
- [ ] [ ] Padrão obrigatório: sempre fazer upload para Storage
- [ ] Integração com API de clima real
- [ ] Cache de imagens para melhorar performance
- [ ] Validação de URL antes de incluir no XML

---

## 🔗 REFERÊNCIAS

- **Arquivo Principal:** `supabase/functions/serve-xml-geral/index.ts`
- **Configurações:** `src/components/ConfiguracoesPage.tsx`
- **Tipos:** `src/integrations/supabase/types.ts`
- **Serviço:** `src/lib/empresaConfigService.ts`

---

## 💬 NOTAS

1. Todas as alterações devem ser testadas com dados reais
2. XML deve ser validado antes de retornar (sem erros de sintaxe)
3. Cache-Control deve permanecer `no-store` para dados dinâmicos
4. Sempre validar UUIDs antes de usar
5. Implementar logging para debug
