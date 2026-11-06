/**
 * Shopware's default `elasticsearch.index_settings.max_result_window` for storefront indices.
 * Offsets past it make OpenSearch/Elasticsearch reject the query. The deep-page tests never look
 * further: a shop that raised the limit is outside default Shopware behaviour.
 */
export const SEARCH_RESULT_WINDOW = 10_000;

/** Shopware's default products-per-page, used when a listing fits on one page (its real limit is not visible). */
export const DEFAULT_PAGE_SIZE = 24;

export interface DeepPage {
  p: number;
  label: string;
}

/**
 * Page numbers worth probing beyond the real end of a listing, derived from its actual size
 * instead of a fixed guess: the first page that does not exist (last + 1), and the first page whose
 * offset crosses Shopware's default result window of 10000 (only when that lies further out).
 */
export function pagesBeyondEnd(lastPage: number, pageSize: number): DeepPage[] {
  const pages: DeepPage[] = [{ p: lastPage + 1, label: `first page after the last one (p=${lastPage + 1})` }];
  // page p requests products [(p-1)*size, p*size) → the engine rejects it once p*size > window
  const windowPage = Math.floor(SEARCH_RESULT_WINDOW / pageSize) + 1;
  if (windowPage > lastPage + 1) {
    pages.push({ p: windowPage, label: `first page past the ${SEARCH_RESULT_WINDOW} search result window (p=${windowPage}, ${pageSize} per page)` });
  }
  return pages;
}

/** Appends/replaces the `p` query parameter on a relative or absolute path. */
export function withPage(path: string, p: number): string {
  const url = new URL(path, 'http://x');
  url.searchParams.set('p', String(p));
  return `${url.pathname}${url.search}`;
}
