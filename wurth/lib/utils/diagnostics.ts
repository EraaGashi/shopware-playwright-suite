import { Page } from '@playwright/test';

export async function dismissCookieBannerIfPresent(page: Page, buttonText: string): Promise<void> {
  const acceptNecessaryButton = page.getByRole('button', { name: buttonText, exact: true });

  if (await acceptNecessaryButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await acceptNecessaryButton.click();
    await acceptNecessaryButton.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
  }
}
