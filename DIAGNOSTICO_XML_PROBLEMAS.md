# 🔴 DIAGNÓSTICO: Problemas no XML Geral (serve-xml-geral)

**Data da Investigação:** 2026-11-06  
**Estação Testada:** Interativa FM  
**URL Testada:** http://localhost:8080/xml/interativafm/geral.xml

---

## 📋 PROBLEMAS IDENTIFICADOS

### 1. ❌ URLs DE IMAGENS VAZIAS
As seguintes tags estão vazias no XML, mesmo quando deveriam conter URLs:

```xml
<musica_atual_capa_url/>          <!-- Deveria: capa da música atual -->
<programa_atual_logo_url/>        <!-- Deveria: logo/selo do programa -->
<apresentador_atual_foto_url/>    <!-- Deveria: foto do apresentador -->
<a_seguir_locutor_foto/>          <!-- Deveria: foto do locutor do próximo programa -->
```

**Causa Raiz Identificada:**
No arquivo [`supabase/functions/serve-xml-geral/index.ts`](supabase/functions/serve-xml-geral/index.ts) (linhas 280-310), o código busca fotos e selos apenas quando são URLs começando com "http":

```typescript
// Linha 295-305 - PROBLEMA!
if (fotoIds.length > 0) {
  const { data: fotos } = await sb
    .from("apresentadores")
    .select("id, foto")
    .in("id", fotoIds)
    .like("foto", "http%");  // ← FILTRO MUITO RESTRITIVO
  // ... só pega fotos que começam com "http"
}
```

**Consequência:**
- ✅ Se a foto estiver salva como URL: é incluída no XML
- ❌ Se a foto estiver em base64 ou em path relativo: é ignorada
- ❌ Se a foto não tiver sido enviada: fica vazia

---

### 2. ❌ TICKER AUSENTE
**Problema:** Não há seção `<ticker>` no XML geral.

**Observação:** Pode haver um XML específico de ticker (`tempo.xml`), mas não está integrado ao `geral.xml`.

**Localização no código:** `supabase/functions/serve-xml-geral/index.ts` não menciona ticker

---

### 3. ❌ CAMPOS DE TEMPO INCOMPLETOS
A seção `<previsao_tempo>` existe, mas:
- Temperatura, descrição, mínima/máxima, umidade, vento estão VAZIOS
- Ícone do tempo está VAZIO

**Causa Raiz:**
O código (linhas 350-375) tenta carregar um arquivo XML de tempo do storage:

```typescript
let weatherXml = "";
try {
  const { data: wBlob } = await sb.storage
    .from("xml-files")
    .download(`xml-tempo-${ownerId}.xml`);
  // ... tenta fazer parse
} catch {}
```

**Problema:** Se o arquivo `xml-tempo-{ownerId}.xml` não existir ou não tiver o conteúdo esperado, fica vazio.

---

### 4. ❌ LOGO DA ESTAÇÃO (JORNAL FM)
**Relato do Usuário:** "Ao salvar a logo da empresa, recebeu mensagem de erro dizendo que a logo foi salva apenas no navegador e não no banco"

**Implicação:** A logo da estação também pode estar vazia para Jornal FM

**Verificação Necessária:**
- O campo `empresa.logo` está siendo salvo no banco?
- Qual é a fonte do erro "salva apenas no navegador"?

---

### 5. ❌ ESTAÇÃO LOGO URL (JORNAL FM)
Para a estação Jornal FM:
- O XML pode estar mostrando logo vazia ou caminho errado
- Precisa verificar se o UUID está correto para Jornal FM

**Mapeamento de Estações:**
```typescript
// Linha 49-61: serve-xml-geral/index.ts
const SLUG_TO_UID: Record<string, string> = {
  jornal: "98365ea6-0ebf-496d-83e9-69b38089586d",  // ← Jornal FM
  // ... outros
};
```

---

## 🔍 ESTRUTURA DO BANCO DE DADOS

### Tabela: `apresentadores`
- `id` (UUID)
- `nome` (string)
- `instagram` (string)
- `foto` (string/URL ou base64)  ← **Pode ser URL ou base64, mas XML só aceita URL**

### Tabela: `programas`
- `id` (UUID)
- `nome` (string)
- `selo` (URL ou base64)
- `thumb` (URL ou base64)  ← **Mesmo problema**

### Tabela: `musicas` (ou `music_history_light`)
- `capa` (URL ou base64)  ← **Mesmo problema**

### Tabela: `empresa_config`
- `logo` (URL ou base64)  ← **Pode estar como base64, XML espera URL**

---

## 💾 FLUXO DE SALVAMENTO DA LOGO DA EMPRESA

