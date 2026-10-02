import { test, expect } from '@fixtures/pages.fixture';
import { stableProduct } from '@resources/data/products';
import { checkoutFlow } from '@resources/data/checkout';
import { common } from '@resources/variables/common';
import { dismissCookieBannerIfPresent } from '@lib/utils/diagnostics';

test.describe('Smoke - TC01 Checkout Authentication Gate', () => {
  test('unauthenticated user is redirected to the checkout register/login gate', async ({
    page,
    productDetailPage,
    headerCart,
    cartPage,
    checkoutRegisterPage,
  }) => {
    await test.step('Open product page and handle cookie banner', async () => {
      await productDetailPage.open(stableProduct.path);
      await dismissCookieBannerIfPresent(page, common.text.cookieBannerAcceptNecessary);
    });

    await test.step('Verify product detail page is displayed', async () => {
      await productDetailPage.expectDisplayed();
      await productDetailPage.expectTitle(stableProduct.name);
      await productDetailPage.expectPriceHiddenForGuest();
    });

    await test.step('Add product to cart', async () => {
      await productDetailPage.setQuantity(checkoutFlow.expectedQuantity);
      await productDetailPage.addToCart();
    });

    await test.step('Verify cart counter reflects the added item', async () => {
      if (await headerCart.isBadgeVisible()) {
        await headerCart.expectItemCount(checkoutFlow.expectedQuantity);
      }
    });

    await test.step('Open cart and verify the product', async () => {
      await headerCart.open();
      await cartPage.expectDisplayed();
      await cartPage.expectProductInCart(stableProduct.name);
      await cartPage.expectQuantity(stableProduct.name, checkoutFlow.expectedQuantity);
    });

    await test.step('Proceed to checkout and verify the authentication gate', async () => {
      await cartPage.proceedToCheckout();
      await checkoutRegisterPage.expectAuthenticationGateReached();
    });

    await test.step('Verify login form is displayed with no guest checkout option', async () => {
      await checkoutRegisterPage.expectLoginFormDisplayed();
      await checkoutRegisterPage.expectCreateAccountOptionAvailable();
      await checkoutRegisterPage.expectNoGuestCheckoutOption();
    });
  });
});
