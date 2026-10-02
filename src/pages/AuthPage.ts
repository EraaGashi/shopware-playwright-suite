import { expect, type Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import type { TestCustomer } from '../data/customer';

/**
 * Login + registration forms. Used on /account/login and /checkout/register
 * (checkout variant additionally offers guest checkout).
 */
export class AuthPage extends BasePage {
  get loginForm(): Locator {
    return this.$(this.s.login.form).first();
  }
  get registerForm(): Locator {
    return this.$(this.s.register.form).first();
  }

  async open(): Promise<void> {
    await this.goto(this.cfg.routes.login);
    await expect(this.loginForm).toBeVisible();
  }

  // ---------------- login ----------------
  async login(email: string, password: string): Promise<void> {
    // On /checkout/register the login form is collapsed
    const toggle = this.$(this.s.login.collapseToggle).first();
    if ((await toggle.isVisible()) && !(await this.$(this.s.login.email).isVisible())) await toggle.click();

    await this.$(this.s.login.email).fill(email);
    await this.$(this.s.login.password).fill(password);
    await this.$(this.s.login.submit).click();
  }

  async loginAndExpectSuccess(email: string, password: string): Promise<void> {
    await this.login(email, password);
    await expect(this.page).not.toHaveURL(/\/account\/login/);
  }

  get loginError(): Locator {
    return this.loginForm.locator(this.s.page.alertDanger).or(this.$(`${this.s.page.main} ${this.s.page.alertDanger}`)).first();
  }

  // ---------------- registration ----------------
  /** Default Shopware renders the form on /account/login too, but some themes only on /account/register. */
  async openRegistration(): Promise<void> {
    await this.goto(this.cfg.routes.register);
    await this.revealRegistration();
  }

  /** Clicks the theme's "New customer" tab/collapse if the form is rendered but hidden. */
  async revealRegistration(): Promise<void> {
    const firstName = this.registerForm.locator(this.s.register.firstName).first();
    if (await firstName.isVisible()) return;
    const reveal = this.$(this.s.register.reveal).locator('visible=true').first();
    if (await reveal.count()) await reveal.click();
    await expect(firstName).toBeVisible();
  }

  async fillRegistration(c: TestCustomer, opts: { guest?: boolean } = {}): Promise<void> {
    const r = this.s.register;
    const form = this.registerForm;
    await this.revealRegistration();

    // /checkout/register: checkbox; /account/login: hidden input (value=1) → leave it alone
    const createAccount = form.locator(`${r.createAccount}[type="checkbox"]`);
    const guestToggle = form.locator(r.guestToggle);
    if (await createAccount.count()) {
      // checkout variant: checked = create account, unchecked = guest
      await createAccount.setChecked(!opts.guest, { force: true });
    } else if (await guestToggle.count()) {
      await guestToggle.setChecked(!!opts.guest, { force: true });
    }

    // project-specific fields (B2B forms), in order — later selects may depend on earlier ones
    for (const f of this.cfg.testData.customer.extraFields ?? []) {
      const value = f.value?.replace('{random}', () => String(Math.floor(1e8 + Math.random() * 9e8)));
      await this.setField(form.locator(f.selector).first(), value);
    }

    const salutation = form.locator(r.salutation);
    if (await salutation.isVisible()) await salutation.selectOption({ index: c.salutationIndex });

    await form.locator(r.firstName).fill(c.firstName);
    await form.locator(r.lastName).fill(c.lastName);
    await form.locator(r.email).fill(c.email);
    const mailConfirm = form.locator(r.emailConfirmation);
    if (await mailConfirm.isVisible()) await mailConfirm.fill(c.email);

    const pw = form.locator(r.password);
    if (!opts.guest && (await pw.isVisible())) {
      await pw.fill(c.password);
      const pwConfirm = form.locator(r.passwordConfirmation);
      if (await pwConfirm.isVisible()) await pwConfirm.fill(c.password);
    }

    await form.locator(r.street).fill(c.address.street);
    // some themes render zipcode / city as selects (e.g. a fixed list of postal codes)
    await this.setField(form.locator(r.zipcode).first(), c.address.zipcode);
    await this.setField(form.locator(r.city).first(), c.address.city);
    await this.selectCountry(form.locator(r.country).first(), c.address.countryLabel);
    const phone = form.locator(r.phone).first();
    if (c.address.phoneNumber && (await phone.isVisible())) await phone.fill(c.address.phoneNumber);

    const dp = form.locator(r.dataProtection);
    if (await dp.count()) await dp.check({ force: true });
  }

  /** Fills an input, or picks a select option by value/label (no value = first non-empty option). */
  private async setField(field: Locator, value?: string): Promise<void> {
    if (!(await field.evaluate((el) => el.tagName === 'SELECT'))) return field.fill(value ?? '');
    // disabled selects (e.g. a single preset option) are fixed by the shop — nothing to choose
    if (await field.evaluate((el) => (el as HTMLSelectElement).disabled || el.getAttribute('aria-disabled') === 'true')) return;
    const options = () =>
      field.locator('option').evaluateAll((os) =>
        os.map((o) => ({ value: (o as HTMLOptionElement).value, label: (o.textContent ?? '').trim() })),
      );
    // dependent selects are populated by JS after the previous field changed
    await expect.poll(async () => (await options()).some((o) => o.value !== ''), { timeout: 5_000 }).toBe(true);
    const all = await options();
    const match = all.find((o) => value !== undefined && (o.value === value || o.label === value)) ?? (value === undefined ? all.find((o) => o.value !== '') : undefined);
    if (!match) throw new Error(`No option "${value}" in select`);
    await field.selectOption(match.value);
  }

  private async selectCountry(select: Locator, label?: string): Promise<void> {
    if (!label || !(await select.isVisible())) return;
    const re = new RegExp(label, 'i');
    const values = await select.locator('option').evaluateAll((opts, src) => {
      const rx = new RegExp(src, 'i');
      return opts.filter((o) => rx.test(o.textContent ?? '')).map((o) => (o as HTMLOptionElement).value);
    }, re.source);
    if (values[0]) await select.selectOption(values[0]);
  }

  async submitRegistration(): Promise<void> {
    await this.registerForm.locator(this.s.register.submit).first().click();
  }

  async register(c: TestCustomer, opts: { guest?: boolean } = {}): Promise<void> {
    await this.fillRegistration(c, opts);
    await this.submitRegistration();
  }

  get invalidFields(): Locator {
    return this.registerForm.locator(this.s.page.invalidField);
  }

  /** Inline invalid fields (client/server validation) or an error alert on the page. */
  get validationErrors(): Locator {
    return this.invalidFields.or(this.page.locator(`${this.s.page.main} ${this.s.page.alertDanger}`)).locator('visible=true');
  }
}
