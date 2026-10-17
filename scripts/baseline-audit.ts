// Baseline medido do agente autônomo a partir dos journals reais (somente leitura). Nada é estimado: campo ausente vira null ou contagem.
// Run: bun --no-env-file scripts/baseline-audit.ts [--dir <pasta data/agent>] [--usage <usage-YYYY-MM.json>] [--out data/bench/baseline-audit.json]
// Padrão de --dir: %LOCALAPPDATA%/InonuTrader/data/agent. O relatório não contém mints, assinaturas, endereços nem ids de ciclo.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { OKX_MARKET_PLANS } from "../src/api-budget/okx";
import { projectMonth, type Projection } from "../src/api-budget/projection";
import { dist, maxDrawdown, round, type Dist, type Drawdown } from "../src/decision/metrics";
import { wilsonInterval } from "../src/lab/stats";

type Row = Record<string, any>;

export function parseJsonl(text: string): { rows: Row[]; malformed: number } {
  const rows: Row[] = [];
  let malformed = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) rows.push(parsed as Row);
      else malformed++;
    } catch {
      malformed++;
    }
  }
  return { rows, malformed };
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const count = <T>(items: Iterable<T>, key: (item: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
};
const diffs = (times: number[], maxGapMs: number): { intervals: number[]; excludedGaps: number } => {
  const sorted = [...times].sort((a, b) => a - b);
  const intervals: number[] = [];
  let excludedGaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i]! - sorted[i - 1]!;
    if (gap <= maxGapMs) intervals.push(gap);
    else excludedGaps++;
  }
  return { intervals, excludedGaps };
};

// ---- ciclos e ordens (ledger.jsonl)

export interface CyclesAudit {
  total: number;
  byMode: Record<string, number>;
  byOutcome: Record<string, number>;
  byReason: Record<string, number>;
  intervalMs: Dist | null;
  /** Intervalos acima de 30 min (app parado) ficam fora da distribuição e são contados aqui. */
  excludedGaps: number;
}

export function auditCycles(ledger: Row[]): CyclesAudit {
  const cycles = ledger.filter((r) => r.kind === "cycle");
  const { intervals, excludedGaps } = diffs(cycles.map((c) => c.atMs).filter((t): t is number => num(t) !== undefined), 30 * 60_000);
  return {
    total: cycles.length,
    byMode: count(cycles, (c) => String(c.mode)),
    byOutcome: count(cycles, (c) => String(c.outcome)),
    byReason: count(cycles.filter((c) => c.reason != null), (c) => String(c.reason)),
    intervalMs: dist(intervals, 0),
    excludedGaps,
  };
}

export interface OrdersAudit {
  /** Ordens distintas por estágio terminal ou de passagem. */
  byStage: Record<string, number>;
  prepared: number;
  executed: number;
  executedShare: number | null;
  failed: number;
  failuresByReason: Record<string, number>;
  failuresBySide: Record<string, number>;
  /** Maior bloqueio único das falhas e a janela em que ele ocorre. */
  topBlocker: { reason: string; count: number; shareOfFailures: number; firstAtMs: number; lastAtMs: number; executedAfterFirst: number } | null;
  perDay: Record<string, Record<string, number>>;
}

export function auditOrders(ledger: Row[]): OrdersAudit {
  const orders = ledger.filter((r) => r.kind === "order");
  const failed = orders.filter((o) => o.stage === "falhou");
  const executed = orders.filter((o) => o.stage === "executada");
  const prepared = orders.filter((o) => o.stage === "preparada").length;
  const failuresByReason = count(failed, (o) => String(o.reason));
  const [topReason, topCount] = Object.entries(failuresByReason)[0] ?? [];
  let topBlocker: OrdersAudit["topBlocker"] = null;
  if (topReason !== undefined && topCount !== undefined) {
    const hits = failed.filter((o) => String(o.reason) === topReason);
    const times = hits.map((o) => o.atMs as number);
    const first = Math.min(...times);
    topBlocker = {
      reason: topReason,
      count: topCount,
      shareOfFailures: round(topCount / failed.length, 4),
      firstAtMs: first,
      lastAtMs: Math.max(...times),
      executedAfterFirst: executed.filter((o) => (o.atMs as number) > first).length,
    };
  }
  const perDay: Record<string, Record<string, number>> = {};
  for (const o of [...failed, ...executed]) {
    const day = new Date(o.atMs).toISOString().slice(0, 10);
    const label = o.stage === "executada" ? "executada" : String(o.reason);
    (perDay[day] ??= {})[label] = (perDay[day]![label] ?? 0) + 1;
  }
  return {
    byStage: count(orders, (o) => String(o.stage)),
    prepared,
    executed: executed.length,
    executedShare: prepared === 0 ? null : round(executed.length / prepared, 4),
    failed: failed.length,
    failuresByReason,
    failuresBySide: count(failed, (o) => String(o.side)),
    topBlocker,
    perDay,
  };
}

