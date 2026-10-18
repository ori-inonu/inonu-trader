import { describe, expect, test } from "bun:test";
import type { BriefItemRow, ScoreRow } from "./dataset.ts";
import { BRIEF_FEATURES, CLOSING_FEATURES, JEV_FEATURES, SCORE_FEATURES, featureNames, featureRow } from "./features.ts";
import { signedLog1p } from "./logistic.ts";

const base: BriefItemRow = {
  cycleId: "c",
  candidateId: "buy:token:501:A",
  tokenKey: "501:A",
  atMs: 0,
  item: { mo: { r5: -2, r15: 4, r1: 10, rg: 3, vr: 2 }, tm: { rsi: 61, rp: 70, r4: 5, r24: -3, up: 20, dd: 4, sg: 2 }, c: 12, b: 55, inf: -40, ut: 100, l: 500, v: 2000, h: 9000, i: 0.1, r: 2, t: 20, d: 0, u: 0, m: ["a", "b"], f: ["fluxo"], n: 60, w: 3, p: 10 },
  offered: [],
  requested: null,
  verdict: null,
  pBuy: 0.3,
  pSkip: 0.7,
  pBuyTenth: 0.2,
  verdictSum: 1,
  topMargin: 0.4,
  facets: { late_entry: 0.2, fading: 0.6 },
  codeClosed: false,
  context: { btc_1h: -0.5 },
};

describe("features do brief", () => {
  test("valores conhecidos, com log com sinal nas caudas pesadas", () => {
    const names = featureNames(BRIEF_FEATURES);
    const row = featureRow(BRIEF_FEATURES, base);
    const at = (name: string): number | null => row[names.indexOf(name)] as number | null;
    expect(at("mo_r5")).toBeCloseTo(signedLog1p(-2), 12);
    expect(at("mo_r5") as number).toBeLessThan(0);
    expect(at("tm_rsi")).toBe(61);
    expect(at("liquidity")).toBeCloseTo(Math.log1p(500), 12);
    expect(at("care_codes")).toBe(2);
    expect(at("btc_1h")).toBeCloseTo(signedLog1p(-0.5), 12);
    expect(new Set(names).size).toBe(names.length);
  });

  test("campo ausente vira null, nunca zero", () => {
    const empty: BriefItemRow = { ...base, item: {}, context: null };
    const row = featureRow(BRIEF_FEATURES, empty);
    expect(row.every((v) => v === null)).toBe(true);
  });

  test("saídas do Jev: pBuy e facetas, com null para faceta ausente", () => {
    const names = featureNames(JEV_FEATURES);
    const row = featureRow(JEV_FEATURES, base);
    expect(row[names.indexOf("jev_pbuy")]).toBe(0.3);
    expect(row[names.indexOf("jev_f_late_entry")]).toBe(0.2);
    expect(row[names.indexOf("jev_f_accumulating")]).toBeNull();
    expect(featureRow(JEV_FEATURES, { ...base, facets: null, pBuy: null }).every((v) => v === null)).toBe(true);
  });

  test("placar e fechamento", () => {
    const score: ScoreRow = { key: "k", cycleId: "c", candidateId: "buy:token:501:A", tokenKey: "501:A", atMs: 0, stance: "skip", inaction: true, codeClosed: false, facets: { fading: 0.5 }, families: ["fluxo", "tracao"], triggers: ["sinal_de_risco"], posture: "ofensiva", retBps: { "15m": null, "1h": null, "4h": null }, settledWithoutPrice: { "15m": false, "1h": false, "4h": false } };
    const names = featureNames(SCORE_FEATURES);
    const row = featureRow(SCORE_FEATURES, score);
    expect(row[names.indexOf("fam_fluxo")]).toBe(1);
    expect(row[names.indexOf("fam_liquidez")]).toBe(0);
    expect(row[names.indexOf("n_families")]).toBe(2);
    expect(row[names.indexOf("posture")]).toBe(1);
    expect(row[names.indexOf("trigger_risk")]).toBe(1);
    expect(row[names.indexOf("jev_f_fading")]).toBe(0.5);
    expect(featureNames(CLOSING_FEATURES)).toContain("first_p");
  });
});
