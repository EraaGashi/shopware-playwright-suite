import { defineConfig, devices, type Project } from '@playwright/test';
import { loadConfig } from './src/config/loader';

const cfg = loadConfig();
const isCI = !!process.env.CI;

// ENV_FILE=.env.wurth → own report/result folders (playwright-report-wurth, test-results-wurth) so shops can run in parallel
const runTag = process.env.ENV_FILE?.replace(/^.*\.env\.?/, '');
const reportDir = runTag ? `playwright-report-${runTag}` : 'playwright-report';
const resultsDir = runTag ? `test-results-${runTag}` : 'test-results';

const extraBrowsers = (process.env.EXTRA_BROWSERS ?? '')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);

const browserDevices: Record<string, (typeof devices)[string]> = {
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
};

// Logging out ends every session of the account on some shops → with one shared test account
// (TEST_CUSTOMER_EMAIL) @ends-sessions tests run after all others instead of in parallel with them.
const lastOnly = cfg.env.testCustomer ? /@ends-sessions/ : undefined;

const desktopProjects: Project[] = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ...extraBrowsers
    .filter((b) => browserDevices[b])
    .map((b) => ({ name: b, use: { ...browserDevices[b] } })),
].map((p) => ({
  ...p,
  testDir: './tests',
  testIgnore: /setup\/.*/,
  grepInvert: lastOnly ? /@mobile-only|@ends-sessions/ : /@mobile-only/,
  dependencies: ['setup'],
}));

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : cfg.workers,
  outputDir: resultsDir,
  timeout: cfg.timeouts?.test ?? 60_000,
  expect: { timeout: cfg.timeouts?.expect ?? 10_000 },

  // redact-secrets must stay LAST: it scrubs secrets from the files the reporters before it have written
  reporter: isCI
    ? [['list'], ['html', { open: 'never', outputFolder: reportDir }], ['junit', { outputFile: `${resultsDir}/junit.xml` }], ['./src/reporters/redact-secrets.ts']]
    : [['list'], ['html', { open: runTag ? 'never' : 'on-failure', outputFolder: reportDir }], ['./src/reporters/redact-secrets.ts']],

  metadata: { project: cfg.name, baseURL: cfg.baseURL },

  use: {
    baseURL: cfg.baseURL,
    httpCredentials: cfg.env.httpCredentials,
    locale: cfg.locale,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: cfg.timeouts?.action ?? 15_000,
    navigationTimeout: cfg.timeouts?.navigation ?? 30_000,
  },

  projects: [
    {
      name: 'setup',
      testMatch: /setup\/.*\.setup\.ts/,
      teardown: 'cleanup',
    },
    // teardown of setup: runs once every other project is done, also when tests failed
    // (+ the @ends-sessions tests with a shared test account — a teardown's own teardown never runs)
    {
      name: 'cleanup',
      testMatch: /setup\/.*\.teardown\.ts/,
      ...(lastOnly && {
        testMatch: [/setup\/.*\.teardown\.ts/, /storefront\/.*\.spec\.ts/],
        grep: [lastOnly, /delete leftover test customers/],
        use: { ...devices['Desktop Chrome'] },
      }),
    },
    ...desktopProjects,
    {
      name: 'mobile',
      testDir: './tests',
      testIgnore: /setup\/.*/,
      grep: /@mobile/,
      ...(lastOnly && { grepInvert: lastOnly }),
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
    },
  ],
});