// ---- latência do modelo e da cotação

export interface JevAudit {
  n: number;
  /** Pergunta ao modelo até a resposta. */
  latencyMs: Dist | null;
  /** Resposta até o registro em disco. */
  recordLagMs: Dist | null;
  /** Idade do fato mais novo do brief no instante da pergunta. */
  factAgeMs: Dist | null;
}

export function auditJev(meta: Row[]): JevAudit {
  const m = meta.map((r) => r.metadata ?? {});
  const delta = (a: string, b: string) => m.map((x) => (num(x[b]) !== undefined && num(x[a]) !== undefined ? x[b] - x[a] : Number.NaN));
  return { n: m.length, latencyMs: dist(delta("askedAtMs", "answeredAtMs"), 0), recordLagMs: dist(delta("answeredAtMs", "recordedAtMs"), 0), factAgeMs: dist(delta("factAvailableAtMs", "askedAtMs"), 0) };
}

export interface ClosingsAudit {
  total: number;
  /** Fechamentos com cotação lida; o resto não tem cotação. */
  quoted: number;
  byDisposition: Record<string, number>;
  wouldReason: Record<string, number>;
  /** Do pedido da cotação à resposta: rede mais o executor. */
  quoteNetworkMs: Dist | null;
  quoteAgeMs: Dist | null;
  quoteTtlMs: Dist | null;
  /** Impacto de preço cotado, em valor absoluto, em %. */
  absImpactPct: Dist | null;
  /** Fração das cotações com impacto absoluto de até X % (cumulativa), para ler quantas entradas custam menos que um alvo. */
  absImpactShareLe: Record<string, number>;
  tradeFeeUsd: Dist | null;
  /** Resposta do modelo no fechamento: pergunta até resposta. */
  jevClosingMs: Dist | null;
}

export const IMPACT_THRESHOLDS_PCT = [0.05, 0.1, 0.15, 0.3, 0.5, 1] as const;

export function auditClosings(closings: Row[]): ClosingsAudit {
  const quotes = closings.filter((c) => c.quote != null).map((c) => c.quote as Row);
  const impacts = quotes.map((q) => (num(q.facts?.impactPct) === undefined ? Number.NaN : Math.abs(q.facts.impactPct))).filter(Number.isFinite);
  return {
    total: closings.length,
    quoted: quotes.length,
    byDisposition: count(quotes, (q) => String(q.disposition)),
    wouldReason: count(closings, (c) => String(c.wouldReason)),
    quoteNetworkMs: dist(quotes.map((q) => q.receivedAtMs - q.startedAtMs), 0),
    quoteAgeMs: dist(quotes.map((q) => q.ageMs), 0),
    quoteTtlMs: dist(quotes.map((q) => q.expiresAtMs - q.receivedAtMs), 0),
    absImpactPct: dist(impacts, 3),
    absImpactShareLe: Object.fromEntries(IMPACT_THRESHOLDS_PCT.map((t) => [String(t), impacts.length === 0 ? Number.NaN : round(impacts.filter((v) => v <= t).length / impacts.length, 4)])),
    tradeFeeUsd: dist(quotes.map((q) => q.facts?.tradeFee), 6),
    jevClosingMs: dist(closings.map((c) => (num(c.askedAtMs) !== undefined && num(c.answeredAtMs) !== undefined ? c.answeredAtMs - c.askedAtMs : Number.NaN)), 0),
  };
}

