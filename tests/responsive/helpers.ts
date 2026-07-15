import { expect, Page } from "@playwright/test";

/**
 * Assert an element is inside the current viewport rectangle.
 * Fails with a clear message when the element overflows off-screen
 * (top/left/right/bottom) in a 1366x768 window.
 *
 * Tolerance defaults to 4px to account for sub-pixel anti-aliasing.
 */
export async function expectInViewport(
  page: Page,
  selector: string,
  label = selector,
  tolerance = 4
) {
  const el = page.locator(selector).first();
  await expect(el, `${label}: elemento não encontrado`).toBeVisible();
  const box = await el.boundingBox();
  const vp = page.viewportSize();
  if (!box || !vp) throw new Error(`${label}: sem boundingBox ou viewport`);

  const problems: string[] = [];
  if (box.x < -tolerance) problems.push(`corta à esquerda (x=${box.x.toFixed(1)})`);
  if (box.y < -tolerance) problems.push(`corta em cima (y=${box.y.toFixed(1)})`);
  if (box.x + box.width > vp.width + tolerance)
    problems.push(`corta à direita (x+w=${(box.x + box.width).toFixed(1)} > ${vp.width})`);
  if (box.y + box.height > vp.height + tolerance)
    problems.push(`corta em baixo (y+h=${(box.y + box.height).toFixed(1)} > ${vp.height})`);

  expect(
    problems,
    `❌ "${label}" fora da área visível em ${vp.width}x${vp.height}: ${problems.join(", ")}`
  ).toEqual([]);
}

/**
 * Assert that the document itself does not force horizontal scroll —
 * a very common source of "cortou" bugs at 1366x768.
 */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollW,
    `Página tem scroll horizontal (${overflow.scrollW} > ${overflow.clientW})`
  ).toBeLessThanOrEqual(overflow.clientW + 2);
}

/**
 * Navigate and wait for the app shell to be interactive.
 * Uses networkidle with a soft fallback so pages that keep long-poll
 * connections open still resolve.
 */
export async function goto(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForLoadState("networkidle", { timeout: 6_000 });
  } catch {
    /* long-poll é aceitável */
  }
}
