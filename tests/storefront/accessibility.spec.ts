import { test, expect } from '../../src/fixtures';
import type { Locator } from '@playwright/test';
import type { ResolvedConfig } from '../../src/config/types';

/** Representative page types: CMS home, listing, product detail. */
const keyPages = (cfg: ResolvedConfig) => [cfg.routes.home, cfg.testData.listingCategoryPath, cfg.testData.simpleProduct.path];

test.describe('Accessibility', () => {
  test('page language matches the configured storefront locale', async ({ page, cfg }) => {
    // risk: wrong lang → screen readers pronounce the whole shop in the wrong language
    await page.goto(cfg.routes.home);
    const lang = ((await page.locator('html').getAttribute('lang')) ?? '').toLowerCase();
    expect(lang.split('-')[0], `<html lang="${lang}"> vs. locale ${cfg.locale}`).toBe(cfg.locale.toLowerCase().split('-')[0]);
  });

  test('images have an alt attribute', async ({ page, cfg }) => {
    // alt="" is fine (decorative); a missing alt makes screen readers read the file name
    for (const path of keyPages(cfg)) {
      await page.goto(path, { waitUntil: 'load' });
      const missing = await page.locator('img:not([alt])').evaluateAll((imgs) =>
        (imgs as HTMLImageElement[]).filter((i) => i.getClientRects().length > 0).map((i) => i.currentSrc || i.src),
      );
      expect.soft(missing, `${path}: visible images without alt attribute`).toEqual([]);
    }
  });

  test('header controls have accessible names', { tag: '@mobile' }, async ({ page, cfg, header }) => {
    // risk: icon-only buttons (cart, account …) are announced as "button" without purpose
    await page.goto(cfg.routes.home);
    const controls = [
      ['logo link', header.logo],
      ['cart button', header.cartButton],
      ['account button', header.accountButton],
      ...(cfg.features.wishlist ? ([['wishlist link', header.wishlistButton]] as const) : []),
    ] as const;
    for (const [name, control] of controls) {
      // not shown at this viewport (e.g. wishlist inside the burger menu) → visibility is the homepage test's job
      if (!(await control.count())) {
        test.info().annotations.push({ type: 'not shown at this viewport', description: name });
        continue;
      }
      // selectors may match a wrapper (<div class="header-cart">) → check the link/button itself
      const isInteractive = await control.evaluate((el) => ['A', 'BUTTON', 'INPUT'].includes(el.tagName));
      const target = isInteractive ? control : control.locator('a, button').first();
      await expect.soft(target, name).toHaveAccessibleName(/\S/);
    }
    const burger = page.locator(cfg.selectors.header.mobileMenuToggle).locator('visible=true').first();
    if (await burger.count()) await expect.soft(burger, 'mobile menu button').toHaveAccessibleName(/\S/);
  });

  test('login and registration fields are labelled', async ({ cfg, auth }) => {
    // risk: inputs without label/aria-label are unusable with a screen reader
    const unlabelled = async (form: Locator) => {
      const fields = await form.locator('input:not([type="hidden"]):not([type="submit"]), select, textarea').locator('visible=true').all();
      const names: string[] = [];
      for (const f of fields) {
        const ok = await expect(f).toHaveAccessibleName(/\S/, { timeout: 500 }).then(() => true, () => false);
        if (!ok) names.push((await f.getAttribute('name')) ?? (await f.getAttribute('id')) ?? '(no name)');
      }
      return names;
    };
    await auth.open();
    expect.soft(await unlabelled(auth.loginForm), 'login form fields without accessible name').toEqual([]);
    if (cfg.features.registration) {
      await auth.openRegistration();
      expect.soft(await unlabelled(auth.registerForm), 'registration fields without accessible name').toEqual([]);
    }
  });

  test('skip link is the first tab stop and leads to the main content', async ({ page, cfg }) => {
    // risk: keyboard users must tab through the whole mega menu on every page
    await page.goto(cfg.routes.home, { waitUntil: 'load' });
    const skip = page.locator(cfg.selectors.page.skipLink).first();
    await expect(skip, 'no skip link').toBeAttached();
    const target = (await skip.getAttribute('href')) ?? '';
    await expect(page.locator(target), `skip link target ${target} missing`).toHaveCount(1);
    await page.locator('body').focus();
    await page.keyboard.press('Tab');
    await expect(skip, 'first Tab does not reach the skip link').toBeFocused();
    await expect(skip, 'focused skip link must become visible').toBeVisible();
  });
});
