# Client-specific tests

Put tests for **client-specific features and customisations** here — everything that is
not standard Shopware (custom plugins, B2B flows, configurators, custom CMS elements…).

Rules of thumb:

- Keep `tests/storefront/**` untouched in client projects. If a core test fails because
  the theme differs, fix it via `selectors` / `features` / `testData` in `projects/<client>.ts`.
- Put client page objects in `src/client/` and extend the fixtures there (`src/client/fixtures.ts`).
- Tag client tests `@client` so they can be run separately: `npx playwright test --grep @client`.

## Configurable client tests (reuse for any shop)

These specs read their data from `client` in `projects/<shop>.ts`. Leave a section out and its
tests skip. Each page/link becomes its own test, named after `name`, so a single one can be
put in `knownIssues` / `skipTests`. See `projects/mallstreet.ts` for a full example.

| Spec | Config | Checks |
|---|---|---|
| `header-footer-links.spec.ts` | `client.headerLinks`, `client.footerLinks` | link is shown, points to the expected target and opens without error (header: CSS selector + `href`; footer: visible text) |
| `page-health.spec.ts` | `client.healthPages`, `client.healthIgnoreRequests` | no uncaught JS errors, no failed requests (>= 400) to the shop's own host, no broken images (after scrolling, so lazy images load) |
| `search-cases.spec.ts` | `client.searchCases` | search term finds at least `minResults` products (0 = nothing) and optionally a given product |

```ts
client: {
  headerLinks: [{ name: 'Order status', selector: 'a.top-bar-order-status', href: '/account/order' }],
  footerLinks: [{ name: 'Imprint', text: /Imprint|Impressum/i }],
  healthPages: [{ name: 'Home', path: '/' }],
  searchCases: [{ term: 'shirt', minResults: 3, expectProduct: 'T-Shirt' }, { term: 'xyz-nothing', minResults: 0 }],
},
```

Run only these: `npx playwright test tests/client --project=chromium`
