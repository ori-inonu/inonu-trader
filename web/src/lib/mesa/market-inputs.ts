import type { DeskState } from "../desk/types";

type ChartInputs = Pick<DeskState, "candles" | "ticker" | "metrics" | "instrument">;
type ExchangeInputs = ChartInputs & Pick<DeskState, "derivatives">;

/** Select the source for both chart and header, including values that are unavailable. */
export function marketInputsFor(exchange: ExchangeInputs, onchain: ChartInputs | null) {
  const selected = onchain === null ? exchange : onchain;
  return {
    candles: selected.candles,
    ticker: selected.ticker,
    metrics: selected.metrics,
    instrument: selected.instrument,
    derivatives: onchain === null ? exchange.derivatives : null,
    awaitingLabel: onchain === null ? undefined : "Aguardando dados on-chain",
  };
}
