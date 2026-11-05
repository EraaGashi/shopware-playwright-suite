import { test, expect } from '../../src/fixtures';

test.describe('Homepage', () => {
  test('loads with header, navigation, content and footer', { tag: ['@smoke', '@mobile'] }, async ({ page, cfg, header }) => {
    const res = await page.goto(cfg.routes.home);
    expect(res?.status()).toBe(200);
    await expect(page.locator('body')).toHaveClass(/is-ctl-navigation/);
    await expect(header.logo).toBeVisible();
    await expect(
      header.searchInput.or(page.locator(cfg.selectors.header.searchToggle)).locator('visible=true').first(),
    ).toBeVisible();
    await expect(header.cartButton).toBeVisible();
    await expect(page.locator(cfg.selectors.footer.root).first()).toBeVisible();
    await expect(page.locator('.cms-page, .cms-section').first()).toBeVisible();
  });

  test('has no uncaught JavaScript errors', { tag: '@smoke' }, async ({ page, cfg }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(cfg.routes.home, { waitUntil: 'load' });
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
