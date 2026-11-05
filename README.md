# Shopware Playwright Suite

Reusable **Playwright + TypeScript** E2E skeleton for **Shopware 6.7 storefronts**.
Built and verified against the solution25 demo shop; designed to be copied into every
new client project and adapted through **one project profile file** instead of code changes.

---

## Quick start

```bash
npm ci
npx playwright install --with-deps chromium
cp .env.example .env          # fill in admin API credentials (see below)
npm run test:smoke            # ~45 critical tests, chromium
npm test                      # full suite: chromium + mobile (Pixel 7)
npm run report                # open HTML report
```

Useful variants:

```bash
npx playwright test tests/storefront/cart.spec.ts --headed
npx playwright test --grep @mobile --project=mobile
EXTRA_BROWSERS=firefox,webkit npm test
ALLOW_WRITE_TESTS=false npm test   # production-safe: no customers, orders or form submissions
npm run test:ui                    # Playwright UI mode for debugging
npm run test:crawl                 # catalog crawler only (leave it out elsewhere: --grep-invert @crawl)
npm run test:security              # passive security checks only
npm run test:responsive            # responsive layout suite only (desktop 1440, tablet 768, phone 375)
```

---

## Architecture

```
├── playwright.config.ts        # projects: setup → chromium/[firefox/webkit]/mobile → cleanup
├── .env.example                # secrets & environment switches (never commit .env)
├── projects/                   # ★ one profile per shop — the ONLY file you normally edit
│   ├── demo.ts                 #   demo shop
│   └── _template.ts            #   copy for a new client
├── src/
│   ├── config/                 # types + loader (profile + env overrides + selector merge)
│   ├── selectors/shopware67.ts # core storefront selectors (class/id/name based, language independent)
│   ├── api/                    # AdminApiClient (setup/cleanup), StoreApiClient (fast data setup)
│   ├── data/                   # test data builders (unique customers)
│   ├── components/             # Header, MainNavigation, CookieBanner, OffcanvasCart
│   ├── pages/                  # Page Objects: Listing, Product, Cart, Auth, Account, Checkout, Contact
│   ├── fixtures/index.ts       # ★ extended `test` — inject page objects, API clients, customer, loggedInPage
│   ├── client/                 # extension point for client-specific page objects/fixtures
│   └── utils/                  # price parsing, sorting helpers
└── tests/
    ├── setup/                  # health check (before) + test-data cleanup (after)
    ├── storefront/             # ★ core Shopware tests — reused unchanged across projects
    └── client/                 # client-specific tests (@client)
```

### Design principles

| Principle | How |
|---|---|
| **No hardcoded shop data** | URLs, products, categories, search terms, routes, redirects, feature flags → `projects/<name>.ts`. Secrets → `.env` / CI variables. |
| **Language independent** | Selectors use Shopware core classes, ids and form field names — never visible texts. Assertions use body classes (`is-ctl-checkout`) and URLs. |
| **Theme overrides without forking** | `selectors` in the profile is deep-merged over `shopware67Selectors`. Override only the keys a theme changes. |
| **Feature flags** | Tests for disabled features skip automatically (`features.wishlist = false` → wishlist specs skip). |
| **Fast, isolated test data** | Customers are created via Store API, carts filled via the storefront endpoint (same session), cleanup via Admin API. Every test gets its own customer — tests run fully parallel. |
| **Graceful degradation** | No Admin/Store API credentials? Customer registration and cart setup fall back to UI flows. |
| **Production-safe mode** | `ALLOW_WRITE_TESTS=false` skips everything that creates data (orders, customers, contact form). |
| **Page Objects expose intent, specs assert** | `cart.setQuantity(name, 2)` in POM; `expect(...)` stays in the spec. |

### Fixtures

```ts
import { test, expect } from '../../src/fixtures';

test('customer orders', async ({ loggedInPage, cartHelper, checkout, account, cfg }) => {
  await cartHelper.add(cfg.testData.simpleProduct, 2); // API speed, UI session
  await checkout.openConfirm();
  await checkout.placeOrder();
  await account.openOrders();
  await expect(account.orders.first()).toBeVisible();
});
```

