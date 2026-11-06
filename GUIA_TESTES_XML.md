# 🧪 GUIA DE TESTES - Validar Problemas do XML

## Ambiente de Teste
- **URL de acesso:** http://localhost:8080
- **XML Endpoint:** http://localhost:8080/xml/[slug]/geral.xml
- **Estações disponíveis:**
  - Interativa FM: `http://localhost:8080/xml/interativafm/geral.xml`
  - Jornal FM: `http://localhost:8080/xml/jornal/geral.xml`
  - Positiva FM: `http://localhost:8080/xml/positivafm/geral.xml`

---

## 🧪 TESTE 1: URLs de Imagens Vazias (Música, Programa, Apresentador)

### Passos

**1. Abrir XML Endpoint**
```bash
curl http://localhost:8080/xml/interativafm/geral.xml > /tmp/xml_geral.xml
```

**2. Verificar tags vazias**
```bash
# Música capa
grep "<capa_url>" /tmp/xml_geral.xml
# Esperado: <capa_url>https://...</capa_url>
# Atual: <capa_url></capa_url>  ❌

# Programa logo
grep "<programa_atual_logo_url>" /tmp/xml_geral.xml
# Esperado: <logo_url>https://...</logo_url>
# Atual: <logo_url></logo_url>  ❌

# Apresentador foto
grep "apresentador_atual_foto_url" /tmp/xml_geral.xml
# Esperado: <foto_url>https://...</foto_url>
# Atual: <foto_url></foto_url>  ❌

# Locutor do próximo programa
grep "<locutor_foto>" /tmp/xml_geral.xml
# Esperado: <locutor_foto>https://...</locutor_foto>
# Atual: <locutor_foto></locutor_foto>  ❌
```

