import { expect, Locator, Page } from '@playwright/test';
import { headerLocators } from '@resources/locators/storefront/header.locators';

export class HeaderCart {
  readonly page: Page;
  readonly cartLink: Locator;
  readonly cartBadge: Locator;
  readonly offcanvasViewCartLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.cartLink = page.locator(headerLocators.cartLink);
    this.cartBadge = page.locator(headerLocators.cartBadge);
    this.offcanvasViewCartLink = page.getByRole('link', {
      name: headerLocators.offcanvasViewCartLinkText,
    });
  }

  /**
   * Clicking the header cart icon opens an off-canvas mini-cart rather than
   * navigating directly to /checkout/cart, so opening the full cart page
   * requires following through with the mini-cart's "view cart" link.
   */
  async open(): Promise<void> {
    // The cart icon's click handler is (re-)bound asynchronously after the
    // header widget re-renders, so the first click can occasionally be a
    // no-op; retry until the mini-cart actually opens.
    await expect(async () => {
      await this.cartLink.click();
      await this.offcanvasViewCartLink.waitFor({ state: 'visible', timeout: 3000 });
    }).toPass({ timeout: 15000 });

    await this.offcanvasViewCartLink.click();
  }

  async expectItemCount(expectedCount: number): Promise<void> {
    await expect(this.cartBadge).toHaveText(String(expectedCount));
  }

  async isBadgeVisible(): Promise<boolean> {
    return this.cartBadge.isVisible();
  }
}
