import { test, expect } from '../../src/fixtures';
import { DEFAULT_PAGE_SIZE, DEFAULT_SEARCH_RESULT_WINDOW, pagesBeyondEnd, withPage } from '../../src/utils/paging';

test.describe('Product search', () => {
  test('search via header returns matching products', { tag: '@smoke' }, async ({ page, cfg, header, listing }) => {
    const { searchTerm, searchMinResults } = cfg.testData;
    await page.goto(cfg.routes.home);
    await header.search(searchTerm);
    await expect(page.locator('body')).toHaveClass(/is-ctl-search/);
    await expect(page).toHaveURL(new RegExp(`search=${encodeURIComponent(searchTerm)}`));
    expect(await listing.productBoxes.count()).toBeGreaterThanOrEqual(searchMinResults);
    await expect(page.locator(cfg.selectors.search.headline)).toContainText(searchTerm);
  });

  test('search suggest shows products while typing', async ({ page, cfg, header }) => {
    await page.goto(cfg.routes.home);
    const suggest = await header.typeSearchSuggest(cfg.testData.searchTerm);
    await expect(suggest.locator(cfg.selectors.header.searchSuggestProduct).first()).toBeVisible();
  });

  test('no-result search shows an info message', { tag: '@smoke' }, async ({ page, cfg, listing }) => {
    await page.goto(`${cfg.routes.search}?search=${encodeURIComponent(cfg.testData.searchNoResultTerm)}`);
    await expect(listing.productBoxes).toHaveCount(0);
    await expect(page.locator(cfg.selectors.search.emptyAlert).first()).toBeVisible();
  });

  test('pages beyond the real end of the search results do not cause a server error', async ({ page, cfg, listing }) => {
    // risk: same limits as on categories, reachable with any search term
    const path = `${cfg.routes.search}?search=${encodeURIComponent(cfg.testData.searchTerm)}`;
    await page.goto(path);
    const { lastPage, productsOnPage, pageSize = DEFAULT_PAGE_SIZE } = await listing.paginationInfo();
    expect(productsOnPage, `no results for "${cfg.testData.searchTerm}"`).toBeGreaterThan(0);
    for (const { p, label } of pagesBeyondEnd(lastPage, pageSize, cfg.testData.searchResultWindow ?? DEFAULT_SEARCH_RESULT_WINDOW)) {
      await test.step(label, async () => {
        const res = await page.goto(withPage(path, p));
        expect.soft(res?.status(), `${label} on ${path}`).toBeLessThan(500);
      });
    }
  });

  test('handles special characters safely', async ({ page, cfg }) => {
    const res = await page.goto(`${cfg.routes.search}?search=${encodeURIComponent('<script>alert(1)</script> "ä&%')}`);
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator('script:has-text("alert(1)")')).toHaveCount(0);
  });
});

