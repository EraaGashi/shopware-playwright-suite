import { test, expect } from '../../src/fixtures';
import { uniqueEmail } from '../../src/data/customer';
import type { Page } from '@playwright/test';
import type { ResolvedConfig } from '../../src/config/types';

test.describe('Login / logout', () => {
  // @ends-sessions: logging out can end the account's other sessions (dev Mall Street does)
  test('customer can log in and log out', { tag: ['@smoke', '@mobile', '@ends-sessions'] }, async ({ page, cfg, auth, account, customer }) => {
    await auth.open();
    await auth.loginAndExpectSuccess(customer.email, customer.password);
    await expect(page).toHaveURL(new RegExp(`${cfg.routes.account}(\\?.*)?$`));

    await account.logout();
    await page.goto(cfg.routes.account);
    await expect(page).toHaveURL(new RegExp(cfg.routes.login));
  });

  test('wrong password shows an error', { tag: '@smoke' }, async ({ page, cfg, auth, customer }) => {
    await auth.open();
    await auth.login(customer.email, 'wrong-password-123');
    await expect(page).toHaveURL(new RegExp(cfg.routes.login));
    await expect(auth.loginError).toBeVisible();
  });
});

test.describe('Password recovery', () => {
  /** Submits the recovery form and returns what the visitor sees afterwards. */
  async function requestReset(page: Page, cfg: ResolvedConfig, email: string): Promise<{ status: number; path: string; message: string }> {
    const r = cfg.selectors.passwordRecovery;
    await page.goto(cfg.routes.passwordRecovery ?? '/account/recover', { waitUntil: 'load' });
    const form = page.locator(r.form).first();
    await form.locator(r.email).fill(email);
    const [res] = await Promise.all([
      page.waitForResponse((x) => x.request().method() === 'POST' && x.url().includes('/account/recover')),
      form.locator(r.submit).first().click(),
    ]);
    await page.waitForLoadState('load');
    const alerts = page.locator(`${cfg.selectors.page.main} .alert`).locator('visible=true');
    await expect(alerts.first(), `no message after requesting a reset for ${email}`).toBeVisible();
    const message = (await alerts.allInnerTexts()).join(' | ').replace(/\s+/g, ' ').trim();
    return { status: res.status(), path: new URL(page.url()).pathname, message };
  }

  test('reset request does not reveal whether an e-mail is registered', async ({ page, cfg, customer }) => {
    const known = await requestReset(page, cfg, customer.email);
    const unknown = await requestReset(page, cfg, uniqueEmail(cfg)); // never registered
    expect(unknown.status, 'different response status for known / unknown e-mail').toBe(known.status);
    expect(unknown.path, 'different page for known / unknown e-mail').toBe(known.path);
    // e-mail addresses inside the message would differ legitimately → compare without them
    const strip = (m: string) => m.replace(/\S+@\S+/g, '<email>');
    expect(strip(unknown.message), 'the message tells known and unknown e-mails apart').toBe(strip(known.message));
  });
});
