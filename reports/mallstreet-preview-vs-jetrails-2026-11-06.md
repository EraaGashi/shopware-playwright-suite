# Mall Street: Preview vs. JetRails, differences

**Date:** 6 November 2026  
**Environments:** `https://preview.themallstreet.com` (Preview) · `https://themallstreet.jetrails.cloud` (JetRails)  
**Scope:** Same read-only test suite (123 tests, same code), run on both environments

## Summary

JetRails has **5 failures that Preview does not have**. All 5 have **the same cause**: the Bazaarvoice script is not configured for the JetRails domain.

| | Preview | JetRails |
|---|---|---|
| Failed | 10 | 15 |
| **Failures only on this environment** | **0** | **5** |

## Failures only on JetRails

**Error shown on every page tested:**

```
Uncaught Bazaarvoice is not configured for the domain themallstreet.jetrails.cloud.
```

| # | Test | Page | Preview | JetRails |
|---|---|---|---|---|
| 1 | Homepage has no uncaught JavaScript errors | Home | ✅ Passed | ❌ Failed |
| 2 | Page health: no JS errors, failed requests or broken images | Home | ✅ Passed | ❌ Failed |
| 3 | Page health: no JS errors, failed requests or broken images | Women's category | ✅ Passed | ❌ Failed |
| 4 | Page health: no JS errors, failed requests or broken images | Search results | ✅ Passed | ❌ Failed |
| 5 | Page health: no JS errors, failed requests or broken images | Product page | ✅ Passed | ❌ Failed |

## Cause

The Bazaarvoice integration (product reviews and ratings) only accepts the domains it has been set up for. `preview.themallstreet.com` is one of them; `themallstreet.jetrails.cloud` is not. On JetRails the script therefore throws an uncaught JavaScript error on every page that loads it.

## Recommended fix

Add `themallstreet.jetrails.cloud` to the allowed domains in the Bazaarvoice configuration, or turn off the Bazaarvoice script on the JetRails host. After that, these 5 tests should pass and JetRails should give the same results as Preview.

---
*Source: Playwright HTML reports `playwright-report-mallstreet-preview` and `playwright-report-mallstreet-jetrails` (runs of 6 Nov 2026, ~10:45–10:52).*
