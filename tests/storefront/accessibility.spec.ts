import { test, expect } from '../../src/fixtures';
import type { Locator } from '@playwright/test';
import type { ResolvedConfig } from '../../src/config/types';
import { withoutReportedBugs } from '../../src/utils/reported-bugs';
import { closePopups } from '../../src/utils/popups';

/** Representative page types: CMS home, listing, product detail. */
const keyPages = (cfg: ResolvedConfig) => [cfg.routes.home, cfg.testData.listingCategoryPath, cfg.testData.simpleProduct.path];

test.describe('Accessibility', () => {

  test('images have an alt attribute', async ({ page, cfg }, testInfo) => {
    // alt="" is fine (decorative); a missing alt makes screen readers read the file name
    for (const path of keyPages(cfg)) {
      await page.goto(path, { waitUntil: 'load' });
      const missing = await page.locator('img:not([alt])').evaluateAll((imgs) =>
        (imgs as HTMLImageElement[]).filter((i) => i.getClientRects().length > 0).map((i) => i.currentSrc || i.src),
      );
      expect.soft(withoutReportedBugs(missing, cfg.reportedBugs?.imagesWithoutAlt, testInfo), `${path}: visible images without alt attribute`).toEqual([]);
    }
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
    await closePopups(auth.page, cfg);
    expect.soft(await unlabelled(auth.loginForm), 'login form fields without accessible name').toEqual([]);
    if (cfg.features.registration) {
      await auth.openRegistration();
      await closePopups(auth.page, cfg);
      expect.soft(await unlabelled(auth.registerForm), 'registration fields without accessible name').toEqual([]);
    }
  });
});
