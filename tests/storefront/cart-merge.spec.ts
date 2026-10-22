import type { Browser, Page } from '@playwright/test';
import { test, expect } from '../../src/fixtures';
import { CookieBanner } from '../../src/components/CookieBanner';
import { AuthPage } from '../../src/pages/AuthPage';
import { CartPage } from '../../src/pages/CartPage';
import type { ResolvedConfig } from '../../src/config/types';
import type { TestCustomer } from '../../src/data/customer';

/**
 * Cart behaviour around login / logout / sessions. Uses the `customer` fixture: a fixed test account
 * (TEST_CUSTOMER_EMAIL) or a fresh customer (needs ALLOW_WRITE_TESTS). The account cart is snapshotted
 * first and restored at the end — also when a check fails.
 */
test.describe('Cart across login and sessions', () => {
  // all tests change the same account cart → never in parallel with each other
  test.describe.configure({ mode: 'serial' });

  /** Logs in on `page` unless already logged in. */
  async function ensureLoggedIn(page: Page, cfg: ResolvedConfig, customer: TestCustomer): Promise<void> {
    await page.goto(cfg.routes.account);
    if (!new RegExp(cfg.routes.login).test(page.url())) return;
    await new AuthPage(page, cfg).loginAndExpectSuccess(customer.email, customer.password);
  }

  async function newSession(browser: Browser, cfg: ResolvedConfig): Promise<Page> {
    const ctx = await browser.newContext({ baseURL: cfg.baseURL, httpCredentials: cfg.env.httpCredentials, locale: cfg.locale });
    if (cfg.features.cookieBanner) await CookieBanner.preAccept(ctx, cfg.baseURL);
    return ctx.newPage();
  }

  test('guest cart and saved account cart are merged at login', async ({ page, cfg, auth, account, cart, cartHelper, customer }) => {
    // risk: logging in drops the guest's items or the account's saved items, or duplicates lines
    const { variantProduct: saved, simpleProduct: guest } = cfg.testData;
    test.skip(saved.name === guest.name, 'simple and variant product have the same name');
    await ensureLoggedIn(page, cfg, customer);
    const restore = await cart.snapshot();
    try {
      // 1. the account already holds `saved` in its cart
      await cartHelper.add(saved, 1);
      await cart.open();
      const savedLines = (await cart.lines()).filter((l) => l.name.includes(saved.name));
      expect(savedLines.length, `${saved.name} not in the account cart`).toBeGreaterThan(0);
      const before = await cart.lines();

      // 2. logged out, a guest puts `guest` into a new cart — the account cart must not be visible
      await account.logout();
      await cart.open();
      expect((await cart.lines()).map((l) => l.name), 'account cart still visible after logout').toEqual([]);
      await cartHelper.add(guest, 1);

      // 3. login: every saved line keeps its quantity, the guest product is there exactly once
      await auth.open();
      await auth.loginAndExpectSuccess(customer.email, customer.password);
      await cart.open();
      const after = await cart.lines();
      for (const line of before) {
        const now = after.find((a) => a.href === line.href);
        expect.soft(now, `saved line lost at login: ${line.name}`).toBeTruthy();
        // the guest product may already have been saved in the account → only other lines must stay unchanged
        if (now && !line.name.includes(guest.name)) expect.soft(now.qty, `quantity of ${line.name} changed at login`).toBe(line.qty);
      }
      const guestLines = after.filter((l) => l.name.includes(guest.name));
      expect(guestLines.length, `guest product "${guest.name}" missing after login`).toBeGreaterThan(0);
      expect(new Set(after.map((l) => l.href)).size, 'same product twice in the merged cart').toBe(after.length);
      const hadGuestBefore = before.find((l) => l.name.includes(guest.name));
      test.info().annotations.push({
        type: 'merge behaviour',
        description: hadGuestBefore ? `${guest.name}: account had ${hadGuestBefore.qty}, guest added 1 → ${guestLines[0].qty} after login` : `${guest.name}: added as new line`,
      });
    } finally {
      await ensureLoggedIn(page, cfg, customer);
      const notes = await restore();
      if (notes.length) test.info().annotations.push({ type: 'cart restore', description: notes.join('; ') });
    }
  });

  test('the cart follows the customer into a new browser session', async ({ page, browser, cfg, cart, cartHelper, customer }) => {
    // risk: cart only lives in the session — switching device / browser loses it
    const p = cfg.testData.simpleProduct;
    await ensureLoggedIn(page, cfg, customer);
    const restore = await cart.snapshot();
    const other = await newSession(browser, cfg);
    try {
      await cartHelper.add(p, 1);
      await cart.open();
      const expected = await cart.lines();

      await ensureLoggedIn(other, cfg, customer);
      const otherCart = new CartPage(other, cfg);
      await otherCart.open();
      const seen = await otherCart.lines();
      expect(seen.map((l) => `${l.href} × ${l.qty}`).sort(), 'cart differs in the second browser session').toEqual(expected.map((l) => `${l.href} × ${l.qty}`).sort());
    } finally {
      await other.context().close();
      await ensureLoggedIn(page, cfg, customer);
      const notes = await restore();
      if (notes.length) test.info().annotations.push({ type: 'cart restore', description: notes.join('; ') });
    }
  });
});
