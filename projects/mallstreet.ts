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
    // Mirakl marketplace: every order goes to Mirakl. true = each run places 2 test orders (guest + customer) with
    // Cash on delivery — only on dev with approval. Flow verified with test order #10203 (2026-11-02).
    orderPlacement: false,
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

    // ⚠ No usable simple product: products without a configurator (Callie Pump, TEST …) cost $0.00
    // and get "No longer available from a seller" in the cart (no Mirakl offer). Same as Echonut,
    // a variant child with a live offer stands in. The reference suite's Lodge Hoodie is sold out.
    // 2026-11-02: Breeze Tutu Skirt (PTE7039301) lost its offer → Arahi 8 ($99.99, ordered in test order #10203)
    simpleProduct: {
      path: '/Arahi-8/1168690011',
      productNumber: '1168690011',
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
        street: '1 Test Street',
        zipcode: '10001',
        city: 'New York',
        countryIso: 'US',
        countryLabel: 'United States',   // checkout: "United States of America" (only country)
        state: 'New York',               // required in the dev guest checkout ("Input should not be empty")
      },
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
    { test: 'quantity field never puts 0, negative, fractional or too large amounts in the cart', reason: 'PDP has no quantity field — always adds 1' },
    { test: 'add with quantity > 1 from detail page', reason: 'PDP has no quantity field — always adds 1' },
    { test: 'search suggest shows products while typing', reason: 'no header search; the inspiration search has no suggest dropdown' },
    { test: 'guest can add a product to the wishlist', reason: 'wishlist is for logged-in customers only (header wishlist sends guests to the login)' },
    { test: 'wishlist page shows added product and allows removal', reason: 'wishlist is for logged-in customers only (header wishlist sends guests to the login)' },
    // no real products yet, all prices 0.00 on purpose (2026-11-02) — remove once the catalog is live
    { test: 'sampled navigation categories with a product listing are not empty', reason: 'no real products yet — categories are empty on purpose' },
    { test: 'sampled products have a price above zero', reason: 'no real products yet — all prices are 0.00 on purpose' },
  ],

  // Confirmed shop findings (2026-10-19) — tests stay "expected to fail" until fixed, then remove the entry.
  knownIssues: [
    { test: 'shows core product information', reason: 'PDP shows no product number and no tax notice (price "$98.00" without any tax hint); name, price, buy button, gallery and description are fine' },
    { test: 'mandatory legal pages are linked in the footer and load', reason: 'Terms & Conditions, Privacy policy and Returns & refund load but have only 13–15 words of content' },
    { test: 'Product with "&" in its name', reason: 'name is double-escaped: title and h1 show "Little Kid &amp; Big Kid"' },
    { test: 'search by product number finds the product (full and partial)', reason: 'full product number is found, a partial one ("PTE70393") returns no results' },
  ],

  redirects: [
    { from: '/account', to: '/account/login' },
    { from: '/checkout/confirm', to: '/checkout/cart' },
  ],

  importantLinks: ['/', '/checkout/cart', '/account/login', '/sitemap.xml', '/robots.txt'],

  // Responsive layout suite (tests/storefront/responsive-layout.spec.ts)
  layout: {
    skipViewports: [
      { test: 'mobile-320x568', reason: 'header is 6px wider than 320px screens — known, left out on request (2026-11-02)' },
    ],
  },

  // Configurable client tests (tests/client/, tag @client) — ported from the reference suite
  // (CFE-xxx = its UAT case ids). Verified against the live staging HTML 2026-10-19.
  client: {
    landingPages: [
      { name: 'Home page (CFE-001)', path: '/', minProducts: 1 },
      { name: "Women's CLP (CFE-003)", path: '/Women-s/', heading: "Women's", minProducts: 1 },
      { name: "Men's CLP (CFE-004)", path: '/Men-s/', heading: "Men's", minProducts: 1 },
      { name: 'Kids CLP (CFE-005)', path: '/Kids/', heading: 'Kids', minProducts: 1 },
      { name: 'Beauty CLP (CFE-006)', path: '/Beauty/', heading: 'Beauty' },        // CMS text only, no products yet
      { name: 'Home CLP (CFE-007)', path: '/Home/', heading: 'Home', minProducts: 1 },
      { name: 'Travel CLP (CFE-008)', path: '/Travel/', heading: 'Travel', minProducts: 1 },
      { name: 'Wellness CLP (CFE-009)', path: '/Wellness/', heading: 'Wellness' },  // CMS text only, no products yet
    ],
    seo: {
      pages: [
        { name: 'Home page', path: '/' },
        { name: "Women's CLP", path: '/Women-s/' },
        { name: 'Product page', path: '/Breeze-Tutu-Skirt-Baby/PTE7039301' },
      ],
      requireMetaDescription: true,
      indexable: false,   // staging is noindex,nofollow everywhere — set true for production
      noindexPaths: ['/account/login', '/checkout/cart', '/wishlist'],
    },
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
    encodingPages: [
      { name: 'Home page', path: '/' },
      { name: "Women's CLP", path: '/Women-s/' },
      { name: 'Product page', path: '/Breeze-Tutu-Skirt-Baby/PTE7039301' },
      { name: 'Product with "&" in its name', path: '/Cloud-Tulle-Dress-Set-Toddler-Little-Kid-amp-Big-Kid/CBS8018035' },
    ],
    healthPages: [
      { name: 'Home page', path: '/' },
      { name: "Women's CLP", path: '/Women-s/' },
      { name: 'Product page', path: '/Cloud-Tulle-Dress-Set-Baby/CBS8018031' },
      { name: 'Search results', path: '/search?search=parka' },
    ],
    responsive: {
      // default viewports: mobile 390, tablet 768, desktop 1440 (same as the reference suite)
      pages: [
        { name: 'Home page', path: '/' },
        { name: "Women's CLP", path: '/Women-s/' },
        { name: 'Product page', path: '/Breeze-Tutu-Skirt-Baby/PTE7039301' },
        { name: 'Cart', path: '/checkout/cart' },
      ],
    },
    // verified 2026-10-20 on staging
    searchCases: [
      { term: 'parka', minResults: 4, expectProduct: 'Aurora Parka' },
      { term: 'canada goose', minResults: 3, expectProduct: 'Parka' },   // brand name finds its products
      { term: 'tutu', minResults: 10, expectProduct: 'Tutu' },
      { term: 'backpack', expectProduct: 'Hagen Backpack' },
      { term: 'hoodie', expectProduct: 'Lodge Hoodie' },
      { term: 'zzqx-no-such-product-4711', minResults: 0 },
    ],
    productGallery: {
      // the Breeze skirt has no themallstreet gallery block → products with a full gallery
      pages: [
        { name: 'Cloud Tulle Dress Set', path: '/Cloud-Tulle-Dress-Set-Baby/CBS8018031' },
        { name: 'Aurora Parka', path: '/Aurora-Parka/699363271454' },
      ],
      minImages: 3,
    },
    contentChecks: [
      { name: 'Hero banner', path: '/', selector: '.themallstreet-banner-hero' },
      { name: 'Inspiration search', path: '/', selector: '.cms-element-inspiration-search__input' },
      { name: '"Shop By Category" block', path: '/', selector: '.themallstreet-shop-by-category', text: 'Shop By Category' },
      { name: '"Discover Our Brands" block', path: '/', selector: '.themallstreet-brand-block', text: 'Discover Our Brands' },
      { name: 'Brand logos', path: '/', selector: '.themallstreet-brand-block__logo', minCount: 4 },
      { name: 'Size & Fit note', path: '/Cloud-Tulle-Dress-Set-Baby/CBS8018031', selector: '.product-detail-configurator-size-fit', text: 'Size & Fit' },
      { name: 'Share button', path: '/Cloud-Tulle-Dress-Set-Baby/CBS8018031', selector: '.product-share-button' },
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
