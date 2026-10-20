import { test, expect } from '../../src/client/fixtures';
import { loadConfig } from '../../src/config/loader';

/** Configure in projects/<shop>.ts → client.searchCases */
const cases = loadConfig().client?.searchCases ?? [];

test.describe('Client: search cases', { tag: '@client' }, () => {
  test.skip(cases.length === 0, 'No client.searchCases configured');

  for (const c of cases) {
    const min = c.minResults ?? 1;
    const title = min === 0 ? `search "${c.term}" finds nothing` : `search "${c.term}" finds at least ${min} product(s)${c.expectProduct ? ` incl. "${c.expectProduct}"` : ''}`;

    test(title, async ({ page, cfg, listing, product }) => {
      await page.goto(`${cfg.routes.search}?search=${encodeURIComponent(c.term)}`, { waitUntil: 'load' });
      // an exact hit (e.g. a product number) may redirect straight to the product page
      if (/\bis-ctl-product\b/.test((await page.locator('body').getAttribute('class')) ?? '')) {
        expect(min, `"${c.term}" opened a product page`).toBeLessThanOrEqual(1);
        if (c.expectProduct) await expect(product.name).toContainText(c.expectProduct, { ignoreCase: true });
        return;
      }
      if (min === 0) {
        await expect(listing.productBoxes).toHaveCount(0);
        return;
      }
      await expect(listing.productBoxes.first()).toBeVisible();
      expect(await listing.productBoxes.count(), `results for "${c.term}"`).toBeGreaterThanOrEqual(min);
      if (c.expectProduct) {
        const names = await listing.productNames();
        expect(names.some((n) => n.toLowerCase().includes(c.expectProduct!.toLowerCase())), `results: ${names.join(' | ')}`).toBe(true);
      }
    });
  }
});
