# [B&G] Product image thumbnails have no alt text

**Page:** http://maschinenprofi.de.cloud7-vm254.de-nserver.de/bosch-expert-spannungspruefer-exvt1000-17

**Steps:**
1. Open the product page on desktop.
2. Inspect the small thumbnail images below the main product image.

**Expected:** The thumbnails have an `alt` attribute (e.g. the product name), like the main image does.

**Actual:** The images in `.gallery-slider-thumbnails` have no `alt`. Screen readers read the file name instead. Affects all products with more than one image.

**Fix:** Add `alt` to the thumbnail images in the theme's gallery template.

**Fails:** "Accessibility › images have an alt attribute".

**Checked:** 2026-11-05
