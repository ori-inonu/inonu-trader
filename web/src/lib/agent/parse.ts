/**
 * Reads `GET /agent/status` strictly. A body that is not what the core promises is no status: the screen then says the core did not answer, instead of drawing a half-filled agent. Inside a good status,
 * a piece the screen can live without (the book, the context, the last cycle) is null when it is not well formed, and never invented.
 */
import {
 WINDOW_IDS,
 type AgentEvent,
 type AgentStatus,
 type Authority,
 type Autopilot,
 type BookQuality,
 type BookStatus,
 type CandidateView,
 type CycleReport,
 type ExecutionGuards,
 type InFlightOrder,
 type LedgerRecord,
 type Mandate,
 type Mode,
 type OrderOutcome,
 type OrderStage,
 type Plan,
 type PlanView,
 type PlannedOrder,
 type PositionRow,
 type ResourceMeterView,
 type ResourceTierId,
 type ResourceView,
 type WalletNext,
 type WalletSetup,
 type WindowSummary,
} from "./types";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown, max = 400): string | null => (typeof v === "string" && v.length <= max ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const MODES: readonly string[] = ["desligado", "sombra", "limitado"];
const isMode = (v: unknown): v is Mode => typeof v === "string" && MODES.includes(v);
const STAGES: readonly string[] = ["preparada", "enviando", "executada", "falhou", "incerta"];
const isStage = (v: unknown): v is OrderStage => typeof v === "string" && STAGES.includes(v);
const ADDRESS = /^[A-Za-z0-9]{20,80}$/;

function strings(v: unknown, max = 40): string[] {
 return arr(v).filter((x): x is string => typeof x === "string" && x.length <= 200).slice(0, max);
}

function parseOrder(v: unknown): PlannedOrder | null {
 const o = rec(v);
 if (o === null) return null;
 const usd = num(o.usd);
 const side = o.side === "buy" || o.side === "sell" ? o.side : null;
 const wallet = o.wallet === "agente" || o.wallet === "principal" ? o.wallet : null;
 const [candidateId, stance, chainIndex, symbol, address] = [text(o.candidateId), text(o.stance), text(o.chainIndex), text(o.symbol), text(o.address)];
 if (usd === null || side === null || wallet === null || candidateId === null || stance === null || chainIndex === null || symbol === null || address === null) return null;
 return { candidateId, side, stance, chainIndex, symbol, address, usd, wallet, profile: text(o.profile), source: o.source === "protecao" ? "protecao" : "modelo" };
}

function parseOutcome(v: unknown): OrderOutcome | null {
 const o = rec(v);
 const order = parseOrder(o?.order);
 if (o === null || order === null || !isStage(o.stage)) return null;
 return { order, stage: o.stage, ref: text(o.ref), reason: text(o.reason) };
}

function parseView(v: unknown): CandidateView | null {
 const o = rec(v);
 const [id, symbol, chainIndex] = [text(o?.id, 300), text(o?.symbol, 40), text(o?.chainIndex, 20)];
 if (o === null || id === null || symbol === null || chainIndex === null || (o.kind !== "holding" && o.kind !== "buy")) return null;
 return { id, kind: o.kind, symbol, chainIndex, stance: text(o.stance, 40), families: strings(o.families, 6), marks: strings(o.marks, 6), closed: text(o.closed, 30), probs: unitMap(o.probs), facets: unitMap(o.facets) };
}

/** A map of names to numbers between 0 and 1 (probabilities), at most a dozen entries; null when it is not one. */
function unitMap(v: unknown): Record<string, number> | null {
 const o = rec(v);
 if (o === null) return null;
 const out: Record<string, number> = {};
 for (const [k, val] of Object.entries(o).slice(0, 12)) {
  if (!/^[a-z_]{1,24}$/.test(k) || typeof val !== "number" || !Number.isFinite(val) || val < 0 || val > 1) return null;
  out[k] = val;
 }
 return Object.keys(out).length === 0 ? null : out;
}

/** How many purchases each level of risk would open: whole numbers by level; null when absent. */
function unitCounts(v: unknown): Record<string, number> | null {
 const o = rec(v);
 if (o === null) return null;
 const out: Record<string, number> = {};
 for (const [k, val] of Object.entries(o).slice(0, 6)) if (/^[a-z_]{1,24}$/.test(k) && typeof val === "number" && Number.isInteger(val) && val >= 0 && val <= 1000) out[k] = val;
 return Object.keys(out).length === 0 ? null : out;
}

function parsePerformance(v: unknown): AgentStatus["performance"] {
 const o = rec(v);
 const series: { t: number; v: number }[] = [];
 for (const raw of arr(o?.series).slice(-200)) {
  const p = rec(raw);
  const [t, value] = [num(p?.t), num(p?.v)];
  if (t !== null && value !== null && value >= 0) series.push({ t, v: value });
 }
 const record: Record<string, { n: number; acerto: number | null }> = {};
 for (const [k, raw] of Object.entries(rec(o?.record) ?? {}).slice(0, 12)) {
  const r = rec(raw);
  const n = num(r?.n);
  if (/^[a-z_]{1,24}$/.test(k) && n !== null) record[k] = { n, acerto: num(r?.acerto) };
 }
 return { series, record };
}

function parseCycle(v: unknown): CycleReport | null {
 const o = rec(v);
 if (o === null) return null;
 const outcome = o.outcome === "mantido" || o.outcome === "decidido" || o.outcome === "bloqueado" || o.outcome === "erro" ? o.outcome : null;
 const [cycleId, atMs, durationMs] = [text(o.cycleId, 80), num(o.atMs), num(o.durationMs)];
 if (outcome === null || cycleId === null || atMs === null || durationMs === null || !isMode(o.mode)) return null;
 const considered = rec(o.considered);
 const stances: Record<string, string> = {};
 for (const [k, val] of Object.entries(rec(o.stances) ?? {})) if (typeof val === "string" && k.length <= 300) stances[k] = val;
 return {
  cycleId,
  atMs,
  durationMs,
  mode: o.mode,
  outcome,
  reason: text(o.reason),
  consulted: o.consulted === true,
  modelo: text(o.modelo, 80),
  posture: o.posture === "defensiva" || o.posture === "neutra" || o.posture === "ofensiva" ? o.posture : null,
  stances,
  orders: arr(o.orders).map(parseOutcome).filter((x): x is OrderOutcome => x !== null),
  dropped: arr(o.dropped).flatMap((d) => {
   const r = rec(d);
   const id = text(r?.candidateId);
   const reason = text(r?.reason);
   return id !== null && reason !== null ? [{ candidateId: id, reason }] : [];
  }),
  considered: { holdings: num(considered?.holdings) ?? 0, buys: num(considered?.buys) ?? 0, protected: num(considered?.protected) ?? 0 },
  notes: strings(o.notes),
  view: arr(o.view).map(parseView).filter((x): x is CandidateView => x !== null).slice(0, 16),
  opened: unitCounts(o.opened),
 };
}

function parsePlanView(v: unknown): PlanView | null {
 const o = rec(v);
 const profile = text(o?.profile, 40);
 const [held, left] = [num(o?.hoursHeld), num(o?.hoursLeft)];
 if (o === null || profile === null || held === null || left === null) return null;
 return { profile, sinceEntryPct: num(o.sinceEntryPct), toTargetPct: num(o.toTargetPct), toStopPct: num(o.toStopPct), hoursHeld: held, hoursLeft: left, targetHit: o.targetHit === true, trimmed: o.trimmed === true };
}

function parseBook(v: unknown): BookStatus | null {
 const o = rec(v);
 if (o === null) return null;
 const [atMs, watchFailed, flagged, unpriced] = [num(o.atMs), num(o.watchFailed), num(o.flagged), num(o.unpriced)];
 if (atMs === null || typeof o.managedOk !== "boolean" || watchFailed === null || flagged === null || unpriced === null) return null;
 const positions: PositionRow[] = [];
 for (const raw of arr(o.positions)) {
  const p = rec(raw);
  const [id, symbol, chainIndex] = [text(p?.id), text(p?.symbol, 40), text(p?.chainIndex, 20)];
  if (p === null || id === null || symbol === null || chainIndex === null || (p.wallet !== "agente" && p.wallet !== "principal")) continue;
  positions.push({ id, symbol, chainIndex, wallet: p.wallet, usd: num(p.usd), sharePct: num(p.sharePct), isCash: p.isCash === true, plan: parsePlanView(p.plan) });
 }
 const hasObservationField = o.observedAtMs !== undefined;
 const legacyFailedStatus = !hasObservationField && !o.managedOk;
 const totalUsd = legacyFailedStatus ? null : num(o.totalUsd);
 const agentUsd = legacyFailedStatus ? null : num(o.agentUsd);
 const cashUsd = legacyFailedStatus ? null : num(o.cashUsd);
 const observedAtMs = num(o.observedAtMs);
 const qualityValue = o.quality;
 const hasQuality = qualityValue === "current" || qualityValue === "partial" || qualityValue === "stale" || qualityValue === "unavailable";
 const visibleManagedUnpriced = positions.filter((p) => p.wallet === "agente" && p.usd === null).length;
 const parsedUnpriced = hasQuality ? unpriced : visibleManagedUnpriced;
 const quality: BookQuality = hasQuality
  ? qualityValue
  : !o.managedOk || observedAtMs === null ? "stale" : visibleManagedUnpriced > 0 ? "partial" : "current";
 return { atMs, observedAtMs, quality, managedOk: o.managedOk, watchFailed, flagged, unpriced: parsedUnpriced, totalUsd, agentUsd, cashUsd, positions: legacyFailedStatus ? [] : positions };
}

function parseWindow(v: unknown): WindowSummary | null {
 const o = rec(v);
 if (o === null) return null;
 const [n, settled, pending, unknownPrice, grossUsd] = [num(o.n), num(o.settled), num(o.pending), num(o.unknownPrice), num(o.grossUsd)];
 if (n === null || settled === null || pending === null || unknownPrice === null || grossUsd === null) return null;
 return {
  n,
  overlapping: num(o.overlapping) ?? 0,
  settled,
  pending,
  unknownPrice,
  grossUsd,
  netUsd: num(o.netUsd),
  hitRate: num(o.hitRate),
  claim: o.claim === "acima_de_manter" || o.claim === "nao_acima_de_manter" ? o.claim : null,
  claimBasis: o.claimBasis === "liquido" || o.claimBasis === "bruto" ? o.claimBasis : null,
  claimReason: text(o.claimReason, 60),
 };
}

function parseLedger(v: unknown): LedgerRecord | null {
 const o = rec(v);
 const [cycleId, atMs] = [text(o?.cycleId, 80), num(o?.atMs)];
 if (o === null || cycleId === null || atMs === null || (o.kind !== "cycle" && o.kind !== "order")) return null;
 return {
  kind: o.kind,
  cycleId,
  atMs,
  reason: text(o.reason),
  ...(text(o.outcome, 20) !== null ? { outcome: text(o.outcome, 20)! } : {}),
  ...(isMode(o.mode) ? { mode: o.mode } : {}),
  ...(text(o.posture, 20) !== null ? { posture: text(o.posture, 20) } : {}),
  ...(isStage(o.stage) ? { stage: o.stage } : {}),
  ...(o.side === "buy" || o.side === "sell" ? { side: o.side } : {}),
  ...(text(o.symbol, 40) !== null ? { symbol: text(o.symbol, 40)! } : {}),
  ...(num(o.usd) !== null ? { usd: num(o.usd)! } : {}),
  ...(text(o.stance, 40) !== null ? { stance: text(o.stance, 40)! } : {}),
  ...(text(o.source, 20) !== null ? { source: text(o.source, 20)! } : {}),
  ...(o.kind === "cycle" && Array.isArray(o.dropped)
   ? { dropped: o.dropped.flatMap((d: unknown) => { const r = rec(d); const id = text(r?.candidateId, 300); const reason = text(r?.reason, 60); return id !== null && reason !== null ? [{ candidateId: id, reason }] : []; }) }
   : {}),
 };
}

const METER_STATUS = ["valid", "unreported", "corrupt", "unreadable", "month_mismatch", "invalid"] as const;
const CAP_EVIDENCE = ["local_configuration", "provider_reported", "unknown"] as const;
const SCOPES = ["local_gateway", "account_reported"] as const;

function parseMeter(v: unknown): ResourceMeterView | null {
 const o = rec(v);
 if (o === null) return null;
 const scope = SCOPES.find((x) => x === o.scope);
 const status = METER_STATUS.find((x) => x === o.status);
 const capEvidence = CAP_EVIDENCE.find((x) => x === o.capEvidence);
 if (scope === undefined || status === undefined || capEvidence === undefined) return null;
 return { scope, status, capEvidence, observedAtMs: num(o.observedAtMs), used: num(o.used), monthlyCap: num(o.monthlyCap), remainingAtObservation: num(o.remainingAtObservation), extrapolatedMonthUse: num(o.extrapolatedMonthUse) };
}

function parseResources(v: unknown): ResourceView | null {
 const o = rec(v);
 const month = rec(o?.month);
 const tiers = rec(o?.tiers);
 const limits = rec(o?.accountRateLimits);
 const asOfMs = num(o?.asOfMs);
 const [key, startAtMs, nextMs, days] = [text(month?.key, 7), num(month?.startAtMs), num(month?.localNextMonthUtcMs), num(month?.days)];
 if (o === null || asOfMs === null || month === null || tiers === null || key === null || startAtMs === null || nextMs === null || days === null) return null;
 const parsed: Partial<Record<ResourceTierId, { local: ResourceMeterView; account: ResourceMeterView }>> = {};
 for (const id of ["free", "basic", "premium"] as const) {
  const t = rec(tiers[id]);
  const local = parseMeter(t?.local);
  const account = parseMeter(t?.account);
  if (local === null || account === null) return null;
  parsed[id] = { local, account };
 }
 return { asOfMs, month: { key, startAtMs, localNextMonthUtcMs: nextMs, days }, accountRateLimits: { requestsPerSecond: num(limits?.requestsPerSecond), tokensPerSecond: num(limits?.tokensPerSecond) }, tiers: parsed as ResourceView["tiers"] };
}

function parseInFlight(v: unknown): InFlightOrder | null {
 const o = rec(v);
 const [orderKey, symbol, chainIndex] = [text(o?.orderKey, 300), text(o?.symbol, 40), text(o?.chainIndex, 20)];
 const [atMs, usd] = [num(o?.atMs), num(o?.usd)];
 if (o === null || orderKey === null || !/^[A-Za-z0-9_.:@|-]{1,300}$/.test(orderKey) || symbol === null || chainIndex === null || atMs === null || usd === null) return null;
 if ((o.stage !== "enviando" && o.stage !== "incerta") || (o.side !== "buy" && o.side !== "sell")) return null;
 return { orderKey, atMs, stage: o.stage, side: o.side, symbol, chainIndex, usd, source: o.source === "protecao" ? "protecao" : "modelo", reason: text(o.reason, 60), detail: text(o.detail, 200), ref: text(o.ref, 120) };
}

function parsePlan(v: unknown): Plan | null {
 const o = rec(v);
 const [key, symbol, profile] = [text(o?.key, 200), text(o?.symbol, 40), text(o?.profile, 40)];
 const [entry, at] = [num(o?.entryPriceUsd), num(o?.entryAtMs)];
 if (o === null || key === null || symbol === null || profile === null || entry === null || at === null) return null;
 return { key, symbol, profile, entryPriceUsd: entry, entryAtMs: at, targetHit: o.targetHit === true, trimmed: o.trimmed === true };
}

const NEXT: readonly string[] = ["instalar", "entrar", "depositar", "definir_politica", "operando"];

function parseWallet(v: unknown): WalletSetup | null {
 const o = rec(v);
 if (o === null) return null;
 const login = o.login === "nao_iniciado" || o.login === "aguardando" || o.login === "logado" || o.login === "desconhecido" ? o.login : null;
 const policy = o.policy === "ausente" || o.policy === "ok" || o.policy === "desconhecida" ? o.policy : null;
 const next = typeof o.next === "string" && NEXT.includes(o.next) ? (o.next as WalletNext) : null;
 if ((o.cli !== "ausente" && o.cli !== "instalado") || login === null || policy === null || next === null) return null;
 // the page to sign in on is OKX's own, or it is not offered
 const url = text(o.loginUrl, 2000);
 const safeUrl = url !== null && /^https:\/\/web3\.okx\.com\/account\//.test(url) ? url : null;
 const address = text(o.address, 80);
 const solanaAddress = text(o.solanaAddress, 80);
 return {
  cli: o.cli,
  login,
  loginUrl: safeUrl,
  agentic: o.agentic === true,
  address: address !== null && ADDRESS.test(address) ? address : null,
  solanaAddress: solanaAddress !== null && ADDRESS.test(solanaAddress) ? solanaAddress : null,
  policy,
  fundsUsd: num(o.fundsUsd),
  sessionLeftMs: num(o.sessionLeftMs),
  next,
 };
}

function parseMandate(v: unknown): Mandate | null {
 const o = rec(v);
 if (o === null) return null;
 const risk = ["cauteloso", "moderado", "agressivo"].includes(o.risk as string) ? (o.risk as Mandate["risk"]) : null;
 const reserve = ["baixa", "media", "alta"].includes(o.reserve as string) ? (o.reserve as Mandate["reserve"]) : null;
 const concentration = ["pequena", "media", "grande"].includes(o.concentration as string) ? (o.concentration as Mandate["concentration"]) : null;
 const look = ["rapido", "normal", "calmo"].includes(o.look as string) ? (o.look as Mandate["look"]) : null;
 return risk === null || reserve === null || concentration === null || look === null ? null : { risk, reserve, concentration, look };
}

function parseAutopilot(v: unknown): Autopilot | null {
 const o = rec(v);
 const settings = rec(o?.settings);
 const mandate = parseMandate(settings?.mandate);
 const caps = rec(settings?.caps);
 if (o === null || settings === null || mandate === null || caps === null) return null;
 // a ceiling is a number or null (no ceiling); a field that is missing or is anything else is not a core this screen understands
 const cap = (v: unknown): number | null | undefined => (v === null ? null : num(v) ?? undefined);
 const [maxBuy, maxDailyBuy, maxDailySell, interval, reserve] = [cap(caps.maxBuyUsd), cap(caps.maxDailyBuyUsd), cap(caps.maxDailySellUsd), num(settings.intervalMin), num(settings.reserveShare)];
 const riskTaken = parseMandate({ ...mandate, risk: settings.riskTaken })?.risk ?? null;
 if (maxBuy === undefined || maxDailyBuy === undefined || maxDailySell === undefined || interval === null || reserve === null || riskTaken === null) return null;
 return {
  mandate,
  riskTaken,
  caps: { maxBuyUsd: maxBuy, maxDailyBuyUsd: maxDailyBuy, maxDailySellUsd: maxDailySell },
  intervalMin: interval,
  reserveShare: reserve,
  aggressiveOpen: o.aggressiveOpen === true,
  ownerProfile: o.ownerProfile === "arrojado" ? "arrojado" : "livre",
  leverage: (() => {
   const l = rec(rec(o.authorizations)?.leverage);
   return l !== null && typeof l.granted === "boolean" ? { granted: l.granted, instruments: arr(l.instruments).length } : null;
  })(),
  mandateChangedAtMs: num(o.mandateChangedAtMs),
  capsSource: text(rec(settings.source)?.caps, 40) ?? "automatico",
  guards: parseGuards(o.guards),
 };
}

function triple(v: unknown): { buy: number; sell: number; protecao: number } | null {
 const o = rec(v);
 const [buy, sell, protecao] = [num(o?.buy), num(o?.sell), num(o?.protecao)];
 return buy === null || sell === null || protecao === null ? null : { buy, sell, protecao };
}

function parseGuards(v: unknown): ExecutionGuards | null {
 const o = rec(v);
 if (o === null) return null;
 const [impact, slippage, tax, share] = [triple(o.impactPct), triple(o.slippagePct), num(o.taxPct), num(o.buyCostShareOfStop)];
 const reserve = rec(o.nativeReserve);
 const kind = reserve?.kind === "fixa" || reserve?.kind === "taxa_medida" ? reserve.kind : null;
 if (impact === null || slippage === null || tax === null || share === null || reserve === null || kind === null) return null;
 return { impactPct: impact, taxPct: tax, slippagePct: slippage, buyCostShareOfStop: share, nativeReserve: { kind, usd: num(reserve.usd) } };
}

function parseEvents(v: unknown): AgentEvent[] {
 return arr(v).flatMap((x): AgentEvent[] => {
  const e = rec(x);
  const at = num(e?.atMs);
  const reason = text(e?.reason, 40);
  return e !== null && at !== null && reason !== null && (e.kind === "conectou" || e.kind === "desconectou" || e.kind === "pausou" || e.kind === "retomou") ? [{ atMs: at, kind: e.kind, reason }] : [];
 });
}

export function parseStatus(body: unknown): AgentStatus | null {
 const root = rec(body);
 const s = rec(root?.status);
 if (root === null || root.ok !== true || s === null) return null;
 const state = rec(s.state);
 const config = rec(s.config);
 const managed = rec(config?.managed);
 const readiness = rec(s.readiness);
 const budget = rec(s.budget);
 const limits = rec(budget?.limits);
 const scheduler = rec(s.scheduler);
 const scoreboard = rec(s.scoreboard);
 const windowsRaw = rec(scoreboard?.windows);
 const health = rec(s.health);
 const wallet = parseWallet(s.wallet);
 const autopilot = parseAutopilot(s.autopilot);
 if (state === null || typeof state.connected !== "boolean" || !isMode(s.mode) || managed === null || (managed.kind !== "propria" && managed.kind !== "agentica")) return null;
 if (readiness === null || !Array.isArray(readiness.sombra) || !Array.isArray(readiness.limitado) || budget === null || limits === null || scheduler === null || windowsRaw === null || health === null || wallet === null || autopilot === null) return null;

 const windows = {} as Record<(typeof WINDOW_IDS)[number], WindowSummary>;
 for (const id of WINDOW_IDS) {
  const w = parseWindow(windowsRaw[id]);
  if (w === null) return null;
  windows[id] = w;
 }
 // the decisions not to act: reported by newer cores; a core that does not report them, or reports them badly, simply has none to show
 let inaction: AgentStatus["inaction"] = null;
 const inactionRaw = rec(scoreboard?.inaction);
 const inactionWindows = rec(inactionRaw?.windows);
 if (inactionRaw !== null && inactionWindows !== null) {
  const parsed = {} as Record<(typeof WINDOW_IDS)[number], WindowSummary>;
  let good = true;
  for (const id of WINDOW_IDS) {
   const w = parseWindow(inactionWindows[id]);
   if (w === null) good = false;
   else parsed[id] = w;
  }
  if (good) inaction = { decisions: num(inactionRaw.decisions) ?? 0, windows: parsed };
 }
 const [consults, maxConsults, interval] = [num(budget.consults), num(limits.maxConsultsPerDay), num(scheduler.intervalMin)];
 if (consults === null || maxConsults === null || interval === null) return null;

 const context: Record<string, string | number | null> = {};
 const ctx = rec(s.context);
 if (ctx !== null) for (const [k, v] of Object.entries(ctx)) if (v === null || typeof v === "string" || (typeof v === "number" && Number.isFinite(v))) context[k] = v;

 // what is in force: a server that does not say (an older one) is read from its mode, and never as money
 const rawAuthority = rec(s.authority);
 let authority: Authority;
 if (s.authority === undefined) authority = { level: s.mode === "desligado" ? "desligado" : "analise", blocked: null, ownerPolicy: "exigida" };
 else if (rawAuthority !== null && (rawAuthority.level === "desligado" || rawAuthority.level === "analise" || rawAuthority.level === "dinheiro") && (rawAuthority.ownerPolicy === "exigida" || rawAuthority.ownerPolicy === "dispensada")) authority = { level: rawAuthority.level, blocked: text(rawAuthority.blocked, 60), ownerPolicy: rawAuthority.ownerPolicy };
 else return null;

 return {
  connected: state.connected,
  connectedAtMs: num(state.connectedAtMs),
  mode: s.mode,
  authority,
  paused: s.paused === true,
  pausedUntilMs: num(state.pausedUntilMs),
  pauseReason: text(state.pauseReason, 40),
  events: parseEvents(state.events),
  managed: { kind: managed.kind, evm: text(managed.evm, 80), solana: text(managed.solana, 80) },
  stopFile: s.stopFile === true,
  health: { ledgerOk: rec(health.ledger)?.ok === true, plansOk: rec(health.plans)?.ok === true, configOk: rec(health.config)?.ok === true },
  modelConfigured: s.modelConfigured === true,
  credentialsConfigured: s.credentialsConfigured === true,
  readiness: { sombra: strings(readiness.sombra), limitado: strings(readiness.limitado) },
  wallet,
  autopilot,
  budget: { consults, maxConsultsPerDay: maxConsults },
  resources: parseResources(s.resources),
  scheduler: { started: scheduler.started === true, nextAtMs: num(scheduler.nextAtMs), lastAtMs: num(scheduler.lastAtMs), intervalMin: interval },
  last: parseCycle(s.last),
  plans: arr(s.plans).map(parsePlan).filter((x): x is Plan => x !== null),
  windows,
  inaction,
  decisions: num(scoreboard?.decisions) ?? 0,
  protective: num(scoreboard?.protective) ?? 0,
  inFlight: arr(s.inFlight).map(parseInFlight).filter((x): x is InFlightOrder => x !== null).slice(0, 40),
  lock: s.lock !== false,
  book: parseBook(s.book),
  context: ctx === null ? null : context,
  ledger: arr(s.ledger).map(parseLedger).filter((x): x is LedgerRecord => x !== null),
  performance: parsePerformance(s.performance),
 };
}
