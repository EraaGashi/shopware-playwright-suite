import * as fs from 'fs';
import * as path from 'path';
import type { Page } from '@playwright/test';
import { test, expect } from '../../src/fixtures';
import { CookieBanner } from '../../src/components/CookieBanner';
import { ProductPage } from '../../src/pages/ProductPage';
import { parsePrice } from '../../src/utils/price';
import type { ResolvedConfig } from '../../src/config/types';

/**
 * Catalog crawler: samples categories from the main navigation and products from those categories
 * through the real browser (works behind bot protection when run headed) and checks catalog data
 * that nobody verifies by clicking through: broken pages, 0 prices, missing images / descriptions,
 * in-stock products that cannot be bought. Read-only. Sample size: projects/<shop>.ts → crawl.
 *
 * Run alone: npx playwright test --grep @crawl   ·   leave out: --grep-invert @crawl
 */

interface PageResult {
  url: string;
  status: number;
  errorPage: boolean;
}
interface CategoryResult extends PageResult {
  /** page has a product listing element (pure CMS landing pages have none) */
  hasListing: boolean;
  productCount: number;
}
interface ProductResult extends PageResult {
  name: string;
  price: number;
  hasImage: boolean;
  descriptionLength: number;
  buyable: boolean;
  /** from structured data; undefined = not published */
  inStock?: boolean;
}
interface CrawlResult {
  blocked?: string;
  categories: CategoryResult[];
  products: ProductResult[];
}

const cacheFile = (outputDir: string, baseURL: string) => path.join(outputDir, `.crawl-${new URL(baseURL).hostname}.json`);

/** Evenly spread sample (keeps the first entry). */
function sample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}

async function isErrorPage(page: Page): Promise<boolean> {
  return /\bis-ctl-error\b/.test((await page.locator('body').getAttribute('class').catch(() => '')) ?? '');
}

async function crawl(page: Page, cfg: ResolvedConfig): Promise<CrawlResult> {
  const s = cfg.selectors;
  const { maxCategories = 12, productsPerCategory = 2, maxProducts = 20, excludePaths = [] } = cfg.crawl ?? {};
  const origin = new URL(cfg.baseURL).origin;
  const result: CrawlResult = { categories: [], products: [] };

  await page.goto(cfg.routes.home, { waitUntil: 'domcontentloaded' });
  if (/Just a moment|security verification/i.test(await page.title())) {
    return { ...result, blocked: 'bot protection challenge on the homepage (run headed or allowlist the test runner)' };
  }

  // category URLs: main navigation incl. flyouts, same host, no query/hash, configured exclusions
  const hrefs = await page.locator(`${s.navigation.link}, ${s.navigation.flyoutLink}`).evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
  const paths = new Set<string>([cfg.testData.listingCategoryPath]);
  for (const h of hrefs) {
    try {
      const u = new URL(h, origin);
      if (u.origin === origin && u.pathname !== '/' && !excludePaths.some((re) => re.test(u.pathname))) paths.add(u.pathname);
    } catch {
      /* javascript: / malformed → ignore */
    }
  }
  const [first, ...rest] = [...paths];
  const sampled = [first, ...sample(rest, maxCategories - 1)];
  // not enough products in the sample (empty leaf categories) → continue with further categories, capped
  const reserve = rest.filter((p) => !sampled.includes(p));
  const categories = [...sampled, ...sample(reserve, maxCategories * 2)];

  const productUrls: string[] = [];
  for (const [i, cat] of categories.entries()) {
    if (i >= sampled.length && productUrls.length >= maxProducts) break;
    const res = await page.goto(cat, { waitUntil: 'domcontentloaded' }).catch(() => null);
    const hasListing = (await page.locator(s.listing.root).count()) > 0;
    const productCount = await page.locator(s.listing.productBox).count();
    result.categories.push({ url: cat, status: res?.status() ?? 0, errorPage: await isErrorPage(page), hasListing, productCount });
    const links = await page
      .locator(s.listing.productBox)
      .locator(s.listing.productName)
      .evaluateAll((els) => els.map((el) => (el.closest('a') ?? el.querySelector('a') ?? el).getAttribute('href') ?? ''));
    for (const l of links.filter(Boolean).slice(0, productsPerCategory)) {
      const p = new URL(l, origin).pathname;
      if (!productUrls.includes(p) && productUrls.length < maxProducts) productUrls.push(p);
    }
  }

  const pdp = new ProductPage(page, cfg);
  for (const url of productUrls) {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => null);
    const short = { timeout: 5_000 };
    const name = ((await pdp.name.textContent(short).catch(() => '')) ?? '').trim();
    const priceText = cfg.features.guestPrices === false ? '' : ((await pdp.price.textContent(short).catch(() => '')) ?? '');
    // an image = a real <img> source in the gallery (Shopware shows an SVG placeholder when there is none)
    const hasImage = await page
      .locator(`${s.product.gallery} img, ${s.product.galleryImage}`)
      .evaluateAll((imgs) =>
        (imgs as HTMLImageElement[]).some((i) => {
          const src = i.currentSrc || i.src || i.getAttribute('data-src') || '';
          return src !== '' && !src.startsWith('data:') && !/placeholder/i.test(src);
        }),
      );
    const descriptionLength = ((await page.locator(s.product.description).first().textContent(short).catch(() => '')) ?? '').replace(/\s+/g, ' ').trim().length;
    const buy = pdp.buyButton;
    const buyable = (await buy.isVisible()) && (await buy.isEnabled().catch(() => false));
    const availability = (await pdp.structuredData().catch(() => ({ availability: undefined }))).availability ?? '';
    const inStock = /InStock|LimitedAvailability|OnlineOnly/.test(availability) ? true : /OutOfStock|SoldOut|Discontinued/.test(availability) ? false : undefined;
    result.products.push({ url, status: res?.status() ?? 0, errorPage: await isErrorPage(page), name, price: parsePrice(priceText), hasImage, descriptionLength, buyable, inStock });
  }
  return result;
}

