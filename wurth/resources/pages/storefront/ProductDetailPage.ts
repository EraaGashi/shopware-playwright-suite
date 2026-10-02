import { expect, Locator, Page } from '@playwright/test';
import { productLocators } from '@resources/locators/storefront/product.locators';
import { common } from '@resources/variables/common';
import { setQuantity } from '@lib/utils/forms';

export class ProductDetailPage {
  readonly page: Page;
  readonly title: Locator;
  readonly buyPanel: Locator;
  readonly quantityInput: Locator;
  readonly quantityMinus: Locator;
  readonly quantityPlus: Locator;
  readonly addToCartButton: Locator;
  readonly guestPrice: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.locator(productLocators.title);
    this.buyPanel = page.locator(productLocators.buyPanel);
    this.quantityInput = page.locator(productLocators.quantityInput);
    this.quantityMinus = page.locator(productLocators.quantityMinus);
    this.quantityPlus = page.locator(productLocators.quantityPlus);
    this.addToCartButton = page.locator(productLocators.addToCartButton);
    this.guestPrice = page.locator(productLocators.guestPrice);
  }

  async open(productPath: string): Promise<void> {
    await this.page.goto(productPath);
  }

  async expectDisplayed(): Promise<void> {
    await expect(this.title).toBeVisible();
    await expect(this.quantityInput).toBeVisible();
    await expect(this.addToCartButton).toBeVisible();
  }

  async expectTitle(expectedTitle: string): Promise<void> {
    await expect(this.title).toHaveText(expectedTitle);
  }

  async expectPriceHiddenForGuest(): Promise<void> {
    await expect(this.guestPrice).toHaveText(common.text.unauthenticatedPriceLabel);
  }

  async setQuantity(quantity: number): Promise<void> {
    await setQuantity(this.quantityInput, quantity);
  }

  async addToCart(): Promise<void> {
    // Add-to-cart is an AJAX submission; wait for its response so the header
    // cart badge/off-canvas are guaranteed to reflect the new item afterwards.
    await Promise.all([
      this.page.waitForResponse((response) => response.url().includes('/checkout/line-item/add')),
      this.addToCartButton.click(),
    ]);
    // The header cart widget re-renders after the add-to-cart response;
    // let it settle before interacting with it.
    await this.page.waitForLoadState('networkidle');
  }
}
