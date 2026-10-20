import { test, expect } from '../../src/client/fixtures';
import { loadConfig } from '../../src/config/loader';

/** Configure in projects/<shop>.ts → client.productGallery */
const gallery = loadConfig().client?.productGallery;

test.describe('Client: product gallery', { tag: '@client' }, () => {
  test.skip(!gallery, 'No client.productGallery configured');

  for (const p of gallery?.pages ?? []) {
    test(`gallery on "${p.name}" shows its images`, async ({ page, cfg, product }) => {
      await product.open(p.path);
      const images = page.locator(gallery!.imageSelector ?? cfg.selectors.product.galleryImage);
      const min = gallery!.minImages ?? 1;
      await expect(images.first()).toBeVisible();
      expect(await images.count(), 'gallery images').toBeGreaterThanOrEqual(min);

      // only the visible images have to be loaded (sliders / "show more" keep the rest lazy)
      const visible = images.locator('visible=true');
      await expect.poll(
        () => visible.evaluateAll((imgs) => (imgs as HTMLImageElement[]).filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.currentSrc || i.src)),
        { message: 'visible gallery images that did not load' },
      ).toEqual([]);

      const noAlt = await images.evaluateAll((imgs) => (imgs as HTMLImageElement[]).filter((i) => !i.alt?.trim()).map((i) => i.currentSrc || i.src));
      expect.soft(noAlt, 'gallery images without alt text').toEqual([]);
    });
  }
});
