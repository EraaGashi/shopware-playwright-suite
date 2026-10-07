import { test, expect } from '../../src/fixtures';

const SOCIAL_HOSTS = /(^|\.)(facebook|instagram|youtube|tiktok|linkedin|xing|x|twitter|pinterest)\.com$/;

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

  test('social media links point to the shop\'s own profiles', async ({ page, cfg }) => {
    await page.goto(cfg.routes.home);
    const hrefs = await page.locator(cfg.selectors.footer.link).evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    const social = hrefs.filter((h) => { try { return SOCIAL_HOSTS.test(new URL(h).hostname); } catch { return false; } });
    test.skip(social.length === 0, 'No social media links in the footer');
    // a bare network homepage ("https://www.youtube.com/") is a leftover placeholder, not the shop's profile
    const placeholders = social.filter((h) => new URL(h).pathname.replace(/\/+$/, '') === '');
    expect(placeholders, `social links without a profile/page:\n${placeholders.join('\n')}`).toEqual([]);
  });
});
