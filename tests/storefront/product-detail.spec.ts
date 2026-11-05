import { test, expect, skipUnless } from '../../src/fixtures';

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
      if (s.tax) await expect(product.page.locator(s.tax).first()).toBeVisible(); // '' = no tax notice (e.g. US prices)
      if (s.delivery) await expect(product.page.locator(s.delivery).first()).toBeVisible(); // '' = no delivery info
    }
    await expect(product.page.locator(s.description).first()).toBeAttached();
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

  test('reviews tab/teaser is present', async ({ product, cfg }) => {
    skipUnless(cfg.features.productReviews, 'productReviews');
    test.skip(!!cfg.testData.reviewWidget, 'Reviews come from a third-party widget (testData.reviewWidget)');
    await product.open(cfg.testData.simpleProduct);
    await expect(product.page.locator(cfg.selectors.product.reviewTeaser).first()).toBeAttached();
  });

  test('unknown product URL returns 404', async ({ page, cfg }) => {
    const res = await page.goto('/this-product-does-not-exist-e2e/XX-000');
    expect(res?.status()).toBe(404);
    await expect(page.locator(cfg.selectors.error.body)).toBeAttached();
  });
});