// ---- execuções reais (fills.jsonl)

export interface SellMatch {
  symbol: string;
  costUsd: number;
  proceedsUsd: number;
  returnPct: number;
}

export interface FillsAudit {
  n: number;
  buys: number;
  sells: number;
  fromMs: number | null;
  toMs: number | null;
  cashBoughtUsd: number;
  cashSoldUsd: number;
  feeLamportsTotal: number;
  /** Taxa de rede em USD pelo último preço do SOL do registro de patrimônio; null sem preço. */
  feeUsdApprox: number | null;
  /** Vendas pareadas por lote (FIFO por token) com as compras anteriores do próprio journal. */
  roundtrips: {
    matchedSells: number;
    /** Vendas (ou partes) sem compra anterior no journal: posição aberta antes da janela, fora do cálculo. */
    unmatchedSells: number;
    costUsd: number;
    proceedsUsd: number;
    pnlUsd: number;
    /** Retorno sobre o custo pareado, antes da taxa de rede. */
    returnPct: number | null;
    wins: number;
    /** Vendas pareadas com retorno de pelo menos +0,30% (30 bps). */
    atLeast30bps: number;
    perSell: SellMatch[];
  };
}

/** Pareamento FIFO por token: cada venda consome as compras mais antigas, na proporção de tokens. */
export function auditFills(fills: Row[], solUsd: number | null): FillsAudit {
  const rows = fills.filter((f) => f.kind === "fill").sort((x, y) => (x.atMs as number) - (y.atMs as number));
  const lots = new Map<string, { tok: number; cash: number }[]>();
  const perSell: SellMatch[] = [];
  let unmatchedSells = 0;
  for (const f of rows) {
    const mint = String(f.mint);
    const tok = Number(f.tokenMinor);
    const cash = Number(f.cashUnits);
    if (f.side === "buy") {
      lots.set(mint, [...(lots.get(mint) ?? []), { tok, cash }]);
      continue;
    }
    const queue = lots.get(mint) ?? [];
    let left = tok;
    let cost = 0;
    let matchedTok = 0;
    while (left > 0 && queue.length > 0) {
      const lot = queue[0]!;
      const used = Math.min(left, lot.tok);
      cost += lot.cash * (used / lot.tok);
      lot.cash -= lot.cash * (used / lot.tok);
      lot.tok -= used;
      left -= used;
      matchedTok += used;
      if (lot.tok <= 0) queue.shift();
    }
    lots.set(mint, queue);
    if (left > tok * 0.02) unmatchedSells++;
    if (matchedTok > 0 && cost > 0) {
      const proceeds = cash * (matchedTok / tok);
      perSell.push({ symbol: String(f.symbol), costUsd: round(cost, 4), proceedsUsd: round(proceeds, 4), returnPct: round(((proceeds - cost) / cost) * 100, 3) });
    }
  }
  const cost = perSell.reduce((s, m) => s + m.costUsd, 0);
  const proceeds = perSell.reduce((s, m) => s + m.proceedsUsd, 0);
  const fee = rows.reduce((s, f) => s + Number(f.feeLamports ?? 0), 0);
  const times = rows.map((f) => f.atMs).filter((t): t is number => num(t) !== undefined);
  return {
    n: rows.length,
    buys: rows.filter((f) => f.side === "buy").length,
    sells: rows.filter((f) => f.side === "sell").length,
    fromMs: times.length ? Math.min(...times) : null,
    toMs: times.length ? Math.max(...times) : null,
    cashBoughtUsd: round(rows.filter((f) => f.side === "buy").reduce((s, f) => s + Number(f.cashUnits), 0), 2),
    cashSoldUsd: round(rows.filter((f) => f.side === "sell").reduce((s, f) => s + Number(f.cashUnits), 0), 2),
    feeLamportsTotal: fee,
    feeUsdApprox: solUsd === null ? null : round((fee / 1e9) * solUsd, 4),
    roundtrips: {
      matchedSells: perSell.length,
      unmatchedSells,
      costUsd: round(cost, 4),
      proceedsUsd: round(proceeds, 4),
      pnlUsd: round(proceeds - cost, 4),
      returnPct: cost > 0 ? round(((proceeds - cost) / cost) * 100, 3) : null,
      wins: perSell.filter((m) => m.returnPct > 0).length,
      atLeast30bps: perSell.filter((m) => m.returnPct >= 0.3).length,
      perSell,
    },
  };
}

