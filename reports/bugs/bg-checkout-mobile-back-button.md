# [B&G] Checkout on phones: "Zurück zum Shop" is cut off and the page scrolls sideways

**Page:** http://maschinenprofi.de.cloud7-vm254.de-nserver.de/checkout/register (with a product in the cart), 375 × 812

**Steps:**
1. Add a product to the cart on a phone-sized screen.
2. Go to the checkout.

**Expected:** The header's "Zurück zum Shop" button shows its label; the page fits the screen width.

**Actual:**
- The button (`.header-minimal-back-to-shop-button`) is a 46 × 86 px box with `overflow: hidden`; its text needs 67 px, so only "‹" is visible in an otherwise empty box.
- The page is 4 px wider than the screen (scrollWidth 379 at 375) and scrolls sideways: the `.row` around `.confirm-payment` / `.confirm-shipping` is 383 px wide — a Bootstrap row whose negative margins aren't compensated by a container.

**Fails:** "Responsive layout mobile-375x812 › cart, off-canvas cart and guest checkout fit with a product in the cart".

**Screenshot:** `reports/bugs/bg-checkout-mobile-back-button.png`

**Checked:** 2026-11-05
