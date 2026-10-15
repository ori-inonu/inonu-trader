/**
 * Portfolio risk for the valued positions of a wallet evidence document (src/portfolio-evidence), using captured public
 * candles for the assets that have one. Offline: it reads one evidence JSON and data/quant/*-USDT-SWAP-15m.json and makes
 * no request. It does not read any wallet; the evidence document is the input, with its own origin and status carried
 * into the report.
 *
 *   bun --no-env-file run scripts/quant-evidence-risk.ts --evidence wallet-evidence.json [--dir data/quant] [--horizon-bars 96] [--json]
 *   bun --no-env-file run scripts/quant-evidence-risk.ts --demo-evidence                    the evidence layer's synthetic fixture
 *
 * A position is matched to a capture by symbol only when it is a chain's NATIVE asset, exactly one position carries
 * that symbol and a capture with that ticker exists. A contract token that merely shares a ticker (bridged, wrapped or
 * fake) is never matched on its own: state it with `--map <identityKey>=<TICKER>` (repeatable) to take responsibility for
 * the match. Everything else keeps its evidence identity, stays in the concentration and is named as left out of the risk.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runDemo } from "../src/portfolio-evidence/demo";
import { analyzeCapturedPortfolio, type CaptureInput } from "../src/portfolio-analytics/captured-report";
import { positionsFromEvidence, returnsKeysBySymbol, type EvidenceBalancesLike } from "../src/quant/evidence";
import type { PositionInput } from "../src/quant/portfolio";

const ROOT = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string, fallback: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] ?? fallback : fallback; };

const dir = resolve(ROOT, value("--dir", "data/quant"));
const asJson = flag("--json");
const horizonBars = Number(value("--horizon-bars", "96"));

interface EvidenceDoc { origin?: string; realData?: boolean; balances?: EvidenceBalancesLike | null }

let evidence: EvidenceDoc;
if (flag("--demo-evidence")) {
  const scenario = runDemo().find((s) => s.evidence.balances !== null && s.evidence.balances.positions.length > 0);
  if (!scenario) throw new Error("the evidence demo has no balances");
  evidence = scenario.evidence as unknown as EvidenceDoc;
} else {
  const file = value("--evidence", "");
  if (file === "") throw new Error("pass --evidence <file.json> or --demo-evidence");
  if (!existsSync(file)) throw new Error("evidence file not found");
  evidence = JSON.parse(readFileSync(resolve(file), "utf8")) as EvidenceDoc;
}
const balances = evidence.balances;
if (balances === null || balances === undefined || !Array.isArray(balances.positions)) throw new Error("evidence has no balances section");

const adapted = positionsFromEvidence(balances);
const available = new Set(
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => { const m = /^([A-Z0-9]{2,12})-USDT-SWAP-15m\.json$/.exec(name); return m ? [m[1]!] : []; })
    : [],
);
const explicit: Record<string, string> = {};
args.forEach((a, i) => {
  if (a !== "--map") return;
  const spec = args[i + 1] ?? "";
  const at = spec.lastIndexOf("=");
  if (at <= 0 || at === spec.length - 1) throw new Error("--map expects <identityKey>=<TICKER>");
  explicit[spec.slice(0, at)] = spec.slice(at + 1);
});
const mapped = returnsKeysBySymbol(adapted.symbols, available, { eligible: (key) => key.endsWith(":native"), explicit });
const positions: PositionInput[] = adapted.positions.map((p) => ({ key: mapped[p.key] ?? p.key, valueUsd: p.valueUsd }));

const captures: CaptureInput[] = [...new Set(Object.values(mapped).filter((k): k is string => k !== null))].map((key) => {
  try {
    return { key, value: JSON.parse(readFileSync(resolve(dir, `${key}-USDT-SWAP-15m.json`), "utf8")) as unknown };
  } catch {
    return { key, value: null, readError: true };
  }
});

const report = analyzeCapturedPortfolio({ positions, captures, horizonBars });
const origin = evidence.origin ?? "unknown";
const label = evidence.realData === true ? "evidencia real" : origin === "synthetic_fixture" ? "evidencia sintetica (nao e a carteira de ninguem)" : "evidencia sem dados reais declarados";

if (asJson) {
  console.log(JSON.stringify({ label, origin, explicitMappings: explicit, realData: evidence.realData === true, evidenceStatus: adapted.evidenceStatus, unvalued: adapted.unvalued, positions, ...report }, null, 2));
  process.exit(0);
}

const pct = (x: number | null, d = 2) => (x === null ? "n/d" : `${(x * 100).toFixed(d)}%`);
const c = report.analysis.concentration;
console.log(`${label}; origem ${origin}; estado da evidencia ${adapted.evidenceStatus ?? "n/d"}`);
if (adapted.unvalued.length) console.log(`sem valor em USD (fora do calculo): ${adapted.unvalued.map((u) => `${u.key}:${u.reason}`).join(", ")}`);
console.log(`valor conhecido: ${c.totalValueUsd === null ? "n/d" : `US$ ${c.totalValueUsd.toFixed(2)}`}; N efetivo ${c.effectiveN?.toFixed(2) ?? "n/d"}; maior fatia ${pct(c.topShare, 1)}`);
for (const r of report.captures) console.log(`captura ${r.key}: ${r.status}${r.reason ? ` (${r.reason})` : ""}`);
const risk = report.analysis.risk;
if (risk.status !== "ok") console.log(`risco indisponivel: ${risk.reason}`);
else {
  console.log(`risco cobre ${pct(risk.riskedShare, 1)} do valor; volatilidade diaria ${pct(risk.sigmaDaily)}; ES99 historico ${pct(risk.historical.es99)} contra normal ${pct(risk.normal.es99)}; queda maxima ${pct(risk.maxDrawdown)}`);
  if (risk.excluded.length) console.log(`fora do risco: ${risk.excluded.map((e) => `${e.key}:${e.reason}`).join(", ")}`);
}