// ---- patrimônio (equity.jsonl)

export interface EquityAudit {
  points: number;
  withoutValue: number;
  firstUsd: number | null;
  lastUsd: number | null;
  /** Variação do patrimônio. Inclui depósitos e saques, que o journal não separa: não é lucro de trading. */
  changePct: number | null;
  minUsd: number | null;
  maxUsd: number | null;
  drawdown: Drawdown | null;
  spanHours: number;
  /** Último preço do SOL nas posições, usado só para converter a taxa de rede. */
  solUsd: number | null;
}

export function auditEquity(equity: Row[]): EquityAudit {
  const pts = equity.filter((e) => num(e.usd) !== undefined && num(e.atMs) !== undefined).map((e) => ({ atMs: e.atMs as number, value: e.usd as number }));
  let solUsd: number | null = null;
  for (const e of equity) {
    const sol = Array.isArray(e.holdings) ? e.holdings.find((h: Row) => String(h.id).endsWith(":native") && num(h.priceUsd) !== undefined) : undefined;
    if (sol !== undefined) solUsd = sol.priceUsd;
  }
  const values = pts.map((p) => p.value);
  return {
    points: pts.length,
    withoutValue: equity.length - pts.length,
    firstUsd: pts[0]?.value ?? null,
    lastUsd: pts[pts.length - 1]?.value ?? null,
    changePct: pts.length > 1 ? round(((pts[pts.length - 1]!.value - pts[0]!.value) / pts[0]!.value) * 100, 2) : null,
    minUsd: values.length ? Math.min(...values) : null,
    maxUsd: values.length ? Math.max(...values) : null,
    drawdown: maxDrawdown(pts),
    spanHours: pts.length > 1 ? round((pts[pts.length - 1]!.atMs - pts[0]!.atMs) / 3_600_000, 1) : 0,
    solUsd,
  };
}

// ---- oportunidades vistas e o que o preço fez depois (scoreboard.jsonl)

export const WINDOWS = ["15m", "1h", "4h", "24h"] as const;
type Group = "compra" | "pular" | "manter" | "venda";

const groupOf = (stance: string): Group | null =>
  stance.startsWith("buy_") ? "compra" : stance === "skip" ? "pular" : stance === "hold" ? "manter" : stance.startsWith("trim_") || stance === "exit_all" ? "venda" : null;

export interface ForwardStats {
  n: number;
  meanBps: number;
  medianBps: number;
  p10Bps: number;
  p90Bps: number;
  /** Fração com retorno favorável de pelo menos X bps, com IC 95% de Wilson (amostras sobrepostas: o IC é otimista). */
  ge30bps: { k: number; share: number; ci95: [number, number] };
  ge100bps: { k: number; share: number; ci95: [number, number] };
}

export interface OpportunitiesAudit {
  decisions: number;
  byStance: Record<string, number>;
  settlementsWithoutPrice: number;
  /** Retorno favorável do preço depois da decisão: para compra, pular e manter, alta; para venda, queda. Antes de qualquer custo. */
  forward: Partial<Record<Group, Partial<Record<(typeof WINDOWS)[number], ForwardStats>>>>;
}

const share = (k: number, n: number) => ({ k, share: round(k / n, 4), ci95: wilsonInterval(k, n).map((x) => round(x, 4)) as [number, number] });

