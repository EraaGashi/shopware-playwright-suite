import { test, expect } from '../../src/client/fixtures';
import { loadConfig } from '../../src/config/loader';

/** Configure in projects/<shop>.ts → client.seo */
const seo = loadConfig().client?.seo;

test.describe('Client: SEO', { tag: '@client' }, () => {
  test.skip(!seo, 'No client.seo configured');

  for (const p of seo?.pages ?? []) {
    test(`SEO basics on "${p.name}"`, async ({ page, cfg }) => {
      await page.goto(p.path);
      const meta = (sel: string) => page.locator(sel).first().getAttribute('content').catch(() => null);

      // soft: report every missing tag of the page at once
      expect.soft((await page.title()).trim(), 'title is empty').not.toBe('');
      await expect.soft(page.locator('h1'), 'exactly one <h1>').toHaveCount(1);

      const canonical = page.locator('link[rel="canonical"]');
      await expect.soft(canonical, 'exactly one canonical link').toHaveCount(1);
      const href = (await canonical.first().getAttribute('href').catch(() => null)) ?? '';
      expect.soft(href, 'canonical must be an absolute URL on the shop host').toMatch(/^https?:\/\//);
      if (href) expect.soft(new URL(href).host, 'canonical host').toBe(new URL(cfg.baseURL).host);

      expect.soft((await meta('meta[property="og:title"]'))?.trim(), 'og:title missing').toBeTruthy();
      if (seo!.requireMetaDescription !== false) {
        const description = (await meta('meta[name="description"]')) ?? '';
        expect.soft(description.trim().length, 'meta description missing or shorter than 20 chars').toBeGreaterThanOrEqual(20);
      }
      if (seo!.indexable !== false) {
        expect.soft((await meta('meta[name="robots"]')) ?? '', 'page is noindex').not.toMatch(/noindex/i);
      }
    });
  }

  for (const path of seo?.noindexPaths ?? []) {
    test(`"${path}" is noindex`, async ({ page }) => {
      await page.goto(path);
      const robots = (await page.locator('meta[name="robots"]').first().getAttribute('content').catch(() => null)) ?? '';
      expect(robots, `meta robots of ${path}`).toMatch(/noindex/i);
    });
  }
});
