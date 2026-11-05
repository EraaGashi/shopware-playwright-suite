import { test, expect } from '../../src/fixtures';
import { isSortedAsc, isSortedDesc } from '../../src/utils/price';
import type { ListingPage } from '../../src/pages/ListingPage';
import { DEFAULT_PAGE_SIZE, DEFAULT_SEARCH_RESULT_WINDOW, pagesBeyondEnd, withPage } from '../../src/utils/paging';

test.describe('Product listing', () => {
  test.beforeEach(async ({ listing, cfg }) => {
    await listing.open(cfg.testData.listingCategoryPath);
  });

  test('shows product boxes with name, price and image', { tag: ['@smoke', '@mobile'] }, async ({ listing, cfg }) => {
    const s = cfg.selectors.listing;
    await expect(listing.productBoxes.first()).toBeVisible();
    expect(await listing.productBoxes.count()).toBeGreaterThan(0);
    const first = listing.productBoxes.first();
    await expect(first.locator(s.productName)).not.toBeEmpty();
    if (cfg.features.guestPrices !== false) await expect(first.locator(s.productPrice).first()).toContainText(/\d/);
    await expect(first.locator(s.productImage).first()).toBeVisible();
  });

  test('product box links to the detail page', { tag: '@smoke' }, async ({ listing, product }) => {
    const name = await listing.openProduct(0);
    // variant PDPs may append the selected option ("…, XL") to the listing name
    await expect(product.name).toContainText(name);
  });

  test('pagination navigates to the next page', async ({ page, listing, cfg }) => {
    test.skip(!(await listing.pagination.isVisible()), 'Category fits on one page — no pagination');
    const next = page.locator(cfg.selectors.listing.paginationNext).locator('a, label').first();
    const firstPage = await listing.productNames();
    await Promise.all([page.waitForResponse(/\/widgets\/cms/), next.click()]);
    await expect(page).toHaveURL(/[?&]p=\d/);
    await expect.poll(() => listing.productNames()).not.toEqual(firstPage);
  });
});

test.describe('Sorting', () => {
  test.beforeEach(async ({ listing, cfg }) => {
    await listing.open(cfg.testData.listingCategoryPath);
  });

  test('offers the expected sorting options', { tag: '@smoke' }, async ({ listing, cfg }) => {
    const options = await listing.sortingOptions();
    for (const key of cfg.testData.expectedSortings) expect(options).toContain(key);
  });

  test('sorts by price ascending', async ({ listing, cfg }) => {
    test.skip(cfg.features.guestPrices === false, 'Guests see no prices');
    await listing.sortBy('price-asc');
    const prices = await listing.productPrices();
    expect(prices.length).toBeGreaterThan(1);
    expect(isSortedAsc(prices), `prices not ascending: ${prices.join(', ')}`).toBe(true);
  });

  test('sorts by price descending', async ({ listing, cfg }) => {
    test.skip(cfg.features.guestPrices === false, 'Guests see no prices');
    await listing.sortBy('price-desc');
    const prices = await listing.productPrices();
    expect(isSortedDesc(prices), `prices not descending: ${prices.join(', ')}`).toBe(true);
  });

  test('pages beyond the real end of the listing do not cause a server error', async ({ page, listing, cfg }) => {
    // risk: old/crawled links past the last page, or past the search engine's result window → 500
    const path = cfg.testData.listingCategoryPath;
    const { lastPage, productsOnPage, pageSize = DEFAULT_PAGE_SIZE } = await listing.paginationInfo();
    expect(productsOnPage, 'category shows no products').toBeGreaterThan(0);
    const firstPage = await listing.productHrefs();

    await test.step(`last real page (p=${lastPage}) lists its own products`, async () => {
      const res = await page.goto(withPage(path, lastPage));
      expect(res?.status()).toBe(200);
      const count = await listing.productBoxes.count();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(pageSize);
      // proves `p` is honoured — out-of-range pages fall back to page 1, which would look the same
      if (lastPage > 1) expect(await listing.productHrefs(), 'last page shows the products of page 1').not.toEqual(firstPage);
    });

    for (const { p, label } of pagesBeyondEnd(lastPage, pageSize, cfg.testData.searchResultWindow ?? DEFAULT_SEARCH_RESULT_WINDOW)) {
      await test.step(label, async () => {
        const res = await page.goto(withPage(path, p));
        expect.soft(res?.status(), `${label} on ${path}`).toBeLessThan(500);
      });
    }
  });
});

test.describe('Filters', () => {
  test.beforeEach(async ({ listing, cfg }) => {
    await listing.open(cfg.testData.listingCategoryPath);
  });

  /** Tests built on the manufacturer filter skip in categories / shops without one. */
  async function skipWithoutManufacturerFilter(listing: ListingPage): Promise<void> {
    test.skip(!(await listing.filterOfType('manufacturer').count()), 'No manufacturer filter in this category');
  }

  test('expected filter types are available', { tag: '@smoke' }, async ({ listing, cfg }) => {
    await listing.ensureFilterPanelVisible();
    for (const type of cfg.testData.expectedFilterTypes) {
      await expect(listing.filterOfType(type).first(), `filter "${type}" missing`).toBeAttached();
    }
  });

  test('manufacturer filter narrows results and can be reset', async ({ page, listing }) => {
    await skipWithoutManufacturerFilter(listing);
    const before = await listing.productBoxes.count();
    const label = await listing.applyMultiSelectFilter(listing.filterOfType('manufacturer'));
    await expect(page).toHaveURL(/manufacturer=/);
    await expect(listing.activeFilters.first()).toContainText(label);
    expect(await listing.productBoxes.count()).toBeLessThanOrEqual(before);

    await listing.resetAllFilters();
    await expect(listing.activeFilters).toHaveCount(0);
  });

  test('price filter limits product prices', async ({ page, listing, cfg }) => {
    test.skip(cfg.features.guestPrices === false, 'price filter needs visible prices');
    const prices = await listing.productPrices();
    const max = Math.ceil(prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)]);
    await listing.applyPriceFilter(undefined, max);
    await expect(page).toHaveURL(/max-price=/);
    const filtered = await listing.productPrices();
    expect(filtered.every((p) => p <= max + 0.01), `prices above ${max}: ${filtered.join(', ')}`).toBe(true);
  });
});
