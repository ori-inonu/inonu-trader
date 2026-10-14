import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import InstrumentHeader from "@/components/Desk/InstrumentHeader";
import { createLabMarket, LAB_PRESETS } from "../desk/ui/lab-fixture";
import { onchainMetricsFor, onchainTickerFor } from "../onchain/useOnchainCandles";
import { marketInputsFor } from "./market-inputs";

// Explicit synthetic fixture, used only to exercise display source selection.
const exchange = createLabMarket(LAB_PRESETS[0], 3, Date.UTC(2026, 9, 11, 12)).state();
const empty = { candles: [], ticker: null, metrics: onchainMetricsFor([]), instrument: null };

describe("focused market display", () => {
  test.each(["bar", "compact"] as const)("%s header never inherits exchange values for an empty on-chain source", (variant: "bar" | "compact") => {
    const inputs = marketInputsFor(exchange, empty);
    const html = renderToStaticMarkup(<InstrumentHeader {...inputs} variant={variant} />);
    expect(inputs.ticker).toBeNull();
    expect(inputs.instrument).toBeNull();
    expect(inputs.candles).toHaveLength(0);
    expect(inputs.metrics).toBe(empty.metrics);
    expect(inputs.derivatives).toBeNull();
    expect(html).toContain("Aguardando dados on-chain");
    expect(html).toContain("Faixa de 24 horas indisponivel");
    expect(html).not.toContain("BTC-USDT");
    expect(html).not.toContain("Ultimo em USDT");
    expect(html).not.toContain("Aguardando dados da OKX");
    expect(html).not.toContain("data-dir=");
  });

  test("a partial on-chain response cannot fill its missing instrument or book from the exchange", () => {
    const candles = [{ tsMs: 1000, open: 2, high: 3, low: 1, close: 2.5, volBase: 10, volQuote: 25, confirmed: true }];
    const onchain = { candles, ticker: onchainTickerFor(candles, { symbol: "TOKEN", name: "Test token", chainIndex: "1", address: "0x1" }), metrics: onchainMetricsFor(candles), instrument: null };
    const inputs = marketInputsFor(exchange, onchain);
    expect(inputs.ticker?.instId).toBe("TOKEN");
    expect(inputs.instrument).toBeNull();
    expect(inputs.metrics.spreadBps).toBeNull();
    expect(inputs.candles).toBe(candles);
  });

  test("without on-chain focus it preserves the exchange slices and derivatives", () => {
    const inputs = marketInputsFor(exchange, null);
    expect(inputs.ticker).toBe(exchange.ticker);
    expect(inputs.instrument).toBe(exchange.instrument);
    expect(inputs.metrics).toBe(exchange.metrics);
    expect(inputs.candles).toBe(exchange.candles);
    expect(inputs.derivatives).toBe(exchange.derivatives);
    expect(inputs.awaitingLabel).toBeUndefined();
  });
});
