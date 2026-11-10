import type { ProjectConfig } from '../src/config/types';
import mallstreet from './mallstreet';

/**
 * The Mall Street — themallstreet.jetrails.cloud (real catalog and prices, behind Cloudflare).
 * PRODUCTION-SAFE: readOnly forces read-only runs — no orders, no customers, no account changes,
 * no cleanup — whatever .env / CI variables say. Same theme as dev → selectors come from ./mallstreet.
 *
 *   PROJECT=mallstreet-jetrails npx playwright test
 *
 * Test products picked on 2026-11-04 (page views only).
 */
const devOnly = /no real products yet|dev\.themallstreet\.com/;

const config: ProjectConfig = {
  ...mallstreet,
  name: 'The Mall Street (themallstreet.jetrails.cloud)',
  baseURL: 'https://themallstreet.jetrails.cloud',
  readOnly: true,

  testData: {
    ...mallstreet.testData,
    // Arahi 8 (dev test product) does not exist here (404); numbers = the pages' structured-data "sku"
    simpleProduct: { path: '/adelina-wool-scarf/lar899', productNumber: '2017-LAR899', name: 'Adelina - Wool Scarf' },
    // Cloud Tulle Dress Set exists but has only one option here
    variantProduct: {
      path: '/adonis-loafer/adon-blac-10',  
      productNumber: '2006-Adon-Blac-10',
      name: 'Adonis Loafer',
      optionGroups: ['Color', 'Size (Shoe)'],
    },
  },

  // dev-only reasons (empty demo catalog, dev's plain-HTTP setup) don't apply here
  skipTests: mallstreet.skipTests?.filter((s) => !devOnly.test(s.reason)),
};

export default config;
