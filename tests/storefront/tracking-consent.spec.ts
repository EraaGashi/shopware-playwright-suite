import { test, expect, skipUnless } from '../../src/fixtures';
import type { BrowserContext, Page, Request } from '@playwright/test';

/**
 * GDPR / ePrivacy: no analytics or marketing tracking until the visitor consents.
 *
 * Only real tracking counts — data hits to known trackers and their cookies. Merely *loading* a tag
 * script (e.g. gtag.js) is not counted: with Google Consent Mode that is allowed as long as no data is sent.
 */
const TRACKING_HIT = [
  /google-analytics\.com\/(g\/|j\/)?collect/,
  /analytics\.google\.com\/g\/collect/,
  /(stats|googleads)\.g\.doubleclick\.net\//,
  /google\.[a-z.]+\/(pagead|ads)\/(ga-audiences|1p-conversion|conversion)/,
  /facebook\.com\/tr\b/,
  /bat\.bing\.com\/action/,
  /clarity\.ms\/collect/,
  /analytics\.tiktok\.com\/api/,
];
const TRACKING_COOKIE = /^(_ga|_ga_.*|_gid|_gat.*|_gcl_.*|_fbp|_fbc|_uetsid|_uetvid|_clck|_clsk|_ttp)$/;

/** Records tracking hits on the page; returns a getter. */
function recordTracking(page: Page): () => string[] {
  const hits: string[] = [];
  page.on('request', (r: Request) => {
    if (TRACKING_HIT.some((re) => re.test(r.url()))) hits.push(new URL(r.url()).host + new URL(r.url()).pathname);
  });
  return () => [...new Set(hits)];
}

async function trackingCookies(context: BrowserContext): Promise<string[]> {
  return (await context.cookies()).map((c) => c.name).filter((n) => TRACKING_COOKIE.test(n));
}

/** Trackers often fire a moment after `load` → give them time to show up. */
const SETTLE_MS = 3_000;

test.describe('Tracking & cookie consent', () => {
  test.use({ acceptCookies: false });
  test.beforeEach(({ cfg }) => {
    skipUnless(cfg.features.cookieBanner, 'cookieBanner');
    skipUnless(cfg.features.trackingConsent !== false, 'trackingConsent');
  });

  test('no tracking before the visitor makes a consent choice', { tag: '@smoke' }, async ({ page, context, cfg, cookieBanner }) => {
    const hits = recordTracking(page);
    await page.goto(cfg.routes.home, { waitUntil: 'load' });
    await expect(cookieBanner.banner).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);

    expect(hits(), `tracking requests sent while the cookie banner is still open:\n${hits().join('\n')}`).toEqual([]);
    expect(await trackingCookies(context), 'tracking cookies set before consent').toEqual([]);
  });
});
