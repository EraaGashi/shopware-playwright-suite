# [B&G] Product pages show no description on staging

**Page:** http://maschinenprofi.de.cloud7-vm254.de-nserver.de/bosch-expert-spannungspruefer-exvt1000-17 (same on every product checked)

**Steps:**
1. Open any product page on staging.
2. Scroll below the gallery / buy box.

**Expected:** The "Beschreibung" / "Technische Eigenschaften" section, as on production (https://www.maschinenprofi.de/bosch-expert-spannungspruefer-exvt1000-17).

**Actual:** The CMS block `cms-block-product-description-reviews` is rendered empty (`<div class="col-12" data-cms-element-id="019174ce…"></div>`). The description is in the staging data — it appears in `<meta name="description">` and in the JSON-LD — it just isn't rendered.

**Fails:** "Product detail page › shows core product information" (desktop + mobile).

**Checked:** 2026-11-05
