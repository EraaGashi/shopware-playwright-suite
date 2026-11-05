import { test, expect } from '../../src/fixtures';
import { CookieBanner } from '../../src/components/CookieBanner';
import type { Response } from '@playwright/test';

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

  test('quantity field never puts 0, negative, fractional or too large amounts in the cart', async ({ page, context, cfg, product, cart }) => {
    const p = cfg.testData.simpleProduct;
    for (const value of ['0', '-1', '1.5', '99999']) {
      await test.step(`quantity "${value}"`, async () => {
        // fresh, empty cart for every value: new session, same cookie consent
        await context.clearCookies();
        await CookieBanner.preAccept(context, cfg.baseURL);
        const serverErrors: string[] = [];
        const onResponse = (r: Response) => { if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`); };
        page.on('response', onResponse);

        await product.open(p);
        const max = Number((await product.quantity.getAttribute('max')) || 100);
        await product.quantity.fill(value);
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined); // session settles (see addToCart)
        await product.buyButton.click();
        // the browser / shop may block the value entirely → no off-canvas, that's fine
        await page.waitForResponse((r) => r.url().includes('/checkout/offcanvas'), { timeout: 8_000 }).catch(() => undefined);

        await cart.open();
        const line = cart.lineItem(p.name);
        if (await line.count()) {
          const raw = await line.locator(cfg.selectors.cart.quantityInput).first().inputValue();
          const qty = Number(raw);
          expect(Number.isInteger(qty), `quantity "${raw}" is not a whole number`).toBe(true);
          expect(qty, 'quantity below 1').toBeGreaterThanOrEqual(1);
          expect(qty, `quantity above the maximum (${max})`).toBeLessThanOrEqual(max);
        }
        page.off('response', onResponse);
        expect(serverErrors, 'server errors while adding').toEqual([]);
      });
    }
  });

  test('add product from listing', async ({ listing, offcanvasCart, cfg }) => {
    await listing.open(cfg.testData.listingCategoryPath);
    const idx = await listing.firstBuyableIndex();
    test.skip(idx < 0, 'No directly buyable product on listing');
    const name = await listing.addToCartFromListing(idx);
    await offcanvasCart.expectOpen();
    await expect(offcanvasCart.lineItem(name)).toBeVisible();
  });

  test('add with quantity > 1 from detail page', async ({ product, cart, cfg }) => {
    const p = cfg.testData.simpleProduct;
    await product.open(p);
    await product.addToCart(3);
    await cart.open();
    expect(await cart.quantityOf(p.name)).toBe(3);
  });

  test('update quantity in off-canvas cart', async ({ product, offcanvasCart, cfg }) => {
    const p = cfg.testData.simpleProduct;
    await product.open(p);
    await product.addToCart();
    await offcanvasCart.increaseQuantity(p.name);
    await expect(offcanvasCart.lineItem(p.name).locator(cfg.selectors.offcanvasCart.quantityInput)).toHaveValue('2');
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

  test('removing one product keeps the other lines and lowers the total', async ({ cart, cartHelper, cfg }) => {
    // risk: deleting a line resets or drops other cart positions, totals not recalculated
    const { simpleProduct: a, variantProduct: b } = cfg.testData;
    test.skip(a.name === b.name, 'simple and variant product have the same name');
    await cartHelper.add(a, 1);
    await cartHelper.add(b, 1);
    await cart.open();
    await expect(cart.lineItems).toHaveCount(2);

    const guestPrices = cfg.features.guestPrices !== false;
    if (guestPrices) {
      // grand total covers every position (gross: + shipping, net: + shipping + tax)
      expect(await cart.totalValue(), 'grand total below the sum of the lines').toBeGreaterThanOrEqual((await cart.lineTotalsSum()) - 0.01);
    }
    const before = guestPrices ? await cart.totalValue() : 0;
    const keptQty = await cart.quantityOf(b.name);

    await cart.remove(a.name);
    await expect(cart.lineItems).toHaveCount(1);
    await expect(cart.lineItem(b.name)).toBeVisible();
    expect(await cart.quantityOf(b.name), 'quantity of the remaining line changed').toBe(keptQty);
    if (guestPrices) await expect.poll(() => cart.totalValue()).toBeLessThan(before);
  });

  test('adding the same product twice increases the quantity of one line', { tag: '@mobile' }, async ({ cart, cartHelper, cfg }) => {
    // risk: duplicate cart positions for the same product (confusing totals, double shipping rules)
    const p = cfg.testData.simpleProduct;
    await cartHelper.add(p, 1);
    await cartHelper.add(p, 1);
    await cart.open();
    await expect(cart.lineItems.filter({ hasText: p.name })).toHaveCount(1);
    expect(await cart.quantityOf(p.name)).toBe(2);
  });

  test('an emptied cart cannot proceed to checkout', async ({ page, cart, cartHelper, cfg }) => {
    // risk: checkout reachable with a cart that was emptied in the same session (stale state)
    const p = cfg.testData.simpleProduct;
    await cartHelper.add(p, 1);
    await cart.open();
    await cart.remove(p.name);
    await cart.expectEmpty();
    await expect(cart.checkoutButton.locator('visible=true'), 'checkout button still offered for an empty cart').toHaveCount(0);
    await page.goto(cfg.routes.checkoutConfirm);
    await expect(page).toHaveURL(new RegExp(cfg.routes.cart));
  });

  test('remove product from off-canvas cart', async ({ product, offcanvasCart, cfg }) => {
    const p = cfg.testData.simpleProduct;
    await product.open(p);
    await product.addToCart();
    await offcanvasCart.remove(p.name);
    await expect(offcanvasCart.lineItems).toHaveCount(0);
  });

  test('cart persists across page navigation', async ({ page, cart, cartHelper, header, cfg }) => {
    await cartHelper.add(cfg.testData.simpleProduct, 1);
    await page.goto(cfg.testData.listingCategoryPath);
    // B2B shops hide prices from guests → the item count in the header shows the cart instead
    if (cfg.features.guestPrices === false) await expect.poll(() => header.cartBadgeCount()).toBeGreaterThan(0);
    else await expect.poll(() => header.cartTotal()).toBeGreaterThan(0);
    await cart.open();
    await expect(cart.lineItems).toHaveCount(1);
  });

  test('invalid promotion code is rejected', async ({ page, cart, cartHelper, cfg }) => {
    test.skip(!cfg.features.promotionCodes, 'promotion codes disabled');
    await cartHelper.add(cfg.testData.simpleProduct, 1);
    await cart.open();
    await cart.applyPromotion('E2E-INVALID-CODE-4711');
    await expect(page.locator(`${cfg.selectors.page.alertDanger}, .alert-warning`).first()).toBeVisible();
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
