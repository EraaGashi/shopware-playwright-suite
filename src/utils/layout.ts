import type { Locator, Page, TestInfo } from '@playwright/test';

/**
 * Responsive layout audit: measures the rendered page in the browser and returns concrete
 * offending elements (selector path, text, measured pixels) instead of a plain pass/fail.
 *
 * What counts as a defect (and what does not):
 * - horizontal overflow of the document (scrollWidth > clientWidth — the scrollbar is excluded);
 *   normal vertical scrolling is never flagged
 * - visible elements cut off at the left/right screen edge — elements inside a clipping container
 *   (overflow hidden/auto/scroll: carousels, sliders, scroll areas) are skipped, the container is checked instead
 * - text cut off inside its own box (overflow hidden without ellipsis / line clamp)
 * - controls covered by another element (checked at the top of the page, nothing opened)
 * - fixed / sticky elements hiding a large part of the screen
 * - touch targets below `minTarget` px that also lack the WCAG 2.5.8 spacing
 * - images stretched out of their aspect ratio
 */

export interface LayoutIssue {
  kind: 'overflow' | 'cut-off' | 'clipped-text' | 'covered' | 'fixed-cover' | 'small-target' | 'distorted-image';
  element: string;
  detail: string;
}

export interface LayoutAudit {
  viewport: { width: number; height: number };
  /** document width minus visible width (px); > 0 = horizontal scrolling */
  overflowX: number;
  issues: LayoutIssue[];
}

export interface AuditOptions {
  /** Elements (and their children) left out of every check, e.g. third-party widgets. */
  ignore?: string[];
  /** Minimum touch target size in px; 0 = check off (desktop). */
  minTarget?: number;
  /** Only audit inside this element (off-canvas, modal …). */
  scope?: Locator;
}

/** Marker attribute set on offending elements, so a screenshot can highlight them. */
const MARK = 'data-e2e-layout-issue';

