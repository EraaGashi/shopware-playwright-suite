import { test, expect, skipUnless } from '../../src/fixtures';

test.describe('Cookie consent', () => {
  test.use({ acceptCookies: false });

  test.beforeEach(({ cfg }) => skipUnless(cfg.features.cookieBanner, 'cookieBanner'));

  test('banner is shown to new visitors and remembered after choice', { tag: '@smoke' }, async ({ page, cfg, cookieBanner, context }) => {
    await page.goto(cfg.routes.home);
    await expect(cookieBanner.banner).toBeVisible();

    await cookieBanner.acceptOnlyNecessary();
    await expect(cookieBanner.banner).toBeHidden();

    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'cookie-preference')?.value).toBe('1');

    // Shopware writes cookie-config-hash a moment after the click — reloading before that brings the banner back
    // (not every shop sets it → give up after 5 s, the assertion below decides)
    await expect.poll(async () => (await context.cookies()).some((c) => c.name === 'cookie-config-hash'), { timeout: 5_000 }).toBe(true).catch(() => undefined);
    await page.reload();
    await expect(cookieBanner.banner).toBeHidden();
  });

  test('"accept all" is remembered after reload and in a new tab', async ({ page, cfg, cookieBanner, context }) => {
    const s = cfg.selectors.cookie;
    await page.goto(cfg.routes.home, { waitUntil: 'load' });
    await expect(cookieBanner.banner).toBeVisible();
    // on the banner, or inside the "Configure" dialog
    const onBanner = page.locator(s.acceptAll).locator('visible=true').first();
    if (await onBanner.count()) {
      await onBanner.click();
    } else {
      await page.locator(s.configure).locator('visible=true').first().click();
      const inDialog = page.locator(s.configureAcceptAll).first();
      await inDialog.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
      test.skip(!(await inDialog.isVisible()), 'Shop offers no "accept all" option (banner or dialog)');
      await inDialog.click();
    }
    await expect(cookieBanner.banner).toBeHidden();
    await expect.poll(async () => (await context.cookies()).find((c) => c.name === 'cookie-preference')?.value, { timeout: 5_000 }).toBe('1');

    await page.reload({ waitUntil: 'load' });
    await expect(cookieBanner.banner).toBeHidden();
    const tab = await context.newPage();
    await tab.goto(cfg.routes.home, { waitUntil: 'load' });
    await expect(tab.locator(s.banner)).toBeHidden();
  });
});
