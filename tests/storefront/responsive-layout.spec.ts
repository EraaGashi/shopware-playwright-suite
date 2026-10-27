import type { Locator, Page, TestInfo } from '@playwright/test';
import { test, expect } from '../../src/fixtures';
import { loadConfig } from '../../src/config/loader';
import type { ClientPage, ResolvedConfig } from '../../src/config/types';
import { attachEvidence, auditLayout, formatIssues, settle, stickyCoverage, type LayoutIssue } from '../../src/utils/layout';

/**
 * Responsive layout suite: every core page and the shared components (navigation, filters, search,
 * cookie banner, off-canvas cart, account) at desktop, laptop, tablet and phone sizes, portrait and landscape.
 * Read-only for the shop: only a guest cart is filled, the fixed test account's cart is restored, no order is placed.
 *
 * Viewports: a core set by default; `LAYOUT_VIEWPORTS=all` runs all 21, or a comma list of name parts
 * (`LAYOUT_VIEWPORTS=mobile-320x568`, `LAYOUT_VIEWPORTS=tablet`) — `npm run test:responsive` runs all.
 * Viewport emulation (incl. touch / mobile meta viewport) catches layout defects; it is not a real device.
 * Shop specifics: projects/<shop>.ts → layout (extra pages, ignored widgets, nav breakpoint, sizes).
 */

type Kind = 'desktop' | 'laptop' | 'tablet' | 'tablet-landscape' | 'mobile' | 'mobile-landscape';
interface Viewport { name: string; kind: Kind; width: number; height: number; touch: boolean }

const vp = (kind: Kind, width: number, height: number): Viewport =>
  ({ name: `${kind}-${width}x${height}`, kind, width, height, touch: kind.startsWith('tablet') || kind.startsWith('mobile') });

const ALL_VIEWPORTS: Viewport[] = [
  vp('desktop', 1920, 1080), vp('desktop', 1440, 900), vp('desktop', 1366, 768),
  vp('laptop', 1280, 800), vp('laptop', 1024, 768),
  vp('tablet', 1024, 1366), vp('tablet', 834, 1194), vp('tablet', 768, 1024),
  vp('tablet-landscape', 1366, 1024), vp('tablet-landscape', 1194, 834), vp('tablet-landscape', 1024, 768),
  vp('mobile', 430, 932), vp('mobile', 390, 844), vp('mobile', 375, 812), vp('mobile', 360, 800), vp('mobile', 320, 568),
  vp('mobile-landscape', 932, 430), vp('mobile-landscape', 844, 390), vp('mobile-landscape', 812, 375), vp('mobile-landscape', 800, 360), vp('mobile-landscape', 568, 320),
];
/** One per device class + the narrowest phone + one landscape phone. */
const CORE = ['desktop-1440x900', 'laptop-1024x768', 'tablet-768x1024', 'mobile-390x844', 'mobile-320x568', 'mobile-landscape-844x390'];

function selectedViewports(): Viewport[] {
  const wanted = (process.env.LAYOUT_VIEWPORTS ?? '').trim();
  if (wanted === 'all') return ALL_VIEWPORTS;
  if (!wanted) return ALL_VIEWPORTS.filter((v) => CORE.includes(v.name));
  const parts = wanted.split(',').map((p) => p.trim()).filter(Boolean);
  return ALL_VIEWPORTS.filter((v) => parts.some((p) => v.name.includes(p)));
}

const cfg = loadConfig();
const layout = cfg.layout ?? {};
const VIEWPORTS = selectedViewports();
const NOT_FOUND = '/e2e-layout-not-found-page';