test.describe('Catalog crawl', { tag: '@crawl' }, () => {
  // same worker, in order → the catalog is crawled once and shared (a failing check does not skip the others)
  test.describe.configure({ mode: 'default' });
  let data: CrawlResult;

  test.beforeAll(async ({ browser, cfg }, testInfo) => {
    testInfo.setTimeout(15 * 60_000);
    const cache = cacheFile(testInfo.project.outputDir, cfg.baseURL);
    if (fs.existsSync(cache)) {
      data = JSON.parse(fs.readFileSync(cache, 'utf8')) as CrawlResult;
      return;
    }
    const ctx = await browser.newContext({ baseURL: cfg.baseURL, httpCredentials: cfg.env.httpCredentials, locale: cfg.locale });
    try {
      if (cfg.features.cookieBanner) await CookieBanner.preAccept(ctx, cfg.baseURL);
      data = await crawl(await ctx.newPage(), cfg);
    } finally {
      await ctx.close();
    }
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, JSON.stringify(data, null, 2));
  });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(!!data.blocked, `Crawl inconclusive: ${data.blocked}`);
    testInfo.annotations.push({ type: 'crawl sample', description: `${data.categories.length} categories, ${data.products.length} products` });
  });

  const list = (items: PageResult[], extra: (p: any) => string = () => '') => items.map((p) => `${p.url}${extra(p)}`);

  test('sampled category pages load without errors', async ({}, testInfo) => {
    await testInfo.attach('crawl-result.json', { body: JSON.stringify(data, null, 2), contentType: 'application/json' });
    const broken = data.categories.filter((c) => c.status >= 400 || c.status === 0 || c.errorPage);
    expect(list(broken, (c) => ` → ${c.status || 'no response'}${c.errorPage ? ' (error page)' : ''}`)).toEqual([]);
  });

  test('sampled navigation categories with a product listing are not empty', async () => {
    // risk: the menu leads customers to categories without a single product (dead ends)
    const empty = data.categories.filter((c) => c.status < 400 && c.hasListing && c.productCount === 0);
    expect(list(empty), `${empty.length} of ${data.categories.length} sampled categories show an empty product listing`).toEqual([]);
  });

  test('sampled product pages load and have a name', async () => {
    expect(data.products.length, 'no product links found in the sampled categories').toBeGreaterThan(0);
    const broken = data.products.filter((p) => p.status >= 400 || p.status === 0 || p.errorPage || !p.name);
    expect(list(broken, (p) => ` → ${p.status || 'no response'}${p.errorPage ? ' (error page)' : ''}${p.name ? '' : ' (no name)'}`)).toEqual([]);
  });

  test('sampled products have a price above zero', async ({ cfg }) => {
    // risk: price rules / import errors publish products for free (or as "0,00 €" placeholders)
    test.skip(cfg.features.guestPrices === false, 'Guests see no prices');
    const free = data.products.filter((p) => !(p.price > 0));
    expect(list(free, (p) => ` → ${Number.isNaN(p.price) ? 'no price' : p.price}`), `${free.length} of ${data.products.length} sampled products`).toEqual([]);
  });

  test('sampled products show at least one image', async () => {
    const noImage = data.products.filter((p) => !p.hasImage);
    expect(list(noImage), `${noImage.length} of ${data.products.length} sampled products without image`).toEqual([]);
  });

  test('sampled products have a description', async () => {
    const empty = data.products.filter((p) => p.descriptionLength < 20);
    expect(list(empty, (p) => ` → ${p.descriptionLength} characters`), `${empty.length} of ${data.products.length} sampled products`).toEqual([]);
  });

  test('in-stock sampled products can be put in the cart', async () => {
    // risk: product says "in stock" (also to Google) but has no usable buy button
    const stuck = data.products.filter((p) => p.inStock === true && !p.buyable);
    expect(list(stuck), 'in stock according to structured data, but no enabled buy button').toEqual([]);
  });
});
