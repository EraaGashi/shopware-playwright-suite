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
    const recorded = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Cookie[]) : [];
    // nothing recorded (e.g. the shop's "only necessary" button sets no cookie) → Shopware's default cookie below
    if (recorded.length) {
      await context.addCookies(recorded);
      return;
    }
    const { hostname } = new URL(baseURL);
    await context.addCookies([
      { name: 'cookie-preference', value: '1', domain: hostname, path: '/', sameSite: 'Lax' },
    ]);
  }

  /**
   * Clicks "only necessary" like a visitor (or "accept all", see cfg.consentRecording) and stores the
   * resulting consent cookies for preAccept().
   */
  async recordConsent(baseURL: string): Promise<void> {
    const rec = this.cfg.consentRecording;
    const keep = rec?.keep ?? /^cookie-(preference|config-hash)$/;
    await this.page.goto('/', { waitUntil: 'load' });
    await this.banner.first().waitFor({ state: 'visible' });
    if (rec?.button === 'acceptAll') await this.$(this.s.cookie.acceptAll).first().click();
    else await this.acceptOnlyNecessary();
    await this.banner.first().waitFor({ state: 'hidden' });
    // the shop's own cookies only (not e.g. Google's reCAPTCHA token cookie)
    const host = new URL(baseURL).hostname;
    const consent = async () => (await this.page.context().cookies()).filter((c) => keep.test(c.name) && host.endsWith(c.domain.replace(/^\./, '')));
    // cookie-config-hash is written a moment after the click (not every shop sets it → give up after 5 s)
    const hasHash = async () => (await consent()).some((c) => c.name === 'cookie-config-hash');
    await expect.poll(hasHash, { timeout: 5_000 }).toBe(true).catch(() => undefined);
    if (rec) {
      // custom cookie list: written over a few moments → wait until it stops growing (max 8 s)
      let last = -1;
      for (let i = 0; i < 8; i++) {
        const n = (await consent()).length;
        if (n > 0 && n === last) break;
        last = n;
        await this.page.waitForTimeout(1_000);
      }
    }
    const cookies = await consent();
    fs.mkdirSync(path.dirname(consentFile(baseURL)), { recursive: true });
    fs.writeFileSync(consentFile(baseURL), JSON.stringify(cookies, null, 2));
  }
}
