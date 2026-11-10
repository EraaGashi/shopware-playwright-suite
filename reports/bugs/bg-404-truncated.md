# [B&G] Error pages (404, 400) never finish loading — Content-Length is 736 bytes too large

**Page:** any error page, e.g. http://maschinenprofi.de.cloud7-vm254.de-nserver.de/e2e-not-existing-1 (404) or `/search?search[]=e2e` (400)

**Steps:**
1. Open a URL that doesn't exist, or run `curl -sS -o /dev/null <url>`.

**Expected:** The error page loads completely, like on DinoParts / Würth on the same server.

**Actual:** The HTML that arrives is complete (it ends with `</html>`), but the response header announces 736 bytes more (`Content-Length: 158785`, 158049 bytes sent — `curl: (18) transfer closed with 736 bytes remaining to read`). The browser keeps waiting for the missing bytes: the page stays in "loading", `DOMContentLoaded` never fires, so Shopware's JavaScript (menu flyouts, search suggestions, off-canvas cart) never starts on error pages. Always exactly 736 bytes, on every error page — normal 200 pages are fine. Probably something changes the error page output after the length was set (a plugin / response subscriber).

**Fails:** "Error handling › unknown URL shows a 404 page with a way back", "Product detail page › unknown product URL returns 404".

**Checked:** 2026-11-06
