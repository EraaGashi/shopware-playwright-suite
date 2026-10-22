/**
 * Bot protection (Cloudflare & co.) answers non-browser requests with a challenge page instead of the shop.
 * Such a response says nothing about the shop → tests treat it as "inconclusive", never as a shop result.
 */
export function isBotChallenge(status: number, headers: Record<string, string>, body: string): boolean {
  if (status !== 403 && status !== 503 && status !== 429) return false;
  return headers['cf-mitigated'] === 'challenge' || /Just a moment\.\.\.|cf_chl_opt|challenge-platform/.test(body);
}
