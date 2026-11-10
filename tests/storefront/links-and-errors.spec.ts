import { test, expect } from '../../src/fixtures';
import { loadConfig } from '../../src/config/loader';
import { withoutReportedBugs } from '../../src/utils/reported-bugs';

test.describe('Important links & redirects', () => {
  test('important pages respond without error', { tag: '@smoke' }, async ({ request, cfg }) => {
    const failures: string[] = [];
    for (const path of cfg.importantLinks) {
      const res = await request.get(path);
      if (res.status() >= 400) failures.push(`${path} → ${res.status()}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  for (const rule of loadConfig().redirects) {
    test(`redirect ${rule.from} → ${rule.to}`, async ({ page }) => {
      await page.goto(rule.from);
      await expect(page).toHaveURL(new RegExp(rule.to));
    });
  }

  test('header and footer links on the homepage are not broken', async ({ page, request, cfg }, testInfo) => {
    test.slow(); // up to 60 requests one after another — slow staging servers need the extra time
    await page.goto(cfg.routes.home);
    const hrefs = await page
      .locator(`${cfg.selectors.header.root} a[href], ${cfg.selectors.footer.root} a[href]`)
      // getAttribute: SVG <a> elements expose href as SVGAnimatedString, not a string
      .evaluateAll((as) => as.map((a) => new URL(a.getAttribute('href') ?? '', document.baseURI).href));
    const origin = new URL(cfg.baseURL).origin;
    const internal = withoutReportedBugs([...new Set(hrefs)].filter((h) => h.startsWith(origin) && !h.includes('/account/logout')), cfg.reportedBugs?.brokenLinks, testInfo).slice(0, 60);
    const broken: string[] = [];
    for (const href of internal) {
      const res = await request.get(href, { maxRedirects: 5 });
      if (res.status() >= 400) broken.push(`${href} → ${res.status()}`);
    }
    expect(broken, broken.join('\n')).toEqual([]);
  });
});

test.describe('Error handling', () => {
  test('unknown URL shows a 404 page with a way back', { tag: '@smoke' }, async ({ page, cfg }) => {
    const res = await page.goto(`/e2e-not-existing-${Date.now()}`);
    expect(res?.status()).toBe(404);
    await expect(page.locator(cfg.selectors.error.body)).toBeAttached();
    await expect(page.locator(cfg.selectors.header.logo).locator('visible=true').first()).toBeVisible();
    await expect(page.locator(cfg.selectors.error.backToShop).first()).toBeVisible();
  });
});
