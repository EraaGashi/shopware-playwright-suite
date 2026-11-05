import { test, expect } from '../../src/fixtures';

test.describe('Customer account', () => {
  test('overview shows account navigation', { tag: '@smoke' }, async ({ loggedInPage: page, account, cfg }) => {
    await account.open();
    // account sidebar is collapsed on mobile → check it is rendered, not visible
    await expect(page.locator(cfg.selectors.account.aside).first()).toBeAttached();
    expect(await account.asideItems.count()).toBeGreaterThanOrEqual(3);
  });

  test('addresses page lists the default address', async ({ loggedInPage: page, account, customer, cfg }) => {
    await account.openAddresses();
    // a fixed account keeps its own default address; a newly registered one has the profile's address
    const street = (cfg.env.testCustomer && cfg.testData.customer.testCustomerDefaultStreet) || customer.address.street;
    const sel = cfg.selectors.account.defaultAddressCard;
    if (sel) await expect(page.locator(sel).first(), 'no address is marked as default').toBeVisible();
    // only the default card counts — the same street on another saved address would not prove anything
    const scope = sel ? page.locator(sel) : page.locator('body');
    await expect(scope.getByText(street).first(), `default address does not show ${street}`).toBeVisible();
  });

  test('orders page is reachable', async ({ loggedInPage: _page, account }) => {
    await account.openOrders();
  });

  test('order history shows a number and, when expanded, an amount for each order', async ({ loggedInPage: page, account, cfg }) => {
    // risk: order list renders empty rows / loses the order total after template changes
    await account.openOrders();
    // orderItem can match an order and its own header row → only the outermost matches are orders
    const sel = cfg.selectors.account.orderItem;
    const orders = page.locator(`:is(${sel}):not(:is(${sel}) *)`);
    const count = await orders.count();
    test.skip(count === 0, 'Test customer has no orders (use a TEST_CUSTOMER_EMAIL account with orders)');
    const amount = new RegExp(`${escapeRe(cfg.currencySymbol)}\\s*\\d|\\d\\s*${escapeRe(cfg.currencySymbol)}`);
    for (let i = 0; i < Math.min(count, 3); i++) {
      const order = orders.nth(i);
      await expect.soft(order, `order ${i + 1}: no order number`).toContainText(/\d{4,}/);
      // totals live in the collapsed details (core Shopware and themes) → expand like a customer
      const toggle = order.locator(cfg.selectors.account.orderDetailsToggle).first();
      if (await toggle.isVisible()) await toggle.click();
      await expect.soft(order, `order ${i + 1}: no amount visible after expanding`).toContainText(amount);
    }
  });

  test('account pages require login', { tag: '@smoke' }, async ({ page, cfg }) => {
    for (const path of [cfg.routes.account, cfg.routes.accountProfile, cfg.routes.accountOrders, cfg.routes.accountAddresses]) {
      await page.goto(path);
      await expect(page, `${path} should redirect to login`).toHaveURL(new RegExp(cfg.routes.login));
    }
  });
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
