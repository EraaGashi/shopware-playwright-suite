import type { Selectors } from '../selectors/shopware67';

/** Deep partial helper used for project-level overrides. */
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/**
 * Switch storefront features on/off per client project.
 * Tests for a disabled feature are skipped automatically.
 */
export interface FeatureFlags {
  wishlist: boolean;
  guestCheckout: boolean;
  registration: boolean;
  /** Registration requires e-mail confirmation (double opt-in). */
  doubleOptInRegistration: boolean;
  /**
   * New accounts stay pending until their first checkout: registration only shows a success message
   * and the customer cannot log in yet. Login/account tests then need a fixed, active account
   * (TEST_CUSTOMER_EMAIL / TEST_CUSTOMER_PASSWORD) — without one they are skipped.
   */
  registrationNeedsFirstCheckout?: boolean;
  productReviews: boolean;
  contactForm: boolean;
  newsletter: boolean;
  promotionCodes: boolean;
  /** Cookie consent banner is shown to first-time visitors. */
  cookieBanner: boolean;
  languageSwitch: boolean;
  currencySwitch: boolean;
  /** Mobile off-canvas navigation exists (Shopware default). */
  mobileNavigation: boolean;
  /**
   * Orders can be placed end-to-end (needs an offline payment method, e.g. prepayment).
   * false → checkout tests stop on the confirm page (redirect-only payments like PayPal, or production).
   */
  orderPlacement: boolean;
  /**
   * Guests see prices, tax notice, delivery info and cart totals (default true).
   * false for B2B shops that show "log in to see prices" instead.
   */
  guestPrices?: boolean;
  /**
   * Analytics/marketing tracking must wait for cookie consent (default true).
   * false where the shop's legal context doesn't require it → tracking-consent tests are skipped.
   */
  trackingConsent?: boolean;
}

export interface ProductRef {
  /** SEO path relative to baseURL, e.g. "/Canvas-Tote-Bag/A-BAG-001-CREAM" */
  path: string;
  productNumber: string;
  name: string;
}

export interface RedirectRule {
  from: string;
  /** Expected final path (regex source or plain path prefix). */
  to: string;
  /** Only applies to logged-out visitors (default true). */
  guestOnly?: boolean;
}

export interface CustomerAddress {
  street: string;
  zipcode: string;
  city: string;
  /** ISO 3166 alpha-2, resolved to a countryId via Store API / UI */
  countryIso: string;
  /** Visible country name in the storefront select (used by UI flows). */
  countryLabel?: string;
  /** Only needed when the shop requires a phone number (Store API + registration form). */
  phoneNumber?: string;
  /** Visible state / region name, for shops that require one (e.g. US: "New York"). */
  state?: string;
}

/**
 * Additional registration form field (B2B forms etc.), filled in the given order.
 * Selects: `value` is an option value or label; omitted = first non-empty option.
 * `{random}` in a value is replaced by 9 random digits (for unique IDs).
 */
export interface ExtraFormField {
  selector: string;
  value?: string;
}

/**
 * A test that currently fails because of a confirmed bug in the shop (not in the test).
 * Matching tests are marked "expected to fail": the run stays green, the report shows the reason,
 * and once the shop is fixed the test fails with "expected to fail, but passed" → remove the entry.
 */
export interface KnownIssue {
  /** Substring of the test title (or a RegExp). */
  test: string | RegExp;
  reason: string;
}

/** A reported shop bug excluded from one check: URL substring (or RegExp) and the ticket / reason. */
export interface ReportedBug {
  match: string | RegExp;
  reason: string;
}

export interface ProjectConfig {
  /** Human readable name, shown in reports. */
  name: string;
  baseURL: string;
  /**
   * Production (or production-like) shop: nothing may be written. Forces ALLOW_WRITE_TESTS=false,
   * CLEANUP_TEST_DATA=false and orderPlacement=false and ignores TEST_CUSTOMER_* — whatever .env / CI says.
   */
  readOnly?: boolean;
  /** Shopware storefront locale — used for price parsing only. */
  locale: string;
  currencySymbol: string;

  features: FeatureFlags;

  /** Paths of important storefront routes (override for custom routing). */
  routes: {
    home: string;
    login: string;
    register: string;
    account: string;
    accountProfile: string;
    accountAddresses: string;
    accountOrders: string;
    logout: string;
    cart: string;
    checkoutRegister: string;
    checkoutConfirm: string;
    checkoutFinish: string;
    search: string;
    wishlist: string;
    /** Path of a CMS page containing the contact form (null = discover via footer). */
    contactPage: string | null;
    /**
     * Where registration ends when new accounts need manual approval (B2B), e.g. '/account/register/success'.
     * Unset = customer is logged in and lands on routes.account.
     */
    registerPending?: string;
    /** Password recovery form (default '/account/recover'). */
    passwordRecovery?: string;
  };

