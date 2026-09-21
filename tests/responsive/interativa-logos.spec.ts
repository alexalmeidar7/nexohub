import { test, expect } from "@playwright/test";

test.use({ channel: "chrome" });

test("Interativa FM - logos de patrocinadores carregadas e visíveis", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1. Login as Interativa FM
  console.log("Navigating to login...");
  await page.goto("http://localhost:8080/?signed_out=1");
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });

  console.log("Entering credentials...");
  await page.fill('input[type="email"]', "interativafmgynaovivo@gmail.com");
  await page.fill('input[type="password"]', "interativa2026");
  await page.click('button:has-text("Entrar")');

  // Wait for login redirection
  console.log("Waiting for /home...");
  await page.waitForURL("**/home**", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Clear any old cached logos in localStorage to ensure clean load
  await page.evaluate(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith("nexohub_logos_")) {
        localStorage.removeItem(key);
      }
    }
  });

  // 2. Open logos module via query param ?page=logos
  console.log("Navigating to /home?page=logos...");
  await page.goto("http://localhost:8080/home?page=logos");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(4000);

  // 3. Verify text content of body for programs
  const bodyText = await page.textContent("body");
  const progsExpected = [
    "FALANDO SÉRIO",
    "HORA DO CAFÉZIN",
    "PAPO CABEÇA",
    "CLASSIC HITS",
    "TOP 10",
    "SUPER PLAY",
    "INBOX"
  ];

  for (const prog of progsExpected) {
    const found = bodyText?.toUpperCase().includes(prog);
    console.log(`Program '${prog}' visible:`, found);
    expect(found).toBe(true);
  }

  // 4. Scroll to HORA DO CAFÉZIN (which is already defaultOpen since it has 7 logos)
  const cafezin = page.locator('text=HORA DO CAFÉZIN').first();
  if (await cafezin.count()) {
    await cafezin.scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(600);

  // Find all sponsor logo images
  const logoImgs = await page.$$eval('.w-28 img', (imgs) => imgs.map((i) => ({
    alt: i.alt,
    src: i.src,
    isDataUrl: i.src.startsWith("data:image/"),
    complete: i.complete,
    naturalWidth: i.naturalWidth,
    naturalHeight: i.naturalHeight
  })));

  console.log(`[TEST RESULT] Total de logos de patrocinadores renderizadas: ${logoImgs.length}`);
  console.log("Sample logos:", logoImgs.slice(0, 10));
  expect(logoImgs.length).toBeGreaterThanOrEqual(10);

  // CRITICAL CHECK: ZERO synthetic data URLs
  const syntheticSvgs = logoImgs.filter(l => l.src.startsWith("data:image/svg+xml"));
  console.log("Synthetic SVG count (must be 0):", syntheticSvgs.length);
  expect(syntheticSvgs.length).toBe(0);

  // Check that real images loaded (naturalWidth > 0)
  const brokenLogos = logoImgs.filter(l => l.naturalWidth === 0);
  console.log("Broken images count:", brokenLogos.length);
  expect(brokenLogos.length).toBe(0);

  // Move mouse over window and scroll down
  await page.mouse.move(600, 400);
  await page.mouse.wheel(0, 850);
  await page.waitForTimeout(800);

  // 5. Take screenshot artifact
  const screenshotPath = "C:\\Users\\Usuario\\.gemini\\antigravity\\brain\\5d86efca-20d5-4b60-b3a7-8755017a587b\\authentic_sponsor_logos_verified.png";
  await page.screenshot({
    path: screenshotPath,
    fullPage: false,
  });
  console.log("Screenshot successfully saved to:", screenshotPath);
});
