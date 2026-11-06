import type { ProjectConfig } from '../src/config/types';

/**
 * B&G Maschinenprofi — staging (maschinenprofi.de.cloud7-vm254.de-nserver.de), Shopware 6 with the
 * ThemeWare "Electric" theme. Locators and test data taken from the live staging HTML on 2026-11-05
 * (no source code access).
 *
 *   ENV_FILE=.env.bg npx playwright test
 *
 * German shop in EUR for wood/plastics machines and tools. Every size/colour is its own product (no
 * configurator). "Outlet %" is a plain product listing (61 products, 24 per page, manufacturer + price filter).
 * Read-only for now: no customers, no orders, no form submits until writes on this staging are approved.
 */
const config: ProjectConfig = {
  name: 'B&G Maschinenprofi',
  baseURL: 'http://maschinenprofi.de.cloud7-vm254.de-nserver.de',
  locale: 'de-DE',
  currencySymbol: '€',

  features: {
    wishlist: true,                  // header "Klemmbrett" + heart on product boxes and PDP
    guestCheckout: true,             // unverified — write tests not run yet
    registration: true,
    doubleOptInRegistration: false,  // unverified
    productReviews: false,           // no review tab or teaser on the PDP
    contactForm: true,               // /service/kontakt/ has form[action="/form/contact"] (reCAPTCHA)
    newsletter: true,                // footer form[action="/form/newsletter"]
    promotionCodes: true,
    // production uses the CCM19 consent widget (footer "Cookie Einstellungen ändern" → #CCM.openWidget);
    // it isn't loaded on the staging host, so staging shows no banner at all (checked 2026-11-05)
    cookieBanner: false,
    trackingConsent: false,          // consent is CCM19's job on production — not testable on this staging
    languageSwitch: false,
    currencySwitch: false,
    mobileNavigation: true,
    orderPlacement: false,           // no orders until explicitly approved
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
    contactPage: '/service/kontakt/',
  },

  testData: {
    // "Marken" is left out: it opens the manufacturer overview of a plugin (body.is-ctl-frontend), not a category
    mainCategories: ['Unser Produktprogramm', 'Outlet %', 'Online-Kataloge', 'Unternehmen'],
    listingCategoryPath: '/outlet/',   // 61 products, 3 pages on 2026-11-05
    simpleProduct: {
      path: '/bosch-expert-spannungspruefer-exvt1000-17',
      productNumber: 'BG-1050140',
      name: 'BOSCH EXPERT Spannungsprüfer EXVT1000-17',
    },
    // ⚠ no configurable (variant) products — sizes are separate products → a second simple product stands in
    variantProduct: {
      path: '/fhb-arbeitshose-leo-anthrazit-schwarz-50-elastisch',
      productNumber: 'BG-1722102',
      name: 'FHB Arbeitshose LEO anthrazit-schwarz 50 elastisch',
      optionGroups: [],
    },
    searchTerm: 'festool',           // 1997 products on 2026-11-05
    searchMinResults: 10,
    searchNoResultTerm: 'zzqx-no-such-product-4711',
    expectedFilterTypes: ['manufacturer', 'price'],
    expectedSortings: ['name-asc', 'name-desc', 'price-asc', 'price-desc'],
    customer: {
      emailDomain: 'example.com',
      emailPrefix: 'e2e',
      password: 'Shopware-E2E-2026!',
      firstName: 'Erika',
      lastName: 'Tester',
      salutationIndex: 1,
      address: {
        street: 'Teststraße 1',
        zipcode: '48624',
        city: 'Schöppingen',
        countryIso: 'DE',
        countryLabel: 'Deutschland',
      },
    },
    contactLinkText: /^\s*Kontakt\s*$/i,
    legalLinks: [/AGB Onlinehandel/i, /Widerrufsbelehrung/i, /Datenschutz/i, /Impressum/i],
    paymentMethod: null,
    shippingMethod: null,
    promotionCode: null,
  },

  // Not applicable for this shop (verified 2026-11-05) → skipped with the reason.
  skipTests: [
    { test: 'variant switch updates product number and URL', reason: 'no configurable (variant) products — every size/colour is its own product' },
    // the cart always gets a "2% Vorkasse Rabatt" line item (Vorkasse is the default payment) → the header total is
    // 2 % below the PDP price by design. Off-canvas cart + line item stay covered by "add product from listing".
    { test: 'add product from detail page opens off-canvas cart', reason: 'automatic 2% prepayment discount (Vorkasse Rabatt) makes the cart total differ from the product price by design' },
    // gallery + buy box are position:sticky inside their columns but scroll away normally (checked with instant
    // scrolling 2026-11-05). The theme's smooth scrolling keeps the sticky check measuring them at the page top → false 58–74 %.
    { test: 'Product detail has no layout defects', reason: 'sticky check measures the PDP gallery/buy box before smooth scrolling moves the page — they do not cover content' },
  ],

  // staging sends "X-Powered-By: PHP/8.4.27" (same server as Würth / DinoParts) — accepted on staging like there
  acceptedHeaders: ['x-powered-by'],

  // staging answers in 2–50 s per page, a top category took > 90 s (2026-11-05) → few browsers, long timeouts
  workers: 2,
  timeouts: { test: 240_000, action: 45_000, navigation: 120_000, expect: 20_000 },

  redirects: [
    { from: '/account', to: '/account/login' },
    { from: '/checkout/confirm', to: '/checkout/cart' },
  ],

  importantLinks: ['/', '/checkout/cart', '/account/login', '/sitemap.xml', '/robots.txt', '/service/kontakt/'],

  selectors: {
    navigation: {
      // the hidden "Home" root link is left out (it can't be hovered)
      rootLink: '.main-navigation-link.root:not(.home-link)',
      // ThemeWare flyouts sit in their own wrapper, outside .main-navigation-menu (lazy loaded on hover)
      flyout: '.twt-top-navigation-flyout',
    },
    listing: {
      // struck-through old price is a .product-price too: <span class="product-price product-price-unit-list-price">
      productPrice: '.product-price:not(.product-price-unit-list-price)',
      listPrice: '.product-price-unit-list-price, .list-price-percentage, .list-price',
    },
    register: {
      // one-page checkout: "Ich bin bereits Kunde" / "Ich bin Neukunde" tabs
      reveal: '[role="tab"][aria-controls="opc-register-tab-content"]',
    },
    wishlist: {
      // the .product-wishlist-remove wrapper is hidden — the visible ✕ is labelled "… vom Klemmbrett entfernen"
      remove: 'button[aria-label$="vom Klemmbrett entfernen"]',
    },
  },
};

export default config;
