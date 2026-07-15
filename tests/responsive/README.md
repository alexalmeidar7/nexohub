# Testes de responsividade (1366x768)

Suite Playwright que valida se as páginas principais cabem inteiras em
uma tela **1366x768** — resolução comum em notebooks e vMix.

## Rodar

```bash
# 1. Suba o dev server (outra aba/terminal)
npm run dev

# 2. Rode os testes
npm run test:responsive
```

## O que é validado

- Nenhuma página gera **scroll horizontal**.
- A **shell do app** (`[data-app-shell]`) fica dentro da viewport.
- Container da Home (`[data-home-scroll]`) e widgets críticos (Próximos
  Eventos, No Ar/Ao Vivo) ficam visíveis — quando testando rota
  autenticada.

## Testar tenants específicos

```bash
TENANT_SLUGS="jornalfm,housemix" npm run test:responsive
```

Cada slug é validado em `/:slug/home`.

## Testar Home autenticada

Requer sessão ativa (o helper ainda não injeta login). Marque
`TEST_HOME_AUTH=1` **somente** quando o cookie/storage de sessão
estiver presente no perfil do Chromium usado.

## Adicionar novas páginas

Edite `tests/responsive/home.spec.ts` ou crie um novo `*.spec.ts` e
use os helpers `expectInViewport` / `expectNoHorizontalScroll`.
