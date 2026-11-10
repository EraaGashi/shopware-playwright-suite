import { randomBytes } from 'node:crypto';
import type { ResolvedConfig, CustomerAddress } from '../config/types';

export interface TestCustomer {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  salutationIndex: number;
  address: CustomerAddress;
}

const rand = () => Math.random().toString(36).slice(2, 8);

/**
 * Password for customers the tests register themselves: NEW_CUSTOMER_PASSWORD if set (secret in CI), otherwise a
 * random one per customer — upper + lower case, digits and a symbol, so it passes the shops' password rules.
 * The fixed TEST_CUSTOMER account keeps its own TEST_CUSTOMER_PASSWORD.
 */
function newCustomerPassword(): string {
  const fromEnv = process.env.NEW_CUSTOMER_PASSWORD?.trim();
  return fromEnv || `E2e-${randomBytes(9).toString('base64url')}-7!`;
}

/** Unique e-mail per call: <prefix>.<timestamp>.<rand>@<domain> — easy to clean up by prefix. */
export function uniqueEmail(cfg: ResolvedConfig): string {
  const { emailPrefix, emailDomain } = cfg.testData.customer;
  return `${emailPrefix}.${Date.now()}.${rand()}@${emailDomain}`;
}

export function buildCustomer(cfg: ResolvedConfig, overrides: Partial<TestCustomer> = {}): TestCustomer {
  const c = cfg.testData.customer;
  return {
    email: uniqueEmail(cfg),
    password: newCustomerPassword(),
    firstName: c.firstName,
    lastName: c.lastName,
    salutationIndex: c.salutationIndex,
    address: { ...c.address },
    ...overrides,
  };
}
