import type { Page } from '@playwright/test';
import { test, expect } from '../../src/client/fixtures';

/**
 * The Mall Street (dev.themallstreet.com) only — Mirakl image background processing (LBX-291 / LBX-292).
 * A studio photo on a plain white or light-grey background gets the standard light background (light-grey
 * corners, soft gradient), is trimmed and centred on a fixed 438×800 canvas. Everything else (lifestyle/model
 * photos, room scenes, coloured backgrounds, product running off the frame) stays as the seller uploaded it.
 * So an unprocessed image is only a bug when it is a plain studio photo; its size and shape don't matter.
 * Checked on dev 2026-11-06: Cloud Tulle Dress Set images 1 + 4 processed, 2 + 3 lifestyle photos left as they are.
 *
 *   npm run test:mallstreet:image-bg
 *
 * Read-only: page views only. Not checked (needs a human eye): products eaten away by the processing,
 * halos or old-background patches around the product, variants showing another colour's photos.
 */
const DEV_HOST = 'dev.themallstreet.com';
const BACKGROUND = [220, 220, 220];   // corners of the standard background (the gradient is lighter towards the centre)
const COLOR_TOLERANCE = 8;            // JPEG compression shifts flat colours by a few steps
const ASPECT = 438 / 800;
const ASPECT_TOLERANCE = 0.01;        // smaller srcset variants round (420×767)
// a frame pixel counts as "plain studio background" when it is light and colourless (white or light grey)
const PLAIN_MIN_CHANNEL = 215;
const PLAIN_MAX_SPREAD = 15;
// share of plain frame pixels from which an image is a plain studio photo with the product fully in frame
const PLAIN_FRAME_SHARE = 0.95;
const LISTING_SAMPLE = 12;

type ImageCheck = {
  url: string;
  width: number;
  height: number;
  corners: number[][];
  /** share of the outer 2px frame that is plain white / light grey (0–1) */
  plainFrame: number;
  error?: string;
};

/** Loads every URL in the page (same host → readable canvas), reads the corner pixels and how plain the frame is. */
async function inspectImages(page: Page, urls: string[], plain: { minChannel: number; maxSpread: number }): Promise<ImageCheck[]> {
  return page.evaluate(
    ({ list, plain }) =>
      Promise.all(
        list.map(
          (url) =>
            new Promise<ImageCheck>((resolve) => {
              const img = new Image();
              img.onload = () => {
                const width = img.naturalWidth;
                const height = img.naturalHeight;
                try {
                  const c = document.createElement('canvas');
                  c.width = width;
                  c.height = height;
                  const ctx = c.getContext('2d')!;
                  ctx.drawImage(img, 0, 0);
                  const data = ctx.getImageData(0, 0, width, height).data;
                  const px = (x: number, y: number) => [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];
                  const corners = [[1, 1], [width - 2, 1], [1, height - 2], [width - 2, height - 2]].map(([x, y]) => px(x, y));
                  let frame = 0;
                  let plainCount = 0;
                  for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                      if (x > 1 && x < width - 2 && y > 1 && y < height - 2) continue;
                      const [r, g, b] = px(x, y);
                      frame++;
                      if (Math.min(r, g, b) >= plain.minChannel && Math.max(r, g, b) - Math.min(r, g, b) <= plain.maxSpread) plainCount++;
                    }
                  }
                  resolve({ url, width, height, corners, plainFrame: plainCount / frame });
                } catch (e) {
                  resolve({ url, width, height, corners: [], plainFrame: 0, error: (e as Error).message });
                }
              };
              img.onerror = () => resolve({ url, width: 0, height: 0, corners: [], plainFrame: 0, error: 'image failed to load' });
              img.src = url;
            }),
        ),
      ),
    { list: urls, plain },
  );
}

/** Image URLs of the matched <img>s, lazy ones included (src, data-src or the first srcset entry), one per file. */
async function imageUrls(page: Page, selector: string): Promise<string[]> {
  const urls = await page.locator(selector).evaluateAll((imgs) =>
    (imgs as HTMLImageElement[])
      .map((i) => i.currentSrc || i.getAttribute('src') || i.dataset.src || (i.getAttribute('srcset') ?? i.dataset.srcset ?? '').split(/\s/)[0])
      .filter((u) => u && !u.startsWith('data:'))
      .map((u) => new URL(u, location.href).href),
  );
  // the same media comes in several thumbnail sizes → keep one per file
  const byFile = new Map<string, string>();
  for (const u of urls) {
    const file = new URL(u).pathname.split('/').pop()!.replace(/_\d+x\d+(?=\.\w+$)/, '');
    if (!byFile.has(file)) byFile.set(file, u);
  }
  return [...byFile.values()];
}

