import type { Page } from '@playwright/test';
import type { ResolvedConfig } from '../config/types';

/** Closes one of the shop's own popups (cfg.dismissPopups); a click during the fade-in can be ignored → retried. */
async function close(page: Page, popup: string, closeButton: string): Promise<void> {
  const dialog = page.locator(popup).first();
  for (let i = 0; i < 5 && (await dialog.isVisible()); i++) {
    await dialog.locator(closeButton).first().click({ timeout: 5_000 }).catch(() => page.keyboard.press('Escape'));
    await dialog.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => undefined);
  }
}

/** Closes popups automatically before every click / fill / web-first assertion on this page. */
export async function autoClosePopups(page: Page, cfg: ResolvedConfig): Promise<void> {
  for (const { popup, close: closeButton } of cfg.dismissPopups ?? []) {
    await page.addLocatorHandler(page.locator(popup).first(), () => close(page, popup, closeButton));
  }
}

/**
 * For checks that only read the page (layout audits, accessible names): waits briefly for the shop's popups
 * and closes them. No-op on shops without cfg.dismissPopups.
 */
// Mall Street dev opens its newsletter popup ~2.5 s after DOMContentLoaded, later on a slow server
export async function closePopups(page: Page, cfg: ResolvedConfig, appearTimeout = 10_000): Promise<void> {
  for (const { popup, close: closeButton } of cfg.dismissPopups ?? []) {
    const shown = await page.locator(popup).first().waitFor({ state: 'visible', timeout: appearTimeout }).then(() => true, () => false);
    if (shown) await close(page, popup, closeButton);
  }
}
