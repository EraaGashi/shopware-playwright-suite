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
      const matches = page.locator(cfg.selectors.footer.root).locator('a', { hasText: l.text });
      const link = matches.first();
      await expect(link, `no footer link matching ${l.text} on ${page.url()}`).toBeAttached();
      const href = (await link.getAttribute('href')) ?? '';
      if (!href) {
        // which page and which element(s) the locator really found — an error / bot page or a second match is the usual cause
        const found = await matches.evaluateAll((els) =>
          els.map((e) => `${e.outerHTML.replace(/\s+/g, ' ').slice(0, 300)} (visible: ${e.checkVisibility()}, in: ${e.parentElement?.className || e.parentElement?.tagName})`));
        const where = `${page.url()} — "${await page.title()}", body class "${(await page.locator('body').getAttribute('class')) ?? ''}"`;
        await test.info().attach('footer link matches', { body: `page: ${where}\n\n${found.join('\n')}`, contentType: 'text/plain' });
        expect(href, `footer link has no href — ${found.length} match(es) on ${where}:\n${found.join('\n')}`).not.toBe('');
      }
      const res = await page.goto(new URL(href, cfg.baseURL).href);
      expect(res?.status(), `${href} status`).toBeLessThan(400);
      await expect(page.locator('body')).not.toHaveClass(/is-ctl-error/);
    });
  }
});
