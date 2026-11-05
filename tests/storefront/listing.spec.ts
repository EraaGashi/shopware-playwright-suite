import { test, expect } from '../../src/fixtures';
import { routeBypassHeader } from '../../src/utils/http';
import { isSortedAsc, isSortedDesc, parsePrice } from '../../src/utils/price';
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

test.describe('Listing consistency', () => {
  test.beforeEach(async ({ listing, cfg }) => {
    await listing.open(cfg.testData.listingCategoryPath);
  });

  test('paging never repeats a product on the next page', async ({ page, listing, cfg }) => {
    // risk: unstable sorting (equal prices / names) → products shown twice, others never shown
    for (const order of ['', 'price-asc']) {
      await test.step(order || 'default sorting', async () => {
        if (order) await listing.sortBy(order);
        test.skip(!(await listing.pagination.isVisible()), 'Category fits on one page — no pagination');
        const page1 = await listing.productHrefs();
        expect(new Set(page1).size, 'same product twice on page 1').toBe(page1.length);
        const next = page.locator(cfg.selectors.listing.paginationNext).locator('a, label').first();
        await Promise.all([page.waitForResponse(/\/widgets\/cms/), next.click()]);
        await expect.poll(async () => (await listing.productHrefs())[0]).not.toBe(page1[0]);
        const page2 = await listing.productHrefs();
        expect(page2.filter((h) => page1.includes(h)), 'products repeated from page 1').toEqual([]);
        await page.goto(cfg.testData.listingCategoryPath);
      });
    }
  });

  test('all listing prices use one format', async ({ listing, cfg }) => {
    // risk: mixed price rendering ("98", "$98.00", "98.00 $") from different templates / plugins
    test.skip(cfg.features.guestPrices === false, 'Guests see no prices');
    const texts = (await listing.productPriceTexts()).filter((t) => /\d/.test(t));
    expect(texts.length).toBeGreaterThan(0);
    const symbol = cfg.currencySymbol;
    const bad = texts.filter((t) => !t.includes(symbol) || !/\d[.,]\d{2}(?!\d)/.test(t));
    expect(bad, `prices without "${symbol}" or without 2 decimals`).toEqual([]);
    // symbol consistently before or after the amount
    const before = texts.filter((t) => t.indexOf(symbol) < t.search(/\d/)).length;
    expect([0, texts.length], `currency symbol position mixed: ${texts.join(' | ')}`).toContain(before);
  });

  test('listing price matches the product page price', async ({ page, listing, product, cfg }) => {
    // risk: listing (cached / price rules) shows another price than the product the customer buys
    test.skip(cfg.features.guestPrices === false, 'Guests see no prices');
    // first page may only hold free / price-on-request products → bring priced ones to the front
    if (!(await listing.productPrices()).some((x) => x > 0)) await listing.sortBy('price-desc');
    const hrefs = await listing.productHrefs();
    const names = await listing.productNames();
    const texts = await listing.productBoxes.evaluateAll(
      (els, sel) => els.map((el) => (el.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim()),
      cfg.selectors.listing.productPrice,
    );
    const candidates: Array<{ href: string; price: number; name: string }> = [];
    texts.forEach((text, i) => {
      // "from 10 €", ranges, unit / strike-through prices → no single comparable price
      if (candidates.length === 3 || (text.match(/\d[\d.,]*/g) ?? []).length !== 1) return;
      if (/[a-z]{2,}/i.test(text.replace(cfg.currencySymbol, ''))) return;
      const price = parsePrice(text);
      if (price > 0 && hrefs[i]) candidates.push({ href: hrefs[i], price, name: names[i] });
    });
    test.skip(candidates.length === 0, 'No box with a single comparable price');
    for (const c of candidates) {
      await page.goto(c.href);
      await expect(product.name).toBeVisible();
      // variant parents may list another variant's price → only compare the product that was linked
      if (await product.configuratorGroups.count()) {
        const linkedPath = new URL(c.href, cfg.baseURL).pathname;
        if (new URL(page.url()).pathname !== linkedPath) continue;
      }
      expect.soft(await product.priceValue(), `${c.name}: listing ${c.price} vs product page`).toBeCloseTo(c.price, 2);
    }
  });

  test('canonical ignores sorting and keeps a valid page URL', async ({ page, cfg }) => {
    // risk: every sort order / page indexed as its own page, or malformed canonical URLs ignored by search engines
    // expected (Shopware's own format): page 1 → the category URL without parameters, page n > 1 → "<category URL>?p=n"
    const path = cfg.testData.listingCategoryPath;
    const canonicalOf = async (query: string) => {
      await page.goto(`${path}${query}`);
      const links = page.locator('link[rel="canonical"]');
      expect.soft(await links.count(), `${query || 'page 1'}: number of canonical tags`).toBe(1);
      return (await links.first().getAttribute('href')) ?? '';
    };
    const base = await canonicalOf('');
    expect(base, 'page 1 canonical carries parameters').not.toContain('?');

    const sorted = await canonicalOf('?order=price-asc');
    expect.soft(sorted, 'canonical of a sorted listing contains the sort parameter').not.toMatch(/[?&]order=/);
    expect.soft(sorted, '?order=price-asc').toBe(base);

    const firstPage = await canonicalOf('?p=1');
    expect.soft(firstPage, '?p=1 must point to the category URL (page 1 indexed twice otherwise)').toBe(base);

    // page 2 only exists when the category has more than one page
    await page.goto(path);
    const hasPage2 = await page.locator(cfg.selectors.listing.pagination).first().isVisible();
    test.info().annotations.push({ type: 'canonical', description: hasPage2 ? 'checked pages 1 and 2' : 'category has one page — page 2 not checked' });
    if (!hasPage2) return;
    for (const query of ['?p=2', '?order=price-asc&p=2']) {
      const paged = await canonicalOf(query);
      expect.soft(paged.split('?').length, `${query}: malformed canonical "${paged}"`).toBeLessThanOrEqual(2);
      expect.soft((paged.match(/[?&]p=/g) ?? []).length, `${query}: page parameter repeated in "${paged}"`).toBeLessThanOrEqual(1);
      expect.soft(paged, query).toBe(`${base}?p=2`);
    }
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

  test('price sorting continues on the next page', async ({ page, listing, cfg }) => {
    // risk: each page is sorted on its own (or page 2 forgets the order) → cheap products hidden on later pages
    await listing.sortBy('price-asc');
    test.skip(!(await listing.pagination.isVisible()), 'Category fits on one page — no pagination');
    const page1 = await listing.productPrices();
    const next = page.locator(cfg.selectors.listing.paginationNext).locator('a, label').first();
    await Promise.all([page.waitForResponse(/\/widgets\/cms/), next.click()]);
    await expect(page).toHaveURL(/[?&]p=2/);
    await expect(page).toHaveURL(/order=price-asc/);
    await expect.poll(async () => (await listing.productPrices())[0]).not.toBeUndefined();
    const page2 = await listing.productPrices();
    expect(isSortedAsc(page2), `page 2 not ascending: ${page2.join(', ')}`).toBe(true);
    expect(Math.min(...page2), 'page 2 starts below the last price of page 1').toBeGreaterThanOrEqual(Math.max(...page1) - 0.01);
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

  test('sorts by name A-Z and Z-A', async ({ listing, page, cfg }) => {
    // only the listing's own products (sliders elsewhere on the page are not sorted)
    const own = page.locator(cfg.selectors.listing.root).first().locator(cfg.selectors.listing.productBox);
    test.skip((await own.count()) < 2, 'Category lists fewer than 2 products — nothing to sort');
    await listing.sortBy('name-asc');
    const asc = await listing.productNames();
    await listing.sortBy('name-desc');
    const desc = await listing.productNames();
    expect(asc[0]).not.toEqual(desc[0]);
    const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
    expect(collator.compare(asc[0], asc[asc.length - 1])).toBeLessThanOrEqual(0);
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

  test('manufacturer filter narrows results and can be reset', { tag: '@mobile' }, async ({ page, listing }) => {
    await skipWithoutManufacturerFilter(listing);
    const before = await listing.productBoxes.count();
    const label = await listing.applyMultiSelectFilter(listing.filterOfType('manufacturer'));
    await expect(page).toHaveURL(/manufacturer=/);
    await expect(listing.activeFilters.first()).toContainText(label);
    expect(await listing.productBoxes.count()).toBeLessThanOrEqual(before);

    await listing.resetAllFilters();
    await expect(listing.activeFilters).toHaveCount(0);
  });

  test('applying a filter keeps the chosen sorting', async ({ page, listing, cfg }) => {
    await skipWithoutManufacturerFilter(listing);
    // risk: filter request drops the order parameter → listing silently falls back to the default sorting
    await listing.sortBy('price-desc');
    await listing.applyMultiSelectFilter(listing.filterOfType('manufacturer'));
    await expect(page).toHaveURL(/manufacturer=/);
    await expect(page).toHaveURL(/order=price-desc/);
    await expect(listing.sorting).toHaveValue('price-desc');
    if (cfg.features.guestPrices !== false) {
      const prices = await listing.productPrices();
      expect(isSortedDesc(prices), `filtered prices not descending: ${prices.join(', ')}`).toBe(true);
    }
  });

  test('browser back removes the filter again', async ({ page, listing }) => {
    await skipWithoutManufacturerFilter(listing);
    // risk: history navigation shows the filtered products under an unfiltered URL (or the reverse)
    const before = await listing.productNames();
    await listing.applyMultiSelectFilter(listing.filterOfType('manufacturer'));
    await expect(page).toHaveURL(/manufacturer=/);
    await page.goBack();
    await expect(page).not.toHaveURL(/manufacturer=/);
    await expect(listing.activeFilters).toHaveCount(0);
    await expect.poll(() => listing.productNames(), { message: 'listing after back differs from the unfiltered one' }).toEqual(before);
  });

  test('filter is kept when paging', async ({ page, listing, cfg }) => {
    // risk: page 2 drops the filter → customer sees products outside the filter
    test.skip(cfg.features.guestPrices === false, 'price filter needs visible prices');
    await listing.applyPriceFilter(1);
    await expect(page).toHaveURL(/min-price=1/);
    test.skip(!(await listing.pagination.isVisible()), 'Filtered result fits on one page');
    const next = page.locator(cfg.selectors.listing.paginationNext).locator('a, label').first();
    await Promise.all([page.waitForResponse(/\/widgets\/cms/), next.click()]);
    await expect(page).toHaveURL(/[?&]p=2/);
    await expect(page).toHaveURL(/min-price=1/);
    await expect(listing.activeFilters.first(), 'active filter chip lost on page 2').toBeAttached();
    const prices = await listing.productPrices();
    expect(prices.length).toBeGreaterThan(0);
    expect(prices.filter((x) => x < 1), 'products below the minimum price on page 2').toEqual([]);
  });

  test('min and max price filter apply together', async ({ page, listing, cfg }) => {
    // risk: only one bound is applied (e.g. max wins, min ignored)
    test.skip(cfg.features.guestPrices === false, 'price filter needs visible prices');
    if ((await listing.productPrices()).filter((x) => x > 0).length < 4) await listing.sortBy('price-desc');
    const prices = (await listing.productPrices()).filter((x) => x > 0).sort((a, b) => a - b);
    test.skip(prices.length < 4, 'Not enough priced products for a price range');
    const min = Math.floor(prices[Math.floor(prices.length / 4)]);
    const max = Math.ceil(prices[Math.floor((prices.length * 3) / 4)]);
    test.skip(min >= max, 'Prices too close together for a range');
    await listing.applyPriceFilter(min, max);
    await expect(page).toHaveURL(/min-price=/);
    await expect(page).toHaveURL(/max-price=/);
    const filtered = await listing.productPrices();
    expect(filtered.length, 'range filter removed every product').toBeGreaterThan(0);
    expect(filtered.filter((x) => x < min - 0.01 || x > max + 0.01), `prices outside ${min}–${max}`).toEqual([]);
  });

  test('minimum price above maximum price is handled', async ({ page, cfg }) => {
    // risk: contradictory URL parameters (bookmarks, manual edits) crash the listing
    const res = await page.goto(`${cfg.testData.listingCategoryPath}?min-price=1000&max-price=10`);
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator(cfg.selectors.header.logo).locator('visible=true').first()).toBeVisible();
  });

  test('filter and sorting are restored after a reload', async ({ page, listing }) => {
    await skipWithoutManufacturerFilter(listing);
    // risk: state lives only in JS — reload (or a shared link) shows a different product list
    await listing.sortBy('price-desc');
    await listing.applyMultiSelectFilter(listing.filterOfType('manufacturer'));
    const names = await listing.productNames();
    await page.reload();
    await expect(page).toHaveURL(/manufacturer=/);
    await expect(listing.sorting).toHaveValue('price-desc');
    await expect(listing.activeFilters.first()).toBeAttached();
    expect(await listing.productNames(), 'products differ after reload').toEqual(names);
  });

  test('a filtered URL opened directly shows the same products as filtering in the UI', async ({ page, listing, browser, cfg }) => {
    await skipWithoutManufacturerFilter(listing);
    // risk: server-side rendering and the AJAX filter use different criteria
    await listing.applyMultiSelectFilter(listing.filterOfType('manufacturer'));
    const url = page.url();
    const names = await listing.productNames();
    const ctx = await browser.newContext({ baseURL: cfg.baseURL, httpCredentials: cfg.env.httpCredentials, storageState: await page.context().storageState() });
    await routeBypassHeader(ctx, cfg);
    try {
      const fresh = await ctx.newPage();
      await fresh.goto(url);
      const direct = (await fresh.locator(cfg.selectors.listing.productBox).locator(cfg.selectors.listing.productName).allInnerTexts()).map((t) => t.trim());
      expect(direct, 'direct URL shows other products than the UI filter').toEqual(names);
    } finally {
      await ctx.close();
    }
  });

  test('removing the filter chip restores the unfiltered listing', async ({ page, listing }) => {
    await skipWithoutManufacturerFilter(listing);
    // risk: removing a filter keeps stale results or leaves the parameter in the URL
    const before = await listing.productNames();
    await listing.applyMultiSelectFilter(listing.filterOfType('manufacturer'));
    await listing.removeActiveFilter(0);
    await expect(page).not.toHaveURL(/manufacturer=/);
    await expect(listing.activeFilters.locator('visible=true')).toHaveCount(0);
    expect(await listing.productNames(), 'listing after removing the filter differs from the original').toEqual(before);
  });

  test('price filter bounds are inclusive', async ({ page, listing, cfg }) => {
    // risk: off-by-one / rounding — a product priced exactly at the bound disappears
    test.skip(cfg.features.guestPrices === false, 'price filter needs visible prices');
    if (!(await listing.productPrices()).some((x) => x > 0)) await listing.sortBy('price-desc');
    const prices = (await listing.productPrices()).filter((x) => x > 0);
    test.skip(prices.length === 0, 'No priced product on the first page');
    // a decimal price (e.g. 99.99) is the sharper check: rounding bugs drop exactly these products
    const target = prices[0];
    await listing.applyPriceFilter(target, target);
    await expect(page).toHaveURL(/min-price=/);
    const filtered = await listing.productPrices();
    expect(filtered.length, `no product left at exactly ${target}`).toBeGreaterThan(0);
    expect(filtered.filter((x) => Math.abs(x - target) > 0.01), `prices other than ${target}`).toEqual([]);
  });

  test('property filter narrows results', async ({ page, listing }) => {
    await listing.applyMultiSelectFilter(listing.filterOfType('properties'));
    await expect(page).toHaveURL(/properties=/);
    await expect(listing.activeFilters).toHaveCount(1);
    await expect(listing.productBoxes.first()).toBeVisible();
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
