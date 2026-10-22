import { expect, type Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { parsePrice } from '../utils/price';
import type { ProductRef } from '../config/types';

export class ProductPage extends BasePage {
  get name(): Locator {
    return this.$(this.s.product.name).first();
  }
  get price(): Locator {
    return this.$(this.s.product.price).first();
  }
  get productNumber(): Locator {
    return this.$(this.s.product.productNumber).first();
  }
  get buyButton(): Locator {
    return this.$(this.s.product.buyButton).first();
  }
  get quantity(): Locator {
    return this.$(this.s.product.quantityInput).first();
  }
  get configuratorGroups(): Locator {
    return this.$(this.s.product.configuratorGroup);
  }

  async open(product: ProductRef | string): Promise<void> {
    await this.goto(typeof product === 'string' ? product : product.path);
    await expect(this.name).toBeVisible();
  }

  /** Product number without a label some themes prepend ("Art.-Nr. 0899970911" → "0899970911"). */
  async productNumberValue(): Promise<string> {
    // no product number shown: SEO URLs end with it (canonical link, else the current URL)
    if (!(await this.productNumber.count())) {
      const canonical = this.$('link[rel="canonical"]').first();
      const href = (await canonical.count()) ? await canonical.getAttribute('href') : null;
      return new URL(href ?? this.page.url()).pathname.replace(/\/$/, '').split('/').pop() ?? '';
    }
    return (await this.productNumber.innerText()).trim().split(/\s+/).pop() ?? '';
  }

  /**
   * Product data published for search engines: JSON-LD (Product) or schema.org microdata.
   * Fields are undefined when the shop doesn't publish them.
   */
  async structuredData(): Promise<{ source: string; name?: string; price?: number; currency?: string; availability?: string; url?: string }> {
    return this.page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const s of scripts) {
        let data: any;
        try { data = JSON.parse(s.textContent ?? ''); } catch { continue; }
        const nodes = ([] as any[]).concat(data, data?.['@graph'] ?? []);
        const p = nodes.find((n) => n && (n['@type'] === 'Product' || (Array.isArray(n['@type']) && n['@type'].includes('Product'))));
        if (!p) continue;
        const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers;
        return { source: 'json-ld', name: p.name, price: offer?.price !== undefined ? Number(offer.price) : undefined, currency: offer?.priceCurrency, availability: offer?.availability, url: offer?.url };
      }
      const scope = document.querySelector('[itemtype*="schema.org/Product"]');
      if (!scope) return { source: 'none' };
      const prop = (n: string) => scope.querySelector(`[itemprop="${n}"]`);
      const val = (n: string) => prop(n)?.getAttribute('content') ?? prop(n)?.getAttribute('href') ?? prop(n)?.textContent?.trim() ?? undefined;
      const price = val('price');
      return { source: 'microdata', name: val('name'), price: price !== undefined ? Number(price) : undefined, currency: val('priceCurrency'), availability: val('availability'), url: val('url') };
    });
  }

  async priceValue(): Promise<number> {
    return parsePrice(await this.price.innerText());
  }

  async setQuantity(qty: number): Promise<void> {
    await this.quantity.fill(String(qty));
  }

  async addToCart(qty?: number): Promise<void> {
    // themes without a quantity field add 1 per click → click qty times
    const hasQuantityField = (await this.quantity.count()) > 0;
    if (qty && hasQuantityField) await this.setQuantity(qty);
    const clicks = hasQuantityField ? 1 : (qty ?? 1);
    // On a cached page a new visitor has no session yet; the page's background requests create one.
    // Clicking before they finish can add the product to a session that is replaced a moment later
    // (cart then shows empty). Real visitors never click that fast → let them settle first.
    await this.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    for (let i = 0; i < clicks; i++) {
      // the off-canvas cart from the previous click covers the buy button
      if (i > 0) await this.closeOffcanvasCart();
      await this.waitForXhr('/checkout/offcanvas', () => this.buyButton.click());
    }
  }

  private async closeOffcanvasCart(): Promise<void> {
    const oc = this.$(this.s.offcanvasCart.root).first();
    await oc.locator(this.s.offcanvasCart.close).first().click();
    await expect(oc).toBeHidden();
  }

  /** Selected option id per configurator group (works for radio and <select> configurators). */
  async selectedOptions(): Promise<string[]> {
    const groups = await this.configuratorGroups.all();
    return Promise.all(
      groups.map(async (g) => {
        const select = g.locator('select');
        if (await select.count()) return select.first().inputValue();
        return (await g.locator(`${this.s.product.configuratorOptionInput}:checked`).first().getAttribute('value')) ?? '';
      }),
    );
  }

  /**
   * Selects another option in the given configurator group (by index).
   * Shopware reloads the page/URL for the new variant.
   */
  async switchVariant(groupIndex: number): Promise<{ before: string; after: string }> {
    const before = await this.productNumberValue();
    const group = this.configuratorGroups.nth(groupIndex);
    // some themes render each group as a <select> instead of radio buttons
    const select = group.locator('select');
    if (await select.count()) return this.switchVariantBySelect(select.first(), before);
    const options = group.locator(this.s.product.configuratorOptionInput);
    const count = await options.count();
    // some themes drop the is-combinable marker → then treat every enabled option as combinable
    const hasMarkers = (await group.locator(`${this.s.product.configuratorOptionInput}.is-combinable`).count()) > 0;
    for (let i = 0; i < count; i++) {
      const opt = options.nth(i);
      if ((await opt.isChecked()) || (await opt.isDisabled())) continue;
      const cls = (await opt.getAttribute('class')) ?? '';
      if (hasMarkers && !cls.includes('is-combinable')) continue;
      const id = await opt.getAttribute('id');
      await Promise.all([
        this.page.waitForURL((u) => !u.pathname.endsWith(before), { timeout: 15_000 }),
        this.page.locator(`label[for="${id}"]`).click(),
      ]);
      if (await this.productNumber.count()) await expect(this.productNumber).not.toContainText(before);
      return { before, after: await this.productNumberValue() };
    }
    throw new Error('No alternative combinable variant option found');
  }

  /** Shopware marks not combinable <option>s with a title ("This option is currently unavailable."). */
  private async switchVariantBySelect(select: Locator, before: string): Promise<{ before: string; after: string }> {
    const values = await select.locator('option').evaluateAll((os) =>
      (os as HTMLOptionElement[]).filter((o) => !o.selected && !o.disabled).map((o) => ({ value: o.value, combinable: !o.title })),
    );
    const target = values.find((o) => o.combinable) ?? values[0];
    if (!target) throw new Error('No alternative variant option found');
    await Promise.all([
      this.page.waitForURL((u) => !u.pathname.endsWith(before), { timeout: 15_000 }),
      select.selectOption(target.value),
    ]);
    if (await this.productNumber.count()) await expect(this.productNumber).not.toContainText(before);
    return { before, after: await this.productNumberValue() };
  }

  get wishlistButton(): Locator {
    return this.$(this.s.product.wishlistButton).first();
  }

  /** Guests may first have to accept the wishlist cookie in an off-canvas; then the click is repeated. */
  async addToWishlist(): Promise<void> {
    await this.wishlistButton.click();
    const accept = this.$(this.s.product.wishlistConsentAccept).first();
    const consentShown = await accept.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
    if (!consentShown) return;
    await accept.click();
    await expect(accept).toBeHidden();
    await this.wishlistButton.click();
  }
}
