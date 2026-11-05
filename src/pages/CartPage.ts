import { expect, type Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { parsePrice } from '../utils/price';

export class CartPage extends BasePage {
  get lineItems(): Locator {
    return this.$(`${this.s.cart.root} ${this.s.cart.lineItem}`);
  }
  get total(): Locator {
    return this.$(this.s.cart.summaryTotal).first();
  }
  get checkoutButton(): Locator {
    return this.$(this.s.cart.checkoutButton).first();
  }

  lineItem(name: string): Locator {
    return this.lineItems.filter({ hasText: name }).first();
  }

  async open(): Promise<void> {
    await this.goto(this.cfg.routes.cart);
    await this.expectController('checkout');
  }

  async totalValue(): Promise<number> {
    return parsePrice(await this.total.innerText());
  }

  /**
   * Price breakdown of the summary: grand total, net amount and tax rows (rate from the row label).
   * `net` undefined = the theme shows no net/tax breakdown with the configured selectors.
   */
  async summary(): Promise<{ grand: number; net?: number; taxes: Array<{ rate?: number; amount: number; label: string }> }> {
    const grand = await this.totalValue();
    const netEl = this.$(this.s.cart.summaryNet).first();
    const net = (await netEl.count()) ? parsePrice(await netEl.innerText()) : undefined;
    const amounts = await this.$(this.s.cart.summaryTax).allInnerTexts();
    const labels = await this.$(this.s.cart.summaryTaxLabel).allInnerTexts();
    const taxes = amounts.map((a, i) => {
      const label = (labels[i] ?? '').replace(/\s+/g, ' ').trim();
      const m = label.match(/(\d+(?:[.,]\d+)?)\s*%/);
      return { amount: parsePrice(a), rate: m ? parseFloat(m[1].replace(',', '.')) : undefined, label };
    });
    return { grand, net, taxes };
  }

  /** Cart lines keyed by their product link (unique per variant, unlike names). */
  async lines(): Promise<Array<{ href: string; name: string; qty: number }>> {
    // some themes reload the cart page once more after it loaded (stock / seller checks) → read after it settled
    for (let attempt = 0; ; attempt++) {
      try {
        await this.page.waitForLoadState('load');
        return await this.readLines();
      } catch (e) {
        if (attempt >= 2 || !/context was destroyed|navigat/i.test(String(e))) throw e;
      }
    }
  }

  private async readLines(): Promise<Array<{ href: string; name: string; qty: number }>> {
    const s = this.s.cart;
    const rows = await this.lineItems.evaluateAll(
      (els, sel) =>
        els.map((el) => {
          const label = el.querySelector(sel.label);
          const q = el.querySelector(sel.qty) as HTMLInputElement | HTMLSelectElement | null;
          return {
            href: (label?.closest('a') ?? label?.querySelector('a') ?? label)?.getAttribute('href') ?? '',
            name: (label?.textContent ?? '').replace(/\s+/g, ' ').trim(),
            qty: q ? Number(q.value) : 1,
          };
        }),
      { label: s.lineItemLabel, qty: s.quantityInput },
    );
    return rows.filter((r) => r.href);
  }

  lineItemByHref(href: string): Locator {
    return this.lineItems.filter({ has: this.page.locator(`a[href="${href}"]`) }).first();
  }

  async setQuantityByHref(href: string, qty: number): Promise<void> {
    const input = this.lineItemByHref(href).locator(this.s.cart.quantityInput);
    const isSelect = await input.evaluate((el) => el.tagName === 'SELECT');
    await this.waitForXhr('/checkout/line-item/change-quantity', async () => {
      if (isSelect) return input.selectOption(String(qty));
      await input.fill(String(qty));
      await input.press('Enter');
    });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async removeByHref(href: string): Promise<void> {
    await this.waitForXhr('/checkout/line-item/delete', () => this.lineItemByHref(href).locator(this.s.cart.remove).click());
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Remembers the cart (for a fixed test account whose cart persists between runs);
   * the returned function brings back the remembered quantities and removes lines added since.
   */
  async snapshot(): Promise<() => Promise<string[]>> {
    await this.open();
    const before = await this.lines();
    return async () => {
      const notes: string[] = [];
      await this.open();
      for (const line of await this.lines()) {
        const was = before.find((b) => b.href === line.href);
        if (!was) await this.removeByHref(line.href);
        else if (was.qty !== line.qty) await this.setQuantityByHref(line.href, was.qty);
      }
      const after = await this.lines();
      for (const b of before) if (!after.some((a) => a.href === b.href)) notes.push(`could not restore ${b.name} (${b.href})`);
      return notes;
    };
  }

  /** Unit price of a line item, NaN when the theme doesn't show one. */
  async unitPriceOf(name: string): Promise<number> {
    const unit = this.lineItem(name).locator(this.s.cart.lineItemUnitPrice).first();
    return (await unit.count()) ? parsePrice(await unit.innerText()) : NaN;
  }

  async lineTotalOf(name: string): Promise<number> {
    return parsePrice(await this.lineItem(name).locator(this.s.cart.lineItemTotal).first().innerText());
  }

  async lineSummary(): Promise<string[]> {
    return this.lineSummaryOf(this.lineItems);
  }

  /** Sum of all product line totals in the cart. */
  async lineTotalsSum(): Promise<number> {
    const texts = await this.lineItems.locator(this.s.cart.lineItemTotal).allInnerTexts();
    return texts.map(parsePrice).reduce((a, b) => a + b, 0);
  }

  async quantityOf(name: string): Promise<number> {
    return parseInt(await this.lineItem(name).locator(this.s.cart.quantityInput).inputValue(), 10);
  }

  async increaseQuantity(name: string): Promise<void> {
    await this.waitForXhr('/checkout/line-item/change-quantity', () =>
      this.lineItem(name).locator(this.s.cart.plus).click(),
    );
    await this.page.waitForLoadState('domcontentloaded');
  }

  async setQuantity(name: string, qty: number): Promise<void> {
    const input = this.lineItem(name).locator(this.s.cart.quantityInput);
    // some themes replace the +/- number input with a <select>
    const isSelect = await input.evaluate((el) => el.tagName === 'SELECT');
    await this.waitForXhr('/checkout/line-item/change-quantity', async () => {
      if (isSelect) return input.selectOption(String(qty));
      await input.fill(String(qty));
      await input.press('Enter');
    });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async remove(name: string): Promise<void> {
    await this.waitForXhr('/checkout/line-item/delete', () => this.lineItem(name).locator(this.s.cart.remove).click());
    await this.page.waitForLoadState('domcontentloaded');
  }

  async applyPromotion(code: string): Promise<void> {
    const input = this.$(this.s.cart.promotionInput).first();
    if (this.s.cart.promotionReveal && !(await input.isVisible())) {
      await this.$(this.s.cart.promotionReveal).locator('visible=true').first().click();
      await expect(input).toBeVisible();
    }
    await input.fill(code);
    await this.waitForXhr('/checkout/promotion/add', () => this.$(this.s.cart.promotionSubmit).first().click());
  }

  async expectEmpty(): Promise<void> {
    await expect(this.lineItems).toHaveCount(0);
  }

  async proceedToCheckout(): Promise<void> {
    await Promise.all([this.page.waitForURL(/\/checkout\/(confirm|register)/), this.checkoutButton.click()]);
  }
}
