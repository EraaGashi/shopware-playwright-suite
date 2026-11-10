# [Mall Street dev] Every product is "No longer available from a seller" — no order can be placed

**Page:** https://dev.themallstreet.com/checkout/confirm (also the cart), with any product in it

**Steps:**
1. Open a priced product, e.g. https://dev.themallstreet.com/Arahi-8/1168690001 (Arahi 8, Varsity Navy US 8, $99.99), and add it to the cart.
2. Go to the cart or continue to checkout as a guest or logged-in customer.

**Expected:** The product can be ordered, like it could on 2026-11-09 (same variant, test order placed).

**Actual:** The line item gets the red badge "No longer available from a seller", the confirm page says "One or more marketplace items are no longer available from a seller. Please remove them from your cart before placing your order." and the order button stays disabled. It's not one product: every product checked on 2026-11-10 has this — Arahi 8 (1168690001, 1168690002), Cloud Tulle Dress Set (CBS8018031), five more priced products from the parka / backpack / tutu / dress searches ($98–$225), and the $0.00 products (Callie Pump, Ashley Top, Bianca Earring). It looks like all Mirakl seller offers are gone on dev, maybe a failed or stopped offer sync. Variants that are actually sold out are still shown as "(Unavailable)" on the PDP. These ones aren't, so the PDP and the cart disagree.

**Fails:** "Checkout › guest checkout places an order", "Checkout › registered customer places an order and sees it in the account" (CI and local).

**Screenshot:** mallstreet-dev-no-seller-offers.png

**Checked:** 2026-11-10
