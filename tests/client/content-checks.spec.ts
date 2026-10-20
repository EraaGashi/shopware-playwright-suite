import { test, expect } from '../../src/client/fixtures';
import { loadConfig } from '../../src/config/loader';

/** Configure in projects/<shop>.ts → client.contentChecks */
const checks = loadConfig().client?.contentChecks ?? [];

test.describe('Client: content checks', { tag: '@client' }, () => {
  test.skip(checks.length === 0, 'No client.contentChecks configured');

  for (const c of checks) {
    test(`"${c.name}" is shown on ${c.path}`, async ({ page }) => {
      await page.goto(c.path);
      const el = page.locator(c.selector);
      await expect(el.first(), `${c.selector} not visible`).toBeVisible();
      if (c.minCount && c.minCount > 1) expect(await el.count(), `matches of ${c.selector}`).toBeGreaterThanOrEqual(c.minCount);
      if (c.text) await expect(el.first()).toContainText(c.text, { ignoreCase: true });
    });
  }
});
