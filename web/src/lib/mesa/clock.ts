/**
 * The exchange clock as the desk knows it: the browser clock (the Windows clock, which can be minutes off) plus the skew measured against
 * the exchange. The engine stamps its readings with the exchange clock, so their ages must be counted against this one. Zero until the
 * browser clock has ticked; the browser clock itself when no skew was measured yet.
 */
export function exchangeNowMs(browserNowMs: number, skewMs: number | null): number {
  if (!(browserNowMs > 0)) return 0;
  return browserNowMs + (skewMs ?? 0);
}
