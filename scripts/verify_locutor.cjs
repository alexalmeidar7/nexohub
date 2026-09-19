const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 }
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:8080/locutor...');
  await page.goto('http://localhost:8080/locutor', { waitUntil: 'networkidle', timeout: 30000 });

  // Give React and Open-Meteo 3 seconds to finish renders
  await page.waitForTimeout(3000);

  const artifactsDir = 'C:\\Users\\Usuario\\.gemini\\antigravity\\brain\\5d86efca-20d5-4b60-b3a7-8755017a587b';

  // 1. Overview screenshot
  const overviewPath = path.join(artifactsDir, 'locutor_overview.png');
  await page.screenshot({ path: overviewPath, fullPage: false });
  console.log('Saved overview screenshot:', overviewPath);

  // Extract page info safely
  const pageData = await page.evaluate(() => {
    const noArMatch = document.body.innerText.match(/NO AR[\s\S]{1,120}/i)?.[0] || '';
    const presenterImg = document.querySelector('.group\\/presenter img')?.getAttribute('src');
    const weatherMatch = document.body.innerText.match(/Goiânia[\s\S]{1,120}/i)?.[0] || '';
    const bannerImgs = Array.from(document.querySelectorAll('img[alt]')).map(img => ({ alt: img.alt, src: img.src }));
    const promoButtons = Array.from(document.querySelectorAll('.grid.grid-cols-4 > div')).map(b => b.textContent.trim());

    return {
      noArMatch,
      presenterImg,
      weatherMatch,
      bannerCount: bannerImgs.length,
      promoButtons,
    };
  });

  console.log('Page Evaluation Data:', JSON.stringify(pageData, null, 2));

  // 2. Click on program cover to test Citacoes modal
  const coverEl = await page.$('.group\\/cover');
  if (coverEl) {
    console.log('Clicking program cover...');
    await coverEl.click();
    await page.waitForTimeout(1500);
    const modalPath = path.join(artifactsDir, 'locutor_citacoes_modal.png');
    await page.screenshot({ path: modalPath });
    console.log('Saved citacoes modal screenshot:', modalPath);

    // Close modal by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  } else {
    console.log('Program cover element not found');
  }

  // 3. Click on first promo button to test Promo teleprompter modal
  const firstPromoBtn = await page.$('.grid.grid-cols-4 > div:first-child');
  if (firstPromoBtn) {
    console.log('Clicking first promo button...');
    await firstPromoBtn.click();
    await page.waitForTimeout(1500);
    const promoModalPath = path.join(artifactsDir, 'locutor_promo_modal.png');
    await page.screenshot({ path: promoModalPath });
    console.log('Saved promo modal screenshot:', promoModalPath);
  }

  await browser.close();
  console.log('Verification completed successfully!');
})();
