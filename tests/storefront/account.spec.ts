import { test, expect } from '../../src/fixtures';

test.describe('Customer account', () => {
  test('overview shows account navigation', { tag: ['@smoke', '@mobile'] }, async ({ loggedInPage: page, account, cfg }) => {
    await account.open();
    // account sidebar is collapsed on mobile → check it is rendered, not visible
    await expect(page.locator(cfg.selectors.account.aside).first()).toBeAttached();
    expect(await account.asideItems.count()).toBeGreaterThanOrEqual(3);
  });

  test('profile name can be changed', async ({ loggedInPage: page, account, cfg, customer }) => {
    await account.openProfile();
    await account.updateName('Changed', 'Name');
    await expect(account.successAlert).toBeVisible();
    await page.reload();
    await expect(page.locator(cfg.selectors.account.profileFirstName)).toHaveValue('Changed');
    // a fixed test account (TEST_CUSTOMER_EMAIL) is shared by every run → put its name back
    if (cfg.env.testCustomer) await account.updateName(customer.firstName, customer.lastName);
  });

  test('addresses page lists the default address', async ({ loggedInPage: page, account, customer }) => {
    await account.openAddresses();
    await expect(page.getByText(customer.address.street).first()).toBeVisible();
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

  test('password is not changed with a wrong current password', async ({ loggedInPage: _page, account, auth, cfg, customer, requireWriteAccess }) => {
    // risk: password change without knowing the old password = account takeover
    void requireWriteAccess;
    test.skip(!!cfg.env.testCustomer, 'Never touches the password of the fixed test account');
    await account.changePassword('wrong-current-password-4711', 'Changed-E2E-2026!');
    await expect(account.page.locator(`${cfg.selectors.page.alertDanger}, ${cfg.selectors.page.invalidFeedback}`).locator('visible=true').first()).toBeVisible();
    // proof: the old password still works
    await account.logout();
    await auth.open();
    await auth.loginAndExpectSuccess(customer.email, customer.password);
  });

  test('empty address form is rejected', async ({ loggedInPage: page, account, cfg, requireWriteAccess }) => {
    // risk: incomplete addresses saved → orders shipped to nowhere (write-gated: only creates data if validation is broken)
    void requireWriteAccess;
    const form = await account.openAddressCreate();
    await form.locator('button[type="submit"]').first().click();
    await expect(page.locator(`${cfg.selectors.page.invalidField}, ${cfg.selectors.page.alertDanger}`).locator('visible=true').first()).toBeVisible();
    await expect(page).toHaveURL(/\/account\/address\/create/);
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
