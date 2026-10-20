import { test, expect } from '../../src/client/fixtures';
import { loadConfig } from '../../src/config/loader';

/** Configure in projects/<shop>.ts → client.responsive */
const responsive = loadConfig().client?.responsive;
const viewports = responsive?.viewports ?? [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

test.describe('Client: responsive layout', { tag: '@client' }, () => {
  test.skip(!responsive, 'No client.responsive configured');

  for (const vp of viewports) {
    test.describe(vp.name, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      for (const p of responsive?.pages ?? []) {
        test(`"${p.name}" fits the ${vp.name} screen (${vp.width}px)`, async ({ page, header }) => {
          const res = await page.goto(p.path, { waitUntil: 'load' });
          expect(res?.status(), `${p.path} status`).toBeLessThan(400);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect.soft(overflow, `page is ${overflow}px wider than the screen (horizontal scrolling)`).toBeLessThanOrEqual(1);
          await expect.soft(header.logo, 'logo').toBeVisible();
          await expect.soft(header.cartButton, 'cart button').toBeVisible();
        });
      }
    });
  }
});
