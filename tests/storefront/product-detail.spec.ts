import { test, expect, skipUnless } from '../../src/fixtures';
import { ProductPage } from '../../src/pages/ProductPage';

test.describe('Product detail page', () => {
  test('shows core product information', { tag: ['@smoke', '@mobile'] }, async ({ product, cfg }) => {
    const p = cfg.testData.simpleProduct;
    await product.open(p);
    const s = cfg.selectors.product;
    await expect(product.name).toHaveText(p.name);
    await expect(product.productNumber).toContainText(p.productNumber);
    await expect(product.buyButton).toBeEnabled();
    await expect(product.page.locator(s.gallery).first()).toBeVisible();
    // B2B shops (guestPrices=false) show price, tax and delivery info only after login
    if (cfg.features.guestPrices !== false) {
      expect(await product.priceValue()).toBeGreaterThan(0);
      await expect(product.page.locator(s.tax).first()).toBeVisible();
      await expect(product.page.locator(s.delivery).first()).toBeVisible();
    }
    await expect(product.page.locator(s.description).first()).toBeAttached();
  });

  test('delivery promise does not show dates in the past', async ({ product, cfg }) => {
    await product.open(cfg.testData.simpleProduct);
    const delivery = product.page.locator(cfg.selectors.product.delivery).first();
    test.skip(!(await delivery.count()), 'No delivery information on the product page');
    const text = (await delivery.innerText()).replace(/\s+/g, ' ');
    const dates = parseDates(text, cfg.locale);
    test.skip(dates.length === 0, `Delivery text has no concrete dates: "${text}"`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const past = dates.filter((d) => d < today).map(ymd);
    expect(past, `delivery promise "${text}" shows dates before today (${ymd(today)})`).toEqual([]);
  });

  test('has exactly one main heading and a title with the product name', async ({ product, cfg, page }) => {
    const p = cfg.testData.simpleProduct;
    await product.open(p);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page).toHaveTitle(new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  });

  test('has a meta description', async ({ product, cfg, page }) => {
    await product.open(cfg.testData.simpleProduct);
    const description = (await page.locator('meta[name="description"]').getAttribute('content').catch(() => null)) ?? '';
    expect(description.trim().length, 'meta description is missing or empty').toBeGreaterThan(20);
  });

  test('gallery images have alt texts', async ({ product, cfg, page }) => {
    await product.open(cfg.testData.simpleProduct);
    // main images only — thumbnails and the hidden zoom-modal copies repeat the same pictures
    const imgs = page.locator(cfg.selectors.product.gallery).locator('img:not(.gallery-slider-thumbnails-image):not(.modal img)');
    test.skip((await imgs.count()) === 0, 'No gallery images');
    const missing = await imgs.evaluateAll((els) =>
      els.filter((i) => !(i as HTMLImageElement).alt?.trim()).map((i) => (i as HTMLImageElement).currentSrc || (i as HTMLImageElement).src),
    );
    expect(missing, `${missing.length} gallery image(s) without alt text`).toEqual([]);
  });

  test('B2B: guests see a login prompt instead of prices', async ({ product, listing, cfg, page }) => {
    test.skip(cfg.features.guestPrices !== false, 'Shop shows prices to guests');
    await product.open(cfg.testData.simpleProduct);
    const prompt = page.locator(cfg.selectors.product.guestPricePrompt).locator('visible=true').first();
    await expect(prompt).toBeVisible();
    await expect(prompt.locator('a[href*="login"], a[href*="account"]').first()).toBeAttached();
    await expect(page.locator(cfg.selectors.product.price).locator('visible=true')).toHaveCount(0);

    await listing.open(cfg.testData.listingCategoryPath);
    const box = listing.productBoxes.first();
    await expect(box.locator(cfg.selectors.listing.guestPricePrompt).first()).toBeAttached();
    await expect(listing.productBoxes.filter({ hasText: /\d[.,]\d{2}\s*€|€\s*\d/ })).toHaveCount(0);
  });

  test('has product structured data / canonical link', async ({ product, cfg, page }) => {
    await product.open(cfg.testData.simpleProduct);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('[itemtype*="schema.org/Product"], script[type="application/ld+json"]').first()).toBeAttached();
  });

  test('variant switch updates product number and URL', { tag: '@smoke' }, async ({ product, cfg, page }) => {
    const v = cfg.testData.variantProduct;
    await product.open(v);
    await expect(product.configuratorGroups).toHaveCount(v.optionGroups.length);
    const urlBefore = page.url();
    const { before, after } = await product.switchVariant(v.optionGroups.length - 1);
    expect(after).not.toEqual(before);
    await expect(page).not.toHaveURL(urlBefore);
    // SEO URLs end in the product number; canonical /detail/{id} URLs (no SEO URL) don't
    if (urlBefore.includes(before)) await expect(page).toHaveURL(new RegExp(after.replace(/[.]/g, '\\.')));
  });

  test('switching one variant option keeps the other options', async ({ product, cfg }) => {
    // risk: selecting e.g. a size resets the chosen colour → customer buys a variant they did not pick
    await product.open(cfg.testData.variantProduct);
    const groups = await product.configuratorGroups.count();
    test.skip(groups < 2, 'Variant product has only one option group');
    const before = await product.selectedOptions();
    const changed = groups - 1;
    await product.switchVariant(changed);
    const after = await product.selectedOptions();
    expect(after[changed], 'switched option did not change').not.toBe(before[changed]);
    for (let i = 0; i < groups; i++) {
      if (i !== changed) expect(after[i], `option group ${i + 1} changed although only group ${changed + 1} was switched`).toBe(before[i]);
    }
  });

  test('structured data matches the visible product', async ({ product, cfg }) => {
    // risk: search engines / price comparison show another name, price or currency than the shop
    const p = cfg.testData.simpleProduct;
    await product.open(p);
    const data = await product.structuredData();
    test.skip(data.source === 'none', 'No Product structured data (JSON-LD or microdata) on the page');
    const name = (await product.name.innerText()).trim();
    expect.soft(data.name ?? '', `structured name (${data.source}) vs <h1> "${name}"`).toContain(name);
    if (cfg.features.guestPrices !== false) {
      expect.soft(data.price, `structured price (${data.source}) vs visible price`).toBeCloseTo(await product.priceValue(), 2);
      const iso = ({ '€': 'EUR', $: 'USD', '£': 'GBP', 'CHF': 'CHF', 'zł': 'PLN', 'kr': 'SEK' } as Record<string, string>)[cfg.currencySymbol];
      if (iso) expect.soft(data.currency, `structured currency vs shop currency ${cfg.currencySymbol}`).toBe(iso);
    }
    expect.soft(data.availability ?? '', 'availability missing or not a schema.org value').toMatch(/schema\.org\/(InStock|OutOfStock|PreOrder|LimitedAvailability|BackOrder|Discontinued|InStoreOnly|OnlineOnly|SoldOut)/);
  });

  test('canonical, og:url and structured data URL agree', async ({ page, product, cfg }) => {
    // risk: shares / search results point to another product, host or protocol than the page itself
    await product.open(cfg.testData.simpleProduct);
    const canonical = (await page.locator('link[rel="canonical"]').first().getAttribute('href')) ?? '';
    expect(canonical, 'no canonical link').not.toBe('');
    const c = new URL(canonical);
    const here = new URL(page.url());
    expect.soft(`${c.protocol}//${c.host}`, 'canonical host/protocol differs from the shop').toBe(new URL(cfg.baseURL).origin);
    expect.soft(c.pathname, 'canonical points to another page').toBe(here.pathname);
    const og = await page.locator('meta[property="og:url"]').first().getAttribute('content').catch(() => null);
    if (og) expect.soft(new URL(og).href, 'og:url differs from canonical').toBe(c.href);
    const data = await product.structuredData();
    if (data.url) expect.soft(new URL(data.url).href, `structured data URL (${data.source}) differs from canonical`).toBe(c.href);
  });

  test('a variant URL keeps its selected options after reload and when opened directly', async ({ page, product, browser, cfg }) => {
    // risk: deep links / reloads open the default variant instead of the chosen one
    await product.open(cfg.testData.variantProduct);
    test.skip((await product.configuratorGroups.count()) === 0, 'Variant product has no configurator');
    await product.switchVariant((await product.configuratorGroups.count()) - 1);
    const chosen = await product.selectedOptions();
    const url = page.url();
    await page.reload();
    expect(await product.selectedOptions(), 'options changed after reload').toEqual(chosen);
    const ctx = await browser.newContext({ baseURL: cfg.baseURL, httpCredentials: cfg.env.httpCredentials, storageState: await page.context().storageState() });
    try {
      const fresh = await ctx.newPage();
      const freshProduct = new ProductPage(fresh, cfg);
      await freshProduct.open(url);
      expect(await freshProduct.selectedOptions(), 'variant URL opened directly selects other options').toEqual(chosen);
    } finally {
      await ctx.close();
    }
  });

  test('breadcrumb links back to the category', async ({ product, cfg, page }) => {
    await product.open(cfg.testData.variantProduct);
    const crumb = page.locator(`${cfg.selectors.page.breadcrumb} a`).first();
    await expect(crumb).toBeVisible();
    await Promise.all([page.waitForLoadState('domcontentloaded'), crumb.click()]);
    await expect(page.locator('body')).toHaveClass(/is-ctl-navigation/);
  });

  test('reviews tab/teaser is present', async ({ product, cfg }) => {
    skipUnless(cfg.features.productReviews, 'productReviews');
    test.skip(!!cfg.testData.reviewWidget, 'Reviews come from a third-party widget (testData.reviewWidget)');
    await product.open(cfg.testData.simpleProduct);
    await expect(product.page.locator(cfg.selectors.product.reviewTeaser).first()).toBeAttached();
  });

  test('reviews tab with Bazaarvoice widget is present', async ({ product, cfg }) => {
    skipUnless(cfg.features.productReviews, 'productReviews');
    const widget = cfg.testData.reviewWidget;
    test.skip(!widget, 'No third-party review widget configured (testData.reviewWidget)');
    await product.open(cfg.testData.simpleProduct);
    const tab = product.page.locator(widget!.tab).first();
    await expect(tab).toBeVisible();
    await expect(tab).toContainText(widget!.tabText);
    await tab.click();
    const root = product.page.locator(widget!.root);
    await expect(root).toBeAttached();
    // rendered by Bazaarvoice's external script — slower than the shop's own markup
    await expect(root.getByRole('button', { name: widget!.writeButton }).first()).toBeVisible({ timeout: 30_000 });
  });

  test('unknown product URL returns 404', async ({ page, cfg }) => {
    const res = await page.goto('/this-product-does-not-exist-e2e/XX-000');
    expect(res?.status()).toBe(404);
    await expect(page.locator(cfg.selectors.error.body)).toBeAttached();
  });
});

/** Dates like 09/14/2026, 14.09.2026, 14/09/2026 or 2026-09-14 (day/month order from the values, else the locale). */
function parseDates(text: string, locale: string): Date[] {
  const out: Date[] = [];
  for (const [, y, m, d] of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.push(new Date(+y, +m - 1, +d));
  for (const [, a, b, y] of text.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g)) {
    const [p, q] = [+a, +b];
    const monthFirst = p > 12 ? false : q > 12 ? true : /^en-US/i.test(locale);
    out.push(monthFirst ? new Date(+y, p - 1, q) : new Date(+y, q - 1, p));
  }
  return out;
}
