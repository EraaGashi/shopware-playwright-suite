import { test, expect, skipUnless } from '../../src/fixtures';
import { buildCustomer } from '../../src/data/customer';

test.describe('Customer registration', () => {
  test.beforeEach(async ({ cfg, auth }) => {
    skipUnless(cfg.features.registration, 'registration');
    await auth.openRegistration();
  });

  test('new customer can register', { tag: '@smoke' }, async ({ page, cfg, auth, adminApi, requireWriteAccess }) => {
    void requireWriteAccess;
    const customer = buildCustomer(cfg);
    await auth.register(customer);

    if (cfg.routes.registerPending) {
      // account must be approved by the shop first → "request under review" page, not logged in
      await expect(page).toHaveURL(new RegExp(cfg.routes.registerPending.replace(/[.]/g, '\\.')));
    } else if (cfg.features.doubleOptInRegistration) {
      await expect(page.locator(cfg.selectors.page.alertSuccess).first()).toBeVisible();
    } else if (cfg.features.registrationNeedsFirstCheckout) {
      // account stays pending until the first checkout → success message, customer not logged in
      await expect(page.locator(cfg.selectors.page.alertSuccess).first()).toBeVisible();
      await expect(page).not.toHaveURL(new RegExp(`${cfg.routes.account}(\\?.*)?$`));
    } else {
      await expect(page).toHaveURL(new RegExp(`${cfg.routes.account}(\\?.*)?$`));
      // account sidebar is collapsed on mobile → check it is rendered, not visible
      await expect(page.locator(cfg.selectors.account.aside).first()).toBeAttached();
    }
    if (adminApi && cfg.env.cleanupTestData) await adminApi.deleteCustomerByEmail(customer.email);
  });

  test('empty form shows validation errors', { tag: '@smoke' }, async ({ page, cfg, auth }) => {
    await auth.submitRegistration();
    await expect(auth.validationErrors.first()).toBeVisible();
    // server-side validation re-renders the form on /account/register
    await expect(page).toHaveURL(/\/account\/(login|register)/);
    void cfg;
  });

  test('already registered e-mail is rejected', async ({ page, cfg, auth, customer }) => {
    await auth.register(buildCustomer(cfg, { email: customer.email }));
    await expect(page).toHaveURL(/\/account\/(login|register)/);
    await expect(page.locator(`${cfg.selectors.page.alertDanger}, ${cfg.selectors.page.invalidFeedback}`).locator('visible=true').first()).toBeVisible();
  });
});
