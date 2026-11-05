import { test, expect, skipUnless } from '../../src/fixtures';
import { buildCustomer } from '../../src/data/customer';
import type { CartPage } from '../../src/pages/CartPage';

/**
 * Without an offline payment method (features.orderPlacement=false) the flow is verified up to the
 * payment hand-off and the test passes with an annotation instead of placing a real order.
 */
function stopBeforeOrder(orderPlacement: boolean): boolean {
  if (orderPlacement) return false;
  test.info().annotations.push({
    type: 'order not placed',
    description: 'features.orderPlacement=false — verified up to payment hand-off only',
  });
  return true;
}

// A fixed test account (TEST_CUSTOMER_EMAIL) shares one cart: logged-in tests running side by side add to it
// while an order is submitted → "Products or prices in your shopping cart may have changed". One at a time.
test.describe.configure({ mode: 'default' });

test.describe('Checkout', () => {

  test('guest is asked to log in or register before confirm', { tag: '@smoke' }, async ({ page, cartHelper, cfg, auth }) => {
    await cartHelper.add(cfg.testData.simpleProduct);
    await page.goto(cfg.routes.checkoutConfirm);
    await expect(page).toHaveURL(new RegExp(cfg.routes.checkoutRegister));
    // without guest checkout the gate may only offer login (+ a link to a separate registration)
    if (!cfg.features.guestCheckout) return void (await expect(auth.loginForm).toBeVisible());
    await auth.revealRegistration();
    await expect(auth.registerForm).toBeVisible();
  });

  test('guest checkout places an order', { tag: ['@smoke', '@mobile'] }, async ({ page, cfg, cart, cartHelper, auth, checkout, requireWriteAccess }) => {
    void requireWriteAccess;
    skipUnless(cfg.features.guestCheckout, 'guestCheckout');

    await cartHelper.add(cfg.testData.simpleProduct);
    await cart.open();
    await cart.proceedToCheckout();
    await expect(page).toHaveURL(new RegExp(cfg.routes.checkoutRegister));

    await auth.register(buildCustomer(cfg), { guest: true });
    await checkout.expectOnConfirm();
    await expect(checkout.lineItems.filter({ hasText: cfg.testData.simpleProduct.name })).toHaveCount(1);

    await checkout.expectPaymentReady();
    if (stopBeforeOrder(cfg.features.orderPlacement)) return;
    await checkout.placeOrder();
    await expect(page.locator('body')).toHaveClass(/is-act-finishpage/);
    await expect(checkout.finishHeader).toBeVisible();
  });

  test('registered customer places an order and sees it in the account', { tag: '@smoke' }, async ({ loggedInPage: page, cfg, cart, cartHelper, checkout, account }) => {
    // leftovers in a fixed test account's cart would be ordered too — or block the order (sold-out items)
    if (cfg.features.orderPlacement) await cart.clear();
    await cartHelper.add(cfg.testData.simpleProduct, 2);
    await checkout.openConfirm();
    await checkout.expectOnConfirm();
    await expect(page.locator(cfg.selectors.checkout.address).first()).toBeVisible();

    await checkout.expectPaymentReady();
    if (stopBeforeOrder(cfg.features.orderPlacement)) return;
    await checkout.placeOrder();
    await expect(checkout.finishHeader).toBeVisible();

    await account.openOrders();
    await expect(account.orders.first()).toBeVisible();
  });

  test('order cannot be placed without accepting terms', async ({ loggedInPage: page, cfg, cartHelper, checkout }) => {
    skipUnless(cfg.features.orderPlacement, 'orderPlacement');
    await cartHelper.add(cfg.testData.simpleProduct);
    await checkout.openConfirm();
    test.skip(!cfg.selectors.checkout.tos, 'Terms are accepted by placing the order (no checkbox)');
    const tos = page.locator(cfg.selectors.checkout.tos);
    test.skip((await tos.count()) === 0, 'Shop has no TOS checkbox');
    await checkout.submitButton.click();
    // Shopware rewrites the URL client-side (history API) without submitting — assert
    // we are still on the confirm page instead of matching the URL.
    await expect(page).not.toHaveURL(/\/checkout\/finish/);
    await expect(checkout.submitButton).toBeVisible();
    const s = cfg.selectors.checkout.tos;
    await expect(page.locator(`${s}:invalid, ${s}${cfg.selectors.page.invalidField}`)).toHaveCount(1);
  });

  test('confirm page lists payment and shipping methods', async ({ loggedInPage: page, cfg, cartHelper, checkout }) => {
    await cartHelper.add(cfg.testData.simpleProduct);
    await checkout.openConfirm();
    expect(await page.locator(cfg.selectors.checkout.paymentMethod).count()).toBeGreaterThan(0);
    expect(await page.locator(cfg.selectors.checkout.shippingMethod).count()).toBeGreaterThan(0);
    await expect(page.locator(`${cfg.selectors.checkout.paymentMethod}:checked`)).toHaveCount(1);
  });
});

/**
 * Cart ↔ confirm page consistency for a logged-in customer. No order is placed.
 * With a fixed test account (TEST_CUSTOMER_EMAIL) the cart and checkout selections persist
 * between runs → every test restores what it changed.
 */
test.describe('Checkout consistency', () => {
  // a fixed test account shares one cart → these tests must not change it at the same time
  test.describe.configure({ mode: 'serial' });

  /** Remembers the quantity of a cart line; the returned function puts it back (or removes the line). */
  async function rememberLine(cart: CartPage, name: string): Promise<() => Promise<void>> {
    await cart.open();
    const before = (await cart.lineItem(name).count()) ? await cart.quantityOf(name) : 0;
    return async () => {
      await cart.open();
      if (!(await cart.lineItem(name).count())) return;
      if (before === 0) await cart.remove(name);
      else if ((await cart.quantityOf(name)) !== before) await cart.setQuantity(name, before);
    };
  }

  test('confirm page shows the same items and total as the cart', async ({ loggedInPage: _page, cfg, cart, cartHelper, checkout }) => {
    // risk: checkout calculates differently than the cart (other prices, lost or duplicated positions)
    const p = cfg.testData.simpleProduct;
    const restore = await rememberLine(cart, p.name);
    try {
      await cartHelper.add(p, 1);
      await cart.open();
      const cartLines = await cart.lineSummary();
      const cartTotal = await cart.totalValue();

      await checkout.openConfirm();
      await checkout.expectOnConfirm();
      expect(await checkout.lineSummary(), 'line items (name = line total) differ between cart and confirm page').toEqual(cartLines);
      expect(await checkout.totalValue(), 'grand total differs between cart and confirm page').toBeCloseTo(cartTotal, 2);
    } finally {
      await restore();
    }
  });
});