/** Guest pages audited at every viewport — derived from the profile, so every shop gets them without setup. */
function guestPages(c: ResolvedConfig): Array<ClientPage & { expect404?: boolean }> {
  const list: Array<ClientPage & { expect404?: boolean }> = [
    { name: 'Homepage', path: c.routes.home },
    { name: 'Category listing', path: c.testData.listingCategoryPath },
    { name: 'Product detail', path: c.testData.simpleProduct.path },
    { name: 'Product detail (variants)', path: c.testData.variantProduct.path },
    { name: 'Search results', path: `${c.routes.search}?search=${encodeURIComponent(c.testData.searchTerm)}` },
    { name: 'Search without results', path: `${c.routes.search}?search=${encodeURIComponent(c.testData.searchNoResultTerm)}` },
    { name: 'Empty cart', path: c.routes.cart },
    { name: 'Login', path: c.routes.login },
    { name: 'Registration', path: c.routes.register },
    { name: 'Password recovery', path: c.routes.passwordRecovery ?? '/account/recover' },
    { name: 'Not found page', path: NOT_FOUND, expect404: true },
    ...(c.routes.contactPage ? [{ name: 'Contact page', path: c.routes.contactPage }] : []),
    ...(layout.pages ?? []),
  ];
  return list.filter((p, i) => list.findIndex((o) => o.path === p.path) === i);
}

const KIND_TITLE: Record<LayoutIssue['kind'], string> = {
  overflow: 'page scrolls sideways — caused by',
  'cut-off': 'elements cut off at the screen edge',
  'clipped-text': 'text cut off inside its box',
  covered: 'controls covered by another element',
  'fixed-cover': 'fixed element hides the page',
  'small-target': 'touch targets too small and too close together',
  'distorted-image': 'images stretched out of their aspect ratio',
};

const minTarget = layout.minTargetSize ?? 24;

/**
 * Runs the layout audit and reports every defect class as its own soft assertion (all findings in one run).
 * Touch target sizes are checked separately (one test per touch viewport) — header buttons would otherwise
 * repeat the same finding on every page.
 */
async function expectNoLayoutDefects(page: Page, testInfo: TestInfo, where: string, scope?: Locator): Promise<void> {
  const audit = await auditLayout(page, { ignore: layout.ignore, scope });
  await attachEvidence(page, testInfo, where.replace(/\W+/g, '-').toLowerCase(), audit);
  const at = `${where} (${page.url()})`;
  if (!scope) {
    const culprits = audit.issues.filter((i) => i.kind === 'overflow');
    expect.soft(audit.overflowX, formatIssues(`${at}: page is ${audit.overflowX}px wider than the screen — ${KIND_TITLE.overflow}`, audit, culprits)).toBeLessThanOrEqual(1);
  }
  for (const kind of Object.keys(KIND_TITLE) as Array<LayoutIssue['kind']>) {
    if ((kind === 'overflow' && !scope) || kind === 'small-target') continue;
    const found = audit.issues.filter((i) => i.kind === kind);
    expect.soft(found.length, formatIssues(`${at}: ${KIND_TITLE[kind]}`, audit, found)).toBe(0);
  }
}

/** Opens a page; 404 = data missing on this shop (skipped with the reason), bot challenge = inconclusive. */
async function open(page: Page, path: string, expect404 = false): Promise<void> {
  const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
  const status = res?.status() ?? 0;
  test.skip(/just a moment/i.test(await page.title()), 'Inconclusive: Cloudflare bot challenge answered (run headed or allowlist the runner)');
  if (!expect404) {
    test.skip(status === 404 || status === 410, `${path} answered ${status} — page/data not available on this shop, layout not checkable`);
    expect(status, `${path} answered HTTP ${status}`).toBeLessThan(400);
  }
  await settle(page);
}

/** Bounding box of a locator must lie within the screen width. */
async function expectInsideScreen(target: Locator, what: string): Promise<void> {
  const box = await target.boundingBox();
  expect(box, `${what} has no box (not rendered)`).toBeTruthy();
  const vw = await target.page().evaluate(() => document.documentElement.clientWidth);
  expect.soft(box!.x, `${what} starts ${Math.round(-box!.x)}px left of the screen`).toBeGreaterThanOrEqual(-1);
  expect.soft(box!.x + box!.width, `${what} ends ${Math.round(box!.x + box!.width - vw)}px beyond the ${vw}px screen`).toBeLessThanOrEqual(vw + 1);
}

