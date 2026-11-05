import { test, expect } from '../../src/fixtures';

test.describe('Legal pages & footer', () => {
  test('mandatory legal pages are linked in the footer and load', { tag: '@smoke' }, async ({ page, request, cfg }) => {
    const required = cfg.testData.legalLinks;
    test.skip(!required?.length, 'No testData.legalLinks configured for this shop');
    await page.goto(cfg.routes.home);

    for (const text of required!) {
      const link = page.locator(cfg.selectors.footer.link).filter({ hasText: text }).first();
      // soft: report every missing/empty legal page, not only the first
      await expect.soft(link, `footer link ${text} missing`).toBeAttached();
      if (!(await link.count())) continue;
      const url = new URL((await link.getAttribute('href'))!, cfg.baseURL).href;
      const res = await request.get(url);
      expect.soft(res.status(), `${text} → ${url}`).toBe(200);
      // a real page, not an empty CMS shell
      const body = (await res.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
      const main = body.match(/<main[\s\S]*?<\/main>/)?.[0] ?? body;
      const words = main.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length;
      expect.soft(words, `${text} → ${url} has almost no content (${words} words)`).toBeGreaterThan(50);
    }
  });
});
