import { test, expect } from '../../src/fixtures';
import { loadConfig } from '../../src/config/loader';

test.describe('Important links & redirects', () => {
  test('important pages respond without error', { tag: '@smoke' }, async ({ request, cfg }) => {
    const failures: string[] = [];
    for (const path of cfg.importantLinks) {
      const res = await request.get(path);
      if (res.status() >= 400) failures.push(`${path} → ${res.status()}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  for (const rule of loadConfig().redirects) {
    test(`redirect ${rule.from} → ${rule.to}`, async ({ page }) => {
      await page.goto(rule.from);
      await expect(page).toHaveURL(new RegExp(rule.to));
    });
  }

  test('header and footer links on the homepage are not broken', async ({ page, request, cfg }) => {
    test.slow(); // up to 60 requests one after another — slow staging servers need the extra time
    await page.goto(cfg.routes.home);
    const hrefs = await page
      .locator(`${cfg.selectors.header.root} a[href], ${cfg.selectors.footer.root} a[href]`)
      // getAttribute: SVG <a> elements expose href as SVGAnimatedString, not a string
      .evaluateAll((as) => as.map((a) => new URL(a.getAttribute('href') ?? '', document.baseURI).href));
    const origin = new URL(cfg.baseURL).origin;
    const internal = [...new Set(hrefs)].filter((h) => h.startsWith(origin) && !h.includes('/account/logout')).slice(0, 60);
    const broken: string[] = [];
    for (const href of internal) {
      const res = await request.get(href, { maxRedirects: 5 });
      if (res.status() >= 400) broken.push(`${href} → ${res.status()}`);
    }
    expect(broken, broken.join('\n')).toEqual([]);
  });

  test('sitemap and robots.txt are served', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain('<sitemapindex');
  });
});

test.describe('Error handling', () => {
  test('unknown URL shows a 404 page with a way back', { tag: ['@smoke', '@mobile'] }, async ({ page, cfg }) => {
    const res = await page.goto(`/e2e-not-existing-${Date.now()}`);
    expect(res?.status()).toBe(404);
    await expect(page.locator(cfg.selectors.error.body)).toBeAttached();
    await expect(page.locator(cfg.selectors.header.logo).locator('visible=true').first()).toBeVisible();
    await expect(page.locator(cfg.selectors.error.backToShop).first()).toBeVisible();
  });

  test('unknown category/deep URL returns 404, not 500', async ({ request, cfg }) => {
    const res = await request.get(`${cfg.testData.listingCategoryPath.replace(/\/$/, '')}/does-not-exist-${Date.now()}/`);
    expect(res.status()).toBe(404);
  });

  test('invalid listing parameters do not crash the page', async ({ page, cfg }) => {
    // risk: hand-edited / outdated links with malformed parameters → 500 instead of a usable page.
    // One parameter per request, so a failure names the culprit. Page numbers that are valid but too
    // large are covered by "pages beyond the real end of the listing" (listing.spec) — not repeated here.
    const path = cfg.testData.listingCategoryPath;
    const cases: Array<{ query: string; listingShown: boolean }> = [
      { query: 'order=invalid', listingShown: true },        // unknown sorting → falls back to the default order
      { query: 'manufacturer=xyz', listingShown: true },     // not a manufacturer id
      { query: 'properties=xyz', listingShown: true },       // not a property option id
      { query: 'min-price=abc&max-price=-5', listingShown: true },
      { query: 'p=abc', listingShown: false },              // non-numeric page (a 4xx answer is fine)
      { query: 'p=0', listingShown: true },
      { query: 'p=-1', listingShown: true },
    ];
    for (const { query, listingShown } of cases) {
      await test.step(`?${query}`, async () => {
        const res = await page.goto(`${path}?${query}`);
        expect.soft(res?.status(), `?${query} on ${path}`).toBeLessThan(500);
        if (listingShown && (res?.status() ?? 500) < 400) {
          await expect.soft(page.locator(cfg.selectors.listing.root).first(), `?${query}: listing not rendered`).toBeAttached();
        }
      });
    }
  });

  test('POST to add-to-cart with invalid product does not 500', async ({ page, cfg }) => {
    await page.goto(cfg.routes.home);
    const res = await page.request.post('/checkout/line-item/add', {
      form: { 'lineItems[x][id]': 'x', 'lineItems[x][type]': 'product', 'lineItems[x][referencedId]': 'invalid', 'lineItems[x][quantity]': '1' },
      maxRedirects: 0,
    });
    expect(res.status()).toBeLessThan(500);
  });
});
