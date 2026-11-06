# [B&G] 404 pages are sent incomplete — the browser keeps loading

**Page:** any unknown URL, e.g. http://maschinenprofi.de.cloud7-vm254.de-nserver.de/e2e-not-existing-1

**Steps:**
1. Open a URL that doesn't exist (or `curl -sS -o /dev/null <url>`).

**Expected:** A complete 404 page.

**Actual:** The response announces `Content-Length: 158785` but only 158049 bytes arrive — always exactly 736 bytes short (`curl: (18) transfer closed with 736 bytes remaining to read`). The browser waits for the rest and the page never finishes loading. DinoParts and Würth on the same server send complete 404 pages, so this is specific to the B&G shop (something adds/removes output after the length was set, e.g. a plugin or response subscriber on the error page). Normal 200 pages are fine.

**Fails:** "unknown URL shows a 404 page with a way back", "unknown product URL returns 404", "error pages do not reveal debug information", "sensitive files are not served" (all time out on the 404 responses).

**Checked:** 2026-11-05
