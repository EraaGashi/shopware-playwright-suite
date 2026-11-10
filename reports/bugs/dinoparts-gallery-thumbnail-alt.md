# [DinoParts] Product image thumbnails have no alt text

**Page:** http://dino-parts.com.cloud7-vm254.de-nserver.de/Faltenbalg-Schalthebel-Ferrari-365-GTB4-Daytona/113343

**Steps:**
1. Open the product page on desktop.
2. Inspect the small thumbnail images below the main product image.

**Expected:** The thumbnails have an `alt` attribute (e.g. the product name), like the main image does.

**Actual:** The thumbnails (`img.gallery-slider-thumbnails-image`) have no `alt`, only a `title`. Screen readers read the file name instead. This affects all products with more than one image.

**Fix:** Add `alt` to the thumbnail images in the theme's gallery template.

**Screenshot:** `reports/bugs/dinoparts-gallery-thumbnail-alt.png`

**Fails:** "Accessibility › images have an alt attribute".

**Checked:** 2026-11-06 (still open)
