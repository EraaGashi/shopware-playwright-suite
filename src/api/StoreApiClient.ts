import { request, type APIRequestContext } from '@playwright/test';
import type { ResolvedConfig } from '../config/types';
import { bypassHeaders } from '../utils/http';
import type { TestCustomer } from '../data/customer';

/**
 * Minimal Shopware Store API client (headless, fast test data setup).
 * Requires the sales channel access key (SW_ACCESS_KEY or resolved via Admin API).
 */
export class StoreApiClient {
  private countryCache = new Map<string, string>();

  private constructor(
    private readonly ctx: APIRequestContext,
    private readonly cfg: ResolvedConfig,
  ) {}

  static async create(cfg: ResolvedConfig, accessKey: string): Promise<StoreApiClient> {
    const ctx = await request.newContext({
      baseURL: cfg.baseURL,
      httpCredentials: cfg.env.httpCredentials,
      extraHTTPHeaders: { 'sw-access-key': accessKey, Accept: 'application/json', ...bypassHeaders(cfg) },
    });
    return new StoreApiClient(ctx, cfg);
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  private async post<T = any>(path: string, data: unknown = {}, headers: Record<string, string> = {}): Promise<{ json: T; contextToken?: string }> {
    const res = await this.ctx.post(`/store-api${path}`, { data, headers });
    if (!res.ok()) throw new Error(`Store API ${path} failed: ${res.status()} ${await res.text()}`);
    return { json: (await res.json()) as T, contextToken: res.headers()['sw-context-token'] };
  }

  async countryId(iso: string): Promise<string> {
    if (!this.countryCache.has(iso)) {
      // Store API caps limit at 100 → filter by ISO instead of loading all countries
      const { json } = await this.post<{ elements: { id: string; iso: string }[] }>('/country', {
        filter: [{ type: 'equals', field: 'iso', value: iso }],
        limit: 1,
      });
      for (const c of json.elements) this.countryCache.set(c.iso, c.id);
    }
    const id = this.countryCache.get(iso);
    if (!id) throw new Error(`Country ${iso} is not assigned to the sales channel`);
    return id;
  }

  async salutationIds(): Promise<string[]> {
    const { json } = await this.post<{ elements: { id: string; salutationKey: string }[] }>('/salutation');
    return json.elements.map((s) => s.id);
  }

  /** Looks up a product by product number, returns its id (for fast cart setup). */
  async productIdByNumber(productNumber: string): Promise<string> {
    const { json } = await this.post<{ elements: { id: string }[] }>('/product', {
      filter: [{ type: 'equals', field: 'productNumber', value: productNumber }],
      limit: 1,
      includes: { product: ['id'] },
    });
    const id = json.elements[0]?.id;
    if (!id) throw new Error(`Product ${productNumber} not found / not visible in sales channel`);
    return id;
  }

  /** Registers a customer headlessly (same validation as the storefront form). */
  async registerCustomer(customer: TestCustomer): Promise<void> {
    const countryId = await this.countryId(customer.address.countryIso);
    const salutations = await this.salutationIds().catch(() => []);
    await this.post('/account/register', {
      salutationId: salutations[0],
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      password: customer.password,
      storefrontUrl: this.cfg.baseURL,
      acceptedDataProtection: true,
      billingAddress: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        street: customer.address.street,
        zipcode: customer.address.zipcode,
        city: customer.address.city,
        countryId,
        ...(customer.address.phoneNumber ? { phoneNumber: customer.address.phoneNumber } : {}),
      },
    });
  }
}
