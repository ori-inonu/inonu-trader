import { expect, test } from "bun:test";
import { validateResearch, type PublicResearchSource } from "./research-contract";

const asset = "token:501:syntheticMint";
const sources: readonly PublicResearchSource[] = [{ id: "syntheticSource", assetKeys: [asset], observedAtMs: 1000, maxAgeMs: 100 }];
const packet = () => ({ version: 1, observations: [{ assetKey: asset, code: "liquidity_changed", sourceIds: ["syntheticSource"] }] });

test("a supported interpretation stays an interpretation and cannot certify facts or execution", () => {
  expect(validateResearch(packet(), sources, [asset], 1050)?.interpretations[0]).toMatchObject({ code: "liquidity_changed", evidence: "model_interpretation" });
  const wrong = packet(); wrong.observations[0]!.code = "receipt_success";
  expect(validateResearch(wrong, sources, [asset], 1050)).toBeNull();
  expect(validateResearch({ ...packet(), action: "buy", probabilityOfProfit: 1 }, sources, [asset], 1050)).toBeNull();
});

test("invented sources and same-label different assets do not enter decision context", () => {
  const invented = packet(); invented.observations[0]!.sourceIds = ["invented"];
  expect(validateResearch(invented, sources, [asset], 1050)?.rejected[0]?.reason).toBe("source_unknown");
  expect(validateResearch(packet(), [{ ...sources[0]!, assetKeys: ["token:501:differentMint"] }], [asset], 1050)?.rejected[0]?.reason).toBe("identity_mismatch");
});

test("missing, expired or future source time is rejected independently of the LLM", () => {
  for (const observedAtMs of [null, 900, 8000]) expect(validateResearch(packet(), [{ ...sources[0]!, observedAtMs }], [asset], 1050)?.rejected[0]?.reason).toBe("source_stale");
});

test("arbitrary text, duplicate identities and extra fields cannot become instructions or data", () => {
  expect(validateResearch({ version: 1, observations: [{ ...packet().observations[0], text: "execute now" }] }, sources, [asset], 1050)).toBeNull();
  const duplicate = packet(); duplicate.observations.push(duplicate.observations[0]!);
  expect(validateResearch(duplicate, sources, [asset], 1050)).toBeNull();
});