| Fixture | Scope | Purpose |
|---|---|---|
| `cfg` | worker | resolved project config (profile + env + selectors) |
| `adminApi` / `storeApi` | worker | API clients, `null` if no credentials |
| `header`, `navigation`, `listing`, `product`, `cart`, `offcanvasCart`, `auth`, `account`, `checkout`, `contact`, `cookieBanner` | test | page objects |
| `cartHelper` | test | put products into the storefront cart without UI clicks |
| `customer` | test | freshly registered customer (auto-deleted afterwards), or the fixed account from `TEST_CUSTOMER_EMAIL` / `TEST_CUSTOMER_PASSWORD` (shared cart → logged-in tests that change the cart can interfere when run in parallel; use `--workers=1` for exact runs) |
| `loggedInPage` | test | `page` logged in as `customer` |
| `acceptCookies` | option | `test.use({ acceptCookies: false })` to see the cookie banner |
| `requireWriteAccess` | test | skip test when `ALLOW_WRITE_TESTS=false` |

### Tags

| Tag | Meaning |
|---|---|
| `@smoke` | critical path, run on every MR/PR (`npm run test:smoke`) |
| `@mobile` | also runs in the `mobile` project (Pixel 7) |
| `@mobile-only` | runs only in the `mobile` project |
| `@client` | client-specific tests |
| `@responsive` | responsive layout suite (`npm run test:responsive`) |

---

## Coverage (tests/storefront)

| Spec | Covers |
|---|---|
| `homepage` | header/nav/content/footer, JS errors |
| `cookie-consent` | banner shown and remembered, "accept all" remembered |
| `navigation` | configured categories, every category opens, flyout, breadcrumb |
| `listing` | product boxes, PDP link, pagination, sorting options and price sorting, pages past the end, filter types, manufacturer filter + reset, price filter |
| `product-detail` | core info, variant switch, reviews, 404 product |
| `search` | header search, suggest, no result, XSS-safe input, pages past the end |
| `cart` | add from PDP/listing, quantity on the cart page, PDP price = cart price × quantity, remove, promotion code |
| `checkout` | login/register gate, guest order, customer order → account, TOS required, payment/shipping methods, cart = confirm page (items, totals) |
| `registration` | register, empty-form validation, duplicate email |
| `login` | login/logout, wrong password, password recovery does not reveal accounts |
| `account` | overview, default address, orders (number + amount), login protection |
| `wishlist` | guest add, wishlist page + remove (feature-flagged) |
| `forms` | contact form validation + submit, newsletter (feature-flagged) |
| `mobile` | off-canvas nav, burger visibility, no horizontal overflow, off-canvas filters |
| `accessibility` | image alt attributes, labelled login/register fields |
| `pricing` | cart summary adds up (grand total = net + taxes; selectors `cart.summaryNet` / `summaryTax` for other themes) |
| `cart-merge` | guest cart + saved account cart merged at login (nothing lost or duplicated) — snapshots and restores the test account's cart |
| `catalog-crawl` (`@crawl`) | samples categories from the navigation (size: `crawl` in the profile) and checks they load without errors |
| `security` | security headers, session cookie flags, no debug output on error pages, no exposed files (`.env`, `.git` …). Bot-protection answers count as *inconclusive* (skipped) |
| `responsive-layout` (`@responsive`) | home, listing and PDP, the navigation (flyout / burger menu) and cart + off-canvas cart + guest checkout at desktop 1440×900, tablet 768×1024 and phone 375×812: horizontal overflow (with the causing elements), elements cut off at the screen edge, clipped text, covered controls, fixed/sticky bars hiding the screen, stretched images. Failures attach the measured issues as JSON and a full-page screenshot with the offenders outlined. Subset: `LAYOUT_VIEWPORTS=mobile` (name parts, comma-separated); shop specifics in `layout` of the profile |
| `links-and-errors` | important links, configured redirects, broken header/footer links, 404 page |

---

## Credentials & test data setup

The suite works without API credentials, but is faster and cleans up after itself with them.

