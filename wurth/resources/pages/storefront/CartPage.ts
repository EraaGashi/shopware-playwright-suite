import { expect, Locator, Page } from '@playwright/test';
import { cartLocators } from '@resources/locators/storefront/cart.locators';
import { common } from '@resources/variables/common';

export class CartPage {
  readonly page: Page;
  readonly container: Locator;
  readonly lineItems: Locator;
  readonly proceedToCheckoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator(cartLocators.container);
    this.lineItems = page.locator(cartLocators.lineItem);
    this.proceedToCheckoutButton = page.locator(cartLocators.proceedToCheckoutButton);
  }

  async expectDisplayed(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`${common.routes.cart}$`));
    await expect(this.container).toBeVisible();
  }

  async expectProductInCart(productName: string): Promise<void> {
    const lineItem = this.lineItems.filter({ hasText: productName });
    await expect(lineItem).toHaveCount(1);
  }

  async expectQuantity(productName: string, expectedQuantity: number): Promise<void> {
    const lineItem = this.lineItems.filter({ hasText: productName });
    const quantityInput = lineItem.locator(cartLocators.lineItemQuantityInput);
    await expect(quantityInput).toHaveValue(String(expectedQuantity));
  }

  async proceedToCheckout(): Promise<void> {
    await this.proceedToCheckoutButton.click();
  }
}
