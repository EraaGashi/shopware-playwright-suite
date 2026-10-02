// The site renders a duplicate (hidden) buy-widget alongside the visible one
// for the same product, so every selector scoped under `.product-detail-buy`
// must be narrowed to the `:visible` instance to avoid strict-mode violations.
export const productLocators = {
  title: 'h1.product-name',
  buyPanel: '.product-detail-buy',
  quantityInput: '.product-detail-buy input.js-quantity-selector:visible',
  quantityMinus: '.product-detail-buy .js-btn-minus:visible',
  quantityPlus: '.product-detail-buy .js-btn-plus:visible',
  addToCartButton: '.product-detail-buy .btn-buy:visible',
  guestPrice: '.product-detail-price-guest',
};
