import { test, expect, skipUnless } from '../../src/fixtures';
import { buildCustomer } from '../../src/data/customer';

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

test.describe('Checkout', () => {
  test('empty cart cannot proceed to checkout', { tag: '@smoke' }, async ({ page, cfg }) => {
    await page.goto(cfg.routes.checkoutConfirm);
    await expect(page).toHaveURL(new RegExp(cfg.routes.cart));
  });

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

  test('registered customer places an order and sees it in the account', { tag: '@smoke' }, async ({ loggedInPage: page, cfg, cartHelper, checkout, account }) => {
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
