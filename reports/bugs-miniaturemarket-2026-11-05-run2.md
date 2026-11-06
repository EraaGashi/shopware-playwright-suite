# Miniature Market staging — bug tickets, second run (2026-11-05)

Source: Playwright run against `https://swstaging.miniaturemarket.com` (profile `miniaturemarket`, chromium, ~17:00), 7 failed, 12 skipped.
Results and traces: `test-results-miniature/`.

Six of the seven failures are the same bugs as in the first run today (`reports/bugs-miniaturemarket-2026-11-05.md`); they are still open. One failure is new (ticket 6 below).
The three tests filed under "staging is very slow" in the first run (guest checkout, registered checkout, breadcrumb) passed this time with the raised timeouts.

| # | Ticket | Priority | Status | Failed tests |
|---|--------|----------|--------|--------------|
| 1 | `/retail-stl` returns 500 | High | Still open | links-and-errors: header and footer links |
| 2 | Listing and search return 500 past page 416 | Medium | Still open | listing: pages beyond the end · search: pages beyond the end |
| 3 | Cart and checkout pages are 5px wider than the screen on mobile/tablet | Medium | Still open | responsive-layout: cart/checkout @ 375×812 and 768×1024 |
| 4 | Promo images on category pages have no `alt` attribute | Low | Still open | accessibility: images have an alt attribute |
| 6 | Cookie choice is sometimes forgotten, banner comes back after reload | Medium | **New**, intermittent | cookie-consent: banner is shown and remembered @smoke |

Full steps and expected results for tickets 1–4 are in the first report. Only what this run confirms is repeated here.

---

## 1. `/retail-stl` returns HTTP 500 — still open

`https://swstaging.miniaturemarket.com/retail-stl → 500`, linked from the homepage header/footer. Unchanged since the first run.

## 2. Listing and search return HTTP 500 past result 10,000 — still open

- `/board-games.html?p=417` (24 per page) → **500**
- `/search?search=catan&p=417` → **500**

Same Elasticsearch/OpenSearch `max_result_window` (10,000) limit as before.

## 3. Cart and checkout scroll sideways on mobile and tablet (5px) — still open

Same elements, same 5px, both viewports:

| Page | Viewport | Element | Right edge |
|------|----------|---------|-----------|
| `/checkout/cart` | 375 | `div.container-main > div.checkout > div.checkout-container` | 380px (width 385px) |
| `/checkout/cart` | 768 | `div.container-main > div.checkout > div.checkout-container` | 773px (width 778px) |
| `/checkout/register` | 375 | `header.header-minimal … div.row.header-row.header-minimal-row` and `div.checkout-container` | 380px |
| `/checkout/register` | 768 | `header.header-minimal … div.row.header-row.header-minimal-row` and `div.checkout-container` | 773px |

Screenshots: `test-results-miniature/storefront-responsive-layo-*/test-failed-1.png`.

## 4. Promo images on `/board-games.html` have no `alt` attribute — still open

- `/thumbnail/b6/0b/c9/1763138310/11-14-2025_Emberleaf_Slider_800x800.webp`
- `/media/a7/55/c2/1751986192/7-01-2025_Gift-Card_RIR_1920x1920.png`
- `/media/30/34/0e/1751891160/7-01-2025_BuyBack_RIR_800x800.jpg`

---

## 6. Cookie choice is sometimes forgotten: banner shows again after reload (new)

**Priority:** Medium. A visitor who picked "Only technically required" is asked again on the next page. That is annoying, and if the choice is lost the shop has no stored consent decision for that visitor.

**Steps to reproduce**
1. Open `https://swstaging.miniaturemarket.com/` in a fresh browser (no cookies).
2. In the cookie banner, click **Only technically required**.
3. The banner closes and the page reloads by itself; `cookie-preference=1` is set.
4. Wait about 5 seconds, then reload the page.

**Actual (in the failed run):** After step 4 the cookie banner is shown again. The `cookie-preference` cookie that was set in step 3 is gone.
**Expected:** The banner stays closed after reload and in later visits until the visitor changes the choice.

**What the trace shows** (`test-results-miniature/storefront-cookie-consent--…/trace.zip`):

| Time (UTC) | Request | `cookie-preference` sent? |
|------------|---------|---------------------------|
| 16:09:33.3 | `GET /` (first visit) | no (correct) |
| 16:09:35.3 | click "Only technically required" → `POST /mm-consent/log` | — |
| 16:09:35.6 | `GET /` (page reloads itself after the click) | **yes**, `cookie-preference=1` |
| 16:09:40.3 | `GET /` (test reloads) | **no**, cookie was removed |

So the cookie was set correctly and then deleted while the page that loaded after the click was open (between 35.6 s and 40.3 s). `cookie-config-hash` was never set in that time. A `net::ERR_CONNECTION_RESET` for one resource was logged on that page.

**How often:** Intermittent. It passed in the first run today, and three manual retries right after this run (fresh browser, same steps) all kept `cookie-preference` and the banner stayed closed.

**Notes / likely cause:** Something on page load clears `cookie-preference`. Things to check:
- Shopware's cookie plugin resets the choice when `cookie-config-hash` is missing or does not match the current cookie configuration. The shop never wrote `cookie-config-hash` after the "Only technically required" click. If the custom consent handler (`/mm-consent/log`, page self-reload) replaced Shopware's handler, the hash may never be written, and a reset can happen depending on timing.
- A script that removes non-essential cookies after the choice may sometimes also remove `cookie-preference`.

Please check whether the custom consent code writes `cookie-config-hash` and whether any cleanup script can delete `cookie-preference`.
