import { test, expect, skipUnless } from '../../src/fixtures';

test.describe('Contact form', () => {
  test.beforeEach(async ({ cfg, contact }) => {
    skipUnless(cfg.features.contactForm, 'contactForm');
    await contact.open();
  });

  test('empty submit shows validation errors', { tag: '@smoke' }, async ({ contact }) => {
    await contact.submit();
    // Shopware shows either inline field errors or a server-side alert list
    await expect(contact.validationErrors.first()).toBeVisible();
  });

  test('invalid e-mail is flagged', async ({ contact, cfg }) => {
    await contact.fill({ email: 'invalid@', firstName: 'E2E', lastName: 'Test' });
    await contact.submit();
    await expect(
      contact.form.locator(`${cfg.selectors.contact.email}${cfg.selectors.page.invalidField}`).or(contact.validationErrors).first(),
    ).toBeVisible();
  });

  test('valid submission shows a confirmation', async ({ page, cfg, contact, requireWriteAccess }) => {
    void requireWriteAccess;
    const c = cfg.testData.customer;
    await contact.fill({
      salutationIndex: c.salutationIndex,
      firstName: c.firstName,
      lastName: c.lastName,
      email: `${c.emailPrefix}.contact.${Date.now()}@${c.emailDomain}`,
      phone: '0123456789',
      subject: 'E2E test – please ignore',
      comment: 'Automated Playwright test message. Please ignore.',
    });
    await Promise.all([page.waitForResponse(/\/form\/contact/), contact.submit()]);
    await expect(page.locator(cfg.selectors.contact.success).first()).toBeVisible();
  });
});

test.describe('Newsletter', () => {
  test('newsletter form is present', async ({ page, cfg }) => {
    skipUnless(cfg.features.newsletter, 'newsletter');
    await page.goto(cfg.routes.home);
    await expect(page.locator('form[action*="newsletter"]').first()).toBeAttached();
  });

  test('newsletter rejects an invalid e-mail address', async ({ page, cfg }) => {
    skipUnless(cfg.features.newsletter, 'newsletter');
    await page.goto(cfg.routes.home, { waitUntil: 'load' });
    const form = page.locator(cfg.selectors.footer.newsletterForm).locator('visible=true').first();
    await form.locator('input[type="email"], input[name="email"]').first().fill('invalid@');
    await form.locator('button[type="submit"], button:not([type])').first().click();
    // native (:invalid), Shopware JS validation (.is-invalid / feedback) or a server error must stop it
    const s = cfg.selectors.page;
    await expect(
      form.locator(`input:invalid, ${s.invalidField}, ${s.invalidFeedback}`).locator('visible=true').first()
        .or(page.locator(s.alertDanger).locator('visible=true').first())
        .first(), // some shops show the field error and the alert together
    ).toBeVisible();
    await expect(page.locator(s.alertSuccess).locator('visible=true')).toHaveCount(0);
  });
});
