import type { ProjectConfig } from '../src/config/types';

/**
 * DinoParts — staging (dino-parts.com.cloud7-vm254.de-nserver.de), Shopware 6 storefront with a custom theme.
 * Locators and test data taken from the live staging HTML on 2026-11-04 (no source code access).
 *
 *   PROJECT=dinoparts ALLOW_WRITE_TESTS=false npx playwright test
 *
 * German shop in EUR, parts for classic Ferrari / Fiat / Lancia Dino. Category pages under "Teile & Zubehör"
 * are CMS landing pages; products are listed in "Neue Artikel" (24 per page, no filter panel) and the search.
 * Product pages have no <h1> (name in span.custom-product-name). Forms are protected by reCAPTCHA.
 */
const config: ProjectConfig = {
  name: 'DinoParts',
  baseURL: 'http://dino-parts.com.cloud7-vm254.de-nserver.de',
  locale: 'de-DE',
  currencySymbol: '€',

  features: {
    wishlist: true,                  // header wishlist + heart on PDP
    guestCheckout: true,             // unverified — write tests not run yet
    registration: true,
    doubleOptInRegistration: false,  // unverified
    productReviews: false,           // no review tab or teaser on the PDP
    contactForm: true,               // /UEber-uns/Kontakt/ has form[action="/form/contact"] (reCAPTCHA)
    newsletter: true,                // footer form[action="/form/newsletter"] (reCAPTCHA)
    promotionCodes: true,
    cookieBanner: true,
    languageSwitch: false,           // unverified — switcher markup present, only German checked
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
    contactPage: '/UEber-uns/Kontakt/',
  },

  testData: {
    mainCategories: ['News', 'Dinografie', 'Teile & Zubehör', 'Über uns'],
    listingCategoryPath: '/Teile-Zubehoer/Neue-Artikel/',   // 24 per page, 21 pages, no filter panel
    simpleProduct: {
      path: '/Faltenbalg-Schalthebel-Ferrari-365-GTB4-Daytona/113343',
      productNumber: '113343',
      name: 'Faltenbalg Schalthebel Ferrari 365 GTB4 (Daytona)',
    },
    // ⚠ no configurable (variant) products found → a second simple product stands in; variant tests are skipped
    variantProduct: {
      path: '/Fahrwerksfeder-vorne-Fiat-Dino-Spider-2400/112979',
      productNumber: '112979',
      name: 'Fahrwerksfeder vorne Fiat Dino Spider 2400',
      optionGroups: [],
    },
    searchTerm: 'Dichtung',          // 473 products on 2026-11-04
    searchMinResults: 10,
    searchNoResultTerm: 'zzqx-no-such-product-4711',
    expectedFilterTypes: [],         // no filter panel on the listing category
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
        phoneNumber: '0301234567',     // required by the registration / guest form
      },
    },
    contactLinkText: /Kontakt/i,
    legalLinks: [/Allgemeine Geschäftsbedingungen|AGB/i, /Widerrufsrecht/i, /Datenschutzerklärung/i, /Impressum/i],
    paymentMethod: null,
    shippingMethod: null,
    promotionCode: null,
  },

  // Not applicable for this shop (verified 2026-11-04) → skipped with the reason.
  skipTests: [
    { test: 'variant switch updates product number and URL', reason: 'no configurable (variant) products found' },
    { test: 'expected filter types are available', reason: 'the product listing ("Neue Artikel") has no filter panel' },
  ],

  // reCAPTCHA forms (registration, contact, newsletter) need Shopware's _GRECAPTCHA consent cookie
  consentRecording: { button: 'onlyNecessary', keep: /^(cookie-preference|cookie-config-hash|_GRECAPTCHA)$/ },

  redirects: [
    { from: '/account', to: '/account/login' },
    { from: '/checkout/confirm', to: '/checkout/cart' },
  ],

  importantLinks: ['/', '/checkout/cart', '/account/login', '/sitemap.xml', '/robots.txt', '/UEber-uns/Kontakt/'],

  selectors: {
    header: {
      // total only in the button text: "Warenkorb enthält 0 Positionen. Der Gesamtwert beträgt 0,00 €."
      cartTotal: '.header-cart-btn',
    },
    search: {
      // no alert box — the headline says "Zu "…" wurden keine Ergebnisse gefunden."
      emptyAlert: 'h1.search-headline',
    },
    product: {
      // no <h1> on product pages — the name is a span
      name: '.custom-product-name',
      productNumber: '.desc-row:has-text("Artikelnummer") .desc-content',   // row "Artikelnummer | 113343"
      tax: '.custom-text-black:has-text("MwSt")',                 // "Preise inkl. MwSt."
      description: '.desc-content',
      delivery: '.custom-stock-status',                           // "Auf Lager, sofort versandbereit" (the standard block is empty)
    },
  },
};

export default config;