/** Scrolls through the page once (lazy images / sliders get their final size), then back to the top. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => undefined);
  await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    await document.fonts?.ready;
    const step = Math.max(200, window.innerHeight);
    // bounded: very long pages are sampled, not fully scrolled
    for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < 15; y += step, i++) {
      window.scrollTo(0, y);
      await frame();
    }
    window.scrollTo(0, 0);
    await frame();
  });
  // lazy images started by the scroll; bounded — third-party trackers can keep the network busy
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
}

export async function auditLayout(page: Page, opts: AuditOptions = {}): Promise<LayoutAudit> {
  const scopeHandle = opts.scope ? await opts.scope.elementHandle() : null;
  return page.evaluate(
    ({ scope, ignore, minTarget, MARK }) => {
      const doc = document.documentElement;
      const vw = doc.clientWidth;
      const vh = window.innerHeight;
      const root: Element = scope ?? document.body;
      const issues: LayoutIssue[] = [];
      document.querySelectorAll(`[${MARK}]`).forEach((e) => e.removeAttribute(MARK));

      const isIgnored = (el: Element) => ignore.some((s) => { try { return !!el.closest(s); } catch { return false; } });
      const isVisible = (el: Element) =>
        (el as any).checkVisibility ? (el as any).checkVisibility({ opacityProperty: true, visibilityProperty: true }) : !!(el as HTMLElement).offsetParent;
      const px = (n: number) => `${Math.round(n)}px`;
      const describe = (el: Element) => {
        const part = (e: Element) => {
          let s = e.tagName.toLowerCase();
          if (e.id) return `${s}#${e.id}`;
          const cls = Array.from(e.classList).filter((c) => !/^(js-|is-|show$|active$|col-)/.test(c)).slice(0, 3);
          if (cls.length) s += '.' + cls.join('.');
          return s;
        };
        const parts: string[] = [];
        for (let e: Element | null = el, i = 0; e && e !== document.body && i < 3; e = e.parentElement, i++) {
          parts.unshift(part(e));
          if (e.id) break;
        }
        const text = ((el as HTMLElement).innerText || el.getAttribute('aria-label') || el.getAttribute('alt') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        return parts.join(' > ') + (text ? ` "${text}"` : '');
      };
      const add = (kind: LayoutIssue['kind'], el: Element, detail: string) => {
        el.setAttribute(MARK, kind);
        issues.push({ kind, element: describe(el), detail });
      };
      /** nearest ancestor that clips its content horizontally (html/body excluded — they are the page itself) */
      const clipper = (el: Element): Element | null => {
        for (let a = el.parentElement; a && a !== document.body && a !== doc; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (cs.overflowX !== 'visible' || cs.contain.includes('paint')) return a;
        }
        return null;
      };
      /** screen-reader-only content (Bootstrap .visually-hidden: clip + 1px box) — invisible on purpose */
      const srOnly = new Map<Element, boolean>();
      const isSrOnly = (el: Element | null): boolean => {
        if (!el || el === document.body) return false;
        if (srOnly.has(el)) return srOnly.get(el)!;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const hidden = cs.clip !== 'auto' || (cs.clipPath !== 'none' && /inset\(50%|rect\(0/.test(cs.clipPath)) ||
          (r.width <= 2 && r.height <= 2 && cs.overflow !== 'visible') || isSrOnly(el.parentElement);
        srOnly.set(el, hidden);
        return hidden;
      };
      const all = Array.from(root.querySelectorAll('*')).filter((el) => !isIgnored(el) && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'BR'].includes(el.tagName));
      const visible = all.filter((el) => isVisible(el) && !isSrOnly(el));

      // ---- horizontal overflow / elements cut off at the screen edge ----
      const overflowX = Math.max(0, doc.scrollWidth - doc.clientWidth);
      const pageClips = ['hidden', 'clip'].includes(getComputedStyle(doc).overflowX) || ['hidden', 'clip'].includes(getComputedStyle(document.body).overflowX);
      const outside = new Set<Element>();
      for (const el of visible) {
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) continue; // visually-hidden helpers (clip rect)
        const cutRight = r.right > vw + 1;
        const cutLeft = r.left < -1;
        if (!cutRight && !cutLeft) continue;
        if (clipper(el)) continue;
        const fixed = getComputedStyle(el).position === 'fixed';
        const fullyOff = r.left >= vw - 1 || r.right <= 1;
        // fully off-screen: slide-in panels (fixed) and "left:-9999px" hiding never show; to the right they only matter when they widen the page
        if (fullyOff && (fixed || r.right <= 1 || pageClips)) continue;
        outside.add(el);
      }
      /** text, images or controls of the element really lie beyond the screen edge (not just an empty box margin) */
      const contentOutside = (el: Element) => {
        const out = (r: DOMRect) => r.width > 1 && r.height > 1 && (r.left < -1 || r.right > vw + 1);
        const range = document.createRange();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent!.trim()) continue;
          range.selectNodeContents(n);
          if (Array.from(range.getClientRects()).some(out)) return true;
        }
        const media = [el, ...Array.from(el.querySelectorAll('img, video, iframe, canvas, svg, input, select, textarea, button'))];
        return media.some((m) => (m === el ? !el.children.length : true) && isVisible(m) && out(m.getBoundingClientRect()));
      };
      // report the outermost offenders (the cause), not every child inside them
      for (const el of outside) {
        if (el.parentElement && outside.has(el.parentElement)) continue;
        const r = el.getBoundingClientRect();
        // page does not scroll (or the element only sticks out on the left, which never scrolls):
        // only report what a visitor actually loses at the edge
        if ((!(overflowX > 0 && !pageClips) || r.right <= vw + 1) && !contentOutside(el)) continue;
        const by = r.right > vw + 1 ? `right edge at ${px(r.right)}, ${px(r.right - vw)} beyond the ${vw}px screen` : `left edge at ${px(r.left)}`;
        const w = getComputedStyle(el).width;
        add(overflowX > 0 && !pageClips ? 'overflow' : 'cut-off', el, `${by} (width ${w}${r.width > vw ? ', wider than the screen' : ''})`);
      }

      // ---- text cut off inside its own box ----
      /** the rendered letters (not just the line height) leave the element's box */
      const lettersOutside = (el: Element) => {
        const box = el.getBoundingClientRect();
        const range = document.createRange();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent!.trim()) continue;
          range.selectNodeContents(n);
          for (const r of Array.from(range.getClientRects())) {
            if (r.width === 0 || r.height === 0) continue;
            if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) return true;
          }
        }
        return false;
      };
      for (const el of visible) {
        if (['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'IMG', 'SVG', 'svg', 'VIDEO', 'IFRAME', 'CANVAS'].includes(el.tagName)) continue;
        const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim().length > 1);
        if (!ownText) continue;
        const cs = getComputedStyle(el);
        const h = el as HTMLElement;
        const clipsX = cs.overflowX !== 'visible' && h.scrollWidth > h.clientWidth + 1 && cs.textOverflow !== 'ellipsis';
        const clamp = cs.getPropertyValue('-webkit-line-clamp');
        const clipsY = ['hidden', 'clip'].includes(cs.overflowY) && h.scrollHeight > h.clientHeight + 2 && (!clamp || clamp === 'none');
        if (h.clientWidth === 0 || h.clientHeight === 0) continue;
        // a line height larger than the box overflows on paper, but the letters may still fit:
        // horizontally the letters must leave the box, vertically at least half a line must be hidden
        if (clipsX && !lettersOutside(el)) continue;
        if (!clipsX && clipsY && h.scrollHeight - h.clientHeight < parseFloat(cs.fontSize) * 0.5) continue;
        if (clipsX) add('clipped-text', el, `text needs ${px(h.scrollWidth)} but the box is ${px(h.clientWidth)} wide (overflow: ${cs.overflowX})`);
        else if (clipsY) add('clipped-text', el, `text needs ${px(h.scrollHeight)} but the box is ${px(h.clientHeight)} high (overflow: ${cs.overflowY})`);
      }

      // ---- interactive controls ----
      const CONTROL = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], summary';
      const controls = visible.filter((el) => el.matches(CONTROL) && !(el as HTMLButtonElement).disabled);
      /** the part of the element that is not clipped away by scroll/overflow containers */
      const shownRect = (el: Element) => {
        const r = el.getBoundingClientRect();
        let [l, t, rt, b] = [r.left, r.top, r.right, r.bottom];
        for (let a = el.parentElement; a && a !== doc; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
          const ar = a.getBoundingClientRect();
          l = Math.max(l, ar.left); t = Math.max(t, ar.top); rt = Math.min(rt, ar.right); b = Math.min(b, ar.bottom);
        }
        return rt - l > 1 && b - t > 1 ? { l, t, rt, b } : null;
      };
      const related = (a: Element, b: Element) =>
        a.contains(b) || b.contains(a) || ((a as HTMLInputElement).labels && Array.from((a as HTMLInputElement).labels!).some((l) => l.contains(b))) ||
        // the same link twice (e.g. a banner and its "Discover now" button) — clicking either goes to the same place
        (!!a.closest('a[href]') && a.closest('a[href]')!.getAttribute('href') === b.closest('a[href]')?.getAttribute('href'));
      /** fixed / sticky bars (sticky add-to-cart, headers) overlap content by design — it is reachable by scrolling */
      const inBar = (e: Element | null) => {
        for (let a = e; a && a !== document.body; a = a.parentElement) if (/fixed|sticky/.test(getComputedStyle(a).position)) return true;
        return false;
      };
      for (const el of controls) {
        const s = shownRect(el);
        if (!s) continue;
        const cx = (s.l + s.rt) / 2;
        const cy = (s.t + s.b) / 2;
        if (cx < 0 || cy < 0 || cx > vw || cy > vh) continue; // only what is on screen at the top of the page
        const hit = document.elementFromPoint(cx, cy);
        if (!hit || related(el, hit) || isIgnored(hit) || (inBar(hit) && !inBar(el))) continue;
        add('covered', el, `centre (${px(cx)}, ${px(cy)}) is covered by ${describe(hit)}`);
      }

      // ---- fixed / sticky elements hiding the screen (top of page, nothing opened) ----
      for (const el of visible) {
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed') continue;
        if (el.parentElement && getComputedStyle(el.parentElement).position === 'fixed') continue;
        const r = el.getBoundingClientRect();
        const w = Math.min(r.right, vw) - Math.max(r.left, 0);
        const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        if (w <= 0 || h <= 0) continue;
        const share = (w * h) / (vw * vh);
        if (share > 0.4) add('fixed-cover', el, `fixed element covers ${Math.round(share * 100)}% of the ${vw}×${vh} screen without being opened`);
      }

      // ---- touch targets (WCAG 2.5.8: at least 24×24 px, or 24 px of free space around) ----
      if (minTarget > 0) {
        const targets = controls.filter((el) => {
          if (el.matches('input[type="checkbox"], input[type="radio"]') && (el as HTMLInputElement).labels?.length) return false;
          // links inside running text are exempt
          if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') {
            const parentText = (el.parentElement?.textContent ?? '').replace(el.textContent ?? '', '').trim();
            if (parentText.length > 10) return false;
          }
          return true;
        });
        const rects = targets.map((el) => [el, el.getBoundingClientRect()] as const);
        for (const [el, r] of rects) {
          if (r.width >= minTarget && r.height >= minTarget) continue;
          if (r.width <= 1 || r.height <= 1) continue;
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const half = minTarget / 2;
          const crowded = rects.find(([o, or]) => o !== el && !o.contains(el) && !el.contains(o) &&
            or.left < cx + half && or.right > cx - half && or.top < cy + half && or.bottom > cy - half);
          if (crowded) add('small-target', el, `${px(r.width)}×${px(r.height)} target, next to ${describe(crowded[0])}`);
        }
      }

      // ---- stretched images ----
      for (const el of visible) {
        if (el.tagName !== 'IMG') continue;
        const img = el as HTMLImageElement;
        if (!img.complete || !img.naturalWidth || /\.svg(\?|$)/i.test(img.currentSrc)) continue;
        const r = img.getBoundingClientRect();
        if (r.width < 24 || r.height < 24) continue;
        if (getComputedStyle(img).objectFit !== 'fill') continue;
        const natural = img.naturalWidth / img.naturalHeight;
        const shown = r.width / r.height;
        const diff = Math.abs(shown / natural - 1);
        if (diff > 0.05) add('distorted-image', img, `shown ${px(r.width)}×${px(r.height)}, image is ${img.naturalWidth}×${img.naturalHeight} — stretched by ${Math.round(diff * 100)}%`);
      }

      return { viewport: { width: vw, height: vh }, overflowX, issues };
    },
    { scope: scopeHandle, ignore: opts.ignore ?? [], minTarget: opts.minTarget ?? 0, MARK },
  );
}

