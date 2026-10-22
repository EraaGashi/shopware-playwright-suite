import { test, expect } from '../../src/fixtures';

test.describe('Product search', () => {
  test('search via header returns matching products', { tag: ['@smoke', '@mobile'] }, async ({ page, cfg, header, listing }) => {
    const { searchTerm, searchMinResults } = cfg.testData;
    await page.goto(cfg.routes.home);
    await header.search(searchTerm);
    await expect(page.locator('body')).toHaveClass(/is-ctl-search/);
    await expect(page).toHaveURL(new RegExp(`search=${encodeURIComponent(searchTerm)}`));
    expect(await listing.productBoxes.count()).toBeGreaterThanOrEqual(searchMinResults);
    await expect(page.locator(cfg.selectors.search.headline)).toContainText(searchTerm);
  });

  test('results contain the search term', async ({ page, cfg, listing }) => {
    await page.goto(`${cfg.routes.search}?search=${encodeURIComponent(cfg.testData.searchTerm)}`);
    const names = await listing.productNames();
    const hits = names.filter((n) => n.toLowerCase().includes(cfg.testData.searchTerm.toLowerCase()));
    expect(hits.length, `names: ${names.join(' | ')}`).toBeGreaterThan(0);
  });

  test('search suggest shows products while typing', async ({ page, cfg, header }) => {
    await page.goto(cfg.routes.home);
    const suggest = await header.typeSearchSuggest(cfg.testData.searchTerm);
    await expect(suggest.locator(cfg.selectors.header.searchSuggestProduct).first()).toBeVisible();
  });

  test('search by product number finds the product (full and partial)', async ({ page, cfg, listing, product }) => {
    const p = cfg.testData.simpleProduct;
    // full number, then without the last 2 characters (e.g. variant suffix "SW10001.1" → "SW10001")
    for (const term of [p.productNumber, p.productNumber.slice(0, -2)]) {
      await test.step(`search "${term}"`, async () => {
        await page.goto(`${cfg.routes.search}?search=${encodeURIComponent(term)}`, { waitUntil: 'load' });
        // an exact hit may redirect straight to the product page
        if (/\bis-ctl-product\b/.test((await page.locator('body').getAttribute('class')) ?? '')) {
          await expect(product.name, `"${term}" opened another product`).toContainText(p.name, { ignoreCase: true });
        } else {
          await expect(listing.productBoxes.filter({ hasText: new RegExp(escapeRe(p.name), 'i') }).first(), `"${term}" did not find ${p.name}`).toBeVisible();
        }
      });
    }
  });

  test('search ignores upper/lower case, extra spaces and accents', async ({ page, cfg, listing }) => {
    const term = cfg.testData.searchTerm;
    const count = async (q: string) => {
      await page.goto(`${cfg.routes.search}?search=${encodeURIComponent(q)}`, { waitUntil: 'load' });
      return listing.productBoxes.count();
    };
    const expected = await count(term);
    expect(expected, `"${term}" finds nothing`).toBeGreaterThan(0);
    for (const variant of [term.toUpperCase(), term.toLowerCase(), `  ${term}  `, ...(cfg.testData.searchTermVariants ?? [])]) {
      expect.soft(await count(variant), `"${variant}" finds a different number of products than "${term}"`).toBe(expected);
    }
  });

  test('no-result search shows an info message', { tag: '@smoke' }, async ({ page, cfg, listing }) => {
    await page.goto(`${cfg.routes.search}?search=${encodeURIComponent(cfg.testData.searchNoResultTerm)}`);
    await expect(listing.productBoxes).toHaveCount(0);
    await expect(page.locator(cfg.selectors.search.emptyAlert).first()).toBeVisible();
  });

  test('empty, blank and very long search terms are handled', async ({ page, cfg }) => {
    // risk: missing/oversized input crashes the search (500) instead of a normal page.
    // What an empty term shows is shop behaviour (Shopware may list all products) → not asserted.
    for (const [label, term] of [['empty', ''], ['blank', '   '], ['1000 characters', 'a'.repeat(1000)]]) {
      const res = await page.goto(`${cfg.routes.search}?search=${encodeURIComponent(term)}`);
      expect(res?.status(), `${label} search term`).toBeLessThan(500);
      await expect(page.locator(cfg.selectors.header.logo).locator('visible=true').first(), `${label}: shop page rendered`).toBeVisible();
    }
  });

  test('sorting search results keeps the search term', async ({ page, cfg, listing }) => {
    // risk: changing the order replaces the result list with the whole catalogue
    const term = cfg.testData.searchTerm;
    await page.goto(`${cfg.routes.search}?search=${encodeURIComponent(term)}`, { waitUntil: 'load' });
    test.skip(!(await listing.sorting.isVisible()), 'No sorting on the search page');
    const before = await listing.productBoxes.count();
    await listing.sortBy('name-desc');
    await expect(page).toHaveURL(new RegExp(`search=${encodeURIComponent(term)}`));
    await expect(page.locator(cfg.selectors.search.headline)).toContainText(term, { ignoreCase: true });
    expect(await listing.productBoxes.count(), 'number of results changed by sorting').toBe(before);
  });

  test('very deep page numbers in search do not cause a server error', async ({ page, cfg }) => {
    // risk: same result-window limit as on categories, reachable with any search term
    const res = await page.goto(`${cfg.routes.search}?search=${encodeURIComponent(cfg.testData.searchTerm)}&p=99999`);
    expect(res?.status()).toBeLessThan(500);
  });

  test('handles special characters safely', async ({ page, cfg }) => {
    const res = await page.goto(`${cfg.routes.search}?search=${encodeURIComponent('<script>alert(1)</script> "ä&%')}`);
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator('script:has-text("alert(1)")')).toHaveCount(0);
  });
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
