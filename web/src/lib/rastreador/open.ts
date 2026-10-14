/**
 * How the Rastreador hands an asset to the desk (RAS-1): `/?ativo=SYMBOL`. The desk reads it once when it opens and accepts only a
 * plain OKX instrument id; anything else in the address is ignored, never trusted.
 */
const INSTRUMENT = /^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}(-[A-Z0-9]{1,20})?$/;

export function openUrl(instId: string): string {
  return INSTRUMENT.test(instId) ? `/?ativo=${instId}` : "/";
}

/** The instrument named in a query string (`location.search`), or null when there is none or it is not a plain id. */
export function focusFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("ativo");
  return value !== null && INSTRUMENT.test(value) ? value : null;
}
