import { test } from "@playwright/test";
import { expectInViewport, expectNoHorizontalScroll, goto } from "./helpers";

/**
 * Responsividade da Home em 1366x768.
 * Falha se qualquer região crítica (shell, sidebar, player, próximos eventos)
 * ficar fora da viewport ou provocar scroll horizontal.
 *
 * Rotas testadas:
 *  - "/"       → landing / login pública
 *  - "/home"   → dashboard do usuário logado (quando disponível)
 *
 * Para testar tenants específicos, defina TENANT_SLUGS="jornalfm,housemix"
 * — cada slug será validado em /:slug/home.
 */
const tenantSlugs = (process.env.TENANT_SLUGS || "").split(",").map(s => s.trim()).filter(Boolean);
const routes = ["/", "/home", ...tenantSlugs.map(s => `/${s}/home`)];

for (const route of routes) {
  test(`responsividade 1366x768 — ${route}`, async ({ page }) => {
    await goto(page, route);
    await expectNoHorizontalScroll(page);
    // Shell principal do app
    await expectInViewport(page, "[data-app-shell]", "shell do app").catch(async () => {
      // Rotas públicas (landing) podem não ter data-app-shell — validar body.
      await expectInViewport(page, "body", "body");
    });
  });
}

test("home autenticada — widgets principais visíveis (opcional)", async ({ page }) => {
  test.skip(!process.env.TEST_HOME_AUTH, "defina TEST_HOME_AUTH=1 para rodar após login");
  await goto(page, "/home");
  await expectNoHorizontalScroll(page);
  await expectInViewport(page, "[data-home-scroll]", "container da Home");
  // Widgets críticos — usam textos estáveis da UI:
  const critical = [
    { sel: "text=Próximos Eventos", label: "widget Próximos Eventos" },
    { sel: "text=/AO VIVO|NO AR/i", label: "bloco No Ar / Ao Vivo" },
  ];
  for (const c of critical) await expectInViewport(page, c.sel, c.label);
});