/** The control can be scrolled into view and is the topmost element at its centre (clickable). */
async function expectReachable(target: Locator, what: string): Promise<void> {
  await expect(target, `${what} not visible`).toBeVisible();
  await target.scrollIntoViewIfNeeded();
  const result = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const inView = cx >= 0 && cy >= 0 && cx <= document.documentElement.clientWidth && cy <= window.innerHeight;
    const hit = inView ? document.elementFromPoint(cx, cy) : null;
    const top = !!hit && (el.contains(hit) || hit.contains(el));
    return { inView, top, hit: hit ? hit.tagName.toLowerCase() + '.' + Array.from(hit.classList).slice(0, 3).join('.') : '' };
  });
  expect.soft(result.inView, `${what} cannot be scrolled into the screen`).toBe(true);
  if (result.inView) expect.soft(result.top, `${what} is covered by ${result.hit}`).toBe(true);
}

/** Product grid geometry: columns of the first row, widths, boxes outside the screen. */
async function gridOf(page: Page, c: ResolvedConfig) {
  return page.locator(c.selectors.listing.productBox).locator('visible=true').evaluateAll((els) => {
    const boxes = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    const firstTop = boxes[0]?.top ?? 0;
    const firstRow = boxes.filter((r) => Math.abs(r.top - firstTop) < 4);
    return {
      count: boxes.length,
      columns: firstRow.length,
      widths: firstRow.map((r) => Math.round(r.width)),
      minWidth: Math.round(Math.min(...boxes.map((r) => r.width))),
      outside: boxes.filter((r) => r.left < -1 || r.right > document.documentElement.clientWidth + 1).length,
    };
  });
}

function useViewport(v: Viewport): void {
  test.use({
    viewport: { width: v.width, height: v.height },
    hasTouch: v.touch,
    // mobile meta-viewport handling like a phone/tablet browser (not supported by Firefox)
    isMobile: async ({ browserName }, use) => use(v.touch && browserName !== 'firefox'),
  });
}

