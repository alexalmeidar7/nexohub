import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config focused on responsive validation.
 * All tests target the local Vite dev server at http://localhost:8080.
 * The default project pins the viewport to 1366x768 (notebook / vMix / TV).
 */
export default defineConfig({
  testDir: "./tests/responsive",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080",
    headless: true,
    ignoreHTTPSErrors: true,
    viewport: { width: 1366, height: 768 },
  },
  projects: [
    {
      name: "chromium-1366x768",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } },
    },
  ],
});
