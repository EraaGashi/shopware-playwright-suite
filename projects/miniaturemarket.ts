import type { ProjectConfig } from '../src/config/types';

/**
 * Miniature Market — staging (swstaging.miniaturemarket.com), Shopware 6 storefront with a custom theme.
 * Locators and test data taken from the live staging HTML on 2026-11-02 (no source code access).
 *
 *   PROJECT=miniaturemarket npx playwright test --workers=1
 *
 * Not read-only: write tests (registration, test customers) and test orders are allowed on this staging shop
 * (approved 2026-11-05); orders are paid with the offline "Check Order" method.
 *
 * Board-game shop in USD: no configurable (variant) products found, no tax line on the PDP (US prices),
 * no contact form (support page is CMS only). The site is slow — the first page load can take 20 s+.
 */
const config: ProjectConfig = {
  name: 'Miniature Market',
  baseURL: 'https://swstaging.miniaturemarket.com',
  locale: 'en-US',
  currencySymbol: '$',

  features: {
    wishlist: true,                  // header wishlist link; /wishlist redirects to /note
    guestCheckout: true,
    registration: true,
    doubleOptInRegistration: false,  // unverified — check with the first write-test run
    productReviews: true,            // "Product Reviews" tab on the PDP
    contactForm: false,              // /customer-support is a CMS page without form[action="/form/contact"]
    newsletter: false,               // "Subscribe" goes to Klaviyo (external)
    promotionCodes: true,
    cookieBanner: true,
    languageSwitch: false,
    currencySwitch: false,
    mobileNavigation: true,
    // test orders approved 2026-11-05 ("you can make orders at miniature market") — paid with the offline "Check Order"
    // method (no payment provider), only with ALLOW_WRITE_TESTS=true
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
    contactPage: null,
  },

  testData: {
    // main nav (desktop), in display order — note "Miniature" and "Trading Card" are the visible labels
    mainCategories: ['Board Games', 'Miniature', 'Trading Card', 'Role Playing', 'Collectible Miniatures', 'Accessories'],
    listingCategoryPath: '/board-games.html',   // ~8,600 products, 24 per page, manufacturer/property/price/rating filters
    simpleProduct: { path: '/cga06001.html', productNumber: 'CGA06001', name: '#ARTBOX' },
    // ⚠ no product with a configurator found (searched sleeves, dice sets, playmats, t-shirts, paint) → a second
    // simple product stands in; variant tests are skipped below
    variantProduct: {
      path: '/10-days-national-parks-usopa025-846.html',
      productNumber: 'USOPA025-846',
      name: '10 Days in the National Parks',
      optionGroups: [],
    },
    searchTerm: 'catan',
    searchMinResults: 10,            // 51 results on 2026-11-02
    searchNoResultTerm: 'zzqx-no-such-product-4711',
    expectedFilterTypes: ['manufacturer', 'properties', 'price', 'rating'],
    expectedSortings: ['name-asc', 'name-desc', 'price-asc', 'price-desc'],
    customer: {
      emailDomain: 'example.com',
      emailPrefix: 'e2e',
      password: 'Shopware-E2E-2026!',
      firstName: 'Erika',
      lastName: 'Tester',
      salutationIndex: 1,
      // must be a real, verifiable US address: the shop validates it for tax calculation and rejects made-up ones
      // ("We could not verify this address…", 2026-11-05) — same public business address as the fixed test account
      address: {
        street: '500 S Buena Vista St',
        zipcode: '91521',
        city: 'Burbank',
        countryIso: 'US',
        countryLabel: 'United States',
        phoneNumber: '3145550100',   // required by the registration form
        state: 'California',
      },
      // default billing + shipping street of the TEST_CUSTOMER_EMAIL account ("Era Gashi, 500 S Buena Vista St,
      // Burbank", checked 2026-11-05) — update it when the account's default changes
      testCustomerDefaultStreet: '500 S Buena Vista St',
    },
    contactLinkText: /Contact Us|Customer Support/i,
    legalLinks: [/Privacy Policy/i, /Terms of Use/i],
    // offline payment (pay by check) — the default Google Pay hides "Submit order" (checked 2026-11-05)
    paymentMethod: 'Check Order',
    shippingMethod: null,
    promotionCode: null,
    // Reviews.io in the "Product Reviews" tab instead of Shopware's review teaser
    // the widget shows rating + reviews only — no "Write a review" button (checked 2026-11-04)
    reviewWidget: { tab: 'a[id^="review-tab-"]', tabText: 'Product Reviews', root: '#reviews-io-polaris-modal-ReviewsWidget, [id^="reviews-io"]' },
  },

  // staging rate-limits (429 "Too many requests") with several browsers at once; the mobile guest
  // checkout needs more than the 60 s default (2026-11-05)
  workers: 1,
  timeouts: { test: 120_000, navigation: 45_000 },

  // Not applicable for this shop (verified 2026-11-02) → skipped with the reason.
  skipTests: [
    { test: 'variant switch updates product number and URL', reason: 'no configurable (variant) products in the catalog' },
    { test: 'guest can add a product to the wishlist', reason: '"My Notes" multi-list wishlist: adding opens a list-picker dialog, no header counter' },
    { test: 'wishlist page shows added product and allows removal', reason: '"My Notes" multi-list wishlist (/note), not Shopware\'s single wishlist' },
    // reported bug, not "not applicable": the whole test is about it (reports/bugs-miniaturemarket-2026-11-05.md #2)
    { test: 'pages beyond the real end of the listing do not cause a server error', reason: 'reported bug #2 (2026-11-05): p=417+ (past the 10,000 search result window) returns 500' },
    { test: 'pages beyond the real end of the search results do not cause a server error', reason: 'reported bug #2 (2026-11-05): p=417+ (past the 10,000 search result window) returns 500' },
  ],

  // Reported 2026-11-05 (reports/bugs-miniaturemarket-2026-11-05.md) — only these URLs are left out, the rest is still checked.
  // Remove an entry once the shop is fixed.
  reportedBugs: {
    brokenLinks: [
      { match: '/retail-stl', reason: 'reported bug #1 (2026-11-05): header/footer link returns 500' },
    ],
    imagesWithoutAlt: [
      { match: '11-14-2025_Emberleaf_Slider_800x800', reason: 'reported bug #4 (2026-11-05): CMS promo image without alt' },
      { match: '7-01-2025_Gift-Card_RIR_1920x1920', reason: 'reported bug #4 (2026-11-05): CMS promo image without alt' },
      { match: '7-01-2025_BuyBack_RIR_800x800', reason: 'reported bug #4 (2026-11-05): CMS promo image without alt' },
    ],
  },

  // Confirmed on staging 2026-11-02 — tests stay "expected to fail" until fixed, then remove the entry.
  knownIssues: [
    { test: 'add product from detail page opens off-canvas cart', reason: 'header cart total includes shipping ($31.99 item → $37.98) — compare with the theme team whether that is intended' },
    { test: 'no tracking before the visitor makes a consent choice', reason: 'Google Analytics, Reddit and Meta pixel fire while the cookie banner is still open' },
  ],

  // "Only technically required" sets no cookie and leaves the banner open, and the shop deletes a lone
  // cookie-preference cookie → tests start with "Accept all" consent (trackers run during tests).
  // Kept: the consent flags only — no session, tracking IDs or guest wishlist ID.
  consentRecording: {
    button: 'acceptAll',
    keep: /^(cookie-preference|cookie-config-hash|mm-[a-z-]+|[a-z-]+-enabled|dtgsAllowGtmTracking|shopstudio-google-ads-cloud-cookie-consent|nosto-integration-allowed|nosto-track|youtube-video|moorl-location-map|od-klaviyo-track-allow)$/,
  },

  // third-party widgets left out of the layout checks: UserWay accessibility button, Klaviyo sign-up pop-up
  layout: {
    ignore: ['.userway_p1, #userwayAccessibilityIcon, .uwy', '.needsclick.kl-private-reset-css-Xuajs1, [class*="kl-private"]', '#launcher' /* Zendesk chat button */,
      // product cards: the name link is stretched over the card; on real phones the buttons still work (manual check 2026-11-04)
      '.product-box .product-name.stretched-link'],
    // reported bug #3 (2026-11-05): .checkout-container and .header-minimal-row are 5px wider than the screen — remove once fixed
    acceptIssues: [
      { kind: 'overflow', where: /^(Cart with product|Checkout \(guest step\)) @ (tablet|mobile)/, reason: 'reported bug #3 (2026-11-05): cart and guest checkout scroll 5px sideways' },
    ],
  },

  redirects: [
    { from: '/account', to: '/account/login' },
    { from: '/checkout/confirm', to: '/checkout/cart' },
  ],

  importantLinks: ['/', '/checkout/cart', '/account/login', '/sitemap.xml', '/robots.txt', '/customer-support'],

  selectors: {
    cookie: {
      // modal banner: "Only technically required" is its own button, not .js-cookie-permission-button
      onlyNecessary: '.cookie-permission-container .cookie-permission-reject',
    },
    login: {
      // a second, hidden login form sits in the header account dropdown → use the page's own form
      form: 'main form.login-form',
      email: 'main #loginMail',
      password: 'main #loginPassword',
      submit: 'main form.login-form button[type="submit"]',
    },
    register: {
      // personal fields without the "billingAddress" prefix (address fields keep it)
      firstName: '[name="firstName"]',
      lastName: '[name="lastName"]',
    },
    product: {
      tax: '',                                            // US prices: no tax notice on the PDP
      wishlistButton: '.pdp-wishlist .product-wishlist-btn',   // the first match is the hidden mobile copy
      delivery: '',                                       // the delivery-information block is rendered empty
      // buy box has a desktop and a mobile quantity field — only one is shown per screen size (2026-11-05)
      quantityInput: '.product-detail-buy .js-quantity-selector:visible',
    },
    header: {
      // the account dropdown holds a login form instead of a "Log in" link
      accountLoginLink: '.account-menu-login button[type="submit"]',
    },
    listing: {
      // only the "×" inside a filter chip removes the filter
      activeFilterRemove: '.filter-active-remove',
    },
    cart: {
      // promotion field is collapsed behind "Discount code"
      promotionReveal: 'button[aria-controls="discountCollapse"]',
      promotionSubmit: 'form.cart-add-promotion button[type="submit"]',   // "Apply"
    },
    account: {
      // no account sidebar on the account pages — the navigation (9 .account-aside-item links) lives in the header dropdown (2026-11-05)
      aside: '.account-menu-dropdown',
    },
    checkout: {
      // confirm page renders every product twice: a hidden copy in .checkout-main + the visible sidebar list (2026-11-05)
      lineItem: '.checkout-aside-product-list .line-item-product',
      // Braintree's Google Pay hides "Submit order" (d-none) and renders its own "Buy with GPay" button (2026-11-05)
      paymentButtons: '[data-swag-paypal-smart-payment-buttons], button[aria-label*="GPay" i], .gpay-button, .gpay-card-info-container',
      // only 5 payment methods are shown — "Check Order" sits behind "Show more" (a toggle → match it only while collapsed) (2026-11-05)
      paymentReveal: '.confirm-checkout-collapse-trigger:has-text("Show more")',
    },
    search: {
      emptyAlert: '.no-results-content',                  // "We're Sorry! We cannot find any products …"
    },
    navigation: {
      // top-level links lack Shopware's ".root" class (custom theme)
      rootLink: '#main-navigation-menu .main-navigation-link',
    },
  },
};

export default config;
