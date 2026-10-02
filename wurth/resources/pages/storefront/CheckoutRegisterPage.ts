import { expect, Locator, Page } from '@playwright/test';
import { checkoutLocators } from '@resources/locators/storefront/checkout.locators';
import { common } from '@resources/variables/common';

export class CheckoutRegisterPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginSubmitButton: Locator;
  readonly createAccountLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator(checkoutLocators.loginUsernameInput);
    this.passwordInput = page.locator(checkoutLocators.loginPasswordInput);
    this.loginSubmitButton = page.getByRole('button', {
      name: checkoutLocators.loginSubmitButtonText,
      exact: true,
    });
    this.createAccountLink = page.getByRole('link', {
      name: checkoutLocators.createAccountLinkText,
    });
  }

  async expectAuthenticationGateReached(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`${common.routes.checkoutRegister}$`));
  }

  async expectLoginFormDisplayed(): Promise<void> {
    await expect(this.usernameInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.loginSubmitButton).toBeVisible();
  }

  async expectCreateAccountOptionAvailable(): Promise<void> {
    await expect(this.createAccountLink.first()).toBeVisible();
  }

  async expectNoGuestCheckoutOption(): Promise<void> {
    const guestCheckoutControl = this.page.getByRole('button', { name: /guest|mysafir/i })
      .or(this.page.getByRole('link', { name: /guest|mysafir/i }));
    await expect(guestCheckoutControl).toHaveCount(0);
  }
}