**3. No painel administrativo:**
1. Ir para **Configurações → Apresentadores**
2. Selecionar um apresentador que está on-air
3. Verificar:
   - [ ] Tem foto cadastrada?
   - [ ] A foto é URL (https://...) ou base64?
   - [ ] A foto aparece no formulário?

4. Ir para **Configurações → Programas**
5. Selecionar o programa que está on-air
6. Verificar:
   - [ ] Tem logo/selo cadastrado?
   - [ ] O logo é URL (https://...) ou base64?
   - [ ] O logo aparece no formulário?

7. Ir para **Administração → Música**
8. Verificar música atual:
   - [ ] Tem capa cadastrada?
   - [ ] A capa é URL (https://...) ou base64?
   - [ ] A capa aparece no painel?

### ✅ Resultado Esperado
Todas as tags devem conter URLs válidas:
```xml
<musica_atual>
  <capa_url>https://qazvgmgdidjhbvcuinpy.supabase.co/storage/.../imagem.png</capa_url>
</musica_atual>

<programa_atual>
  <logo_url>https://qazvgmgdidjhbvcuinpy.supabase.co/storage/.../logo.png</logo_url>
</programa_atual>

<apresentador_atual>
  <foto_url>https://qazvgmgdidjhbvcuinpy.supabase.co/storage/.../foto.png</foto_url>
</apresentador_atual>

<a_seguir>
  <locutor_foto>https://qazvgmgdidjhbvcuinpy.supabase.co/storage/.../foto.png</locutor_foto>
</a_seguir>
```

### 🔍 Se Falhar
- Verificar se imagens estão salvas como base64 (veja seção "Como Saber se é Base64")
- Verificar se o `ensureVmixPngUrl()` está funcionando corretamente
- Ver logs no console (F12 → Developer Tools → Console)

---

## 🧪 TESTE 2: Ticker Ausente

### Passos

**1. Verificar se seção `<ticker>` existe**
```bash
curl http://localhost:8080/xml/jornal/geral.xml | grep -i "<ticker"
# Esperado: <ticker> ... </ticker>
# Atual: (nada - AUSENTE)  ❌
```

**2. No painel de Jornal FM:**
1. Ir para **Configurações → Notícias** (ou similar)
2. Verificar:
   - [ ] Existe tabela/seção de notícias?
   - [ ] Há notícias cadastradas com status "ativo"?
   - [ ] As notícias têm título, resumo, fonte?

**3. Verificar logs do servidor**
```bash
# Ver logs da função serve-xml-geral
tail -f logs/serve-xml-geral.log
# Procurar por "ticker" ou "noticias"
```

### ✅ Resultado Esperado
```xml
<ticker>
  <ativo>1</ativo>
  <noticias>
    <noticia>
      <ordem>1</ordem>
      <titulo>Manchete 1</titulo>
      <resumo>Resumo da notícia</resumo>
      <fonte>Fonte</fonte>
      <timestamp>2026-11-06T15:23:00Z</timestamp>
    </noticia>
    <noticia>
      <ordem>2</ordem>
      <titulo>Manchete 2</titulo>
      <!-- ... -->
    </noticia>
  </noticias>
</ticker>
```

Ou, se não houver notícias:
```xml
<ticker>
  <ativo>0</ativo>
</ticker>
```

### 🔍 Se Falhar
- Ticker pode ser feature não implementada ainda
- Verificar se tabela `noticias` existe no banco
- Verificar se `serve-xml-geral` possui query para noticias

---

## 🧪 TESTE 3: Campos de Tempo Vazios

### Passos

**1. Verificar seção de previsão de tempo**
```bash
curl http://localhost:8080/xml/interativafm/geral.xml | grep -A 20 "<previsao_tempo>"
```

### ✅ Resultado Esperado
```xml
<previsao_tempo>
  <cidade>Goiânia - GO</cidade>
  <atual>
    <disponivel>1</disponivel>
    <temperatura>28°C</temperatura>
    <descricao>Parcialmente Nublado</descricao>
    <minima>24°C</minima>
    <maxima>32°C</maxima>
    <umidade>65%</umidade>
    <vento>12 km/h</vento>
    <icone_url>https://qazvgmgdidjhbvcuinpy.supabase.co/storage/.../sol.png</icone_url>
  </atual>
</previsao_tempo>
```

### ❌ Resultado Atual (Problema)
```xml
<previsao_tempo>
  <cidade>Goiânia - GO</cidade>
  <atual>
    <disponivel>0</disponivel>
    <temperatura></temperatura>
    <descricao></descricao>
    <minima></minima>
    <maxima></maxima>
    <umidade></umidade>
    <vento></vento>
    <icone_url></icone_url>
  </atual>
</previsao_tempo>
```

### 2. Verificar arquivo de tempo no Storage
```bash
# Abrir Supabase Dashboard
# Ir para Storage → xml-files
# Procurar por: xml-tempo-[USER_ID].xml
# Exemplo: xml-tempo-9cab6c46-c32a-4c19-94db-773dcfaf7632.xml

# Se arquivo não existir → problema confirmado
```

**3. No painel administrativo:**
1. Ir para **Configurações → Previsão de Tempo** (se existir)
2. Verificar:
   - [ ] Há dados de previsão cadastrados?
   - [ ] Dados estão atualizados?
   - [ ] Existe configuração de API (OpenWeatherMap, INMET)?

### 🔍 Se Falhar
- Arquivo `xml-tempo-{USER_ID}.xml` não existe no Storage
- Previsão de tempo não foi atualizada
- API de clima não está configurada
- Parsing do XML de tempo está falhando

---

## 🧪 TESTE 4: Logo da Empresa Não Salva no Banco

### Passos

**1. Fazer upload de nova logo**
1. Ir para **Configurações → Dados da Emissora**
2. Clicar em **Carregar Logo**
3. Selecionar uma imagem (PNG, JPG)
4. **OBSERVAR:** Aparece mensagem de erro? Qual?

**2. Verificar se foi salvo no navegador**
1. Abrir DevTools: F12
2. Ir para **Application → LocalStorage**
3. Procurar por chave: `nexohub_empresa_extra_v1_[USER_ID]`
   - Se existir → Logo foi salva no localStorage ✅
   - Se não existir → Problema no formulário

4. Expandir e procurar por: `"logo": ""`
   - Se vazio → Logo não foi processada
   - Se preenchido → Logo foi salva no navegador

**3. Verificar se foi salvo no banco**
```bash
# Via Supabase Dashboard:
# 1. Ir para SQL Editor
# 2. Executar:

SELECT user_id, nome, logo 
FROM empresa_config 
WHERE user_id = '9cab6c46-c32a-4c19-94db-773dcfaf7632'  -- Interativa FM
LIMIT 1;

# Verificar coluna `logo`:
# - Se NULL → não foi salvo ❌
# - Se vazio '' → não foi salvo ❌
# - Se URL → foi salvo ✅
```

**4. Verificar erro no console**
1. F12 → **Console**
2. Procurar por mensagens de erro (vermelho)
3. Copiar erro completo

### ✅ Resultado Esperado
1. Logo aparece na formulário
2. Mensagem: "Logo salva com sucesso" (ou similar)
3. Após 2 segundos, no banco:
   ```sql
   -- Query retorna:
   user_id | nome | logo
   --------|------|-----
   9cab... | Interativa FM | https://...logo.png
   ```

### ❌ Resultado Atual (Problema)
1. Logo aparece no navegador
2. Mensagem: **"As alterações ficaram no navegador, mas não foram confirmadas no banco"**
3. No banco, `logo` fica vazio

### 🔍 Se Falhar
- Erro no `upsert` do Supabase
- RLS policies bloqueando a operação
- Permissões de usuário insuficientes
- Limite de tamanho de arquivo excedido
- Timeout na conexão com banco

---

## 🧪 TESTE 5: Jornal FM - Logo da Estação

### Passos

**1. Acessar XML de Jornal FM**
```bash
curl http://localhost:8080/xml/jornal/geral.xml | grep "<estacao_logo_url>"
# Esperado: <estacao_logo_url>https://...</estacao_logo_url>
# Atual: <estacao_logo_url></estacao_logo_url>  ❌
```

**2. Verificar configuração de Jornal FM**
1. Ir para **Configurações → Dados da Emissora**
2. Selecionar "Jornal FM" no filtro de estação
3. Verificar:
   - [ ] Logo da estação está configurada?
   - [ ] Logo aparece no formulário?
   - [ ] Após salvar, aparece mensagem de erro?

**3. Verificar UUID correto**
```bash
# Jomal FM deve ter UUID:
# 98365ea6-0ebf-496d-83e9-69b38089586d

# Verificar no banco:
SELECT user_id, nome, logo FROM empresa_config 
WHERE user_id = '98365ea6-0ebf-496d-83e9-69b38089586d';
```

### ✅ Resultado Esperado
```xml
<estacao>
  <slug>jornal</slug>
  <logo_url>https://qazvgmgdidjhbvcuinpy.supabase.co/storage/.../logo.png</logo_url>
  <timezone>America/Sao_Paulo</timezone>
</estacao>
```

### 🔍 Se Falhar
- Logo não foi salva para Jornal FM
- UUID de Jornal FM está errado
- Problema no upsert (ver TESTE 4)

---

## 📝 Como Saber se Imagem é Base64

### No Formulário
1. Abrir DevTools (F12)
2. Ir para **Console**
3. Executar:
   ```javascript
   // Verificar valor do campo logo
   const logo = document.querySelector('[value*="logo"]')?.value;
   console.log(logo?.substring(0, 100));  // Primeiros 100 caracteres
   
   // Se começar com "data:image/" → é base64
   // Se começar com "https://" → é URL
   ```

### No Banco de Dados
```sql
-- Query para verificar formato de imagens
SELECT 
  id,
  nome,
  CASE 
    WHEN foto LIKE 'data:image/%' THEN 'BASE64'
    WHEN foto LIKE 'http%' THEN 'URL'
    WHEN foto LIKE '/%' THEN 'PATH_RELATIVO'
    ELSE 'DESCONHECIDO'
  END as formato,
  LENGTH(foto) as tamanho_bytes
FROM apresentadores
LIMIT 10;

-- Igual para programas:
SELECT id, nome,
  CASE 
    WHEN selo LIKE 'data:image/%' THEN 'BASE64'
    WHEN selo LIKE 'http%' THEN 'URL'
    ELSE 'DESCONHECIDO'
  END as formato_selo
FROM programas
LIMIT 10;
```

---

## 🛠️ Ferramentas Úteis

### Para Validar XML
```bash
# Instalar xmllint
# macOS: brew install libxml2
# Ubuntu: apt-get install libxml2-utils
# Windows: choco install libxml2

# Validar XML
curl http://localhost:8080/xml/interativafm/geral.xml | xmllint --format -
```

### Para Extrair Campos Específicos
```bash
# Grep com cor
curl http://localhost:8080/xml/interativafm/geral.xml | grep --color=always "<capa_url>"

# XPath para extrair valor
curl http://localhost:8080/xml/interativafm/geral.xml | xmllint --xpath '//musica_atual/capa_url/text()' -
```

### Para Comparar XMLs
```bash
# Salvar dois XMLs
curl http://localhost:8080/xml/interativafm/geral.xml > /tmp/xml1.xml
# ... fazer alteração ...
curl http://localhost:8080/xml/interativafm/geral.xml > /tmp/xml2.xml

# Comparar
diff -u /tmp/xml1.xml /tmp/xml2.xml | less
```

---

## 📋 Checklist de Testes

Execute todos os testes abaixo:

- [ ] **TESTE 1:** URLs de Imagens
  - [ ] `<capa_url>` tem valor
  - [ ] `<programa_atual_logo_url>` tem valor
  - [ ] `<apresentador_atual_foto_url>` tem valor
  - [ ] `<locutor_foto>` tem valor

- [ ] **TESTE 2:** Ticker
  - [ ] Tag `<ticker>` existe
  - [ ] Contém noticias (se cadastradas)
  - [ ] Formato está correto

- [ ] **TESTE 3:** Tempo
  - [ ] `<disponivel>` é 1 (dados disponíveis)
  - [ ] `<temperatura>` tem valor
  - [ ] `<descricao>` tem valor
  - [ ] `<icone_url>` tem valor

- [ ] **TESTE 4:** Logo da Empresa
  - [ ] Salvamento sem erro
  - [ ] Mensagem de sucesso aparece
  - [ ] Dados aparecem no banco após 2 seg
  - [ ] XML mostra URL válida

- [ ] **TESTE 5:** Jornal FM
  - [ ] Logo da estação aparece
  - [ ] Não há campos vazios
  - [ ] XML estrutura está correta

---

## 📊 Relatório de Testes

Após rodar os testes, preencha este relatório:

```
Data: __/__/____
Hora: __:__
Ambiente: [ ] Local [ ] Dev [ ] Prod

TESTE 1: URLs de Imagens
Status: [ ] ✅ Passou [ ] ❌ Falhou
Detalhes: ___________________

TESTE 2: Ticker
Status: [ ] ✅ Passou [ ] ❌ Falhou [ ] ⏭️ Pulado (feature não impl.)
Detalhes: ___________________

TESTE 3: Tempo
Status: [ ] ✅ Passou [ ] ❌ Falhou
Detalhes: ___________________

TESTE 4: Logo da Empresa
Status: [ ] ✅ Passou [ ] ❌ Falhou
Erro reportado: ___________________

TESTE 5: Jornal FM
Status: [ ] ✅ Passou [ ] ❌ Falhou
Detalhes: ___________________

Ações Necessárias:
- [ ] ...
- [ ] ...
- [ ] ...
```

---

## 🚀 Próximas Etapas

Após completar os testes:

1. **Se TODOS passarem:** ✅ Sistema funcionando normalmente
2. **Se alguns falharem:** 
   - Documentar exatamente qual falhou
   - Executar ações do PLANO_ACAO_XML.md
   - Re-rodar teste específico
   - Confirmar correção

3. **Se muitos falharem:**
   - Considerar reset do banco (com cuidado!)
   - Verificar logs do Supabase
   - Conferir RLS policies
