import type { BrowserContext } from '@playwright/test';
import type { ResolvedConfig } from '../config/types';

/**
 * Bypass header for the shop's bot protection (cfg.env.bypassHeader), e.g. a Cloudflare WAF rule
 * "skip challenges when header x-e2e-bypass equals <secret>". Only ever sent to the shop's own host.
 */
export function bypassHeaders(cfg: ResolvedConfig): Record<string, string> {
  const h = cfg.env.bypassHeader;
  return h ? { [h.name]: h.value } : {};
}

/**
 * Adds the bypass header to every browser request to the shop's host (not to PayPal, CDNs, trackers …:
 * the secret stays with the shop, and third-party requests get no extra CORS preflight).
 * Note: routing turns off the browser's HTTP cache in that context.
 */
export async function routeBypassHeader(context: BrowserContext, cfg: ResolvedConfig): Promise<void> {
  const h = cfg.env.bypassHeader;
  if (!h) return;
  const host = new URL(cfg.baseURL).host;
  await context.route(
    (url) => url.host === host,
    (route) => route.fallback({ headers: { ...route.request().headers(), [h.name]: h.value } }),
  );
}

/**
 * Bot protection (Cloudflare & co.) answers non-browser requests with a challenge page instead of the shop.
 * Such a response says nothing about the shop → tests treat it as "inconclusive", never as a shop result.
 */
export function isBotChallenge(status: number, headers: Record<string, string>, body: string): boolean {
  if (status !== 403 && status !== 503 && status !== 429) return false;
  return headers['cf-mitigated'] === 'challenge' || /Just a moment\.\.\.|cf_chl_opt|challenge-platform/.test(body);
}