**Bot protection (Cloudflare & co.)**: CI servers get challenged ("Performing security verification"). Ask the
hosting team for a WAF rule that skips challenges when a secret header is present, and set the same secret as
`E2E_HEADER_VALUE` (header name `E2E_HEADER_NAME`, default `x-e2e-bypass`). The suite then sends it with every
browser and API request to the shop's own host — never to third parties (payment, reviews, trackers).
Playwright writes headers and typed values in clear text into call logs, traces and the HTML report; the
last reporter (`src/reporters/redact-secrets.ts`) replaces the values of `E2E_HEADER_VALUE`, `HTTP_PASSWORD`,
`ADMIN_CLIENT_SECRET`, `ADMIN_PASSWORD`, `TEST_CUSTOMER_PASSWORD` and `SW_ACCESS_KEY` with `[REDACTED]` in every
artifact after the run. Older folders: `npx tsx src/reporters/redact-secrets.ts`. Console output is not covered.

1. **Admin API** — recommended: create an *Integration* in the admin
   (*Settings → System → Integrations*, with admin rights) → `ADMIN_CLIENT_ID` / `ADMIN_CLIENT_SECRET`.
   Alternative: `ADMIN_USERNAME` / `ADMIN_PASSWORD` of a dedicated test admin user.
2. **Store API access key** — resolved automatically via the Admin API from `BASE_URL`,
   or set `SW_ACCESS_KEY` (*Sales Channels → Storefront → API access*).

Test customers use `<prefix>.<timestamp>.<rand>@<domain>` (default `e2e.…@example.com`).
They are deleted after each test and a teardown project deletes any leftovers by prefix.

---

## Onboarding a new client project (≈ 1–2 hours)

1. **Copy the suite** into the client repo (e.g. `tests/e2e/`) or a separate repo.
2. `cp projects/_template.ts projects/<client>.ts` and fill in every `TODO`:
   - `baseURL`, `locale`
   - `features` — check the client's settings (wishlist, guest checkout, double opt-in, …)
   - `testData` — 1 simple product, 1 variant product, a listing category, main categories, search term
   - `paymentMethod` — an *offline* method (Vorkasse / Rechnung) so orders finish without a PSP redirect
   - `redirects` / `importantLinks` — client SEO redirects and legal pages
3. `.env`: `PROJECT=<client>`, `BASE_URL`, API credentials, basic auth for staging.
4. Run `npm run test:smoke -- --headed`. For every failure decide:
   - **Different markup** → override the selector key in `projects/<client>.ts → selectors`.
   - **Feature not used** → switch the feature flag off.
   - **Different data** → fix `testData`.
   - **Actual bug** → report it
5. Run the full suite, then add client-only tests under `tests/client/` using `src/client/fixtures.ts`.
6. Configure CI (below) with the variables from `.env.example`.

> Rule: **don't edit `tests/storefront/**` in client projects.** If a core test needs a code change
> for one client, make it configurable in the template instead and back-port it here — that is how
> the skeleton gets better with every project.

---

## CI

- **GitLab**: `.gitlab-ci.yml` — `smoke` on MRs/default branch, sharded `regression` nightly (schedule) or manually.
- **GitHub Actions**: `.github/workflows/playwright.yml` — smoke on PRs, full sharded run on push/nightly.
- **Bitbucket Pipelines**: `bitbucket-pipelines.yml` — one parallel step per shop (Mall Street, Echonut, Würth): smoke on PRs and `main`, every test in `custom: nightly-all-shops` (schedule it under *Pipelines → Schedules*), single shops via `custom: mallstreet | echonut | wurth`. Each shop's variables live in its deployment environment (*Repository settings → Deployments*, same names as `.env`, secrets "Secured"); steps run `ci/e2e.sh`. For now Mall Street and Würth are active; Echonut and Miniature Market (manual pipeline `custom: miniaturemarket` only) follow once their environments exist. `WORKERS=1` in an environment limits parallel browsers for shops that rate-limit (HTTP 429).

Delete the CI files you don't use.

Both use the official `mcr.microsoft.com/playwright` image (keep its version in sync with
`@playwright/test`) and publish the HTML report, traces/videos of failures and a JUnit report.

---

## Demo shop notes (verified 2026‑09‑24, Shopware 6.7)

- Storefront language is German; tests do not depend on texts.
- Wishlist is **disabled** in the demo sales channel → wishlist tests skip (`features.wishlist`).
- Country list contains only Germany. Registration has no birthday / password confirmation.
- 6.7 renders category flyouts as Bootstrap dropdowns: clicking a root category opens the flyout;
  `MainNavigation.openCategory()` handles both behaviours.