for (const v of VIEWPORTS) {
  test.describe(`Responsive layout ${v.name}`, { tag: '@responsive' }, () => {
    useViewport(v);
    const mobileNav = v.width < (layout.mobileNavBelow ?? 992);

    for (const p of guestPages(cfg)) {
      test(`${p.name} has no layout defects`, async ({ page }, testInfo) => {
        await open(page, p.path, p.expect404);
        await expectNoLayoutDefects(page, testInfo, p.name);
        const sticky = await stickyCoverage(page);
        expect.soft(sticky.share, `${p.name}: after scrolling, fixed/sticky bars hide ${Math.round(sticky.share * 100)}% of the ${v.height}px screen height: ${sticky.elements.join(', ')}`).toBeLessThanOrEqual(0.4);
      });
    }

    test(`navigation switches to the ${mobileNav ? 'mobile' : 'desktop'} mode and its menu fits`, async ({ page, cfg, navigation }, testInfo) => {
      await open(page, cfg.routes.home);
      const toggle = page.locator(cfg.selectors.header.mobileMenuToggle).locator('visible=true');
      const rootLinks = page.locator(cfg.selectors.navigation.rootLink).locator('visible=true');
      if (mobileNav) {
        test.skip(!cfg.features.mobileNavigation, 'Feature "mobileNavigation" disabled in project profile');
        await expect(toggle.first(), `burger menu button missing below ${layout.mobileNavBelow ?? 992}px`).toBeVisible();
        expect.soft(await rootLinks.count(), 'desktop navigation still shown on a small screen').toBe(0);
        const menu = await navigation.openMobileMenu();
        await expectInsideScreen(menu, 'mobile menu panel');
        await expectReachable(menu.locator('a').locator('visible=true').first(), 'first menu link');
        await expectNoLayoutDefects(page, testInfo, 'Mobile menu', menu);
        const sideways = await menu.evaluate((el) => [el, ...Array.from(el.querySelectorAll('*'))].filter((e) => {
          const cs = getComputedStyle(e);
          return /auto|scroll/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1;
        }).length);
        expect.soft(sideways, 'mobile menu scrolls sideways').toBe(0);
      } else {
        await expect(rootLinks.first(), `desktop navigation missing at ${v.width}px`).toBeVisible();
        expect.soft(await toggle.count(), 'burger button still shown next to the desktop navigation').toBe(0);
        await expectInsideScreen(page.locator(cfg.selectors.navigation.root).locator('visible=true').first(), 'main navigation bar');
        // first category that has a flyout / mega menu
        const flyout = page.locator(cfg.selectors.navigation.flyout).locator('visible=true').first();
        let opened = '';
        for (const name of (await navigation.rootLinkTexts()).slice(0, 4)) {
          await navigation.rootLink(name).hover();
          if (await flyout.waitFor({ state: 'visible', timeout: 1_500 }).then(() => true, () => false)) { opened = name; break; }
        }
        if (!opened) {
          test.info().annotations.push({ type: 'coverage', description: 'no flyout opened on hover for the first 4 categories' });
          return;
        }
        await expectInsideScreen(flyout, `flyout of "${opened}"`);
        await expectNoLayoutDefects(page, testInfo, `Flyout ${opened}`, flyout);
      }
    });

    test('product grid adapts to the screen width', async ({ page, cfg }) => {
      await open(page, cfg.testData.listingCategoryPath);
      const grid = await gridOf(page, cfg);
      test.skip(grid.count === 0, 'Listing has no products — grid not checkable');
      test.info().annotations.push({ type: 'grid', description: `${grid.columns} columns, box widths ${grid.widths.join('/')}px` });
      expect.soft(grid.outside, 'product boxes outside the screen').toBe(0);
      if (grid.columns > 1) {
        const min = layout.minProductBoxWidth ?? 140;
        expect.soft(grid.minWidth, `product boxes squeezed to ${grid.minWidth}px in ${grid.columns} columns`).toBeGreaterThanOrEqual(min);
        expect.soft(Math.max(...grid.widths) - Math.min(...grid.widths), `uneven column widths ${grid.widths.join('/')}`).toBeLessThanOrEqual(2);
      }
      if (v.width <= 480) expect.soft(grid.columns, `${grid.columns} product columns on a ${v.width}px phone`).toBeLessThanOrEqual(2);
      if (v.width >= 1280) expect.soft(grid.columns, `only ${grid.columns} product column(s) on a ${v.width}px screen`).toBeGreaterThanOrEqual(3);
    });

    test('listing filters open and fit the screen', async ({ page, cfg, listing }, testInfo) => {
      await open(page, cfg.testData.listingCategoryPath);
      test.skip(!(await page.locator(`${cfg.selectors.listing.filterPanel}, ${cfg.selectors.listing.filterPanelToggle}`).count()), 'Listing has no filter panel');
      const panel = await listing.ensureFilterPanelVisible();
      await expectInsideScreen(panel, 'filter panel');
      const toggleBtn = panel.locator(cfg.selectors.listing.filterItemToggle).locator('visible=true').first();
      await expectReachable(toggleBtn, 'first filter button');
      await toggleBtn.click();
      const dropdown = panel.locator('.dropdown-menu.show, .filter-panel-item-dropdown.show, [aria-expanded="true"] + *').locator('visible=true').first();
      if (await dropdown.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expectInsideScreen(dropdown, 'opened filter dropdown');
        await expectNoLayoutDefects(page, testInfo, 'Filter dropdown', dropdown);
      } else {
        test.info().annotations.push({ type: 'coverage', description: 'filter options open inline (no dropdown)' });
      }
      await expectNoLayoutDefects(page, testInfo, 'Filter panel', panel);
    });

    test('search field is reachable and its dropdown fits', async ({ page, cfg, header }, testInfo) => {
      await open(page, cfg.routes.home);
      await header.ensureSearchVisible();
      await expectInsideScreen(header.searchInput, 'search field');
      const box = (await header.searchInput.boundingBox())!;
      expect.soft(box.width, `search field only ${Math.round(box.width)}px wide`).toBeGreaterThanOrEqual(Math.min(160, v.width * 0.5));
      await header.searchInput.click();
      await header.searchInput.pressSequentially(cfg.testData.searchTerm, { delay: 30 });
      const suggest = page.locator(cfg.selectors.header.searchSuggest).locator('visible=true').first();
      if (await suggest.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false)) {
        await expectInsideScreen(suggest, 'search suggest dropdown');
        await expectNoLayoutDefects(page, testInfo, 'Search suggest', suggest);
      } else {
        test.info().annotations.push({ type: 'coverage', description: 'no search suggest dropdown appeared' });
      }
    });

    test('cart, off-canvas cart and guest checkout fit with a product in the cart', async ({ page, cfg, cartHelper, header, offcanvasCart }, testInfo) => {
      // guest cart only — nothing is ordered
      test.slow(); // add to cart + three pages
      const added = await cartHelper.add(cfg.testData.simpleProduct, 1).then(() => '', (e: Error) => e.message.split('\n')[0]);
      test.skip(!!added, `Product could not be put into the cart (shop data?): ${added}`);
      await open(page, cfg.routes.home);
      const oc = offcanvasCart.root;
      await header.cartButton.click();
      // some themes open the cart page instead of the off-canvas on small screens
      await expect(oc.or(page.locator(cfg.selectors.cart.root).first()), 'cart button opened neither the off-canvas nor the cart page').toBeVisible();
      if (await oc.isVisible()) {
        await expectInsideScreen(oc, 'off-canvas cart');
        await expectReachable(oc.locator(cfg.selectors.offcanvasCart.checkoutButton).first(), 'off-canvas checkout button');
        await expectNoLayoutDefects(page, testInfo, 'Off-canvas cart', oc);
      } else {
        test.info().annotations.push({ type: 'coverage', description: `cart button opens the cart page at ${v.width}px (no off-canvas)` });
      }

      await open(page, cfg.routes.cart);
      await expectNoLayoutDefects(page, testInfo, 'Cart with product');
      await expectReachable(page.locator(cfg.selectors.cart.checkoutButton).locator('visible=true').first(), 'cart checkout button');

      await open(page, cfg.routes.checkoutRegister);
      await expectNoLayoutDefects(page, testInfo, 'Checkout (guest step)');
    });

    test('touch targets are big enough or spaced apart', async ({ page, cfg }, testInfo) => {
      // WCAG 2.5.8 (AA): at least 24×24 px, or no other target within a 24 px circle
      test.skip(!v.touch || minTarget === 0, 'Touch targets are checked on tablet and phone sizes');
      test.slow(); // four pages, each scrolled through once
      const found = new Map<string, string>();
      const checked: string[] = [];
      for (const path of [cfg.routes.home, cfg.testData.listingCategoryPath, cfg.testData.simpleProduct.path, cfg.routes.login]) {
        const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
        if (!res || res.status() >= 400) continue;
        await settle(page);
        checked.push(path);
        const audit = await auditLayout(page, { ignore: layout.ignore, minTarget });
        const small = audit.issues.filter((i) => i.kind === 'small-target');
        if (small.length) await attachEvidence(page, testInfo, `touch-targets${path.replace(/\W+/g, '-')}`, { ...audit, issues: small });
        // same element on several pages (header) → reported once, with the first page it was seen on
        for (const i of small) if (!found.has(i.element.replace(/"[^"]*"$/, ''))) found.set(i.element.replace(/"[^"]*"$/, ''), `${i.element}: ${i.detail} (${path})`);
      }
      test.skip(checked.length === 0, 'No page could be loaded');
      expect.soft(found.size, `touch targets smaller than ${minTarget}px and too close to another target @ ${v.width}×${v.height}\n${[...found.values()].map((l) => `  - ${l}`).join('\n')}`).toBe(0);
    });

    test.describe('first visit', () => {
      test.use({ acceptCookies: false });

      test('cookie banner fits and its buttons are reachable', async ({ page, cfg, cookieBanner }, testInfo) => {
        test.skip(!cfg.features.cookieBanner, 'Feature "cookieBanner" disabled in project profile');
        await open(page, cfg.routes.home);
        const banner = cookieBanner.banner.locator('visible=true').first();
        await expect(banner, 'cookie banner not shown').toBeVisible();
        await expectInsideScreen(banner, 'cookie banner');
        await expectReachable(page.locator(cfg.selectors.cookie.onlyNecessary).locator('visible=true').first(), '"only necessary" button');
        const all = page.locator(cfg.selectors.cookie.acceptAll).locator('visible=true').first();
        if (await all.count()) await expectReachable(all, '"accept all" button');
        await expectNoLayoutDefects(page, testInfo, 'Cookie banner', banner);
      });
    });
  });
}