const rgb = (px: number[]) => `rgb(${px.slice(0, 3).join(',')})`;
const fileName = (url: string) => new URL(url).pathname.split('/').pop()!.replace(/_\d+x\d+(?=\.\w+$)/, '').replace(/\.\w+$/, '');

type Verdict = { position: number; file: string; kind: 'processed' | 'left as uploaded' | 'bug'; detail: string };

/** Sorts each image (position = 1-based order on the page) into processed / deliberately left as uploaded / bug. */
function classify(checks: ImageCheck[]): Verdict[] {
  return checks.map((c, i) => {
    const base = { position: i + 1, file: fileName(c.url) };
    if (c.error || c.width === 0) return { ...base, kind: 'bug', detail: `no image: ${c.error ?? 'empty image'}` };
    const aspect = c.width / c.height;
    const onCanvas = Math.abs(aspect - ASPECT) <= ASPECT_TOLERANCE;
    const greyCorners = c.corners.every((px) => px[3] === 255 && BACKGROUND.every((v, j) => Math.abs(px[j] - v) <= COLOR_TOLERANCE));
    const size = `${c.width}×${c.height}`;
    const frame = `${Math.round(c.plainFrame * 100)}% plain frame`;
    if (onCanvas && greyCorners) return { ...base, kind: 'processed', detail: size };
    if (onCanvas) return { ...base, kind: 'bug', detail: `${size} processed canvas without the standard background (corners ${c.corners.map(rgb).join(' ')})` };
    if (c.plainFrame >= PLAIN_FRAME_SHARE) return { ...base, kind: 'bug', detail: `plain studio photo NOT processed: ${size}, ${frame}, corners ${c.corners.map(rgb).join(' ')}` };
    return { ...base, kind: 'left as uploaded', detail: `${size}, ${frame} (lifestyle / scene / product off the frame)` };
  });
}

/** Attaches the per-image verdicts, notes the deliberately unprocessed ones and fails on the bugs. */
async function expectProcessedCorrectly(page: Page, urls: string[], where: string) {
  const checks = await inspectImages(page, urls, { minChannel: PLAIN_MIN_CHANNEL, maxSpread: PLAIN_MAX_SPREAD });
  const verdicts = classify(checks);
  await test.info().attach('images.json', { body: JSON.stringify(verdicts.map((v, i) => ({ ...v, ...checks[i] })), null, 2), contentType: 'application/json' });
  const line = (v: Verdict) => `#${v.position} ${v.file}: ${v.detail}`;
  for (const v of verdicts.filter((v) => v.kind !== 'bug')) test.info().annotations.push({ type: v.kind, description: line(v) });
  const bugs = verdicts.filter((v) => v.kind === 'bug');
  expect(bugs.map(line), `${bugs.length} of ${verdicts.length} images on ${where} are processed wrongly:\n${bugs.map(line).join('\n')}`).toEqual([]);
}

test.describe('Client: Mall Street image background processing', { tag: '@client' }, () => {
  test.beforeEach(({ cfg }) => {
    test.skip(cfg.name !== 'The Mall Street' || new URL(cfg.baseURL).host !== DEV_HOST, `Mall Street dev only (BASE_URL=https://${DEV_HOST})`);
  });

  for (const key of ['simpleProduct', 'variantProduct'] as const) {
    test(`${key === 'simpleProduct' ? 'simple' : 'variant'} product gallery: studio photos processed, lifestyle photos left as uploaded`, async ({ page, cfg }) => {
      const p = cfg.testData[key];
      await page.goto(p.path, { waitUntil: 'load' });
      await expect(page.locator(cfg.selectors.product.galleryImage).first()).toBeVisible();

      const urls = await imageUrls(page, cfg.selectors.product.galleryImage);
      expect(urls.length, `gallery images on ${p.path}`).toBeGreaterThan(0);
      await expectProcessedCorrectly(page, urls, `${p.path} (${p.productNumber})`);
    });
  }

  test('listing tiles: studio photos processed, lifestyle photos left as uploaded', async ({ page, cfg }) => {
    const path = cfg.testData.listingCategoryPath;
    await page.goto(path, { waitUntil: 'load' });
    const tiles = page.locator(`${cfg.selectors.listing.productBox} ${cfg.selectors.listing.productImage}`);
    await expect(tiles.first()).toBeVisible();

    const urls = (await imageUrls(page, `${cfg.selectors.listing.productBox} ${cfg.selectors.listing.productImage}`)).slice(0, LISTING_SAMPLE);
    expect(urls.length, `tile images on ${path}`).toBeGreaterThan(0);
    await expectProcessedCorrectly(page, urls, path);
  });
});
