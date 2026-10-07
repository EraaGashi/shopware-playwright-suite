import type { ProjectConfig } from '../src/config/types';

const config: ProjectConfig = {
  name: 'Echonut',
  baseURL: 'https://www.echonut.com/',
  locale: 'en-GB',        // CHANGED from de-DE — <html lang="en-GB">, storefront is English
  currencySymbol: '€',

  features: {
    wishlist: true,                  // CHANGED — header /wishlist + .product-wishlist-btn on every tile
    guestCheckout: true,
    registration: true,
    doubleOptInRegistration: false,  // UNVERIFIED — admin setting, not visible from storefront
    productReviews: false,           // CHANGED — no review markup or tab on any PDP
    contactForm: true,
    newsletter: true,                // CHANGED — form.echonut-newsletter-form -> POST /form/newsletter
    promotionCodes: true,
    cookieBanner: true,
    languageSwitch: true,            // CHANGED — DE / EN switcher in header
    currencySwitch: false,
    mobileNavigation: true,
    orderPlacement: false,     // only PayPal / card / Apple Pay / Google Pay — PayPal hides #confirmFormSubmit
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
    contactPage: '/Info/Contact/',   // CMS page, not the stock /contact route
  },

  testData: {
    mainCategories: ['Shop', 'B2B', 'Mounting', 'Noise Pollution', 'Inspiration', 'About us'],
    listingCategoryPath: '/Shop/',   // the ONLY category with products

    // ⚠ No simple product exists — all 10 products have a configurator.
    // Using a variant child as a stand-in; it still renders a Color switcher.
    simpleProduct: {
      path: '/Lorem-ipsum-Copy-2/SW10001.1',
      productNumber: 'SW10001.1',
      name: 'Lorem ipsum Copy 2',
    },

    variantProduct: {
      path: '/Lorem-ipsum/CHNT1000.1',
      productNumber: 'CHNT1000.1',
      name: 'Lorem ipsum',
      optionGroups: ['Color'],       // Brown | Dark brown -> sibling CHNT1000.2
    },

    searchTerm: 'Lorem',
    searchMinResults: 10,
    searchTermVariants: ['Lorém'],   // verified 2026-10-07: same 10 results as 'Lorem'
    searchNoResultTerm: 'zzqx-no-such-product-4711',
    expectedFilterTypes: ['manufacturer', 'properties', 'price'],   // confirmed: Manufacturer, Color, Sets, Size, Price
    expectedSortings: ['name-asc', 'name-desc', 'price-asc', 'price-desc', 'topseller'],  // topseller also present

    customer: {
      emailDomain: 'example.com',
      emailPrefix: 'e2e',
      password: 'Shopware-E2E-2026!',
      firstName: 'Erika',
      lastName: 'Tester',
      salutationIndex: 1,            // options: ['Select from the list','Not specified','Mrs.','Mr.'] -> 1 = "Not specified"
      address: {
        street: 'Teststraße 1',
        zipcode: '48624',
        city: 'Schöppingen',
        countryIso: 'DE',
        countryLabel: 'Germany',     // storefront is English; "Deutschland" won't match
      },
    },

    contactLinkText: /Kontakt|Contact/i,
    // verified 2026-10-05 — all in the footer, all 200
    legalLinks: [/Terms & Conditions/i, /Privacy Policy/i, /Right of Withdrawal/i, /Imprint/i],
    paymentMethod: null,             // ⚠ NO offline method exists — see note below
    shippingMethod: 'DPD',           // €0.00 for guests; DHL also available
    promotionCode: null,               // UI exists, no known test code
  },

  // Not bugs for this shop (decided 2026-10-05): content is still placeholder while the shop is being built.
  // Remove an entry once the real content is live so the check runs again.
  skipTests: [
    { test: 'mandatory legal pages are linked in the footer and load', reason: 'legal pages still contain placeholder text (intended for now)' },
    { test: "social media links point to the shop's own profiles", reason: 'YouTube link is a placeholder until the channel exists (intended for now)' },
    { test: 'delivery promise does not show dates in the past', reason: 'the "Hurry!" delivery block is static marketing text (intended for now)' },
  ],

  redirects: [
    { from: '/account', to: '/account/login' },              // verified
    { from: '/checkout/confirm', to: '/checkout/cart' },     // verified (empty cart)
  ],

  importantLinks: ['/', '/checkout/cart', '/account/login', '/sitemap.xml', '/robots.txt'],  // both return 200

  // Echonut theme renames core markup (verified against live HTML 2026-09-25).
  // Header is rendered twice (desktop + mobile) — page objects pick the visible copy.
  selectors: {
    header: {
      // no visible total in the header, only inside the widget's aria label
      cartTotal: '#cart-widget-aria-label',
      cartBadge: 'a.header-cart-btn .echonut-item-badge',
      wishlist: 'a.echonut-wishlist-btn',
      wishlistBadge: '#wishlist-basket',
    },
    product: {
      name: 'h1.echonut-product-name',
      price: '.echonut-price-current',
      description: '.echonut-product-desc',
      delivery: '.echonut-urgency',          // "order within … for delivery between …"
      configuratorGroup: '.echonut-configurator-group',
      configuratorOptionLabel: '.echonut-swatch-label',
      wishlistButton: '.echonut-product-detail-wishlist .product-wishlist-btn',
      // tax: NOT overridden — the PDP shows no VAT notice at all (reported as a finding)
    },
    offcanvasCart: {
      quantityInput: 'select.echonut-qty-select',
      remove: '.echonut-cart-item-remove-btn',
    },
    cart: {
      quantityInput: 'select.echonut-qty-select',
      remove: '.echonut-cart-item-remove-btn',
      summaryTotal: '.echonut-summary-total-value',
    },
    checkout: {
      // confirm page lists items only in the aside "Order Overview", no .line-item-product table
      lineItem: '.en-order-overview-item',
    },
  },
};

export default config;