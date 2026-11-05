import type { APIResponse, Page } from '@playwright/test';
import { test, expect } from '../../src/fixtures';
import { bypassHeaders, isBotChallenge } from '../../src/utils/http';
import { loadConfig } from '../../src/config/loader';

/** Bot-protection bypass for the shop (unset = none) — the checks below look at the shop, not at Cloudflare. */
const bypass = bypassHeaders(loadConfig());

/**
 * Passive security checks — read-only, no attacks, nothing written. Requests go through the browser
 * session; when bot protection answers instead of the shop, the check is "inconclusive" (skipped),
 * never reported as a shop result.
 */

/** GET through the page's own session (cookies of the browser) — null = bot protection answered. */
async function get(page: Page, path: string): Promise<{ res: APIResponse; body: string } | null> {
  const res = await page.request.get(path, { headers: bypass, maxRedirects: 0, failOnStatusCode: false });
  const body = await res.text().catch(() => '');
  return isBotChallenge(res.status(), res.headers(), body) ? null : { res, body };
}

/** Visible signs of a debug / development error page (Symfony, PHP, stack traces, server paths). */
const DEBUG_LEAK = /Stack ?trace|Symfony\\Component|Symfony Exception|vendor\/shopware|\/var\/www\/|#0 \/[a-z]|Whoops, looks like|No route found for "/i;

test.describe('Security', () => {
  test('security headers are set on storefront pages', async ({ page, cfg }) => {
    // risk: clickjacking, MIME sniffing, leaking full URLs to third parties, HTTPS downgrade
    const res = await page.goto(cfg.routes.home);
    const h = res!.headers();
    expect.soft(h['x-content-type-options'], 'X-Content-Type-Options').toBe('nosniff');
    const frameProtection = /deny|sameorigin/i.test(h['x-frame-options'] ?? '') || /frame-ancestors/i.test(h['content-security-policy'] ?? '');
    expect.soft(frameProtection, 'clickjacking protection (X-Frame-Options or CSP frame-ancestors)').toBe(true);
    expect.soft(h['referrer-policy'] ?? '', 'Referrer-Policy').not.toBe('');
    if (cfg.baseURL.startsWith('https://')) {
      expect.soft(h['strict-transport-security'] ?? '', 'Strict-Transport-Security (HSTS)').toMatch(/max-age=[1-9]\d*/);
    }
    expect.soft(h['x-powered-by'] ?? '', 'X-Powered-By reveals the server stack').toBe('');
    expect.soft(h['server'] ?? '', 'Server header reveals a version number').not.toMatch(/\d+\.\d+/);
  });

  test('session cookie is HttpOnly, Secure and SameSite', async ({ page, context, cfg }) => {
    // risk: session theft via JavaScript (XSS) or plain-HTTP requests, cross-site request forgery
    await page.goto(cfg.routes.home);
    const session = (await context.cookies()).filter((c) => /^session-|^PHPSESSID$|^sw-/.test(c.name));
    test.skip(session.length === 0, 'No session cookie set for guests on the homepage');
    for (const c of session) {
      expect.soft(c.httpOnly, `${c.name}: HttpOnly`).toBe(true);
      if (cfg.baseURL.startsWith('https://')) expect.soft(c.secure, `${c.name}: Secure`).toBe(true);
      expect.soft(c.sameSite, `${c.name}: SameSite`).not.toBe('None');
    }
  });

  test('error pages do not reveal debug information', async ({ page, cfg }) => {
    // risk: debug mode in production — stack traces show code paths, versions, sometimes credentials
    const probes = [
      `/e2e-security-not-existing-${Date.now()}`,
      `${cfg.routes.search}?search[]=e2e`,
      `${cfg.testData.listingCategoryPath}?order[]=e2e`,
      '/widgets/checkout/info?e2e=<x>',
    ];
    for (const path of probes) {
      const res = await page.goto(path).catch(() => null);
      const text = await page.locator('body').innerText().catch(() => '');
      expect.soft(DEBUG_LEAK.test(text) || DEBUG_LEAK.test(await page.title()), `${path} (${res?.status()}) shows debug output`).toBe(false);
    }
  });

  test('sensitive files are not served', async ({ page, cfg }) => {
    // risk: credentials (.env), source code (.git), dependency versions (composer.lock), logs
    await page.goto(cfg.routes.home); // session cookies for the requests below
    const files: Array<[string, RegExp]> = [
      ['/.env', /APP_SECRET|DATABASE_URL|APP_ENV=/],
      ['/.git/config', /\[core\]|repositoryformatversion/],
      ['/.git/HEAD', /^ref: refs\//m],
      ['/composer.json', /"require"\s*:/],
      ['/composer.lock', /"packages"\s*:/],
      ['/var/log/', /prod-\d{4}|\.log/],
      ['/config/packages/shopware.yaml', /shopware:/],
      ['/phpinfo.php', /phpinfo\(\)|PHP Version/],
      ['/.DS_Store', /Bud1/],
    ];
    let checked = 0;
    for (const [path, signature] of files) {
      const r = await get(page, path);
      if (!r) continue;
      checked++;
      expect.soft(r.res.status() === 200 && signature.test(r.body), `${path} is served (HTTP ${r.res.status()})`).toBe(false);
    }
    test.skip(checked === 0, 'Inconclusive: bot protection answered every request (allowlist the test runner)');
  });
});
