import type { ProjectConfig } from '../src/config/types';
import jetrails from './mallstreet-jetrails';

/**
 * The Mall Street — preview.themallstreet.com (behind basic auth + Cloudflare).
 * PRODUCTION-SAFE: readOnly forces read-only runs — no orders, no customers, no account changes,
 * no cleanup — whatever .env / CI variables say. Same theme as dev → selectors come from ./mallstreet.
 *
 *   PROJECT=mallstreet-preview npx playwright test      (.env: HTTP_USERNAME / HTTP_PASSWORD of the preview)
 *
 * Test products as on themallstreet.jetrails.cloud — verified on preview 2026-11-04 (smoke: 28 passed, 10 write tests skipped).
 */
const config: ProjectConfig = {
  ...jetrails,
  name: 'The Mall Street (preview.themallstreet.com)',
  baseURL: 'https://preview.themallstreet.com',
  readOnly: true,
};

export default config;
