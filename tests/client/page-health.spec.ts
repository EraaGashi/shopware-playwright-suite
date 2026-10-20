import type { Response } from '@playwright/test';
import { test, expect } from '../../src/client/fixtures';
import { loadConfig } from '../../src/config/loader';

/** Configure in projects/<shop>.ts → client.healthPages (+ healthIgnoreRequests) */
const { healthPages = [], healthIgnoreRequests = [] } = loadConfig().client ?? {};

test.describe('Client: page health', { tag: '@client' }, () => {
  test.skip(healthPages.length === 0, 'No client.healthPages configured');

  for (const p of healthPages) {
    test(`"${p.name}" has no JS errors, failed requests or broken images`, async ({ page, cfg }) => {
      const host = new URL(cfg.baseURL).host;
      const jsErrors: string[] = [];
      const failed: string[] = [];
      page.on('pageerror', (e) => jsErrors.push(e.message));
      page.on('response', (r: Response) => {
        const url = r.url();
        if (r.status() >= 400 && new URL(url).host === host && !healthIgnoreRequests.some((re) => re.test(url))) {
          failed.push(`${r.status()} ${url}`);
        }
      });

      await page.goto(p.path, { waitUntil: 'load' });
      // lazy images only load once they are scrolled into view
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 150));
        }
      });
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

      const brokenImages = await page.locator('img').evaluateAll((imgs) =>
        (imgs as HTMLImageElement[])
          .filter((i) => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src) && !(i.currentSrc || i.src).startsWith('data:'))
          .map((i) => i.currentSrc || i.src),
      );

      expect.soft(jsErrors, `uncaught JS errors:\n${jsErrors.join('\n')}`).toEqual([]);
      expect.soft(failed, `failed requests:\n${failed.join('\n')}`).toEqual([]);
      expect.soft(brokenImages, `broken images:\n${brokenImages.join('\n')}`).toEqual([]);
    });
  }
});
