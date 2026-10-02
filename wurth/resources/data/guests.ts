/**
 * Reserved for future tests that may need guest-related test data
 * (e.g. testing the guest registration form). The storefront is B2B-only
 * and does not support guest checkout, so this data must never be used
 * to fabricate a guest checkout flow.
 */
export interface GuestProfile {
  firstName: string;
  lastName: string;
  email: string;
}

export const placeholderGuest: GuestProfile = {
  firstName: 'Test',
  lastName: 'Guest',
  email: 'test.guest@example.com',
};
