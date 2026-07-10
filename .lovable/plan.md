## Diagnóstico

**1. Deploy automático está quebrado porque não existe workflow no repositório.**

Verifiquei o projeto: **não há pasta `.github/workflows/`**. Sem um arquivo `.yml`, o GitHub não roda build nem envia nada para a Hostinger — cada push para `main` simplesmente não dispara nada. Isso explica por que "em algum momento parou" — o arquivo foi apagado (ou nunca existiu de fato) em algum commit anterior.

**2. O erro `connect.facebook.net/en_US/fbevents.js ERR_BLOCKED_BY_CLIENT` NÃO é a causa da falha de deploy.**

Esse erro é do **Facebook Pixel** sendo bloqueado por adblocker/uBlock/Brave no navegador do usuário. É um aviso inofensivo do lado cliente — não quebra a aplicação, não impede build, não afeta o deploy. Pode ser ignorado ou o pixel pode ser removido se você não usa Facebook Ads.

---

## O que vou fazer (após aprovação do plano)

### A. Recriar o workflow de deploy FTP para Hostinger

Criar `.github/workflows/deploy-hostinger.yml` que, a cada push na `main`:
1. Checa o código
2. Instala Bun e dependências (`bun install`)
3. Roda `bun run build` (gera `dist/`)
4. Envia `dist/` via FTP para a Hostinger usando `SamKirkland/FTP-Deploy-Action`

Ele vai depender de 4 secrets a serem configurados em **GitHub → Settings → Secrets and variables → Actions**:
- `FTP_SERVER` (ex: `ftp.seudominio.com.br` ou o host que a Hostinger fornece)
- `FTP_USERNAME`
- `FTP_PASSWORD`
- `FTP_SERVER_DIR` (ex: `/public_html/` — geralmente o padrão Hostinger)

Se você já tinha esses secrets configurados antes no GitHub, eles continuam lá — basta o workflow existir para consumi-los.

### B. Corrigir metadados no `index.html`

Atualmente `og:title`, `og:description` e `twitter:title` estão como "Lovable App" / "Lovable Generated Project". Vou substituir por conteúdo real do NexoHub (título e descrição).

### C. Sobre o Facebook Pixel

Preciso que você confirme uma das opções:
- **Manter o pixel** (o erro `ERR_BLOCKED_BY_CLIENT` continuará aparecendo em navegadores com adblock, mas é inofensivo), ou
- **Remover o pixel** do `index.html` se você não usa Facebook Ads.

Vou assumir "manter" a menos que você diga o contrário na próxima mensagem.

---

## Detalhes técnicos

Estrutura do workflow proposto:

```yaml
name: Deploy to Hostinger
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build
      - name: FTP Deploy
        uses: SamKirkland/FTP-Deploy-Action@v4.3.5
        with:
          server: ${{ secrets.FTP_SERVER }}
          username: ${{ secrets.FTP_USERNAME }}
          password: ${{ secrets.FTP_PASSWORD }}
          server-dir: ${{ secrets.FTP_SERVER_DIR }}
          local-dir: ./dist/
          protocol: ftps
          port: 21
```

Observações:
- Uso `ftps` (FTP com TLS) que a Hostinger suporta e é recomendado sobre FTP puro.
- Se sua Hostinger só aceitar FTP simples, troco para `protocol: ftp`.
- Uso `bun install --frozen-lockfile` porque o projeto tem `bun.lockb`.

---

## Como verificar depois do deploy

1. Push do workflow para `main` → abra a aba **Actions** do repo no GitHub.
2. Deve aparecer o job "Deploy to Hostinger" rodando. Se falhar, o log dirá exatamente qual passo quebrou (auth FTP, build, etc.) e eu ajusto.
3. Acesse o domínio da Hostinger e verifique a data do último arquivo `index.html` em File Manager.

Posso implementar? Se sim, aprove o plano.