import { expect, test } from "bun:test";
import { syntheticMobileInput, SYNTHETIC_NOW_MS } from "./fixtures";
import { exportMobileDecisionHtml, exportMobileDecisionJson } from "./export";
import { projectMobileDecisionReport } from "./report";

const options = { now_ms: SYNTHETIC_NOW_MS };

test("a standalone export separates facts, unknown context/costs, source clocks and the human draft", () => {
  const input = syntheticMobileInput();
  const html = exportMobileDecisionHtml(input, options);
  expect(JSON.parse(exportMobileDecisionJson(input, options))).toEqual(projectMobileDecisionReport(input, options));
  for (const text of ["Dados sintéticos", "Fatos observados", "Avaliação contextual JEV", "Não avaliada", "source_time", "fetched_at", "Custos", "Desconhecido", "Fontes", "Decisão humana", "não é salvo", "1000000", "995000", "-5000", "Reavalie"]) expect(html).toContain(text);
  expect(html).toContain('name="human-decision"');
  expect(html).toContain('for="human-notes"');
  expect(html).toContain('lang="pt-BR"');
  expect(html).toContain('name="viewport"');
  expect(html).toContain("overflow-wrap:anywhere");
  expect(html).toContain(":focus-visible");
  expect(html).toContain("Content-Security-Policy");
  expect(html).toContain("connect-src 'none'");
  expect(html).not.toMatch(/<script\b|<iframe\b|<form\b|<img\b|<link\b|<svg\b|\son\w+=/i);
  expect(html).not.toMatch(/(?:src|href)=["'](?:https?:|\/\/|javascript:)/i);
  expect(html).not.toMatch(/[\u00b7\u2013\u2014]/);
});

test("untrusted allowed text is escaped, extra sensitive fields disappear and projected JSON is not trusted", () => {
  const input = syntheticMobileInput("fresh");
  const dex = input.dex_report as Record<string, unknown>;
  (dex.tokenA as Record<string, unknown>).metadataSource = '<img src="https://example.invalid/pixel" onerror="x()"> & <script>bad</script>';
  dex.apiSecret = "synthetic-extra-never-export";
  const html = exportMobileDecisionHtml(input, options);
  expect(html).toContain("&lt;img src=&quot;");
  expect(html).toContain("&lt;script&gt;bad&lt;/script&gt;");
  expect(html).not.toContain('<img src="https://');
  expect(html).not.toContain("synthetic-extra-never-export");
  expect(exportMobileDecisionJson(input, options)).not.toContain("apiSecret");
  const projected = projectMobileDecisionReport(input, options);
  expect(() => exportMobileDecisionHtml(projected, options)).toThrow("Invalid mobile decision report.");
});

test("synthetic cases cover temporal alerts and reject malformed inputs through both exporters", () => {
  for (const [caseName, code] of [["missing", "source_time_missing"], ["stale", "source_stale"], ["future", "source_future"], ["contradiction", "source_after_fetch"]] as const) {
    const html = exportMobileDecisionHtml(syntheticMobileInput(caseName), options);
    expect(html).toContain(code);
    expect(html).toContain("Dados sintéticos");
  }
  for (const exportReport of [exportMobileDecisionHtml, exportMobileDecisionJson]) expect(() => exportReport(syntheticMobileInput("invalid"), options)).toThrow("Invalid mobile decision report.");
  expect(exportMobileDecisionHtml(syntheticMobileInput("known_costs"), options)).toContain("0.000000000000000000000001");
});

test("imported punctuation follows display rules while JSON preserves the original facts", () => {
  const input = syntheticMobileInput();
  const dex = input.dex_report as Record<string, unknown>;
  const source = "Fonte\u00b7secundaria\u2013curta\u2014longa";
  (dex.tokenA as Record<string, unknown>).metadataSource = source;
  const html = exportMobileDecisionHtml(input, options);
  expect(html).not.toMatch(/[\u00b7\u2013\u2014]/);
  expect(html).toContain("Fonte/secundaria-curta-longa");
  const json = JSON.parse(exportMobileDecisionJson(input, options));
  expect(json.observed.dex.tokenA.metadataSource).toBe(source);
  expect(json.observed.dex.reasons).toEqual(dex.reasons);
});