/** Height share of the screen hidden by fixed/sticky bars after scrolling into the page (0–1). */
export async function stickyCoverage(page: Page): Promise<{ share: number; elements: string[] }> {
  return page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    window.scrollTo(0, Math.min(document.documentElement.scrollHeight / 2, window.innerHeight * 2));
    await frame();
    await frame();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const bars: Array<[number, number, string]> = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (!(el as any).checkVisibility?.({ opacityProperty: true, visibilityProperty: true })) continue;
      const r = el.getBoundingClientRect();
      // full-width bars only (header, bottom bar) — small floating buttons don't hide content
      if (r.bottom <= 0 || r.top >= vh || r.width < vw * 0.5) continue;
      bars.push([Math.max(0, r.top), Math.min(vh, r.bottom), el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')]);
    }
    // union of the covered y-ranges
    bars.sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let end = 0;
    for (const [t, b] of bars) {
      if (b <= end) continue;
      covered += b - Math.max(t, end);
      end = b;
    }
    window.scrollTo(0, 0);
    await frame();
    return { share: covered / vh, elements: bars.map((b) => `${b[2]} (${Math.round(b[1] - b[0])}px)`) };
  });
}

/** Human-readable failure text: route, viewport and every offending element. */
export function formatIssues(where: string, audit: LayoutAudit, issues: LayoutIssue[]): string {
  const lines = issues.slice(0, 12).map((i) => `  - ${i.element}: ${i.detail}`);
  if (issues.length > 12) lines.push(`  … ${issues.length - 12} more (see the attached layout-issues.json)`);
  return `${where} @ ${audit.viewport.width}×${audit.viewport.height}\n${lines.join('\n')}`;
}

/** Attaches the measured issues and a full-page screenshot with the offenders outlined in red. */
export async function attachEvidence(page: Page, testInfo: TestInfo, name: string, audit: LayoutAudit): Promise<void> {
  if (!audit.issues.length) return;
  await testInfo.attach(`${name}-layout-issues.json`, { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });
  const style = await page.addStyleTag({ content: `[${MARK}]{outline:3px solid #e00!important;outline-offset:-1px!important}` }).catch(() => null);
  const shot = await page.screenshot({ fullPage: true, timeout: 15_000 }).catch(() => null);
  if (shot) await testInfo.attach(`${name}-highlighted.png`, { body: shot, contentType: 'image/png' });
  await style?.evaluate((s) => (s as HTMLElement).remove()).catch(() => undefined);
}
