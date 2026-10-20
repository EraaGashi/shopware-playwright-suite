import { test, expect } from '../../src/client/fixtures';
import { loadConfig } from '../../src/config/loader';

/** Configure in projects/<shop>.ts → client.headerLinks / client.footerLinks */
const { headerLinks = [], footerLinks = [] } = loadConfig().client ?? {};

test.describe('Client: header links', { tag: '@client' }, () => {
  test.skip(headerLinks.length === 0, 'No client.headerLinks configured');

  for (const l of headerLinks) {
    test(`header link "${l.name}" is shown and opens its page`, async ({ page, cfg }) => {
      await page.goto(cfg.routes.home);
      const link = page.locator(l.selector).locator('visible=true').first();
      await expect(link).toBeVisible();
      const href = (await link.getAttribute('href')) ?? '';
      if (typeof l.href === 'string') expect(href).toContain(l.href);
      else expect(href).toMatch(l.href);
      // the browser follows the link (plain HTTP requests may be blocked by bot protection)
      const res = await page.goto(new URL(href, cfg.baseURL).href);
      expect(res?.status(), `${href} status`).toBeLessThan(400);
    });
  }
});

test.describe('Client: footer links', { tag: '@client' }, () => {
  test.skip(footerLinks.length === 0, 'No client.footerLinks configured');

  for (const l of footerLinks) {
    test(`footer link "${l.name}" is shown and opens its page`, async ({ page, cfg }) => {
      await page.goto(cfg.routes.home);
      const link = page.locator(cfg.selectors.footer.root).locator('a', { hasText: l.text }).first();
      await expect(link).toBeAttached();
      const href = (await link.getAttribute('href')) ?? '';
      expect(href, 'footer link has no href').not.toBe('');
      const res = await page.goto(new URL(href, cfg.baseURL).href);
      expect(res?.status(), `${href} status`).toBeLessThan(400);
      await expect(page.locator('body')).not.toHaveClass(/is-ctl-error/);
    });
  }
});