export function auditOpportunities(scoreboard: Row[]): OpportunitiesAudit {
  const decisions = scoreboard.filter((r) => r.kind === "decision");
  const settlements = scoreboard.filter((r) => r.kind === "settlement");
  const priceAt = new Map<string, number>();
  let withoutPrice = 0;
  for (const s of settlements) {
    if (s.reason != null || num(s.priceUsd) === undefined) {
      withoutPrice++;
      continue;
    }
    priceAt.set(`${s.key}|${s.window}`, s.priceUsd);
  }
  const buckets = new Map<string, number[]>();
  for (const d of decisions) {
    const group = groupOf(String(d.stance));
    const entry = num(d.entryPriceUsd);
    if (group === null || entry === undefined || entry <= 0) continue;
    for (const w of WINDOWS) {
      const price = priceAt.get(`${d.key}|${w}`);
      if (price === undefined) continue;
      const raw = (price / entry - 1) * 1e4;
      const key = `${group}|${w}`;
      buckets.set(key, [...(buckets.get(key) ?? []), group === "venda" ? -raw : raw]);
    }
  }
  const forward: OpportunitiesAudit["forward"] = {};
  for (const [key, values] of buckets) {
    const [group, w] = key.split("|") as [Group, (typeof WINDOWS)[number]];
    const d = dist(values, 1)!;
    const sorted = Float64Array.from(values).sort();
    const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
    (forward[group] ??= {})[w] = {
      n: d.n,
      meanBps: d.mean,
      medianBps: d.p50,
      p10Bps: round(at(10), 1),
      p90Bps: round(at(90), 1),
      ge30bps: share(values.filter((v) => v >= 30).length, values.length),
      ge100bps: share(values.filter((v) => v >= 100).length, values.length),
    };
  }
  return { decisions: decisions.length, byStance: count(decisions, (d) => String(d.stance)), settlementsWithoutPrice: withoutPrice, forward };
}

// ---- consumo de API e vazão

export interface ThroughputFeasibility {
  /** Cadência pedida na hipótese e as chamadas por dia que ela exige se cada decisão precisar de 1 cotação. */
  targetIntervalMs: number;
  requiredPerSecond: number;
  requiredPerDay: number;
  tradeTrialRps: number;
  tradeTrialMaxPerDay: number;
  /** Fator pelo qual a cadência pedida excede o teto de RPS do Trial. */
  rpsShortfallFactor: number;
  basicFranchisePerDay: number;
  basicShortfallFactor: number;
}

export function throughputFeasibility(targetIntervalMs: number, tradeRps = 1, basicMonthly = OKX_MARKET_PLANS.free!.basic!, daysInMonth = 31): ThroughputFeasibility {
  const perSecond = 1000 / targetIntervalMs;
  const perDay = perSecond * 86_400;
  const basicPerDay = basicMonthly / daysInMonth;
  return {
    targetIntervalMs,
    requiredPerSecond: round(perSecond, 2),
    requiredPerDay: Math.round(perDay),
    tradeTrialRps: tradeRps,
    tradeTrialMaxPerDay: tradeRps * 86_400,
    rpsShortfallFactor: round(perSecond / tradeRps, 1),
    basicFranchisePerDay: Math.round(basicPerDay),
    basicShortfallFactor: round(perDay / basicPerDay, 0),
  };
}

export interface ApiAudit {
  source: string | null;
  basic?: Projection;
  premium?: Projection;
  /** O journal não registra erros HTTP por rota (429, 402, 5xx): só o ledger novo de api-budget passa a registrar. */
  httpErrorsRecorded: false;
}

export function auditApi(usageText: string | null, nowMs: number, source: string | null): ApiAudit {
  if (usageText === null) return { source: null, httpErrorsRecorded: false };
  const file = JSON.parse(usageText) as { days?: Record<string, { basic?: number; premium?: number }> };
  const series = (tier: "basic" | "premium") => Object.fromEntries(Object.entries(file.days ?? {}).map(([day, use]) => [day, use[tier] ?? 0]));
  const plan = OKX_MARKET_PLANS.free!;
  return { source, basic: projectMonth(series("basic"), nowMs, plan.basic!), premium: projectMonth(series("premium"), nowMs, plan.premium!), httpErrorsRecorded: false };
}

// ---- relatório

