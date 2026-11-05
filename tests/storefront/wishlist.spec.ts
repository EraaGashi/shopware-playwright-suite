import { test, expect, skipUnless } from '../../src/fixtures';

/** Only runs when features.wishlist = true in the project profile. */
test.describe('Wishlist', () => {
  test.beforeEach(({ cfg }) => skipUnless(cfg.features.wishlist, 'wishlist'));

  test('guest can add a product to the wishlist', { tag: '@smoke' }, async ({ page, cfg, product }) => {
    await product.open(cfg.testData.simpleProduct);
    await product.addToWishlist();
    await expect(page.locator(cfg.selectors.header.wishlistBadge).first()).toContainText('1');
  });

  test('wishlist page shows added product and allows removal', async ({ page, cfg, product }) => {
    await product.open(cfg.testData.simpleProduct);
    await product.addToWishlist();
    await page.goto(cfg.routes.wishlist);
    const box = page.locator(cfg.selectors.wishlist.productBox).filter({ hasText: cfg.testData.simpleProduct.name });
    await expect(box).toBeVisible();
    await box.locator(cfg.selectors.wishlist.remove).first().click();
    await expect(box).toHaveCount(0);
  });
});
