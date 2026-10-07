import { test, expect, skipUnless } from '../../src/fixtures';

test.describe('Cookie consent', () => {
  test.use({ acceptCookies: false });

  test.beforeEach(({ cfg }) => skipUnless(cfg.features.cookieBanner, 'cookieBanner'));

  test('banner is shown to new visitors and remembered after choice', { tag: ['@smoke', '@mobile'] }, async ({ page, cfg, cookieBanner, context }) => {
    await page.goto(cfg.routes.home);
    await expect(cookieBanner.banner).toBeVisible();

    await cookieBanner.acceptOnlyNecessary();
    await expect(cookieBanner.banner).toBeHidden();

    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'cookie-preference')?.value).toBe('1');

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

  test('a custom cookie configuration is remembered', async ({ page, cfg, cookieBanner, context }) => {
    const s = cfg.selectors.cookie;
    await page.goto(cfg.routes.home, { waitUntil: 'load' });
    await page.locator(s.configure).locator('visible=true').first().click();
    await expect(page.locator(s.configureSubmit).first()).toBeVisible(); // dialog fully open
    const items = page.locator(s.configureItem);
    await expect(items.first(), 'no optional cookies to choose in the dialog').toBeAttached();
    const names = await items.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).dataset.cookie!));
    test.skip(names.length < 2, 'Need at least two optional cookies to test a partial choice');

    // expand the collapsed groups like a visitor would, then tick exactly one optional cookie
    for (const toggle of await page.locator(s.configureGroupToggle).all()) {
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    }
    const [chosen, ...others] = names;
    for (const other of others) await expect(page.locator(`${s.configureItem}[data-cookie="${other}"]`), `"${other}" is pre-selected`).not.toBeChecked();
    const box = page.locator(`${s.configureItem}[data-cookie="${chosen}"]`);
    await expect(box).toBeVisible();
    await box.check();
    await page.locator(s.configureSubmit).first().click();
    await expect(cookieBanner.banner).toBeHidden();

    const jarNow = async () => Object.fromEntries((await context.cookies()).map((c) => [c.name, c.value]));
    const check = async () => {
      // the shop writes the consent cookies a moment after the dialog closes
      await expect.poll(async () => (await jarNow())['cookie-preference'], { message: 'consent not stored', timeout: 5_000 }).toBe('1');
      const jar = await jarNow();
      expect(jar[chosen], `chosen cookie "${chosen}" not stored`).toBe('1');
      for (const other of others) expect(jar[other], `"${other}" was set although not chosen`).toBeUndefined();
    };
    await check();
    await page.reload({ waitUntil: 'load' });
    await expect(cookieBanner.banner).toBeHidden();
    await check();
    const tab = await context.newPage();
    await tab.goto(cfg.testData.listingCategoryPath, { waitUntil: 'load' });
    await expect(tab.locator(s.banner)).toBeHidden();
  });
});
