import { expect, type Locator } from '@playwright/test';
import { BasePage } from '../pages/BasePage';
import { parsePrice } from '../utils/price';

export class Header extends BasePage {
  /** Themes may render separate desktop/mobile headers → always target the visible copy. */
  private visible(selector: string): Locator {
    return this.$(selector).locator('visible=true').first();
  }

  get logo(): Locator {
    return this.visible(this.s.header.logo);
  }
  get searchInput(): Locator {
    return this.visible(this.s.header.searchInput);
  }
  get cartButton(): Locator {
    return this.visible(this.s.header.cart);
  }
  get accountButton(): Locator {
    return this.visible(this.s.header.accountButton);
  }
  get wishlistButton(): Locator {
    return this.visible(this.s.header.wishlist);
  }

  /** On mobile the search field is collapsed behind a toggle button. */
  async ensureSearchVisible(): Promise<void> {
    if (await this.searchInput.isVisible()) return;
    await this.$(this.s.header.searchToggle).locator('visible=true').first().click();
    await expect(this.searchInput).toBeVisible();
  }

  async search(term: string): Promise<void> {
    await this.ensureSearchVisible();
    await this.searchInput.fill(term);
    await Promise.all([
      this.page.waitForURL(/\/search\?/),
      this.searchInput.press('Enter'),
    ]);
  }

  /** Types into the search field and waits for the suggest dropdown. */
  async typeSearchSuggest(term: string): Promise<Locator> {
    await this.ensureSearchVisible();
    await this.searchInput.click();
    await this.waitForXhr('/suggest', () => this.searchInput.pressSequentially(term, { delay: 40 }));
    const suggest = this.$(this.s.header.searchSuggest);
    await expect(suggest).toBeVisible();
    return suggest;
  }

  async cartTotal(): Promise<number> {
    // textContent: the total is visually hidden on mobile (innerText would be empty)
    const text = (await this.$(this.s.header.cartTotal).first().textContent()) ?? '';
    // some themes only expose the total in an aria label ("contains 2 items … €99.99") → last number wins
    const value = parsePrice(text.match(/\d[\d.,]*/g)?.pop() ?? '');
    return Number.isNaN(value) ? 0 : value;
  }

  async cartBadgeCount(): Promise<number> {
    const badge = this.visible(this.s.header.cartBadge);
    if (!(await badge.isVisible())) return 0;
    return parseInt((await badge.innerText()).trim(), 10) || 0;
  }

  async openAccountMenu(): Promise<Locator> {
    await this.accountButton.click();
    // themes with separate desktop / mobile account widgets: the dropdown of the visible one
    const dd = this.$(this.s.header.accountDropdown).locator('visible=true').first();
    await expect(dd).toBeVisible();
    return dd;
  }

  async openCart(): Promise<void> {
    await this.waitForXhr('/checkout/offcanvas', () => this.cartButton.click());
    await expect(this.$(this.s.offcanvasCart.root)).toBeVisible();
  }
}
