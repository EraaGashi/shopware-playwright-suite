import { test, expect } from '../../src/fixtures';

test.describe('Cart', () => {
  test('add product from detail page opens off-canvas cart', { tag: ['@smoke', '@mobile'] }, async ({ product, offcanvasCart, header, cfg }) => {
    const p = cfg.testData.simpleProduct;
    await product.open(p);
    const guestPrices = cfg.features.guestPrices !== false;
    const price = guestPrices ? await product.priceValue() : 0;
    await product.addToCart();

    await offcanvasCart.expectOpen();
    await expect(offcanvasCart.lineItem(p.name)).toBeVisible();
    if (!guestPrices) return;

    // header widget refreshes asynchronously / on next page load → verify after reload
    await product.page.reload();
    await expect.poll(() => header.cartTotal()).toBeCloseTo(price, 2);
  });

  test('add product from listing', async ({ listing, offcanvasCart, cfg }) => {
    await listing.open(cfg.testData.listingCategoryPath);
    const idx = await listing.firstBuyableIndex();
    test.skip(idx < 0, 'No directly buyable product on listing');
    const name = await listing.addToCartFromListing(idx);
    await offcanvasCart.expectOpen();
    await expect(offcanvasCart.lineItem(name)).toBeVisible();
  });

  test('update quantity on cart page recalculates total', { tag: '@smoke' }, async ({ cart, cartHelper, cfg }) => {
    const p = cfg.testData.simpleProduct;
    await cartHelper.add(p, 1);
    await cart.open();
    const guestPrices = cfg.features.guestPrices !== false;
    const single = guestPrices ? await cart.totalValue() : 0;
    await cart.setQuantity(p.name, 2);
    expect(await cart.quantityOf(p.name)).toBe(2);
    if (guestPrices) await expect.poll(() => cart.totalValue()).toBeGreaterThan(single);
  });

  test('remove product from cart page', { tag: '@smoke' }, async ({ cart, cartHelper, cfg }) => {
    const p = cfg.testData.simpleProduct;
    await cartHelper.add(p, 1);
    await cart.open();
    await expect(cart.lineItem(p.name)).toBeVisible();
    await cart.remove(p.name);
    await cart.expectEmpty();
  });

  test('price is carried over unchanged from detail page to cart and scales with quantity', async ({ product, offcanvasCart, cart, cfg }) => {
    // risk: cart shows another price than the product page, or line totals don't follow the quantity
    test.skip(cfg.features.guestPrices === false, 'Guests see no prices');
    const p = cfg.testData.simpleProduct;
    await product.open(p);
    const pdpPrice = await product.priceValue();
    await product.addToCart();
    await expect(offcanvasCart.lineItem(p.name)).toBeVisible();

    await cart.open();
    expect(await cart.quantityOf(p.name)).toBe(1);
    expect(await cart.lineTotalOf(p.name), 'cart line total vs. detail page price').toBeCloseTo(pdpPrice, 2);

    await cart.setQuantity(p.name, 2);
    expect(await cart.quantityOf(p.name)).toBe(2);
    // unit price shown → exact check (also correct for tier prices); otherwise the line must double
    const unit = await cart.unitPriceOf(p.name);
    const expected = Number.isNaN(unit) ? pdpPrice * 2 : unit * 2;
    await expect.poll(() => cart.lineTotalOf(p.name), { message: 'line total for quantity 2' }).toBeCloseTo(expected, 2);
  });

  test('valid promotion code reduces total', async ({ cart, cartHelper, cfg }) => {
    const code = cfg.testData.promotionCode;
    test.skip(!cfg.features.promotionCodes || !code, 'No promotion code configured');
    await cartHelper.add(cfg.testData.simpleProduct, 1);
    await cart.open();
    const before = await cart.totalValue();
    await cart.applyPromotion(code!);
    await expect.poll(() => cart.totalValue()).toBeLessThan(before);
  });
});
