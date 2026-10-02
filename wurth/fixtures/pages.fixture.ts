import { test as base } from '@playwright/test';
import { ProductDetailPage } from '@resources/pages/storefront/ProductDetailPage';
import { CartPage } from '@resources/pages/storefront/CartPage';
import { CheckoutRegisterPage } from '@resources/pages/storefront/CheckoutRegisterPage';
import { HeaderCart } from '@resources/components/storefront/HeaderCart';

interface StorefrontFixtures {
  productDetailPage: ProductDetailPage;
  cartPage: CartPage;
  checkoutRegisterPage: CheckoutRegisterPage;
  headerCart: HeaderCart;
}

export const test = base.extend<StorefrontFixtures>({
  productDetailPage: async ({ page }, use) => {
    await use(new ProductDetailPage(page));
  },
  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },
  checkoutRegisterPage: async ({ page }, use) => {
    await use(new CheckoutRegisterPage(page));
  },
  headerCart: async ({ page }, use) => {
    await use(new HeaderCart(page));
  },
});

export { expect } from '@playwright/test';
