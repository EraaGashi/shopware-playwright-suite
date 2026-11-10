# Miniature Market staging — bug tickets (2026-11-05)

Source: Playwright run against `https://swstaging.miniaturemarket.com` (profile `miniaturemarket`, chromium), 9 failed tests.
Bugs 1 and 2 were checked again with plain HTTP requests after the run and still happen.

| # | Ticket | Priority | Failed tests |
|---|--------|----------|--------------|
| 1 | `/retail-stl` returns 500 | High | links-and-errors: header and footer links |
| 2 | Listing and search return 500 past page 416 | Medium | listing: pages beyond the end · search: pages beyond the end |
| 3 | Cart and checkout pages are 5px wider than the screen on mobile/tablet | Medium | responsive-layout: cart/checkout @ 375×812 and 768×1024 |
| 4 | Promo images on category pages have no `alt` attribute | Low | accessibility: images have an alt attribute |
| 5 | Staging is very slow (login, category pages, checkout) | Low / check | checkout: guest · checkout: registered · navigation: breadcrumb |

---

## 1. `/retail-stl` returns HTTP 500

**Priority:** High: the page is linked from the homepage header/footer, so every visitor can reach it.

**Steps to reproduce**
1. Open `https://swstaging.miniaturemarket.com/`.
2. Click the header/footer link that points to `/retail-stl`, or open `https://swstaging.miniaturemarket.com/retail-stl` directly.

**Actual:** The server answers **500 Internal Server Error**.
**Expected:** The retail store page loads (200). If the page was removed, the link should go too, or the URL should redirect (301) to a page that exists.

**Notes:** Happens every time (seen in the test run, then again with `curl`, which took about 3.6 s to return the 500). Please check the server log for the exception. A likely cause is a missing or broken CMS/landing page or SEO URL behind `/retail-stl`.

---

## 2. Category listing and search return HTTP 500 for pages past result 10,000

**Priority:** Medium. Normal visitors rarely get this far, but crawlers and bots follow pagination and SEO links. Every hit fills the error log and takes about 4 s of server time.

**Steps to reproduce**
- `https://swstaging.miniaturemarket.com/board-games.html?p=416` → 200
- `https://swstaging.miniaturemarket.com/board-games.html?p=417` → **500**
- `https://swstaging.miniaturemarket.com/search?search=catan&p=417` → **500**

**Actual:** With 24 products per page, page 417 starts after result 10,000. Any page from there on gives a 500.
**Expected:** A page past the end should not crash. It should show an empty result or a 404, or redirect to the last valid page.

**Notes:** 10,000 is Elasticsearch/OpenSearch's default `index.max_result_window`. The search query fails and Shopware does not catch the error. Possible fixes:
- limit the page number in the listing/search route (return a 404 when `(p-1) * limit ≥ 10000`), or
- raise `max_result_window` on the product index, if deep paging is really needed.

---

## 3. Cart and checkout pages scroll sideways on mobile and tablet (5px overflow)

**Priority:** Medium. The page wobbles sideways on phones during checkout, the most important flow.

**Steps to reproduce**
1. Add any product to the cart.
2. On a 375×812 (mobile) or 768×1024 (tablet) viewport, open:
   - `/checkout/cart`
   - `/checkout/register` (guest checkout step)

**Actual:** The page is **5px wider than the screen** and can be scrolled sideways. These elements stick out:

| Page | Viewport | Element | Right edge |
|------|----------|---------|-----------|
| `/checkout/cart` | 375 | `div.container-main > div.checkout > div.checkout-container` | 380px (width 385px) |
| `/checkout/cart` | 768 | `div.container-main > div.checkout > div.checkout-container` | 773px (width 778px) |
| `/checkout/register` | 375 | `header.header-minimal > div.container > div.row.header-row.header-minimal-row` | 380px |
| `/checkout/register` | 375 | `div.checkout-container` | 380px |
| `/checkout/register` | 768 | `header.header-minimal … .header-minimal-row` | 773px |
| `/checkout/register` | 768 | `div.checkout-container` | 773px |

**Expected:** No horizontal scrolling; the content fits the viewport width.

**Notes:** The overflow is the same 5px on both elements and both viewports. That points to one theme rule, for example a `.row` with negative margins whose parent has no matching padding, or a fixed `margin`/`width` on `.checkout-container` and `.header-minimal-row`. Desktop is not affected. Screenshots: `test-results-miniature/storefront-responsive-layo-*/test-failed-1.png`.

---

## 4. Promo images on category pages have no `alt` attribute

**Priority:** Low (accessibility, WCAG 2.1 SC 1.1.1).

**Steps to reproduce:** Open `https://swstaging.miniaturemarket.com/board-games.html` and inspect the banner/slider images.

**Actual:** These visible images have no `alt` attribute:
- `/thumbnail/b6/0b/c9/1763138310/11-14-2025_Emberleaf_Slider_800x800.webp`
- `/media/a7/55/c2/1751986192/7-01-2025_Gift-Card_RIR_1920x1920.png`
- `/media/30/34/0e/1751891160/7-01-2025_BuyBack_RIR_800x800.jpg`

**Expected:** Every `<img>` has an `alt` attribute: a short description for images that carry content (e.g. "Gift cards"), or `alt=""` for decoration.

**Notes:** These are CMS banner images. Fill in the "Alternative text" in the media manager, or have the CMS image/slider element print `alt` even when it is empty. The UserWay overlay does not fix this in the HTML.

---

## 5. Staging responds very slowly (login, category pages, checkout)

**Priority:** Low / needs checking. This may only affect the staging server. Please check whether production shows the same.

**What was measured in the test run:**
- Clicking **Login** took **9.3 s** to respond.
- The `load` event of the first page took **11 s**.
- `/board-games.html` did **not reach `load` within 30 s** (navigation › breadcrumb test).
- In guest checkout, submitting `/checkout/register` took **over 10 s** to redirect to `/checkout/confirm`; it got there eventually.
- The registered-customer checkout used up its whole 60 s test budget on logins, page loads and add-to-cart before it reached the payment step.

**Expected:** Pages and form submits respond within a few seconds.

**Notes:** On a single `curl` the HTML of `/board-games.html` comes back in about 0.8 s. The slow `load` is therefore probably third-party scripts: UserWay, chat widget, Reviews.io, PayPal/Google Pay SDKs. The slow login and register submits are on the server side. The suite's Miniature Market timeouts were raised to 120 s (test) / 45 s (navigation) after this run. These three tests should pass on the next run if the only problem is speed. If they still fail, this ticket becomes a functional bug.
