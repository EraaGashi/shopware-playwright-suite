import { expect, type Locator } from '@playwright/test';
import { BasePage, escapeRegExp } from './BasePage';
import { parsePrice } from '../utils/price';

/** A payment or shipping method radio on the confirm page. */
export interface MethodOption {
  value: string;
  label: string;
  checked: boolean;
  /** label is shown (core Shopware folds extra methods behind "show more", themes may use steps) */
  visible: boolean;
}

/** /checkout/confirm and /checkout/finish */
export class CheckoutPage extends BasePage {
  get lineItems(): Locator {
    return this.$(`${this.s.cart.root} ${this.s.checkout.lineItem}`);
  }
  get submitButton(): Locator {
    return this.$(this.s.checkout.submitOrder).first();
  }

  async openConfirm(): Promise<void> {
    // Payment SDKs (PayPal / Apple Pay / Google Pay) can delay the `load` event far beyond the shop's
    // own response → wait for the confirm form, give `load` a bounded grace period instead of failing.
    await this.page.goto(this.cfg.routes.checkoutConfirm, { waitUntil: 'domcontentloaded' });
    if (new URL(this.page.url()).pathname.endsWith(this.cfg.routes.checkoutConfirm)) {
      await expect(this.$(this.s.checkout.confirmForm).first()).toBeAttached();
    }
    await this.page.waitForLoadState('load', { timeout: 10_000 }).catch(() => undefined);
  }

  async expectOnConfirm(): Promise<void> {
    await this.expectPath(this.cfg.routes.checkoutConfirm);
    await expect(this.$(this.s.checkout.confirmForm).first()).toBeAttached();
    // payment plugins (e.g. PayPal) hide the core submit button and render their own
    if (this.cfg.features.orderPlacement) await expect(this.submitButton).toBeVisible();
  }

  /** The order can be handed off: core submit button visible, or a payment plugin rendered its own buttons. */
  async expectPaymentReady(): Promise<void> {
    await expect(this.$(`${this.s.checkout.paymentMethod}:checked`)).toHaveCount(1);
    await expect(
      this.submitButton.locator('visible=true').or(this.$(this.s.checkout.paymentButtons)).first(),
    ).toBeAttached();
  }

  async selectPaymentMethod(label: string): Promise<void> {
    if (this.s.checkout.paymentReveal) {
      // stepped checkout: the labels sit in a collapsed step → choose by the method's value
      await this.revealPayment();
      const method = (await this.paymentMethods()).find((m) => new RegExp(escapeRegExp(label), 'i').test(m.label));
      expect(method, `payment method "${label}" not offered`).toBeTruthy();
      if (!method!.checked) await this.choosePayment(method!.value);
      return;
    }
    const lbl = this.$(this.s.checkout.paymentMethodLabel).filter({ hasText: new RegExp(escapeRegExp(label), 'i') }).first();
    await Promise.all([this.page.waitForLoadState('domcontentloaded'), lbl.click()]);
  }

  async selectShippingMethod(label: string): Promise<void> {
    const lbl = this.$(this.s.checkout.shippingMethodLabel).filter({ hasText: new RegExp(escapeRegExp(label), 'i') }).first();
    await Promise.all([this.page.waitForLoadState('domcontentloaded'), lbl.click()]);
  }

  async acceptTerms(): Promise<void> {
    if (!this.s.checkout.tos) return; // accepted by placing the order
    const tos = this.$(this.s.checkout.tos).first();
    if (!(await tos.count())) return;
    // Shopware JS can re-render the confirm page right after load and drop the
    // checked state → wait for load and retry until the checkbox stays checked.
    await this.page.waitForLoadState('load');
    await expect(async () => {
      if (!(await tos.isChecked())) await tos.check();
      await expect(tos).toBeChecked({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  }

  /** Accepts TOS, applies configured payment/shipping, places the order. Returns the order number if shown. */
  async placeOrder(): Promise<string | undefined> {
    const { paymentMethod, shippingMethod } = this.cfg.testData;
    if (shippingMethod) await this.selectShippingMethod(shippingMethod);
    if (paymentMethod) await this.selectPaymentMethod(paymentMethod);
    // stepped checkout: the order button is enabled once the payment step is open
    await this.revealPayment();
    await this.acceptTerms();
    await expect(this.submitButton, 'order button stays disabled').toBeEnabled();
    await Promise.all([
      this.page.waitForURL(new RegExp(escapeRegExp(this.cfg.routes.checkoutFinish)), { timeout: 45_000 }),
      this.submitButton.click(),
    ]);
    const nr = this.$(this.s.checkout.finishOrderNumber).first();
    return (await nr.count()) ? (await nr.innerText()).replace(/\D+/g, ' ').trim().split(' ').pop() : undefined;
  }

  // ---------- totals & line items (confirm page uses the same aside as the cart) ----------
  async lineSummary(): Promise<string[]> {
    return this.lineSummaryOf(this.lineItems);
  }

  async lineTotalOf(name: string): Promise<number> {
    const line = this.lineItems.filter({ hasText: name }).first();
    return parsePrice(await line.locator(this.s.cart.lineItemTotal).first().innerText());
  }

  async totalValue(): Promise<number> {
    return parsePrice(await this.$(this.s.cart.summaryTotal).first().innerText());
  }

  // ---------- payment / shipping selection by value (label texts are shop specific) ----------
  private async methods(input: string): Promise<MethodOption[]> {
    return this.$(input).evaluateAll((els) =>
      (els as HTMLInputElement[]).map((i) => {
        const label = document.querySelector(`label[for="${i.id}"]`);
        return {
          value: i.value,
          checked: i.checked,
          label: (label?.textContent ?? '').replace(/\s+/g, ' ').trim(),
          visible: !!label && label.getClientRects().length > 0 && getComputedStyle(label).visibility !== 'hidden',
        };
      }),
    );
  }

  paymentMethods(): Promise<MethodOption[]> {
    return this.methods(this.s.checkout.paymentMethod);
  }

  shippingMethods(): Promise<MethodOption[]> {
    return this.methods(this.s.checkout.shippingMethod);
  }

  /** Opens the payment step of stepped checkout themes (selectors.checkout.paymentReveal). */
  async revealPayment(): Promise<void> {
    if (!this.s.checkout.paymentReveal) return;
    const reveal = this.$(this.s.checkout.paymentReveal).locator('visible=true').first();
    if (await reveal.count()) await reveal.click();
  }

  async selectedPayment(): Promise<string | undefined> {
    return (await this.paymentMethods()).find((m) => m.checked)?.value;
  }

  async selectedShipping(): Promise<string | undefined> {
    return (await this.shippingMethods()).find((m) => m.checked)?.value;
  }

  /** Selecting a method auto-submits to /checkout/configure and reloads the confirm page. */
  private async choose(input: string, value: string): Promise<void> {
    const radio = this.$(`${input}[value="${value}"]`).first();
    const id = await radio.getAttribute('id');
    await Promise.all([
      this.page.waitForResponse((r) => r.url().includes('/checkout/configure') && r.request().method() === 'POST'),
      this.$(`label[for="${id}"]`).first().click(),
    ]);
    await this.page.waitForLoadState('load');
    await expect(this.$(`${input}[value="${value}"]`).first()).toBeChecked();
  }

  async choosePayment(value: string): Promise<void> {
    await this.revealPayment();
    return this.choose(this.s.checkout.paymentMethod, value);
  }

  chooseShipping(value: string): Promise<void> {
    return this.choose(this.s.checkout.shippingMethod, value);
  }

  get finishHeader(): Locator {
    return this.$(this.s.checkout.finishHeader).first();
  }
}