  testData: {
    /** Main navigation category names in display order (first N are checked). */
    mainCategories: string[];
    /** A category with enough products for listing / filter / sorting tests. */
    listingCategoryPath: string;
    /** A simple (non-variant) product that can be bought. */
    simpleProduct: ProductRef;
    /** A product with variants (configurator). */
    variantProduct: ProductRef & { optionGroups: string[] };
    /** Search term that returns results. */
    searchTerm: string;
    /** Minimum number of hits expected for searchTerm. */
    searchMinResults: number;
    /** Search term guaranteed to return nothing. */
    searchNoResultTerm: string;
    /** Filter types that must exist on the listing page (language independent). */
    expectedFilterTypes: Array<'manufacturer' | 'properties' | 'price' | 'rating' | 'boolean'>;
    /** Sorting option keys that must exist (Shopware values). */
    expectedSortings: string[];
    customer: {
      emailDomain: string;
      emailPrefix: string;
      password: string;
      firstName: string;
      lastName: string;
      /** Salutation option index in the select (0 = "not specified"). */
      salutationIndex: number;
      address: CustomerAddress;
      /**
       * Street of the default address of the fixed TEST_CUSTOMER_EMAIL account, when it differs from `address`
       * (shops whose registration asks for no address: the account's addresses come from its own history).
       * A RegExp covers profiles shared by several hosts whose accounts have different defaults.
       */
      testCustomerDefaultStreet?: string | RegExp;
      extraFields?: ExtraFormField[];
    };
    /** Visible text of the footer link leading to the contact form. */
    contactLinkText: RegExp;
    /**
     * Shop-specific required fields of the contact form (customer number, privacy checkbox …), filled after the
     * standard ones: text fields get `value`, selects the option with that value/label (unset = first), checkboxes are ticked.
     */
    contactExtraFields?: ExtraFormField[];
    /** Footer link texts of mandatory legal pages (terms, privacy, withdrawal, imprint …). Unset = test skipped. */
    legalLinks?: RegExp[];
    /**
     * Spellings that must find the same products as `searchTerm` (accents, umlauts …).
     * Upper-case and space-padded variants are always checked.
     */
    searchTermVariants?: string[];
    /** Payment/shipping method labels to select in checkout; null = keep default. */
    paymentMethod: string | null;
    shippingMethod: string | null;
    promotionCode: string | null;
    /**
     * Third-party review widget that replaces Shopware's reviews on the PDP (e.g. Bazaarvoice).
     * Set → the widget is checked instead of Shopware's review teaser.
     */
    reviewWidget?: {
      /** Reviews tab and its visible text. */
      tab: string;
      tabText: string;
      /** Widget container, attached once the tab is opened. */
      root: string;
      /** Accessible name of the "write a review" button inside the widget (unset = the widget has none). */
      writeButton?: string | RegExp;
    };
  };

  /** Redirects that must work (checked for guests unless stated). */
  redirects: RedirectRule[];

  /** Links (paths) that must resolve with a status < 400. */
  importantLinks: string[];

  /** Selector overrides for themes / customisations. Merged over Shopware 6.7 defaults. */
  selectors?: DeepPartial<Selectors>;

  /** Response headers accepted for this shop although they reveal the server stack (e.g. 'x-powered-by' on staging). */
  acceptedHeaders?: Array<'x-powered-by' | 'server'>;

  /** Confirmed shop bugs → matching tests are expected to fail (see KnownIssue). */
  knownIssues?: KnownIssue[];

  /** Tests that don't apply to this shop (intended behaviour, not a bug) → skipped with the reason. */
  skipTests?: KnownIssue[];

  /**
   * Already reported shop bugs left out of a single check, so the rest of the test keeps running.
   * Each match is noted on the test as an "accepted" annotation — remove the entry once the shop is fixed.
   */
  reportedBugs?: {
    /** Header/footer link URLs not checked by the broken-links test. */
    brokenLinks?: ReportedBug[];
    /** Image URLs allowed to have no alt attribute. */
    imagesWithoutAlt?: ReportedBug[];
  };

  /** Data for the configurable client tests in tests/client/ (each section unset = its tests skip). */
  client?: ClientTestConfig;

  /** Sample size of the catalog crawler (tests/storefront/catalog-crawl.spec.ts); defaults when unset. */
  crawl?: CrawlConfig;

