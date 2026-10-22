import { expect, type Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class AccountPage extends BasePage {
  get asideItems(): Locator {
    return this.$(this.s.account.asideItem);
  }

  async open(): Promise<void> {
    await this.goto(this.cfg.routes.account);
    await this.expectPath(this.cfg.routes.account);
  }

  async openProfile(): Promise<void> {
    await this.goto(this.cfg.routes.accountProfile);
    await expect(this.$(this.s.account.profileForm)).toBeVisible();
  }

  async updateName(firstName: string, lastName: string): Promise<void> {
    await this.$(this.s.account.profileFirstName).fill(firstName);
    await this.$(this.s.account.profileLastName).fill(lastName);
    await Promise.all([
      this.page.waitForLoadState('domcontentloaded'),
      this.$(this.s.account.profileSubmit).first().click(),
    ]);
  }

  async openAddresses(): Promise<void> {
    await this.goto(this.cfg.routes.accountAddresses);
    await this.expectPath(this.cfg.routes.accountAddresses);
  }

  async openOrders(): Promise<void> {
    await this.goto(this.cfg.routes.accountOrders);
    await this.expectPath(this.cfg.routes.accountOrders);
  }

  /** Submits the change-password form of the profile page. */
  async changePassword(current: string, next: string): Promise<void> {
    await this.goto(this.cfg.routes.accountProfile);
    const form = this.$(this.s.account.passwordForm).first();
    // the form may sit in a collapsed section → fill via the fields, submit via the form's button
    await form.locator(this.s.account.passwordNew).fill(next);
    await form.locator(this.s.account.passwordNewConfirm).fill(next);
    await form.locator(this.s.account.passwordCurrent).fill(current);
    await Promise.all([this.page.waitForLoadState('domcontentloaded'), form.locator('button[type="submit"]').first().click()]);
  }

  async openAddressCreate(): Promise<Locator> {
    await this.goto(`${this.cfg.routes.accountAddresses}/create`);
    const form = this.$(this.s.account.addressForm).first();
    await expect(form).toBeVisible();
    return form;
  }

  get orders(): Locator {
    return this.$(this.s.account.orderItem);
  }

  get successAlert(): Locator {
    return this.$(this.s.page.alertSuccess).first();
  }

  async logout(): Promise<void> {
    await this.goto(this.cfg.routes.logout);
  }
}
