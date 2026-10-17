import { describe, expect, test } from "bun:test";
import { createBatcher } from "./batch.ts";

function harness(maxSize?: number) {
  const calls: string[][] = [];
  const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
  const batcher = createBatcher<string, number>({
    maxSize,
    windowMs: 25,
    fetchBatch: async (keys) => {
      calls.push(keys);
      if (keys.includes("boom")) throw new Error("provedor");
      return new Map(keys.filter((k) => k !== "missing").map((k) => [k, k.length]));
    },
    schedule: (fn, ms) => {
      const t = { fn, ms, live: true };
      timers.push(t);
      return () => void (t.live = false);
    },
  });
  const fire = () => timers.filter((t) => t.live).forEach((t) => ((t.live = false), t.fn()));
  return { batcher, calls, timers, fire };
}

describe("batcher", () => {
  test("padrão sem agrupamento: cada pedido sai na hora, uma chave por chamada", async () => {
    const { batcher, calls } = harness();
    expect(await batcher.get("aa")).toBe(2);
    expect(await batcher.get("bbb")).toBe(3);
    expect(calls).toEqual([["aa"], ["bbb"]]);
  });

  test("agrupa chaves da janela em uma chamada e entrega a cada pedido a sua resposta", async () => {
    const { batcher, calls, fire } = harness(10);
    const results = Promise.all([batcher.get("a"), batcher.get("bb"), batcher.get("ccc")]);
    expect(calls).toEqual([]);
    fire();
    expect(await results).toEqual([1, 2, 3]);
    expect(calls).toEqual([["a", "bb", "ccc"]]);
  });

  test("a mesma chave pedida duas vezes na janela vira uma só no lote", async () => {
    const { batcher, calls, fire } = harness(10);
    const results = Promise.all([batcher.get("aa"), batcher.get("aa"), batcher.get("b")]);
    fire();
    expect(await results).toEqual([2, 2, 1]);
    expect(calls).toEqual([["aa", "b"]]);
  });

  test("ao chegar em maxSize envia sem esperar a janela e cancela o temporizador", async () => {
    const { batcher, calls, timers } = harness(2);
    const results = Promise.all([batcher.get("a"), batcher.get("bb")]);
    expect(await results).toEqual([1, 2]);
    expect(calls).toEqual([["a", "bb"]]);
    expect(timers.filter((t) => t.live)).toHaveLength(0);
  });

  test("terceira chave abre um novo lote com uma nova janela", async () => {
    const { batcher, calls, fire } = harness(2);
    await Promise.all([batcher.get("a"), batcher.get("bb")]);
    const third = batcher.get("ccc");
    fire();
    expect(await third).toBe(3);
    expect(calls).toEqual([["a", "bb"], ["ccc"]]);
  });

  test("chave ausente na resposta vira undefined e erro do provedor rejeita todos do lote", async () => {
    const { batcher, fire } = harness(10);
    const missing = batcher.get("missing");
    const ok = batcher.get("x");
    fire();
    expect(await missing).toBeUndefined();
    expect(await ok).toBe(1);

    const failing = harness(10);
    // Os dois tratadores entram antes do disparo: ambos rejeitam no mesmo turno.
    const settled = Promise.allSettled([failing.batcher.get("boom"), failing.batcher.get("c")]);
    failing.fire();
    const outcomes = await settled;
    expect(outcomes.map((o) => o.status)).toEqual(["rejected", "rejected"]);
    expect(outcomes.every((o) => o.status === "rejected" && (o.reason as Error).message === "provedor")).toBe(true);
  });

  test("flush envia o pendente na hora e sem pendente não faz chamada", async () => {
    const { batcher, calls } = harness(10);
    await batcher.flush();
    expect(calls).toEqual([]);
    const pending = batcher.get("abc");
    await batcher.flush();
    expect(await pending).toBe(3);
    expect(calls).toEqual([["abc"]]);
  });
});