**Passos a Investigar:**
1. Onde a logo é feita upload?
2. É convertida para base64 ou salva como URL?
3. O banco de dados está recebendo a logo?
4. Qual é a origem do erro "salva apenas no navegador"?

**Arquivo Relevante:**
- `src/components/ConfiguracoesPage.tsx` - provavelmente contém lógica de upload

---

## 🔧 SOLUÇÃO RECOMENDADA

### Problema 1: URLs de Imagens Vazias

**Opção A: Aceitar base64 no XML** (NÃO RECOMENDADO)
- Causa overhead de tamanho
- Imagens em base64 ocupam ~33% mais espaço

**Opção B: Converter base64 para URL na função** (RECOMENDADO)
- Detectar base64
- Upload para Supabase Storage
- Retornar URL pública

**Opção C: Sempre salvar como URL no banco** (MELHOR PRÁTICA)
- No form de upload, já enviar direto para Storage
- Salvar apenas a URL no banco
- Consistência garantida

### Problema 2: Ticker

**Necessário:**
- Criar seção `<ticker>` no XML geral
- Fonte de dados: tabela `noticias` ou similar
- Formato esperado: lista de notícias em scroll

### Problema 3: Previsão de Tempo

**Necessário:**
- Garantir que `xml-tempo-{ownerId}.xml` existe no Storage
- Ou gerar dinamicamente via API de clima
- Ou permitir upload manual

### Problema 4: Logo da Empresa ✅ CAUSA IDENTIFICADA

**RAIZ DO PROBLEMA:**
No arquivo [`src/components/ConfiguracoesPage.tsx`](src/components/ConfiguracoesPage.tsx) (linhas 390-415):

1. A logo é salva em `localStorage` imediatamente (linha 395)
2. Após 500ms, tenta fazer `upsert` no banco (linhas 403-415)
3. **Se o `upsert` falhar**, mostra erro: "As alterações ficaram no navegador, mas não foram confirmadas no banco"

**Código problemático:**
```typescript
const saveConfig = (newConfig: EmpresaConfig) => {
  // ... 
  // ✅ Salva no localStorage
  if (tid) {
    localStorage.setItem(`${EMPRESA_EXTRA_KEY}_${tid}`, JSON.stringify(extraToSave));
  }
  
  // ❌ Depois tenta salvar no banco (pode falhar silenciosamente)
  setTimeout(async () => {
    const { error: configSaveError } = await supabase.from("empresa_config").upsert({
      user_id: saveId,
      logo: newConfig.logo,  // ← Aqui é onde a logo deve ir
      // ... outros campos
    });
    if (configSaveError) throw configSaveError;
  }, 500);
};
```

**Possíveis Motivos do Erro:**
1. ❌ Erro de permissão no Supabase (RLS policies bloqueando upsert)
2. ❌ Conexão com banco perdida
3. ❌ Campo `user_id` não existe ou está inválido
4. ❌ Limite de tamanho do campo `logo` excedido (se salvar base64)
5. ❌ Timeout na requisição

**Necessário:**
- Validar RLS policies da tabela `empresa_config`
- Verificar logs de erro do Supabase
- Testar upsert direto via console
- Validar UUID de Jornal FM

---

## 📊 CHECKLIST DE TESTES

- [ ] Testar XML com música que tem capa como URL
- [ ] Testar XML com música que tem capa como base64
- [ ] Testar XML com apresentador que tem foto como URL
- [ ] Testar XML com apresentador que tem foto como base64
- [ ] Testar XML de Jornal FM - verificar logo
- [ ] Testar ticker - deve aparecer no XML
- [ ] Testar tempo - campos não devem ficar vazios
- [ ] Testar upload de logo da empresa - deve salvar no banco

---

## 📁 ARQUIVOS AFETADOS

1. **supabase/functions/serve-xml-geral/index.ts** - Função principal que gera XML
2. **src/components/ConfiguracoesPage.tsx** - Formulário de configurações (logo da empresa)
3. **src/lib/empresaConfigService.ts** - Serviço de configuração da empresa
4. **src/integrations/supabase/client.ts** - Cliente Supabase

---

## 🚨 IMPACTO

- ❌ vMix não consegue exibir imagens
- ❌ Broadcast não funciona corretamente
- ❌ Programação visual incompleta
- ❌ Ticker/notícias não aparecem
- ❌ Tempo não é exibido

---

## ✅ PRÓXIMOS PASSOS

1. Executar testes com dados reais do banco
2. Verificar qual formato as imagens estão sendo salvas (URL vs base64)
3. Corrigir a lógica de filtragem de fotos/selos
4. Adicionar seção de ticker
5. Garantir dados de tempo
6. Investigar erro de salvamento de logo
