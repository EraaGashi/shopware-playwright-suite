import type { Locator, Page, TestInfo } from '@playwright/test';
import { test, expect } from '../../src/fixtures';
import { loadConfig } from '../../src/config/loader';
import type { ClientPage, ResolvedConfig } from '../../src/config/types';
import { attachEvidence, auditLayout, formatIssues, settle, stickyCoverage, type LayoutIssue } from '../../src/utils/layout';
import { closePopups } from '../../src/utils/popups';

/**
 * Responsive layout suite: the key pages (home, listing, product), the navigation and the cart / checkout
 * at the three most important screen sizes: desktop, tablet, phone.
 * Read-only for the shop: only a guest cart is filled, no order is placed.
 *
 * Viewports: all three by default; `LAYOUT_VIEWPORTS` = a comma list of name parts runs a subset
 * (`LAYOUT_VIEWPORTS=mobile`, `LAYOUT_VIEWPORTS=desktop,tablet`). Add a size to ALL_VIEWPORTS when a shop needs it.
 * Viewport emulation (incl. touch / mobile meta viewport) catches layout defects; it is not a real device.
 * Shop specifics: projects/<shop>.ts → layout (extra pages, ignored widgets, nav breakpoint, sizes).
 */

type Kind = 'desktop' | 'tablet' | 'mobile';
interface Viewport { name: string; kind: Kind; width: number; height: number; touch: boolean }

const vp = (kind: Kind, width: number, height: number): Viewport =>
  ({ name: `${kind}-${width}x${height}`, kind, width, height, touch: kind.startsWith('tablet') || kind.startsWith('mobile') });

/** The most important device sizes: desktop/MacBook, iPad portrait, iPhone. */
const ALL_VIEWPORTS: Viewport[] = [
  vp('desktop', 1440, 900),
  vp('tablet', 768, 1024),
  vp('mobile', 375, 812),
];

function selectedViewports(): Viewport[] {
  const wanted = (process.env.LAYOUT_VIEWPORTS ?? '').trim();
  if (!wanted || wanted === 'all') return ALL_VIEWPORTS;
  const parts = wanted.split(',').map((p) => p.trim()).filter(Boolean);
  return ALL_VIEWPORTS.filter((v) => parts.some((p) => v.name.includes(p)));
}

const cfg = loadConfig();
const layout = cfg.layout ?? {};
const VIEWPORTS = selectedViewports();
/** Profile's layout.skipViewports entry for a viewport, if any. */
const skipOf = (v: Viewport) => layout.skipViewports?.find((s) => (typeof s.test === 'string' ? v.name.includes(s.test) : s.test.test(v.name)));
const skipViewport = (v: Viewport) => {
  const skip = skipOf(v);
  test.skip(!!skip, `Viewport skipped for this shop: ${skip?.reason}`);
};

/** Guest pages audited at every viewport — derived from the profile, so every shop gets them without setup. */
function guestPages(c: ResolvedConfig): ClientPage[] {
  const list: ClientPage[] = [
    { name: 'Homepage', path: c.routes.home },
    { name: 'Category listing', path: c.testData.listingCategoryPath },
    { name: 'Product detail', path: c.testData.simpleProduct.path },
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

/**
 * Runs the layout audit and reports every defect class as its own soft assertion (all findings in one run).
 */
async function expectNoLayoutDefects(page: Page, testInfo: TestInfo, where: string, scope?: Locator): Promise<void> {
  const audit = await auditLayout(page, { ignore: layout.ignore, scope });
  await attachEvidence(page, testInfo, where.replace(/\W+/g, '-').toLowerCase(), audit);
  const at = `${where} (${page.url()})`;
  // profile's layout.acceptIssues: findings that are not bugs for this shop, matched against "<page> @ <viewport>"
  const key = `${where} @ ${VIEWPORTS.find((v) => v.width === page.viewportSize()?.width)?.name ?? ''}`;
  const accepted = (kind: LayoutIssue['kind']) => {
    const a = layout.acceptIssues?.find((i) => i.kind === kind && (typeof i.where === 'string' ? key.includes(i.where) : i.where.test(key)));
    if (a) testInfo.annotations.push({ type: 'accepted', description: `${key}: ${KIND_TITLE[kind]} — ${a.reason}` });
    return !!a;
  };
  if (!scope && !accepted('overflow')) {
    const culprits = audit.issues.filter((i) => i.kind === 'overflow');
    expect.soft(audit.overflowX, formatIssues(`${at}: page is ${audit.overflowX}px wider than the screen — ${KIND_TITLE.overflow}`, audit, culprits)).toBeLessThanOrEqual(1);
  }
  for (const kind of Object.keys(KIND_TITLE) as Array<LayoutIssue['kind']>) {
    if ((kind === 'overflow' && !scope) || kind === 'small-target' || accepted(kind)) continue;
    const found = audit.issues.filter((i) => i.kind === kind);
    expect.soft(found.length, formatIssues(`${at}: ${KIND_TITLE[kind]}`, audit, found)).toBe(0);
  }
}

/** Opens a page; 404 = data missing on this shop (skipped with the reason), bot challenge = inconclusive. */
async function open(page: Page, path: string): Promise<void> {
  const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
  const status = res?.status() ?? 0;
  test.skip(/just a moment/i.test(await page.title()), 'Inconclusive: Cloudflare bot challenge answered (run headed or allowlist the runner)');
  test.skip(status === 404 || status === 410, `${path} answered ${status} — page/data not available on this shop, layout not checkable`);
  expect(status, `${path} answered HTTP ${status}`).toBeLessThan(400);
  await closePopups(page, loadConfig());
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
    skipViewport(v);
    const mobileNav = v.width < (layout.mobileNavBelow ?? 992);

    for (const p of guestPages(cfg)) {
      test(`${p.name} has no layout defects`, async ({ page }, testInfo) => {
        await open(page, p.path);
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
  });
}
