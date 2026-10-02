import { expect, type Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export interface ContactData {
  salutationIndex?: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  subject?: string;
  comment?: string;
}

/** CMS contact form element (form[action$="/form/contact"]). */
export class ContactPage extends BasePage {
  get form(): Locator {
    return this.$(this.s.contact.form).first();
  }

  /** Opens the configured contact page, or discovers it via the footer link text. */
  async open(): Promise<void> {
    if (this.cfg.routes.contactPage) {
      await this.goto(this.cfg.routes.contactPage);
    } else {
      await this.goto(this.cfg.routes.home);
      const link = this.$(this.s.footer.link).filter({ hasText: this.cfg.testData.contactLinkText }).first();
      await this.clickAndLoad(link);
    }
    await expect(this.form).toBeVisible();
  }

  async fill(d: ContactData): Promise<void> {
    const c = this.s.contact;
    const f = this.form;
    if (d.salutationIndex !== undefined && (await f.locator(c.salutation).count()))
      await f.locator(c.salutation).selectOption({ index: d.salutationIndex });
    const pairs: [string, string | undefined][] = [
      [c.firstName, d.firstName],
      [c.lastName, d.lastName],
      [c.email, d.email],
      [c.phone, d.phone],
      [c.subject, d.subject],
      [c.comment, d.comment],
    ];
    for (const [sel, val] of pairs) {
      // hidden fields are preset by the theme (e.g. lastName="-" when only one name field is shown)
      if (val !== undefined && (await f.locator(sel).first().isVisible())) await f.locator(sel).first().fill(val);
    }
  }

  async submit(): Promise<void> {
    await this.form.locator(this.s.contact.submit).first().click();
  }

  get invalidFields(): Locator {
    return this.form.locator(this.s.page.invalidField);
  }

  /** Inline invalid fields or the AJAX error alert rendered into the CMS element. */
  get validationErrors(): Locator {
    return this.invalidFields.or(this.page.locator(`.cms-element-form ${this.s.page.alertDanger}`)).locator('visible=true');
  }
}
