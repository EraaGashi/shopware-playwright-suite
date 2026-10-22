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

  test('grand total equals net total plus taxes', { tag: '@mobile' }, async ({ cart, cartHelper, cfg }) => {
    // risk: rounding / tax plugins make the summary not add up — the customer pays a different amount than shown
    await cartHelper.add(cfg.testData.simpleProduct, 1);
    await cart.open();
    const s = await breakdown(cart);
    const taxSum = s.taxes.reduce((a, t) => a + t.amount, 0);
    expect(Math.abs(s.net + taxSum - s.grand), `net ${s.net} + taxes ${taxSum} ≠ grand total ${s.grand}`).toBeLessThanOrEqual(await tolerance(cart));
  });

  test('each tax amount matches its rate', async ({ cart, cartHelper, cfg }) => {
    // risk: wrong tax rate applied (or label shows another rate than calculated)
    await cartHelper.add(cfg.testData.simpleProduct, 1);
    await cart.open();
    const s = await breakdown(cart);
    test.skip(s.taxes.length !== 1, 'Several tax rates in one cart — split per rate is not visible in the summary');
    const [tax] = s.taxes;
    test.skip(tax.rate === undefined, `Tax label shows no rate: "${tax.label}"`);
    const expected = (s.net * tax.rate!) / 100;
    expect(Math.abs(tax.amount - expected), `"${tax.label}": ${tax.amount} vs ${s.net} × ${tax.rate}% = ${expected.toFixed(2)}`).toBeLessThanOrEqual(await tolerance(cart));
  });

  test('an odd quantity is calculated without rounding drift', async ({ cart, cartHelper, cfg }) => {
    // risk: per-unit rounding (e.g. 99.99 × 7) or tier prices drift from the unit price shown
    const p = cfg.testData.simpleProduct;
    await cartHelper.add(p, 1);
    await cart.open();
    const single = await cart.lineTotalOf(p.name);
    await cart.setQuantity(p.name, 7);
    expect(await cart.quantityOf(p.name)).toBe(7);
    const unit = await cart.unitPriceOf(p.name);
    const expectedLine = (Number.isNaN(unit) ? single : unit) * 7;
    await expect.poll(() => cart.lineTotalOf(p.name), { message: 'line total for quantity 7' }).toBeCloseTo(expectedLine, 2);
    const s = await cart.summary();
    if (s.net !== undefined && s.taxes.length) {
      const taxSum = s.taxes.reduce((a, t) => a + t.amount, 0);
      expect(Math.abs(s.net + taxSum - s.grand), `after quantity 7: net ${s.net} + taxes ${taxSum} ≠ ${s.grand}`).toBeLessThanOrEqual(await tolerance(cart));
    }
    expect(s.grand, 'grand total below the line total').toBeGreaterThanOrEqual(expectedLine - 0.01);
  });
});
