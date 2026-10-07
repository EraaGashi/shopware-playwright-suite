import { test, expect, skipUnless } from '../../src/fixtures';
import type { Locator, Page } from '@playwright/test';

/** Picks the language option in the header switcher whose label is (or is not) the given language code. */
async function switchTo(page: Page, form: Locator, code: string, opts: { not?: boolean } = {}): Promise<void> {
  const label = new RegExp(`^\\s*${code}\\b`, 'i');
  const options = form.locator('button[name="languageId"], label:has(input[name="languageId"])');
  const target = (opts.not ? options.filter({ hasNotText: label }) : options.filter({ hasText: label })).first();
  await expect(target, `no language option ${opts.not ? 'other than' : 'for'} "${code}"`).toBeAttached();
  // options often sit in a collapsed dropdown → open it with the form's own toggle first
  if (!(await target.isVisible())) await form.locator('button:not([name="languageId"]), [data-bs-toggle]').locator('visible=true').first().click();
  await Promise.all([page.waitForEvent('load'), target.click()]);
}

test.describe('Language switch', () => {
  test.beforeEach(({ cfg }) => skipUnless(cfg.features.languageSwitch, 'languageSwitch'));

  test('switching language changes the page language and can be switched back', { tag: '@smoke' }, async ({ page, cfg }) => {
    await page.goto(cfg.routes.home, { waitUntil: 'load' });
    const html = page.locator('html');
    const original = ((await html.getAttribute('lang')) ?? '').slice(0, 2).toLowerCase();
    expect(original, '<html lang> is missing').not.toBe('');
    const form = () => page.locator(cfg.selectors.header.languageForm).locator('visible=true').first();

    await switchTo(page, form(), original, { not: true });
    await expect(html).not.toHaveAttribute('lang', new RegExp(`^${original}`, 'i'));
    const switched = (await html.getAttribute('lang')) ?? '';

    await switchTo(page, form(), original);
    await expect(html, `could not switch back from ${switched}`).toHaveAttribute('lang', new RegExp(`^${original}`, 'i'));
  });
});
