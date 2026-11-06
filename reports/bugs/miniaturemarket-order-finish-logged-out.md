# [Miniature Market] Customer is logged out right after placing an order — finish page never shows

**Page:** https://swstaging.miniaturemarket.com/checkout/confirm (logged-in customer, offline payment)

**Steps:**
1. Log in as a customer and add a product to the cart.
2. Go to the checkout confirm page, accept the terms and click "Submit order".

**Expected:** The order is placed and the "Thank you" page (`/checkout/finish`) shows the order number.

**Actual:** The order is placed, but the customer doesn't see it:
- `POST /checkout/order` → 302 to `/checkout/finish?orderId=01a1b0cfb1a171c9952b1f28a81f514e`, so the order exists.
- `GET /checkout/finish?orderId=…` → 302 to `/checkout/register`, and the response deletes `sw-states` and `sw-cache-hash`. The customer is treated as logged out.
- The browser ends up on `/checkout/cart` with "Your shopping cart is empty."

The order is created, but the session is lost between the order and the finish page. The customer gets no confirmation and is likely to order again.

**Fails:** "Checkout › registered customer places an order and sees it in the account" (@smoke).

**Note:** Seen once, in the 2026-11-06 run. The same test passed on 2026-11-05 (run 2). Trace: `test-results-miniature/storefront-checkout-Checko-60651--and-sees-it-in-the-account-chromium/trace.zip`.

**Screenshot:** `reports/bugs/miniaturemarket-order-finish-logged-out.png`

**Checked:** 2026-11-06