/**
 * Logged-in pages share one account (TEST_CUSTOMER_EMAIL or a fresh customer) → one viewport after the
 * other, so logins don't interfere; a failure does not skip the other viewports.
 */
test.describe('Responsive layout logged in', { tag: '@responsive' }, () => {
  test.describe.configure({ mode: 'default' });

  for (const v of VIEWPORTS) {
    test.describe(v.name, () => {
      useViewport(v);

      test('account pages and checkout confirm have no layout defects', async ({ loggedInPage: page, cfg, cart, cartHelper }, testInfo) => {
        const pages: ClientPage[] = [
          { name: 'Account overview', path: cfg.routes.account },
          { name: 'Account profile', path: cfg.routes.accountProfile },
          { name: 'Account addresses', path: cfg.routes.accountAddresses },
          { name: 'Account orders', path: cfg.routes.accountOrders },
          ...(cfg.features.wishlist ? [{ name: 'Wishlist', path: cfg.routes.wishlist }] : []),
        ];
        for (const p of pages) {
          await test.step(p.name, async () => {
            await open(page, p.path);
            await expectNoLayoutDefects(page, testInfo, p.name);
          });
        }
        await test.step('Checkout confirm (no order is placed)', async () => {
          const restore = await cart.snapshot();
          try {
            await cartHelper.add(cfg.testData.simpleProduct, 1);
            await open(page, cfg.routes.checkoutConfirm);
            await expectNoLayoutDefects(page, testInfo, 'Checkout confirm');
          } finally {
            const notes = await restore();
            if (notes.length) test.info().annotations.push({ type: 'cart restore', description: notes.join('; ') });
          }
        });
      });
    });
  }
});

