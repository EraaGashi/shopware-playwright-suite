import { test, expect } from '../../src/fixtures';
import type { ResolvedConfig } from '../../src/config/types';

/** Representative page types: CMS home, listing, product detail, cart. */
const keyPages = (cfg: ResolvedConfig) => [cfg.routes.home, cfg.testData.listingCategoryPath, cfg.testData.simpleProduct.path, cfg.routes.cart];

test.describe('Technical quality', () => {
  test('no duplicate element ids', async ({ page, cfg }) => {
    // risk: labels point to the wrong field, JS plugins bind to the wrong element (e.g. header rendered twice)
    for (const path of keyPages(cfg)) {
      await page.goto(path, { waitUntil: 'load' });
      const dupes = await page.evaluate(() => {
        const count: Record<string, number> = {};
        document.querySelectorAll('[id]').forEach((el) => {
          // Shopware inlines its SVG icons with fixed ids (icons-default-…) — core behaviour, ignored
          if (el.closest('svg') || /^icons-/.test(el.id)) return;
          count[el.id] = (count[el.id] ?? 0) + 1;
        });
        return Object.entries(count).filter(([, n]) => n > 1).map(([id, n]) => `#${id} ×${n}`);
      });
      expect.soft(dupes, `${path}: duplicate ids`).toEqual([]);
    }
  });

  test('HTTPS pages load no insecure resources', async ({ page, cfg }) => {
    // risk: http:// images/scripts are blocked by the browser (missing images, broken features, warnings)
    test.skip(!cfg.baseURL.startsWith('https://'), 'Shop is not served over HTTPS');
    for (const path of keyPages(cfg)) {
      const insecure: string[] = [];
      const onRequest = (r: { url(): string }) => { if (r.url().startsWith('http://')) insecure.push(r.url()); };
      page.on('request', onRequest);
      await page.goto(path, { waitUntil: 'load' });
      page.off('request', onRequest);
      expect.soft([...new Set(insecure)], `${path}: requests over plain http`).toEqual([]);
    }
  });
});
