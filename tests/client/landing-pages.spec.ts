import { test, expect } from '../../src/client/fixtures';
import { loadConfig } from '../../src/config/loader';

/** Configure in projects/<shop>.ts → client.landingPages */
const pages = loadConfig().client?.landingPages ?? [];

test.describe('Client: landing pages', { tag: '@client' }, () => {
  test.skip(pages.length === 0, 'No client.landingPages configured');

  for (const p of pages) {
    test(`landing page "${p.name}" loads with header, content and footer`, async ({ page, cfg, header }) => {
      const res = await page.goto(p.path);
      expect(res?.status(), `${p.path} status`).toBe(200);
      await expect(header.logo).toBeVisible();
      await expect(page.locator(cfg.selectors.footer.root).first()).toBeVisible();
      await expect(page.locator('.cms-section').first()).toBeVisible();
      if (p.heading) await expect(page.locator('h1').first()).toContainText(p.heading, { ignoreCase: true });

      const boxes = page.locator(cfg.selectors.listing.productBox);
      if (p.minProducts) {
        await expect(boxes.first()).toBeVisible();
        expect(await boxes.count(), `product boxes on ${p.path}`).toBeGreaterThanOrEqual(p.minProducts);
      }
    });
  }
});
