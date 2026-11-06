import type { ProjectConfig } from '../src/config/types';

/**
 * Würth Kosovo — B2B-only storefront. See notes inline; the two biggest
 * differences from a typical Shopware shop are:
 *  1. There is NO guest checkout at all — every checkout requires a
 *     registered, logged-in business account (verified: an unauthenticated
 *     visitor with items in cart is redirected /checkout/confirm ->
 *     /checkout/register, which offers only Login / Create business account).
 *  2. Guests cannot see prices anywhere (PDP, listing, cart) — every price
 *     slot is replaced with a "log in to see prices" prompt.
 */
const config: ProjectConfig = {
  name: 'Würth Kosovo',
  // Production (eshop.wurth-kosova.com) exists but no known working login
  // account was found there. This staging mirror is what a real test
  // account authenticates against — see the customer note below.
  baseURL: 'http://wurth.com.cloud7-vm254.de-nserver.de',
  locale: 'sq-AL',          // CHANGED from de-DE — storefront is Albanian throughout
  currencySymbol: '€',

  features: {
    wishlist: false,                 // verified 2026-09-25 — no wishlist button in header, listing or PDP (the core /wishlist route still answers 200)
    guestCheckout: false,             // CHANGED — CONFIRMED: no guest checkout exists at all (see file header note)
    registration: true,               // "Krijo llogari të re" / "Regjistrohu" exists on the login/register gate
    doubleOptInRegistration: false,   // UNVERIFIED — registration form itself was never submitted (see testData.customer note)
    productReviews: true,             // "Vlerësimet" (Reviews) tab confirmed present on PDP
    contactForm: true,                // CHANGED 2026-09-25 — verified: /Kontakti/ has form[action="/form/contact"]
    newsletter: true,                 // CHANGED — footer email field, POSTs to /form/newsletter, native HTML5 validation only (no custom class)
    promotionCodes: true,             // confirmed: cart has a "Keni kod zbritjeje?" accordion with a working (rejects invalid codes) input
    cookieBanner: true,
    languageSwitch: false,            // UNVERIFIED — only Albanian observed, no switcher seen
    currencySwitch: false,
    mobileNavigation: true,
    // test orders approved for this staging shop on 2026-11-05 ("you can make orders in wurth") — cash on delivery,
    // only with ALLOW_WRITE_TESTS=true (all 3 payment methods are offline / non-redirect)
    orderPlacement: true,
    trackingConsent: false,           // decided 2026-10-05: consent-before-tracking requirement not applied for this shop (Kosovo)
    guestPrices: false,               // CHANGED — guests see "Kyqu për të parë çmimin" instead of prices, tax, delivery info and cart totals
  },

  routes: {
    home: '/',
    login: '/account/login',
    register: '/account/register',        // UNVERIFIED path (never submitted) — the checkout-flow gate uses /checkout/register instead
    account: '/account',
    accountProfile: '/account/profile',    // UNVERIFIED
    accountAddresses: '/account/address',  // UNVERIFIED
    accountOrders: '/account/order',       // UNVERIFIED path, but real order history IS visible on /account itself ("Porositë" section)
    logout: '/account/logout-custom',      // CHANGED — confirmed real href is /account/logout-custom, NOT the Shopware default /account/logout
    cart: '/checkout/cart',
    checkoutRegister: '/checkout/register',
    checkoutConfirm: '/checkout/confirm',
    checkoutFinish: '/checkout/finish',    // UNVERIFIED — never reached (see orderPlacement note); CheckoutFinishPage equivalent is untested
    search: '/search',
    wishlist: '/wishlist',                 // N/A — wishlist feature not confirmed to exist
    // verified 2026-09-25: new B2B accounts land on "Kërkesa juaj është në shqyrtim" (request under review, up to 24h)
    registerPending: '/account/register/success',
    contactPage: '/Kontakti/',             // CHANGED — verified 2026-09-25
  },

  testData: {
    // Top-level utility nav (not product categories): Dyqani Online, Zyrat e
    // Degëve, Shërbimet, Kompania, Karriera, Kontakti, Katalogjet. "Products
    // test" also appears in this exact staging environment's nav — it looks
    // like a staging-only artifact (English name amid Albanian) and should
    // NOT be relied on as a real category.
    mainCategories: ['Dyqani Online', 'Zyrat e Degëve', 'Shërbimet', 'Kompania', 'Karriera', 'Kontakti'],
    // CHANGED 2026-09-25: old /Online-Shop/Siguri-ne-Pune/Doreza/Aksesore/ now 404s. Taken from the
    // simpleProduct's breadcrumb; has sorting + property & price filters (upper levels are landing pages).
    listingCategoryPath: '/Dyqani-Online/Siguri-Ne-Pune/Doreza/Doreza-Njeperdorimeshe/',

    // ⚠ Friendly SEO-slug URLs broke site-wide during this project (confirmed
    // 404 on at least two unrelated products, each still reachable via its
    // canonical /detail/{id} URL through a SKU-search redirect). Using the
    // canonical form here deliberately — it's what kept working throughout.
    simpleProduct: {
      path: '/detail/019c5170998d7339a951cb56ea81f5f6',
      productNumber: '0899899023',
      name: 'Mbajtëse dorëzash me grep',
    },

    // Has real size options (M/L/XL/XXL). ⚠ Its friendly URL was NOT
    // re-verified after the slug breakage above — confirm before relying on
    // the path below, or resolve it the same way (search by productNumber,
    // follow the redirect to /detail/{id}).
    variantProduct: {
      // CHANGED 2026-09-25: friendly URL 404s → canonical /detail/{id} (found via search for 0899970911)
      path: '/detail/019c51709992721d91c4b715ff8b2ab7',
      productNumber: '0899970911',
      name: 'Dorëza mbrojtëse nitril portokalli',   // CHANGED 2026-11-04 — cart label "Dorëza mbrojtëse nitril portokalli, M"
      optionGroups: ['Madhësia'], // "Size" in Albanian
    },

    searchTerm: 'doreza',
    searchMinResults: 18,             // verified count of .product-action tiles for this term at last check
    searchTermVariants: ['dorëza', 'Dorëza'],   // verified 2026-10-07: same 18 results as 'doreza'
    searchNoResultTerm: 'zzqx-no-such-product-4711',
    // UNVERIFIED — a filter-panel toggle exists (confirmed element present)
    // but the actual filter TYPES behind it were never opened/enumerated.
    // CHANGED 2026-09-25: verified on listingCategoryPath — no manufacturer filter in this shop
    expectedFilterTypes: ['properties', 'price'],
    // Verified via the real sort dropdown; two extra Albanian-only options
    // also exist with no obvious Shopware key equivalent: "Rezultatet
    // kryesore" (top results / relevance) and "Më të shiturat" (bestsellers).
    expectedSortings: ['name-asc', 'name-desc', 'price-asc', 'price-desc'],

    customer: {
      // ⚠ IMPORTANT: this framework's generic registration flow will very
      // likely NOT work for Würth as-is. Its registration form is a full
      // B2B form requiring a "Unique Business ID" field that has no
      // equivalent in ProjectConfig['testData']['customer'] or
      // shopware67Selectors.register — registration was never attempted
      // ourselves (account creation is something we do not do on a user's
      // behalf), so this is flagged, not fixed.
      emailDomain: 'example.com',
      emailPrefix: 'e2e',
      password: 'Shopware-E2E-2026!',
      firstName: 'Erika',
      lastName: 'Tester',
      salutationIndex: 1,           // UNVERIFIED — registration form was never opened
      address: {
        street: 'Rruga Test 1',      // placeholder — not a verified real address
        zipcode: '20000',
        city: 'Prizren',             // matches a real address seen on the test account
        countryIso: 'XK',            // Kosovo (unofficial but commonly used ISO code)
        countryLabel: 'Kosovë',
        phoneNumber: '+38344000000', // required (Store API: PHONE_NUMBER_IS_BLANK_ERROR) — dummy number
      },
      // default billing + shipping street of the TEST_CUSTOMER_EMAIL account ("Erjon Ahmeti, dasd, 20000 Prizren",
      // checked 2026-11-05) — update it when the account's default changes
      testCustomerDefaultStreet: 'dasd',
      // zipcode/city are <select>s here: 20000 → city auto-selects "Prizren"
      // B2B-only fields of form.register-form--new-customer (verified 2026-09-25):
      extraFields: [
        { selector: '[name="billingAddress[customFields][business_unique_number]"]', value: '{random}' },
        { selector: '[name="billingAddress[company]"]', value: 'E2E Test Company' },
        { selector: '[name="billingAddress[customFields][division]"]', value: 'AUTO' },
        { selector: '[name="billingAddress[customFields][branch]"]' },   // options load after division → first one
        // accountType: preset to "Biznes" and disabled → nothing to fill
      ],
    },

    contactLinkText: /Kontakti|Contact/i, // CHANGED — Albanian nav label is "Kontakti"
    // required on /Kontakti/ besides the standard fields (checked 2026-11-05); subject is a dropdown → first option
    contactExtraFields: [
      { selector: '[name="customerNumber"]', value: 'E2E-TEST' },
      { selector: '[name="privacy"]' },
    ],
    // verified 2026-10-05 — terms, privacy, legal info, returns, cookies, disclaimer (all in the footer, all 200)
    legalLinks: [/Kushtet dhe Termat/i, /Privatësia/i, /Informacion ligjor/i, /Kthimi dhe zëvendësimi/i, /Cookies/i, /Mohim përgjegjësie/i],
    paymentMethod: 'Pagesë në dorëzim',   // verified real label — cash on delivery, the only method with no extra dependency
    shippingMethod: 'Transport',          // verified — the only reliably working shipping method (see BUG-001 note below)
    promotionCode: null,                  // only verified the rejection path (invalid code); no known valid/unlimited code
  },

  redirects: [
    { from: '/account', to: '/account/login' }, // verified
    // Verified, but ONLY for a guest with an EMPTY cart. A guest with items
    // in the cart instead gets redirected to /checkout/register (the real
    // authentication gate) — this RedirectRule shape can't express both
    // cases, so this entry only covers the empty-cart case.
    { from: '/checkout/confirm', to: '/checkout/cart' },
  ],

  // Confirmed shop bugs (2026-09-25) — tests stay "expected to fail" until fixed, then remove the entry.
  // Not bugs (decided/verified 2026-10-05) → skipped with the reason.
  skipTests: [
    // staging runs with Symfony debug on (decided 2026-11-05: not a bug for this environment)
    { test: 'error pages do not reveal debug information', reason: 'staging runs in debug mode on purpose: 404 / bad-parameter pages show Symfony exception pages' },
    { test: 'unknown URL shows a 404 page', reason: 'staging runs in debug mode on purpose: unknown URLs show the Symfony "No route found" page instead of the shop 404 page' },
    { test: 'unknown product URL returns 404', reason: 'staging runs in debug mode on purpose: status is 404, but the page is the Symfony exception page, not the shop 404 page' },
    // staging catalogue data, not a shop bug (decided 2026-11-05)
    { test: 'shows product boxes with name, price and image', reason: 'staging data: 8 of 12 products in listingCategoryPath (incl. the first one) have no image, only the placeholder' },
    // checked manually, works on staging (decided 2026-11-05)
    { test: 'add product from detail page opens off-canvas cart', reason: 'verified manually: add to cart opens the off-canvas cart on desktop and mobile — automated check unreliable on this staging' },
  ],

  // Responsive layout suite: the desktop navigation stays down to 768px (burger menu only below)
  layout: {
    mobileNavBelow: 768,
    // banner-slider nav thumbnails show the 1440×500 banner squeezed into 36×28 px — accepted design, not a bug (2026-11-05)
    ignore: ['.banner-slider__nav-inner .pagination__image'],
    // accepted for this shop, not bugs (decided 2026-11-05)
    acceptIssues: [
      { kind: 'distorted-image', where: 'Homepage @', reason: 'home page "four blocks" promo images (14–23% on desktop/tablet) and the mobile banner (20% tablet, 41% phone) are stretched — accepted' },
      { kind: 'overflow', where: /Category listing @ (tablet|mobile)/, reason: 'category listing scrolls 10px sideways on tablet and phone — accepted' },
      { kind: 'overflow', where: 'Product detail @ tablet', reason: 'product page scrolls 5px sideways on tablet — accepted' },
    ],
  },

  // staging sends "X-Powered-By: PHP/8.3.36" — accepted, may only be set on staging (decided 2026-11-05)
  acceptedHeaders: ['x-powered-by'],

  // same server as DinoParts (cloud7-vm254): pages 2–12 s, logins time out at the 15 s click default (2026-11-05).
  // Login is slow by design: a custom B2B rule notifies the ERP on every login — not a bug.
  workers: 2,
  timeouts: { test: 180_000, action: 45_000, navigation: 60_000, expect: 20_000 },

  knownIssues: [],

  importantLinks: ['/', '/checkout/cart', '/account/login', '/sitemap.xml', '/robots.txt'],

  // Verified against the real live HTML throughout this project. Several
  // elements are ALSO duplicated in the DOM (a desktop + a mobile copy, only
  // one visible at a time — occasionally BOTH visible at once, e.g. a sticky
  // mobile "add to cart" bar). Page objects need to pick the visible/first
  // instance; that's a component-level concern, not something a plain
  // selector string alone can express, but it's called out here since it
  // affects every selector below.
  selectors: {
    cookie: {
      // ⚠ NOT overridden, and likely WRONG: the real button has no distinct
      // class (`<button type="submit" class="btn btn-primary">`, matched
      // only by its visible text "Vetëm ato teknikisht të nevojshme"). This
      // framework's CookieBanner component clicks a CSS selector only, with
      // no text fallback — the dedicated cookie-consent test will likely
      // fail here unless the component gains a text-based option. Most
      // other tests are unaffected since CookieBanner.preAccept() sets the
      // consent cookie directly rather than clicking anything.
    },
    header: {
      cart: 'a[href="/checkout/cart"][data-cart-widget="true"]', // CHANGED — real class is header-cart-btn, not the generic .header-cart
      accountLogoutLink: 'a[href="/account/logout-custom"]',     // CHANGED — see routes.logout note
      // accountButton default already matches (.account-menu-btn is real),
      // but note: on mobile it's hidden behind #accountWidget-mobile vs.
      // #accountWidget-desktop — same duplicate-DOM situation as elsewhere.
    },
    navigation: {
      flyoutLink: '.navigation-flyout-categories__link',   // CHANGED 2026-11-04 — sub-category links in the flyout
    },
    listing: {
      // out-of-stock marker (.product-action--out-of-stock, an intentionally
      // empty/zero-size div with no add-to-cart form inside) has NO slot in
      // this framework's listing selectors at all — stock-status listing
      // tests would need a new key added upstream to cover this.
    },
    product: {
      name: 'h1.product-name', // CHANGED from .product-detail-name
      productNumber: '.product-detail-buy .product-number', // CHANGED — "Art.-Nr. 0899899023"
      // Guests cannot see ANY price — .product-detail-price-guest shows a
      // "log in to see prices" prompt instead of a number (text differs
      // between environments: "Kyqu për të parë çmimin" on this staging
      // mirror vs. "Hyni për të parë çmimet" on production). There's no
      // FeatureFlags slot for "prices hidden from guests" — worth adding
      // upstream if more B2B-style clients show up.
      delivery: '.product-detail-delivery-information',
      // ⚠ Confirmed unreliable/empty for stock validation — do not use this
      // for any stock/availability assertion (this was flagged from the
      // very first inspection of this shop, not just a guess).
    },
    cart: {
      // Real class is a div, not a <dd> — CHANGED from the default 'dd.checkout-aside-summary-total'
      summaryTotal: '.checkout-aside-summary-value.checkout-aside-summary-total',
    },
    checkout: {
      // confirm page shows list price + line total (".line-item-price-regular" = quantity × unit price), no .line-item-total-price-value (2026-11-05)
      lineItemTotal: '.checkout-line-item-price .line-item-price-regular',
      // finishHeader / finishOrderNumber: default selectors — the registered-customer order passed with them (2026-11-05)
    },
    register: {
      // CHANGED — two forms on /account/register; the first (existing customer) is hidden
      form: 'form.register-form--new-customer',
      // B2B fields are filled via testData.customer.extraFields.
    },
  },
};

export default config;
