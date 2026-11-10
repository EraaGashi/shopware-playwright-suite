import type { ProjectConfig } from '../src/config/types';

/**
 * The Mall Street — marketplace storefront (Shopware 6.7 + "themallstreet" theme).
 * Selectors traced from the reference suite ~/Desktop/mallstreet-playwright-tests and
 * verified against the live staging HTML (2026-10-19). Biggest differences from core:
 *  1. No search field in the header — search is the CMS "inspiration search" element on
 *     the home and category pages (form[action="/search"]).
 *  2. PDP has no product number, quantity field or tax notice; variants are <select>s.
 *     Only products with a Mirakl seller offer are buyable (see testData.simpleProduct).
 *  3. Registration form is minimal: name, e-mail (+ confirmation), password (+ confirmation),
 *     no salutation and no address fields.
 */
const config: ProjectConfig = {
  name: 'The Mall Street',
  baseURL: 'http://themallstreet.com.cloud7-vm254.de-nserver.de',
  locale: 'en-US',          // CHANGED from de-DE — <html lang="en-US">
  currencySymbol: '$',      // CHANGED — prices in USD ("$950.00")

  features: {
    wishlist: true,                  // CHANGED — header .header-wishlist-btn + [data-add-to-wishlist] on tiles and PDP
    guestCheckout: true,             // one-page checkout /checkout/register: "Customer" (login) / "Guest" tabs
    registration: true,
    doubleOptInRegistration: false,  // UNVERIFIED — admin setting, not visible from storefront
    // verified on dev 2026-10-20: registering shows "Registration successful. You can continue shopping."
    // and logging in says "Could not find an account …" until the first checkout ("Continue here").
    // → login/account tests use TEST_CUSTOMER_EMAIL / TEST_CUSTOMER_PASSWORD (an active account)
    registrationNeedsFirstCheckout: true,
    productReviews: true,            // "Reviews" tab on every PDP
    contactForm: false,              // CHANGED — no form[action="/form/contact"] on any footer page, /contact is 404
    newsletter: false,               // no form[action="/form/newsletter"] anywhere
    promotionCodes: true,            // form.cart-add-promotion shows once the cart has items
    cookieBanner: true,
    languageSwitch: false,           // English only, no switcher
    currencySwitch: false,
    mobileNavigation: true,
    // Mirakl marketplace: every order goes to Mirakl. Each full run with ALLOW_WRITE_TESTS=true places 2 test orders
    // (guest + customer) with Cash on delivery. Approved for dev on 2026-11-04 (flow verified with test order #10203).
    // jetrails / preview import this profile but are readOnly → no orders there.
    orderPlacement: true,
  },

  routes: {
    home: '/',
    login: '/account/login',
    register: '/account/register',
    account: '/account',
    accountProfile: '/account/profile',
    accountAddresses: '/account/address',
    accountOrders: '/account/order',
    logout: '/account/logout',
    cart: '/checkout/cart',
    checkoutRegister: '/checkout/register',
    checkoutConfirm: '/checkout/confirm',
    checkoutFinish: '/checkout/finish',
    search: '/search',
    wishlist: '/wishlist',
    contactPage: null,               // no contact form (see features.contactForm)
  },

  testData: {
    // main nav root links (desktop), in display order
    mainCategories: ["Women's", "Men's", 'Kids', 'Beauty', 'Home', 'Travel', 'Wellness'],
    listingCategoryPath: '/Women-s/',   // 130 products, sorting + manufacturer/property/price filters
    // deep-page tests stop at Shopware's default 10000 result window (p=417 with 24 per page → 200 on dev, 2026-11-05)

    // ⚠ No usable simple product: products without a configurator (Callie Pump, TEST …) cost $0.00
    // and get "No longer available from a seller" in the cart (no Mirakl offer). Same as Echonut,
    // a variant child with a live offer stands in. The reference suite's Lodge Hoodie is sold out.
    // 2026-11-02: Breeze Tutu Skirt (PTE7039301) lost its offer → Arahi 8 ($99.99, ordered in test order #10203)
    // 2026-11-09: 1168690011 (Varsity Navy US 9.5 Wide) shows "(Unavailable)" → Varsity Navy US 8 Regular, which has an offer
    simpleProduct: {
      path: '/Arahi-8/1168690001',
      productNumber: '1168690001',
      name: 'Arahi 8',
    },

    variantProduct: {
      path: '/Cloud-Tulle-Dress-Set-Baby/CBS8018031',
      productNumber: 'CBS8018031',
      name: 'Cloud Tulle Dress Set',
      // <select>s; every size is available (size 5-6 → CBS8018035, a "Toddler, Little Kid & Big Kid" product)
      optionGroups: ['Color', 'Size'],
    },

    searchTerm: 'parka',
    searchMinResults: 5,
    searchNoResultTerm: 'zzqx-no-such-product-4711',
    expectedFilterTypes: ['manufacturer', 'properties', 'price'],
    expectedSortings: ['name-asc', 'name-desc', 'price-asc', 'price-desc', 'topseller'],

    customer: {
      emailDomain: 'example.com',
      emailPrefix: 'e2e',
      password: 'Shopware-E2E-2026!',
      firstName: 'Erika',
      lastName: 'Tester',
      salutationIndex: 1,            // no salutation field on the register form
      // With TEST_CUSTOMER_EMAIL set, name and street must match that account
      // ("addresses page lists the default address" looks for the street, the name test restores the name).
      address: {
        // not asked for at /account/register — used by the guest checkout form and Store API registration
        // must be a real address: dev validates it ("Your shipping address could not be validated" blocks
        // the order for the made-up "1 Test Street, 10001 New York", 2026-11-05) — same as the test account's
        street: '100 Congress Avenue',
        zipcode: '78701',
        city: 'Austin',
        countryIso: 'US',
        countryLabel: 'United States',   // checkout: "United States of America" (only country)
        state: 'Texas',                  // required in the dev guest checkout ("Input should not be empty")
      },
      // default billing + shipping street of the TEST_CUSTOMER_EMAIL account, per host (checked 2026-11-05):
      // dev.themallstreet.com "100 Congress Avenue, Austin, TX 78701", cloud7 "maple street, 1111111 California"
      // — update it when the account's default changes
      // no \b: the card joins name and street with <br>, so its text reads "test2 test2100 Congress Avenue"
      testCustomerDefaultStreet: /100 Congress Avenue|maple street/i,
    },

    contactLinkText: /Contact|Help center/i,
    // verified 2026-10-19 — footer "Customer care" column, all 200
    legalLinks: [/Terms & Conditions/i, /Privacy policy/i, /Returns & refund/i],
    paymentMethod: 'Cash on delivery',   // only method without an external provider (no payment data entered)
    shippingMethod: null,
    promotionCode: null,
    // Bazaarvoice replaces Shopware's reviews on purpose — no .product-detail-review-teaser on any PDP
    reviewWidget: { tab: 'a.review-tab', tabText: 'Reviews', root: '#bv-pdp-reviews', writeButton: /write a review/i },
  },

  // Not applicable for this shop (theme decisions, verified 2026-10-19) → skipped with the reason.
  skipTests: [
    { test: 'search suggest shows products while typing', reason: 'no header search; the inspiration search has no suggest dropdown' },
    { test: 'guest can add a product to the wishlist', reason: 'wishlist is for logged-in customers only (header wishlist sends guests to the login)' },
    { test: 'wishlist page shows added product and allows removal', reason: 'wishlist is for logged-in customers only (header wishlist sends guests to the login)' },
    // remove once the legal texts are published
    { test: 'mandatory legal pages are linked in the footer and load', reason: 'legal content not written yet: Terms & Conditions, Privacy policy and Returns & refund link to the /coming-soon placeholder (dev) or have only 13–15 words (cloud7) — 2026-11-05' },
    // remove once the seller offers are back (reports/bugs/mallstreet-dev-no-seller-offers.md)
    { test: 'guest checkout places an order', reason: 'dev.themallstreet.com has no seller offers since 2026-11-10 — every product is "No longer available from a seller", ordering is blocked' },
    { test: 'registered customer places an order and sees it in the account', reason: 'dev.themallstreet.com has no seller offers since 2026-11-10 — every product is "No longer available from a seller", ordering is blocked' },
  ],

  // Confirmed shop findings (2026-10-19) — tests stay "expected to fail" until fixed, then remove the entry.
  knownIssues: [
    { test: 'shows core product information', reason: 'PDP shows no product number and no tax notice (price "$98.00" without any tax hint); name, price, buy button, gallery and description are fine' },
  ],

  // dev 2026-11-09: a "Subscribe our newsletter" modal opens on every page load (also after closing it — nothing
  // remembers the close) and covers the whole page
  dismissPopups: [{ popup: '.modal.show:has-text("Subscribe our newsletter")', close: 'button[aria-label="Close"], .btn-close' }],

  redirects: [
    { from: '/account', to: '/account/login' },
    { from: '/checkout/confirm', to: '/checkout/cart' },
  ],

  importantLinks: ['/', '/checkout/cart', '/account/login', '/sitemap.xml', '/robots.txt'],

  // Configurable client tests (tests/client/, tag @client) — ported from the reference suite
  // (CFE-xxx = its UAT case ids). Verified against the live staging HTML 2026-10-19.
  client: {
    headerLinks: [
      { name: 'Order Status', selector: 'a.top-bar-order-status', href: '/account/login?redirectTo=frontend.account.order.page' },
      { name: 'Wishlist (guest → login)', selector: 'a.header-wishlist-btn', href: '/account/login?redirectTo=frontend.wishlist.page' },
      { name: 'Moodboard', selector: 'a.nav-main-toggle-btn', href: '/moodboard' },
    ],
    footerLinks: [
      { name: 'Help center', text: /Help center/i },
      { name: 'Terms & Conditions', text: /Terms & Conditions/i },
      { name: 'Privacy policy', text: /Privacy policy/i },
      { name: 'Returns & refund', text: /Returns & refund/i },
      { name: 'About Us', text: /About Us/i },
    ],
    healthPages: [
      { name: 'Home page', path: '/' },
      { name: "Women's CLP", path: '/Women-s/' },
      { name: 'Product page', path: '/Cloud-Tulle-Dress-Set-Baby/CBS8018031' },
      { name: 'Search results', path: '/search?search=parka' },
    ],
    // verified 2026-10-20 on staging
    searchCases: [
      { term: 'parka', minResults: 4, expectProduct: 'Aurora Parka' },
      { term: 'canada goose', minResults: 3, expectProduct: 'Parka' },   // brand name finds its products
      { term: 'tutu', minResults: 10, expectProduct: 'Tutu' },
      { term: 'backpack', expectProduct: 'Hagen Backpack' },
      { term: 'hoodie', expectProduct: 'Lodge Hoodie' },
      { term: 'zzqx-no-such-product-4711', minResults: 0 },
    ],
  },

  // themallstreet theme (verified against live HTML 2026-10-19)
  selectors: {
    header: {
      // inspiration search CMS element (home + category pages), there is no header search
      searchInput: '.cms-element-inspiration-search__input',
      searchButton: '.cms-element-inspiration-search__button',
      cart: 'a.header-cart-btn',
      // no visible total/badge, only the widget's aria label ("… contains 0 items … $0.00")
      cartTotal: '#cart-widget-aria-label',
      wishlist: 'a.header-wishlist-btn',
      wishlistBadge: '#wishlist-basket',
      // .nav-main-toggle-btn is the moodboard link here — the burger is a separate button
      mobileMenuToggle: '.header-hamburger-btn',
    },
    navigation: {
      flyout: '.main-navigation-menu .dropdown-menu, #themallstreet-mega-menu-panel',
    },
    register: {
      // one-page checkout hides the register form behind the "Guest" tab
      reveal: '[role="tab"][aria-controls="newCustomer"], [role="tab"][aria-controls="opc-register-tab-content"]',
    },
    listing: {
      // buyButton: NOT overridden — simple products' "Quick Add" is a real .btn-buy (rendered twice: desktop
      // overlay + mobile bar); variant tiles use .btn-quickadd, which only opens size pills
      wishlistButton: '.product-wishlist-btn',
      // "Add filters" opens the filter off-canvas on every viewport; the inline .filter-panel is just the bar
      filterPanel: '.offcanvas.show .filter-panel',
    },
    checkout: {
      // stepped one-page checkout: payment methods sit in a collapsed "Payment" step (verified on dev 2026-10-21)
      paymentReveal: '[data-themallstreet-opc-open-step="payment"]',
      // #tos is visually hidden and never checked — "By placing this order, you agree …" (order #10203 went through)
      tos: '',
      finishHeader: '.themallstreet-finish__title',
      finishOrderNumber: '.themallstreet-finish__meta',   // "Order Reference: #10203"
    },
    account: {
      // no sidebar: /account is one dashboard of cards (Profile, Wishlist, Messages, Address Book,
      // Moodboards, Order history) — verified on dev 2026-10-20
      aside: '.account-overview-col',
      asideItem: '.account-overview-card',
      // address cards carry a "Default billing / shipping address" badge (dev.themallstreet.com, 2026-11-05)
      defaultAddressCard: '.address-manager-select-address:has(.address-item-default-badge)',
    },
    product: {
      name: 'h1.product-header__name',
      // productNumber: NOT overridden — the PDP shows no product number (since 2026-10-21 not even in the
      // page title). ProductPage then reads it from the canonical SEO URL (/Cloud-Tulle-Dress-Set-Baby/CBS8018031).
      // tax: NOT overridden — the PDP shows no tax notice at all (see knownIssues)
      wishlistButton: '.product-header__actions .product-wishlist-action',
      galleryImage: '.themallstreet-product-gallery img, .gallery-slider-image',
    },
  },
};

export default config;
