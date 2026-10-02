import { Locator } from '@playwright/test';

export async function setQuantity(input: Locator, quantity: number): Promise<void> {
  await input.fill(String(quantity));
  await input.blur();
}
