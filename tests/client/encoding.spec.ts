import { test, expect } from '../../src/client/fixtures';
import { loadConfig } from '../../src/config/loader';

/** Configure in projects/<shop>.ts → client.encodingPages */
const pages = loadConfig().client?.encodingPages ?? [];

/** Double-escaped entities ("&amp;" shown as text) and UTF-8 read as Latin-1 ("Ã¤", "â€™"). */
const BROKEN = /&(amp|quot|apos|lt|gt|nbsp|#0*39|#x27);|Ã[\u0080-¿]|â€/;

test.describe('Client: text encoding', { tag: '@client' }, () => {
  test.skip(pages.length === 0, 'No client.encodingPages configured');

  for (const p of pages) {
    test(`"${p.name}" shows no HTML entities or broken characters`, async ({ page }) => {
      await page.goto(p.path);
      const texts = await page.evaluate(() => {
        const content = (sel: string) => document.querySelector(sel)?.getAttribute('content') ?? '';
        return {
          title: document.title,
          'og:title': content('meta[property="og:title"]'),
          description: content('meta[name="description"]'),
          ...Object.fromEntries(Array.from(document.querySelectorAll('h1, h2, .breadcrumb')).map((el, i) => [`${el.tagName.toLowerCase()} #${i}`, (el.textContent ?? '').trim()])),
        } as Record<string, string>;
      });
      const broken = Object.entries(texts).filter(([, t]) => BROKEN.test(t)).map(([k, t]) => `${k}: "${t.slice(0, 120)}"`);
      expect(broken, broken.join('\n')).toEqual([]);
    });
  }
});
