export const headerLocators = {
  cartLink: 'a[href="/checkout/cart"][data-cart-widget="true"]',
  cartBadge: '.header-cart-badge',
  // Clicking cartLink opens an off-canvas mini-cart rather than navigating
  // directly; this is the "view full cart" action inside that mini-cart.
  offcanvasViewCartLinkText: 'Shiko shportën',
  searchInput: '#header-main-search-input',
  searchToggleButton: '.js-search-toggle-btn',
  searchSubmitButton: 'button[aria-label="Kërko"]',
};