  /**
   * How the setup records the cookie consent all tests start with (default: "only necessary", keeping
   * cookie-preference + cookie-config-hash). For shops whose "only necessary" button is broken or whose
   * consent lives in their own cookies: click "accept all" and keep the cookies matching `keep`.
   * Also for extra consent cookies the shop checks (e.g. Shopware's `_GRECAPTCHA` for reCAPTCHA forms).
   */
  consentRecording?: { button?: 'acceptAll' | 'onlyNecessary'; keep: RegExp };

  /**
   * Popups the shop opens on its own (e.g. a newsletter sign-up on page load) that cover the page — closed
   * whenever they show up before a click/fill/assertion, so they don't block the functional tests.
   */
  dismissPopups?: Array<{ popup: string; /** inside the popup */ close: string }>;

  /** Responsive layout suite (tests/storefront/responsive-layout.spec.ts); works with the defaults when unset. */
  layout?: LayoutTestConfig;

  /** Parallel workers for local runs (default: half the CPU cores) — lower it for slow staging servers. CI always uses 2. */
  workers?: number;

  /**
   * Timeouts in ms for slow servers (defaults: test 60 s, action 15 s, navigation 30 s, expect 10 s).
   * The action timeout also covers a click that waits for the form POST it triggers.
   */
  timeouts?: { test?: number; action?: number; navigation?: number; expect?: number };
}

export interface LayoutTestConfig {
  /** Extra guest pages audited at every viewport (CMS, landing pages …) — home, listing and product are always included. */
  pages?: ClientPage[];
  /** Elements left out of the layout checks (third-party chat widgets, intentionally overflowing banners …). */
  ignore?: string[];
  /** Below this width the theme shows the mobile (burger) navigation (default 992 — Bootstrap "lg"). */
  mobileNavBelow?: number;
  /** Viewports skipped for this shop (name or part of it, e.g. 'mobile-375x812'), with the reason. */
  skipViewports?: KnownIssue[];
  /**
   * Findings accepted for this shop (not bugs) — that check is left out, with the reason as annotation.
   * `where` matches "<page> @ <viewport>", e.g. 'Homepage @' or /Category listing @ (tablet|mobile)/.
   */
  acceptIssues?: AcceptedLayoutIssue[];
}

export interface AcceptedLayoutIssue {
  kind: 'overflow' | 'cut-off' | 'clipped-text' | 'covered' | 'fixed-cover' | 'small-target' | 'distorted-image';
  where: string | RegExp;
  reason: string;
}

export interface CrawlConfig {
  /** Category pages taken from the main navigation (default 12). */
  maxCategories?: number;
  /** Products opened per category (default 2). */
  productsPerCategory?: number;
  /** Upper limit of product pages in total (default 20). */
  maxProducts?: number;
  /** Navigation links to leave out (e.g. CMS-only pages, blogs). */
  excludePaths?: RegExp[];
}

/** A storefront page checked by the client tests. */
export interface ClientPage {
  /** Shown in the test title — use it to target knownIssues / skipTests. */
  name: string;
  path: string;
}

export interface ClientTestConfig {
  /** Header links that must be visible for guests and point to the given target. */
  headerLinks?: Array<{ name: string; selector: string; href: string | RegExp }>;

  /** Footer links (visible text) that must exist and load without error. */
  footerLinks?: Array<{ name: string; text: RegExp }>;

  /** Pages without uncaught JS errors, failed own-host requests (>= 400) or broken images. */
  healthPages?: ClientPage[];
  /** Requests ignored by the health check (third-party noise, known 404 trackers …). */
  healthIgnoreRequests?: RegExp[];

  /** Search terms with expected results (relevance checks beyond testData.searchTerm). */
  searchCases?: Array<{
    term: string;
    /** Minimum number of results (default 1; 0 = must find nothing). */
    minResults?: number;
    /** Product name (substring, case insensitive) that must be among the results. */
    expectProduct?: string;
  }>;

}

/** Final config after env overrides + selector merge. */
export interface ResolvedConfig extends Omit<ProjectConfig, 'selectors'> {
  selectors: Selectors;
  env: {
    httpCredentials?: { username: string; password: string };
    admin: {
      clientId?: string;
      clientSecret?: string;
      username?: string;
      password?: string;
    };
    accessKey?: string;
    /** Existing, active customer to log in with instead of registering a new one per test. */
    testCustomer?: { email: string; password: string };
    /** Secret header that lets test traffic past the shop's bot protection (E2E_HEADER_NAME / E2E_HEADER_VALUE). */
    bypassHeader?: { name: string; value: string };
    allowWriteTests: boolean;
    cleanupTestData: boolean;
  };
}
