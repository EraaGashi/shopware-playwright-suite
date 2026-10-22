import { expect, type Locator, type Page, type Response } from '@playwright/test';
import type { ResolvedConfig } from '../config/types';
import type { Selectors } from '../selectors/shopware67';
import { parsePrice } from '../utils/price';

/**
 * Base for all page objects: config + selectors + common Shopware helpers.
 * Page objects expose *intent* (addToCart, applyFilter), specs contain assertions.
 */
export abstract class BasePage {
  protected readonly s: Selectors;

  constructor(
    readonly page: Page,
    protected readonly cfg: ResolvedConfig,
  ) {
    this.s = cfg.selectors;
  }

  $(selector: string): Locator {
    return this.page.locator(selector);
  }

  /**
   * Waits for `load` so Shopware's JS plugins are bound — clicking earlier submits
   * forms natively (e.g. add-to-cart reloads the page instead of opening the off-canvas).
   * Third-party requests (e.g. PayPal SDK / messaging) can hang and block `load` forever, so `load`
   * gets a bounded wait: the shop's own (async) plugin chunks are long loaded by then.
   */
  async goto(path: string): Promise<Response | null> {
    const res = await this.page.goto(path, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('load', { timeout: 15_000 }).catch(() => undefined);
    return res;
  }

  /** Clicks a link and waits for the next document's `load` (see `goto`). */
  async clickAndLoad(target: Locator): Promise<void> {
    await Promise.all([this.page.waitForEvent('load'), target.click()]);
  }

  /**
   * Line items as sorted "label = total" strings, so cart and confirm page can be compared
   * regardless of their layout (same products, same line totals).
   */
  protected async lineSummaryOf(items: Locator): Promise<string[]> {
    const rows = await items.evaluateAll(
      (els, sel) =>
        els.map((el) => ({
          // some themes prefix the quantity on the confirm page ("2x Product")
          label: (el.querySelector(sel.label)?.textContent ?? '').replace(/\s+/g, ' ').trim().replace(/^\d+\s*[x×]\s+/i, ''),
          total: el.querySelector(sel.total)?.textContent ?? '',
        })),
      { label: this.s.cart.lineItemLabel, total: this.s.cart.lineItemTotal },
    );
    return rows.map((r) => `${r.label} = ${parsePrice(r.total).toFixed(2)}`).sort();
  }

  /** Shopware sets body classes like "is-ctl-checkout is-act-cartpage". */
  async expectController(ctl: string | RegExp): Promise<void> {
    const re = typeof ctl === 'string' ? new RegExp(`\\bis-ctl-${ctl}\\b`) : ctl;
    await expect(this.page.locator('body')).toHaveClass(re);
  }

  async expectPath(path: string | RegExp): Promise<void> {
    const re = typeof path === 'string' ? new RegExp(`${escapeRegExp(path)}(\\?.*)?$`) : path;
    await expect(this.page).toHaveURL(re);
  }

  /** Waits for the Shopware AJAX call triggered by `action` (listing, offcanvas, cart …). */
  async waitForXhr(urlPart: string | RegExp, action: () => Promise<unknown>): Promise<Response> {
    const matcher = (r: Response) =>
      (typeof urlPart === 'string' ? r.url().includes(urlPart) : urlPart.test(r.url())) && r.status() < 400;
    const [res] = await Promise.all([this.page.waitForResponse(matcher), action()]);
    return res;
  }
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
