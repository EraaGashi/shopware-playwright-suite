import { test, expect } from '../../src/fixtures';
import type { CartPage } from '../../src/pages/CartPage';

/**
 * Price calculation invariants of the cart summary — true for gross (B2C) and net (B2B) display:
 * grand total = net + taxes, each tax = net × rate. Guest cart only, nothing is stored.
 * Themes with other summary markup: selectors.cart.summaryNet / summaryTax / summaryTaxLabel.
 */

/** Cent rounding happens per line (and per tax rate) → allow one cent per line item. */
const tolerance = async (cart: CartPage) => 0.011 * Math.max(1, await cart.lineItems.count());

test.describe('Pricing', () => {
  test.beforeEach(({ cfg }) => {
    test.skip(cfg.features.guestPrices === false, 'Guests see no prices');
  });

  async function breakdown(cart: CartPage) {
    const s = await cart.summary();
    test.skip(s.net === undefined || s.taxes.length === 0, 'No net/tax breakdown found — set selectors.cart.summaryNet / summaryTax / summaryTaxLabel for this theme');
    return s as Required<typeof s>;
  }

  test('grand total equals net total plus taxes', async ({ cart, cartHelper, cfg }) => {
    // risk: rounding / tax plugins make the summary not add up — the customer pays a different amount than shown
    await cartHelper.add(cfg.testData.simpleProduct, 1);
    await cart.open();
    const s = await breakdown(cart);
    const taxSum = s.taxes.reduce((a, t) => a + t.amount, 0);
    expect(Math.abs(s.net + taxSum - s.grand), `net ${s.net} + taxes ${taxSum} ≠ grand total ${s.grand}`).toBeLessThanOrEqual(await tolerance(cart));
  });
});
