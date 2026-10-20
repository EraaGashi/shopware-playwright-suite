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

  test('account pages require login', { tag: '@smoke' }, async ({ page, cfg }) => {
    for (const path of [cfg.routes.account, cfg.routes.accountProfile, cfg.routes.accountOrders, cfg.routes.accountAddresses]) {
      await page.goto(path);
      await expect(page, `${path} should redirect to login`).toHaveURL(new RegExp(cfg.routes.login));
    }
  });
});