/** Layout must follow a live resize, not only the size at page load. */
test.describe('Responsive layout resizing', { tag: '@responsive' }, () => {
  const sizes = [...VIEWPORTS].sort((a, b) => b.width - a.width).filter((v, i, a) => a.findIndex((o) => o.width === v.width) === i);
  const widest = sizes[0];
  test.use({ viewport: { width: widest.width, height: widest.height } });

  test('navigation and page width follow the window size', async ({ page, cfg }) => {
    await open(page, cfg.routes.home);
    const toggle = page.locator(cfg.selectors.header.mobileMenuToggle).locator('visible=true').first();
    const rootLink = page.locator(cfg.selectors.navigation.rootLink).locator('visible=true').first();
    for (const v of [...sizes, widest]) {
      await test.step(`resize to ${v.width}×${v.height}`, async () => {
        await page.setViewportSize({ width: v.width, height: v.height });
        const mobile = v.width < (layout.mobileNavBelow ?? 992);
        if (mobile && cfg.features.mobileNavigation) await expect.soft(toggle, `burger button after resizing to ${v.width}px`).toBeVisible();
        if (!mobile) await expect.soft(rootLink, `desktop navigation after resizing to ${v.width}px`).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), {
          message: `page scrolls sideways after resizing to ${v.width}px`, timeout: 3_000,
        }).toBeLessThanOrEqual(1);
      });
    }
  });

  test('product grid never gets more columns on a narrower window', async ({ page, cfg }) => {
    await open(page, cfg.testData.listingCategoryPath);
    test.skip((await gridOf(page, cfg)).count === 0, 'Listing has no products — grid not checkable');
    let previous = Infinity;
    const seen: string[] = [];
    for (const v of sizes) {
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
      const grid = await gridOf(page, cfg);
      seen.push(`${v.width}px: ${grid.columns}`);
      expect.soft(grid.columns, `${grid.columns} columns at ${v.width}px but ${previous} at a wider window (${seen.join(', ')})`).toBeLessThanOrEqual(previous);
      expect.soft(grid.outside, `product boxes outside the screen after resizing to ${v.width}px`).toBe(0);
      previous = grid.columns;
    }
    test.info().annotations.push({ type: 'grid', description: seen.join(', ') });
  });
});
