// Orçamento de API da OKX: tetos teóricos por minuto, hora e dia, franquia mensal, consumo e projeção, por pool.
// Run: bun --no-env-file scripts/api-budget-report.ts [--ledger <ledger.json>] [--usage <usage-YYYY-MM.json>] [--plan free] [--json]
// Somente leitura: não chama a API, não usa credencial e não escreve no ledger.
// --usage: contador por faixa e por dia do gateway (padrão: %LOCALAPPDATA%/InonuTrader/data/onchain/usage-<mês>.json, se existir).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultLedgerPath, readLedger } from "../src/api-budget/ledger";
import { OKX_MARKET_PLANS, okxEntries } from "../src/api-budget/okx";
import { projectMonth, type Projection } from "../src/api-budget/projection";
import { createBudgetRegistry } from "../src/api-budget/registry";
import { budgetReport, type BudgetReport } from "../src/api-budget/report";
import { DEFAULT_MIN_INTERVAL_MS } from "../src/onchain-read/client";

export interface Options {
  readonly ledgerPath: string;
  readonly usagePath?: string;
  readonly plan: string;
  readonly now: number;
}

export interface FullReport {
  readonly budget: BudgetReport;
  /** Política local do cliente: espaçamento mínimo entre requisições assinadas. Não é limite do provedor. */
  readonly clientPacing: { readonly minIntervalMs: number; readonly perMinute: number; readonly perHour: number; readonly perDay: number; readonly note: string };
  /** Projeção por faixa a partir do contador diário do gateway, quando há arquivo. */
  readonly projection: { readonly basic?: Projection; readonly premium?: Projection; readonly source: string | null };
}

interface UsageFile {
  readonly days?: Record<string, { basic?: number; premium?: number }>;
}

export function buildReport(options: Options): FullReport {
  const registry = createBudgetRegistry(okxEntries({ plan: options.plan }));
  const budget = budgetReport(registry, readLedger(options.ledgerPath), options.now);
  const perMinute = Math.floor(60_000 / DEFAULT_MIN_INTERVAL_MS);
  const clientPacing = {
    minIntervalMs: DEFAULT_MIN_INTERVAL_MS,
    perMinute,
    perHour: perMinute * 60,
    perDay: perMinute * 60 * 24,
    note: "política local de ritmo (fila única do cliente); o provedor não publica RPS para Market",
  };

  let projection: FullReport["projection"] = { source: null };
  if (options.usagePath !== undefined && existsSync(options.usagePath)) {
    const file = JSON.parse(readFileSync(options.usagePath, "utf8")) as UsageFile;
    const plan = OKX_MARKET_PLANS[options.plan]!;
    const series = (tier: "basic" | "premium") => Object.fromEntries(Object.entries(file.days ?? {}).map(([day, use]) => [day, use[tier] ?? 0]));
    projection = {
      source: options.usagePath.split(/[\\/]/).pop() ?? null,
      ...(plan.basic === null ? {} : { basic: projectMonth(series("basic"), options.now, plan.basic) }),
      ...(plan.premium === null ? {} : { premium: projectMonth(series("premium"), options.now, plan.premium) }),
    };
  }
  return { budget, clientPacing, projection };
}

const fmt = (n: number | null): string => (n === null ? "n/p" : n.toLocaleString("pt-BR"));

export function format(report: FullReport): string {
  const lines: string[] = [`Orçamento de API (${report.budget.generatedAt}). n/p: o provedor não publica o limite.`, ""];
  for (const p of report.budget.pools) {
    lines.push(
      `${p.pool} (${p.endpoints} endpoints, chave ${p.key}, ${p.validated ? "validado na documentação" : `${p.unvalidated} de ${p.endpoints} fora da documentação`})`,
      `  teto teórico: ${fmt(p.ceilings.minute)}/min  ${fmt(p.ceilings.hour)}/h  ${fmt(p.ceilings.day)}/dia`,
      `  franquia mensal: ${p.monthly.franquia === null ? "sem franquia" : `${fmt(p.monthly.used)} de ${fmt(p.monthly.franquia)} (${p.monthly.usedPct}%), restam ${fmt(p.monthly.remaining)}`}`,
      `  estado: ${p.status}${p.expiresAt === null ? "" : `, expira ${new Date(p.expiresAt).toISOString()}`}`,
    );
    for (const e of p.topEndpoints) lines.push(`  mais usado: ${e.endpoint.replace("/api/v6/dex/", "")} hoje ${fmt(e.today)}, mês ${fmt(e.month)}`);
  }
  lines.push("", `ritmo do cliente: ${report.clientPacing.minIntervalMs} ms entre requisições = ${report.clientPacing.perMinute}/min, ${fmt(report.clientPacing.perHour)}/h, ${fmt(report.clientPacing.perDay)}/dia (${report.clientPacing.note})`);
  if (report.projection.source !== null) {
    lines.push("", `projeção do mês pelo contador do gateway (${report.projection.source}):`);
    for (const tier of ["basic", "premium"] as const) {
      const p = report.projection[tier];
      if (p === undefined) continue;
      lines.push(
        `  ${tier}: usado ${fmt(p.used)} de ${fmt(p.franquia)}, ritmo ${fmt(p.ratePerDay)}/dia, fim do mês ${fmt(p.projectedMonth)}, ` +
          `${p.overQuota ? `ESTOURA no dia ${p.exhaustionDay}` : "cabe"}, cabem ${fmt(p.sustainablePerDay)}/dia até o fim`,
      );
    }
  }
  return lines.join("\n");
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function defaultUsagePath(now: number): string | undefined {
  const base = process.env.LOCALAPPDATA;
  if (base === undefined) return undefined;
  const path = join(base, "InonuTrader", "data", "onchain", `usage-${new Date(now).toISOString().slice(0, 7)}.json`);
  return existsSync(path) ? path : undefined;
}

if (import.meta.main) {
  const now = Date.now();
  const usagePath = arg("--usage") ?? defaultUsagePath(now);
  const report = buildReport({ ledgerPath: arg("--ledger") ?? defaultLedgerPath(), ...(usagePath === undefined ? {} : { usagePath }), plan: arg("--plan") ?? "free", now });
  console.log(process.argv.includes("--json") ? JSON.stringify(report, null, 2) : format(report));
}
