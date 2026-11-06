# [B&G] Checkout on phones: "Zurück zum Shop" is cut off and the page scrolls sideways

**Page:** http://maschinenprofi.de.cloud7-vm254.de-nserver.de/checkout/register (with a product in the cart), 375 × 812

**Steps:**
1. Add a product to the cart on a phone-sized screen.
2. Go to the checkout.

**Expected:** The header's "Zurück zum Shop" button shows its label; the page fits the screen width.

**Actual:** The button (`.header-minimal-back-to-shop-button`) is 46 px wide but its text needs 67 px — only "‹" is visible. The page is 4 px wider than the screen and scrolls sideways.

**Fails:** "Responsive layout mobile-375x812 › cart, off-canvas cart and guest checkout fit with a product in the cart".

**Screenshot:** `reports/bugs/bg-checkout-mobile-back-button.png`

**Checked:** 2026-11-05