export interface Baseline {
  generatedAt: string;
  source: string;
  window: { fromMs: number; toMs: number; hours: number };
  lines: Record<string, number>;
  malformed: number;
  cycles: CyclesAudit;
  orders: OrdersAudit;
  jev: JevAudit;
  closings: ClosingsAudit;
  fills: FillsAudit;
  equity: EquityAudit;
  opportunities: OpportunitiesAudit;
  api: ApiAudit;
  feasibility: ThroughputFeasibility;
  caveats: string[];
}

const FILES = ["ledger", "decisions-meta", "closings", "fills", "equity", "scoreboard"] as const;

export function runAudit(dir: string, usagePath: string | null, nowMs: number): Baseline {
  const data: Record<string, Row[]> = {};
  const lines: Record<string, number> = {};
  let malformed = 0;
  for (const name of FILES) {
    const path = join(dir, `${name}.jsonl`);
    const parsed = existsSync(path) ? parseJsonl(readFileSync(path, "utf8")) : { rows: [], malformed: 0 };
    data[name] = parsed.rows;
    lines[name] = parsed.rows.length;
    malformed += parsed.malformed;
  }
  const times = FILES.flatMap((name) => data[name]!.map((r) => r.atMs).filter((t): t is number => num(t) !== undefined));
  const equity = auditEquity(data.equity!);
  const fromMs = times.length ? Math.min(...times) : nowMs;
  const toMs = times.length ? Math.max(...times) : nowMs;
  return {
    generatedAt: new Date(nowMs).toISOString(),
    source: `${basename(dirname(dir))}/${basename(dir)}`,
    window: { fromMs, toMs, hours: round((toMs - fromMs) / 3_600_000, 1) },
    lines,
    malformed,
    cycles: auditCycles(data.ledger!),
    orders: auditOrders(data.ledger!),
    jev: auditJev(data["decisions-meta"]!),
    closings: auditClosings(data.closings!),
    fills: auditFills(data.fills!, equity.solUsd),
    equity,
    opportunities: auditOpportunities(data.scoreboard!),
    api: auditApi(usagePath !== null && existsSync(usagePath) ? readFileSync(usagePath, "utf8") : null, nowMs, usagePath === null ? null : basename(usagePath)),
    feasibility: throughputFeasibility(90),
    caveats: [
      "Patrimônio inclui depósitos, saques e variação de preço das posições: a variação não é lucro de trading.",
      "Amostras de retorno futuro se sobrepõem no tempo e vêm de poucos tokens: os intervalos de confiança são otimistas.",
      "Retornos do scoreboard e dos fills estão antes da taxa de rede em SOL; as vendas são pareadas por lote (FIFO) com as compras do próprio journal.",
      "O journal não guarda erros HTTP por rota nem latência por etapa de rede; esses números só existem a partir do ledger de api-budget e da telemetria nova.",
      "Nada aqui prova lucro: as execuções reais são poucas e a janela é curta.",
    ],
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (import.meta.main) {
  const home = process.env.LOCALAPPDATA === undefined ? undefined : join(process.env.LOCALAPPDATA, "InonuTrader", "data");
  const dir = arg("--dir") ?? (home === undefined ? undefined : join(home, "agent"));
  if (dir === undefined || !existsSync(dir)) throw new Error("pasta do journal não encontrada: passe --dir");
  const now = Date.now();
  const defaultUsage = home === undefined ? null : join(home, "onchain", `usage-${new Date(now).toISOString().slice(0, 7)}.json`);
  const usage = arg("--usage") ?? defaultUsage;
  const report = runAudit(dir, usage, now);
  const out = resolve(import.meta.dir, "..", arg("--out") ?? "data/bench/baseline-audit.json");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  const o = report.orders;
  console.log(
    `baseline ${report.window.hours} h: ciclos=${report.cycles.total} ordens preparadas=${o.prepared} executadas=${o.executed} (${o.executedShare === null ? "n/d" : `${(o.executedShare * 100).toFixed(1)}%`}) ` +
      `maior bloqueio=${o.topBlocker?.reason ?? "nenhum"} (${o.topBlocker?.count ?? 0}) jev p50=${report.jev.latencyMs?.p50 ?? "n/d"} ms cotação p50=${report.closings.quoteNetworkMs?.p50 ?? "n/d"} ms -> ${out}`,
  );
}
