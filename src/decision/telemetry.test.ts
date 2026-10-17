import { describe, expect, test } from "bun:test";
import { LATENCY_STAGES, createLatencyRecorder } from "./telemetry";

describe("telemetria de latência", () => {
  test("etapas sem amostra aparecem como não medidas, nunca como zero", () => {
    const rec = createLatencyRecorder();
    rec.record("decisao_local", 0.01);
    rec.record("decisao_local", 0.02);
    const { measured, notMeasured } = rec.summary();
    expect(Object.keys(measured)).toEqual(["decisao_local"]);
    expect(measured.decisao_local).toMatchObject({ n: 2, max: 0.02 });
    expect(notMeasured).toEqual(LATENCY_STAGES.filter((s) => s !== "decisao_local"));
  });

  test("amostras negativas ou não finitas são descartadas", () => {
    const rec = createLatencyRecorder();
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) rec.record("cotacao", bad);
    expect(rec.summary().notMeasured).toContain("cotacao");
  });

  test("guarda só as últimas amostras da capacidade", () => {
    const rec = createLatencyRecorder(3);
    for (const v of [1, 2, 3, 4, 5]) rec.record("dados", v);
    expect(rec.summary().measured.dados).toMatchObject({ n: 3, min: 3, max: 5 });
  });

  test("etapas são independentes", () => {
    const rec = createLatencyRecorder();
    rec.record("cotacao", 1000);
    rec.record("decisao_local", 0.005);
    const { measured } = rec.summary();
    expect(measured.cotacao?.p50).toBe(1000);
    expect(measured.decisao_local?.p50).toBe(0.005);
  });
});
