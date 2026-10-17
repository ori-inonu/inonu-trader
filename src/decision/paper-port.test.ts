import { describe, expect, test } from "bun:test";
import { createPaperPort, type PaperPortOptions } from "./paper-port";
import type { Order } from "./types";

const order = (id: string, nonce: number, patch: Partial<Order> = {}): Order => ({ id, symbol: "TOKEN", side: "buy", sizeUsd: 1000, limitPriceUsd: 2.1, nonce, ...patch });
const port = (patch: Partial<PaperPortOptions> = {}) => createPaperPort({ mode: "paper", priceFor: () => 2, feeBps: 10, gasUsd: 0.5, ...patch });

describe("porta paper", () => {
  test("não existe modo live: só paper e replay", () => {
    expect(() => createPaperPort({ mode: "live" as never, priceFor: () => 2, feeBps: 0, gasUsd: 0 })).toThrow("desabilitado");
    expect(port({ mode: "replay" }).mode).toBe("replay");
  });

  test("compra preenche com slippage adverso, taxa e gas", async () => {
    const p = port({ slippageBps: () => 20 });
    const fill = await p.submit(order("a", 1));
    expect(fill.status).toBe("filled");
    expect(fill.fillPriceUsd).toBeCloseTo(2 * 1.002, 12);
    expect(fill.feeUsd).toBeCloseTo(1, 12);
    expect(fill.gasUsd).toBe(0.5);
    expect(fill.slippageBps).toBe(20);
  });

  test("reenviar o mesmo id devolve o mesmo fill e nunca gera uma segunda ordem", async () => {
    const p = port();
    const first = await p.submit(order("a", 1));
    const again = await p.submit(order("a", 1));
    const withOtherNonce = await p.submit(order("a", 7));
    expect(again).toBe(first);
    expect(withOtherNonce).toBe(first);
    expect(p.fills()).toHaveLength(1);
    expect(p.pnl().feesUsd).toBeCloseTo(1, 12);
  });

  test("nonce tem de ser o seguinte; recusa por nonce não queima o id", async () => {
    const p = port();
    const skipped = await p.submit(order("a", 5));
    expect(skipped).toMatchObject({ status: "rejected", reason: "nonce" });
    expect(p.fills()).toHaveLength(0);
    expect((await p.submit(order("a", 1))).status).toBe("filled");
    expect((await p.submit(order("b", 1))).reason).toBe("nonce");
    expect((await p.submit(order("b", 2))).status).toBe("filled");
  });

  test("preço pior que o limite é recusado; vender abaixo do limite também", async () => {
    const buy = await port({ priceFor: () => 2.5 }).submit(order("a", 1));
    expect(buy).toMatchObject({ status: "rejected", reason: "limite_de_preco" });

    const p = port({ priceFor: (o) => (o.side === "buy" ? 2 : 1.8) });
    await p.submit(order("b", 1));
    const sell = await p.submit(order("s", 2, { side: "sell", limitPriceUsd: 1.9 }));
    expect(sell).toMatchObject({ status: "rejected", reason: "limite_de_preco" });
  });

  test("sem preço, sem posição para vender e tamanho inválido são recusas", async () => {
    expect((await port({ priceFor: () => undefined }).submit(order("a", 1))).reason).toBe("sem_preco");
    expect((await port().submit(order("a", 1, { side: "sell" }))).reason).toBe("sem_posicao");
    expect((await port().submit(order("a", 1, { sizeUsd: 0 }))).reason).toBe("tamanho_invalido");
  });

  test("falha de envio cobra o gas, não preenche e carrega o motivo", async () => {
    const p = port({ failure: () => "gas_station_pendente" });
    const fill = await p.submit(order("a", 1));
    expect(fill).toMatchObject({ status: "failed", reason: "gas_station_pendente", gasUsd: 0.5, feeUsd: 0 });
    expect(p.pnl()).toMatchObject({ gasUsd: 0.5, feesUsd: 0, open: {} });
  });

  test("PnL realizado sai líquido da taxa e do gas das duas pernas", async () => {
    // Compra 1000 USD a 2,00 (500 un.): base 1000 + 1 + 0,5. Venda de 1100 USD a 2,20 (500 un.): 1100 - 1,1 - 0,5.
    const p = port({ priceFor: (o) => (o.side === "buy" ? 2 : 2.2) });
    await p.submit(order("a", 1));
    expect(p.pnl().open.TOKEN?.units).toBeCloseTo(500, 9);
    await p.submit(order("b", 2, { side: "sell", sizeUsd: 1100, limitPriceUsd: 2.1 }));
    const pnl = p.pnl();
    expect(pnl.realizedUsd).toBeCloseTo(1100 - 1.1 - 0.5 - 1001.5, 9);
    expect(pnl.open).toEqual({});
    expect(pnl.feesUsd).toBeCloseTo(2.1, 9);
    expect(pnl.gasUsd).toBe(1);
  });

  test("venda parcial realiza só a fração vendida e mantém o resto da base", async () => {
    const p = port({ feeBps: 0, gasUsd: 0, priceFor: (o) => (o.side === "buy" ? 2 : 3) });
    await p.submit(order("a", 1));
    await p.submit(order("b", 2, { side: "sell", sizeUsd: 600, limitPriceUsd: 2.5 }));
    expect(p.pnl().realizedUsd).toBeCloseTo(600 - 400, 9);
    expect(p.pnl().open.TOKEN).toEqual({ units: 300, costUsd: 600 });
  });
});
