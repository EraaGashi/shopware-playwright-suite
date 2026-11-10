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
    // themes without a salutation field keep it as a hidden input with a preset value → nothing to choose
    const salutation = f.locator(`select${c.salutation}`);
    if (d.salutationIndex !== undefined && (await salutation.count()))
      await salutation.selectOption({ index: d.salutationIndex });
    const pairs: [string, string | undefined][] = [
      [c.firstName, d.firstName],
      [c.lastName, d.lastName],
      [c.email, d.email],
      [c.phone, d.phone],
      [c.subject, d.subject],
      [c.comment, d.comment],
    ];
    for (const [sel, val] of pairs) {
      const field = f.locator(sel).first();
      // hidden fields are preset by the theme (e.g. lastName="-" when only one name field is shown)
      if (val === undefined || !(await field.isVisible())) continue;
      // some themes offer the subject as a dropdown of request types → pick the first real option
      if ((await field.evaluate((e) => e.tagName)) === 'SELECT') {
        const first = await field.locator('option:not([disabled])').evaluateAll((o) => (o as HTMLOptionElement[]).find((x) => x.value)?.value);
        if (first) await field.selectOption(first);
      } else await field.fill(val);
    }
    for (const x of this.cfg.testData.contactExtraFields ?? []) {
      const field = f.locator(x.selector).first();
      const kind = await field.evaluate((e) => (e.tagName === 'INPUT' ? (e as HTMLInputElement).type : e.tagName.toLowerCase()));
      if (kind === 'checkbox' || kind === 'radio') await field.check({ force: true });
      else if (kind === 'select') await field.selectOption(x.value ?? { index: 1 });
      else await field.fill(x.value ?? '');
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
