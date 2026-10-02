import * as fs from 'fs';
import * as path from 'path';
import { expect, type BrowserContext, type Cookie, type Locator } from '@playwright/test';
import { BasePage } from '../pages/BasePage';

/** Consent cookies recorded by the setup project (gitignored .auth/ folder), one file per shop host. */
const consentFile = (baseURL: string) => path.resolve(__dirname, '../../.auth', `consent-${new URL(baseURL).hostname}.json`);

/** Shopware core cookie consent ("cookie-preference" cookie). */
export class CookieBanner extends BasePage {
  get banner(): Locator {
    return this.$(this.s.cookie.banner);
  }

  async acceptOnlyNecessary(): Promise<void> {
    await this.$(this.s.cookie.onlyNecessary).first().click();
  }

  async acceptAll(): Promise<void> {
    const all = this.$(this.s.cookie.acceptAll).first();
    if (await all.isVisible()) await all.click();
    else await this.acceptOnlyNecessary();
  }

  /**
   * Pre-sets consent so the banner never overlays elements in functional tests.
   * Used by the base fixture for every test (except the cookie banner test).
   */
  static async preAccept(context: BrowserContext, baseURL: string): Promise<void> {
    // Real consent cookies from setup (cookie-preference + cookie-config-hash). Without the hash some
    // shops show the banner again a few seconds after load — on mobile it then covers buttons.
    const file = consentFile(baseURL);
    if (fs.existsSync(file)) {
      await context.addCookies(JSON.parse(fs.readFileSync(file, 'utf8')) as Cookie[]);
      return;
    }
    const { hostname } = new URL(baseURL);
    await context.addCookies([
      { name: 'cookie-preference', value: '1', domain: hostname, path: '/', sameSite: 'Lax' },
    ]);
  }

  /** Clicks "only necessary" like a visitor and stores the resulting consent cookies for preAccept(). */
  async recordConsent(baseURL: string): Promise<void> {
    await this.page.goto('/', { waitUntil: 'load' });
    await this.banner.first().waitFor({ state: 'visible' });
    await this.acceptOnlyNecessary();
    await this.banner.first().waitFor({ state: 'hidden' });
    const consent = async () => (await this.page.context().cookies()).filter((c) => /^cookie-(preference|config-hash)$/.test(c.name));
    // cookie-config-hash is written a moment after the click (not every shop sets it → give up after 5 s)
    await expect.poll(async () => (await consent()).length, { timeout: 5_000 }).toBe(2).catch(() => undefined);
    const cookies = await consent();
    fs.mkdirSync(path.dirname(consentFile(baseURL)), { recursive: true });
    fs.writeFileSync(consentFile(baseURL), JSON.stringify(cookies, null, 2));
  }
}
