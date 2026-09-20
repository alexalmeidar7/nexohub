import { test, expect } from "@playwright/test";

test.use({ channel: "chrome" });

test("Positiva FM - logos de patrocinadores continuam carregando normalmente", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1. Login as Positiva FM
  console.log("Navigating to login...");
  await page.goto("http://localhost:8080/?signed_out=1");
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });

  console.log("Entering credentials...");
  await page.fill('input[type="email"]', "positivafm@positivafm.com.br");
  await page.fill('input[type="password"]', "positiva2026");
  await page.click('button:has-text("Entrar")');

  // Wait for login redirection
  console.log("Waiting for /home...");
  await page.waitForURL("**/home**", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // 2. Open logos module via query param ?page=logos
  console.log("Navigating to /home?page=logos...");
  await page.goto("http://localhost:8080/home?page=logos");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(4000);

  // Verify logos
  const logoImgs = await page.$$eval('img[src*="comercial"], img[src*="logos"]', (imgs) => imgs.map((i) => i.src));
  console.log(`[TEST RESULT] Positiva FM: Total de imagens de logos encontradas: ${logoImgs.length}`);
  expect(logoImgs.length).toBeGreaterThanOrEqual(5);

  const screenshotPath = "C:\\Users\\Usuario\\.gemini\\antigravity\\brain\\5d86efca-20d5-4b60-b3a7-8755017a587b\\positiva_logos_verified.png";
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
  });
  console.log("Screenshot Positiva saved to:", screenshotPath);
});
