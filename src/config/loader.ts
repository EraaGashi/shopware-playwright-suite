import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { shopware67Selectors, type Selectors } from '../selectors/shopware67';
import type { ProjectConfig, ResolvedConfig } from './types';

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const bool = (v: string | undefined, fallback: boolean) =>
  v === undefined || v === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

const str = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : undefined);

function deepMerge<T>(base: T, override: unknown): T {
  if (!override || typeof override !== 'object') return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    const b = out[k];
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof RegExp) && b && typeof b === 'object'
        ? deepMerge(b, v)
        : v;
  }
  return out as T;
}

let cached: ResolvedConfig | undefined;

/**
 * Loads projects/<PROJECT>.ts (default "demo"), applies env overrides and
 * merges selector overrides over the Shopware 6.7 defaults.
 */
export function loadConfig(): ResolvedConfig {
  if (cached) return cached;

  const projectName = str(process.env.PROJECT) ?? 'demo';
  const projectFile = path.resolve(__dirname, '../../projects', `${projectName}.ts`);
  if (!fs.existsSync(projectFile)) {
    throw new Error(`Project profile not found: projects/${projectName}.ts (set PROJECT=<name>)`);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(projectFile);
  const project: ProjectConfig = mod.default ?? mod.config;

  const baseURL = (str(process.env.BASE_URL) ?? project.baseURL).replace(/\/+$/, '');
  const selectors = deepMerge<Selectors>(shopware67Selectors, project.selectors);

  const testCustomerEmail = str(process.env.TEST_CUSTOMER_EMAIL);
  const testCustomerPassword = str(process.env.TEST_CUSTOMER_PASSWORD);
  const bypassValue = str(process.env.E2E_HEADER_VALUE);
  const httpUser = str(process.env.HTTP_USERNAME);
  const httpPass = str(process.env.HTTP_PASSWORD);

  // readOnly profiles (production): no customers, no account changes, no orders, no cleanup — .env can't override
  const readOnly = project.readOnly === true;

  cached = {
    ...project,
    features: readOnly ? { ...project.features, orderPlacement: false } : project.features,
    baseURL,
    selectors,
    env: {
      httpCredentials: httpUser && httpPass ? { username: httpUser, password: httpPass } : undefined,
      admin: {
        clientId: str(process.env.ADMIN_CLIENT_ID),
        clientSecret: str(process.env.ADMIN_CLIENT_SECRET),
        username: str(process.env.ADMIN_USERNAME),
        password: str(process.env.ADMIN_PASSWORD),
      },
      accessKey: str(process.env.SW_ACCESS_KEY),
      testCustomer:
        !readOnly && testCustomerEmail && testCustomerPassword ? { email: testCustomerEmail, password: testCustomerPassword } : undefined,
      bypassHeader: bypassValue ? { name: str(process.env.E2E_HEADER_NAME) ?? 'x-e2e-bypass', value: bypassValue } : undefined,
      allowWriteTests: !readOnly && bool(process.env.ALLOW_WRITE_TESTS, true),
      cleanupTestData: !readOnly && bool(process.env.CLEANUP_TEST_DATA, true),
    },
  };
  return cached;
}

export function hasAdminCredentials(cfg: ResolvedConfig): boolean {
  const a = cfg.env.admin;
  return Boolean((a.clientId && a.clientSecret) || (a.username && a.password));
}
