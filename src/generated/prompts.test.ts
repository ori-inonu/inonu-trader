import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROMPTS } from "./prompts";

/**
 * O texto dos prompts do Jev esta fixado por hash. Os hashes abaixo foram calculados sobre o texto extraido dos literais que estavam inline nas fontes
 * da main antes da extracao do commit 0147547; mudar uma letra de um prompt muda o comportamento do Jev e exige decisao explicita (Jev), entao este teste
 * so passa com o texto original. Quando o gerador do dono existir e produzir este arquivo de novo, os hashes so mudam por decisao registrada.
 */
const PINS: Readonly<Record<string, string>> = {
  "p-system-one": "26c0a28f7ab46a03c7d5139dec528d63162c274b6a739e17dd350a03738027ef",
  "p-operator": "5da2f37bc33d8c1ee6161661a17a193a493c02b5e1ef365edea0d44d534f3321",
  "p-real-allocation": "cbbe9aaa36d546481c1c5940d03a47f8dd20b52fedabe16a7dec878f85068f97",
  "p-jev-read": "e0fe1647e8bf0d31de825ef53d99800f3920a5a44c9461ec22d18ff8d56b60ba",
  "p-lab-chooser": "a70c52493604beeb45493f871cdd98f3d08e7590eca48e539b459406145f1f6c",
  "p-inonu": "79e850bc71daa5894f291399f75316913e8beb55627508605d9dd9c65c2971d2",
};

const sha = (value: unknown): string => new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex");

describe("prompts do Jev", () => {
  test("cada grupo de prompt tem o texto original, fixado por hash", () => {
    expect(Object.keys(PROMPTS).sort()).toEqual(Object.keys(PINS).sort());
    for (const [id, pin] of Object.entries(PINS)) expect({ id, hash: sha((PROMPTS as Record<string, unknown>)[id]) }).toEqual({ id, hash: pin });
  });

  test("o modulo e feito so de constantes: nenhum import", () => {
    const source = readFileSync(join(import.meta.dir, "prompts.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });

  test("os marcadores {nome} que o codigo preenche existem nos textos que os usam", () => {
    const needs: Array<[string, string[]]> = [
      [PROMPTS["p-system-one"].candidate, ["{side}", "{leverage}", "{marginUsd}", "{notionalUsd}"]],
      [PROMPTS["p-operator"].criteria.candidateFormat, ["{kindText}", "{from}", "{to}", "{chain}"]],
      [PROMPTS["p-jev-read"].direction.instructions.question, ["{horizonMinutes}", "{instId}"]],
      [PROMPTS["p-lab-chooser"].goal, ["{shadowNotice}"]],
      [PROMPTS["p-lab-chooser"].candidateCriterion, ["{candidateId}", "{side}", "{modality}", "{horizonHours}"]],
      [PROMPTS["p-inonu"].decision.criteria.buy, ["{kind}", "{id}"]],
      [PROMPTS["p-inonu"].decision.criteria.sell, ["{kind}", "{id}"]],
      [PROMPTS["p-inonu"].portfolio.question, ["{id}"]],
      [PROMPTS["p-inonu"].ecosystem.stanceQuestion, ["{symbol}", "{id}"]],
      [PROMPTS["p-inonu"].ecosystem.familyQuestion, ["{symbol}", "{id}"]],
      [PROMPTS["p-inonu"].priority.candidate, ["{id}"]],
    ];
    for (const [text, markers] of needs) for (const marker of markers) expect({ marker, found: text.includes(marker) }).toEqual({ marker, found: true });
  });

  test("onde o codigo troca so a primeira ocorrencia (replace de texto), cada marcador aparece uma unica vez", () => {
    const once: Array<[string, string[]]> = [
      [PROMPTS["p-system-one"].candidate, ["{side}", "{leverage}", "{marginUsd}", "{notionalUsd}"]],
      [PROMPTS["p-operator"].criteria.candidateFormat, ["{kindText}", "{from}", "{to}", "{chain}"]],
      [PROMPTS["p-inonu"].decision.criteria.buy, ["{kind}", "{id}"]],
      [PROMPTS["p-inonu"].decision.criteria.sell, ["{kind}", "{id}"]],
      [PROMPTS["p-inonu"].portfolio.question, ["{id}"]],
      [PROMPTS["p-inonu"].ecosystem.stanceQuestion, ["{symbol}", "{id}"]],
      [PROMPTS["p-inonu"].ecosystem.familyQuestion, ["{symbol}", "{id}"]],
      [PROMPTS["p-inonu"].priority.candidate, ["{id}"]],
      [PROMPTS["p-lab-chooser"].goal, ["{shadowNotice}"]],
    ];
    for (const [text, markers] of once) for (const marker of markers) expect({ marker, times: text.split(marker).length - 1 }).toEqual({ marker, times: 1 });
  });

  test("nenhum texto traz ponto medio, travessao ou meia-risca", () => {
    const leaves: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === "string") leaves.push(value);
      else if (value !== null && typeof value === "object") Object.values(value).forEach(walk);
    };
    walk(PROMPTS);
    expect(leaves.length).toBeGreaterThan(60);
    expect(leaves.filter((text) => /[·—–]/.test(text))).toEqual([]);
  });
});
