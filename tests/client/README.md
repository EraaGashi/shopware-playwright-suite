# Client-specific tests

Put tests for **client-specific features and customisations** here — everything that is
not standard Shopware (custom plugins, B2B flows, configurators, custom CMS elements…).

Rules of thumb:

- Keep `tests/storefront/**` untouched in client projects. If a core test fails because
  the theme differs, fix it via `selectors` / `features` / `testData` in `projects/<client>.ts`.
- Put client page objects in `src/client/` and extend the fixtures there
  (see `example-custom-feature.spec.ts`).
- Tag client tests `@client` so they can be run separately: `npx playwright test --grep @client`.

## Configurable client tests (reuse for any shop)

These specs read their data from `client` in `projects/<shop>.ts`. Leave a section out and its
tests skip. Each page/link becomes its own test, named after `name`, so a single one can be
put in `knownIssues` / `skipTests`. See `projects/mallstreet.ts` for a full example.

| Spec | Config | Checks |
|---|---|---|
| `landing-pages.spec.ts` | `client.landingPages` | status 200, logo, footer, CMS section, optional `<h1>` text and minimum product boxes |
| `seo.spec.ts` | `client.seo` | title, one `<h1>`, one absolute canonical on the shop host, `og:title`, meta description (`requireMetaDescription`), not noindex (`indexable`; `false` for staging), and `noindexPaths` really are noindex |
| `header-footer-links.spec.ts` | `client.headerLinks`, `client.footerLinks` | link is shown, points to the expected target and opens without error (header: CSS selector + `href`; footer: visible text) |
| `encoding.spec.ts` | `client.encodingPages` | title, `og:title`, description, `h1`/`h2`, breadcrumb show no `&amp;`-style entities or broken characters (`Ã¤`, `â€™`) |
| `page-health.spec.ts` | `client.healthPages`, `client.healthIgnoreRequests` | no uncaught JS errors, no failed requests (>= 400) to the shop's own host, no broken images (after scrolling, so lazy images load) |
| `responsive.spec.ts` | `client.responsive` | each page at each viewport (default mobile 390 / tablet 768 / desktop 1440): no horizontal scrolling, logo and cart visible |
| `search-cases.spec.ts` | `client.searchCases` | search term finds at least `minResults` products (0 = nothing) and optionally a given product |
| `product-gallery.spec.ts` | `client.productGallery` | PDP gallery has `minImages` images, visible ones loaded, all with alt texts |
| `content-checks.spec.ts` | `client.contentChecks` | any shop-specific element (banner, widget, badge …) is visible on a page, optional text and minimum count |

```ts
client: {
  landingPages: [{ name: 'Women', path: '/Women/', heading: 'Women', minProducts: 1 }],
  seo: { pages: [{ name: 'Home', path: '/' }], indexable: true, noindexPaths: ['/account/login'] },
  headerLinks: [{ name: 'Order status', selector: 'a.top-bar-order-status', href: '/account/order' }],
  footerLinks: [{ name: 'Imprint', text: /Imprint|Impressum/i }],
  encodingPages: [{ name: 'Home', path: '/' }],
  healthPages: [{ name: 'Home', path: '/' }],
  responsive: { pages: [{ name: 'Home', path: '/' }] },
  searchCases: [{ term: 'shirt', minResults: 3, expectProduct: 'T-Shirt' }, { term: 'xyz-nothing', minResults: 0 }],
  productGallery: { pages: [{ name: 'Shirt', path: '/T-Shirt/SW10001' }], minImages: 2 },
  contentChecks: [{ name: 'Hero banner', path: '/', selector: '.hero-banner', text: 'Sale' }],
},
```

Run only these: `npx playwright test tests/client --project=chromium`
