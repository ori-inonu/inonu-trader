/**
 * What the command centre draws, built from the core's status and its analysis. One place where every text that came from outside is cleaned (a token symbol is letters, digits and a few signs, never markup) and where
 * everything the core did not say stays null. Pure: no clock, no network.
 */
import type { AgentStatus, LedgerRecord } from "../agent/types";
import { clean, EMPTY_ANALYSIS } from "./parse-analysis";
import { reasonText } from "../agent/view";
import type { Analysis, HudBlock, HudCandidate, HudDropped, HudEvent, HudGuards, HudInFlight, HudLogLine, HudMeter, HudModel, HudPosition, HudResources, HudStreak, HudSystem, HudUi } from "./types";
import { IDLE_UI } from "./types";

const DAY_MS = 86_400_000;
const CYCLES_KEPT = 48;
const EVENTS_KEPT = 14;

/** The preference for buying: the largest probability among the options that are purchases. Null when the model sent none. */
function buyPreference(probs: Readonly<Record<string, number>> | null | undefined): number | null {
  if (probs === null || probs === undefined) return null;
  let best: number | null = null;
  for (const [option, p] of Object.entries(probs)) if (option.startsWith("buy") && Number.isFinite(p)) best = Math.max(best ?? 0, p);
  return best;
}

/** The option the model preferred (its most likely one, what a Choice picks); null when it sent no probabilities. */
function preferred(probs: Readonly<Record<string, number>> | null | undefined): string | null {
  if (probs === null || probs === undefined) return null;
  let top: [string, number] | null = null;
  for (const [option, p] of Object.entries(probs)) if (Number.isFinite(p) && (top === null || p > top[1])) top = [option, p];
  return top === null ? null : clean(top[0], 24);
}

/** The words for the reasons the code gives when it drops what the Jev chose, in capital letters without accents. The ones the agent page already words (reasonText) are reused; these few are too long for a line of the screen. */
const BLOCK_SHORT: Readonly<Record<string, string>> = {
  sem_saldo: "SEM SALDO LIDO PARA A COMPRA",
  valor_invalido: "VALOR DA ORDEM INVALIDO",
  gasto_desconhecido: "GASTO DO DIA DESCONHECIDO",
  ordem_em_voo: "ORDEM EM VOO PARA O TOKEN",
  abaixo_do_minimo_da_rede: "ABAIXO DO MINIMO DA REDE",
};
const NO_ACCENT = /[̀-ͯ]/g;

/** What the screen says of a reason the code gave for dropping an order. */
export function blockText(code: string): string {
  const short = BLOCK_SHORT[code];
  if (short !== undefined) return short;
  const said = reasonText(code);
  if (said === "" || said === reasonText("<unknown>")) return code.replace(/[._-]+/g, " ").toUpperCase().slice(0, 40);
  return said.normalize("NFD").replace(NO_ACCENT, "").toUpperCase().replace(/[^A-Z0-9 ,]/g, "").trim().slice(0, 48);
}

/** The chain and the address of a candidate id (`buy:token:501:<mint>` or `hold:token:1:<address>@agente`), so the same token is found whichever way its id is written. */
const tokenKey = (id: string): string => {
  const parts = id.split(":");
  return `${parts[2] ?? ""}:${parts.slice(3).join(":").split("@")[0] ?? ""}`.toLowerCase();
};

/** What the Jev chose in the last cycle and the code dropped before it became an order, each with its symbol (from the cycle's own view of the candidates, found by id or by the token's address). */
function dropped(status: AgentStatus): HudDropped[] {
  const last = status.last;
  if (last === null) return [];
  const byId = new Map(last.view.map((v) => [v.id, v] as const));
  const byToken = new Map(last.view.map((v) => [tokenKey(v.id), v] as const));
  return last.dropped.slice(0, 8).map((d) => {
    const v = byId.get(d.candidateId) ?? byToken.get(tokenKey(d.candidateId));
    const address = tokenKey(d.candidateId).split(":").slice(1).join(":");
    const shown = address.length > 10 ? `${address.slice(0, 4)}..${address.slice(-4)}` : address;
    const code = clean(d.reason, 40) ?? "motivo";
    return { s: clean(v?.symbol, 14) ?? (clean(shown, 12) ?? "token"), side: d.candidateId.startsWith("hold:") ? "sell" : "buy", code, text: blockText(code) } satisfies HudDropped;
  });
}

/**
 * How many consecutive cycles nothing went out for what the Jev chose. When the record of each past cycle says what it dropped (the ledger carries `dropped`), the count is of the cycles that dropped the SAME token's
 * request. When it does not, the count is only of the latest cycles that decided and sent no order, and says so (`exact` false): it never claims a past cycle was blocked that the record does not show.
 */
function streak(status: AgentStatus, now: readonly HudDropped[], cycleRows: readonly { o: string; p: number }[]): HudStreak | null {
  const last = status.last;
  if (last === null || now.length === 0) return null;
  const wanted = new Set(last.dropped.map((d) => tokenKey(d.candidateId)));
  const past = status.ledger.filter((r) => r.kind === "cycle" && r.cycleId !== last.cycleId).sort((a, b) => b.atMs - a.atMs);
  const recordsDrops = past.length > 0 && past.every((r) => Array.isArray((r as { dropped?: unknown }).dropped));
  if (recordsDrops) {
    let n = 1;
    for (const r of past) {
      const list = (r as unknown as { dropped: readonly { candidateId?: unknown }[] }).dropped;
      if (!list.some((d) => typeof d.candidateId === "string" && wanted.has(tokenKey(d.candidateId)))) break;
      n++;
    }
    return { cycles: n, exact: true };
  }
  // an agent that only watches sends nothing in any cycle: "no order went out" would say nothing there
  if (status.mode === "sombra") return null;
  let n = 0;
  for (let i = cycleRows.length - 1; i >= 0; i--) {
    const c = cycleRows[i]!;
    if (c.o !== "decidido" || c.p > 0) break;
    n++;
  }
  return { cycles: Math.max(1, n), exact: false };
}

function candidates(status: AgentStatus): HudCandidate[] {
  const out: HudCandidate[] = [];
  const drops = new Map((status.last?.dropped ?? []).map((d) => [d.candidateId, d.reason] as const));
  for (const v of status.last?.view ?? []) {
    if (v.kind !== "buy") continue;
    const facets: Record<string, number> = {};
    for (const [k, x] of Object.entries(v.facets ?? {})) { const key = clean(k, 24); if (key !== null && Number.isFinite(x)) facets[key] = x; }
    const why = drops.get(v.id);
    const blocked: HudBlock | null = why === undefined ? null : { code: clean(why, 40) ?? "motivo", text: blockText(clean(why, 40) ?? "motivo") };
    out.push({
      s: clean(v.symbol, 14) ?? "token", pbuy: buyPreference(v.probs), closed: v.closed !== null, facets,
      marks: v.marks.map((m) => clean(m, 30)).filter((m): m is string => m !== null).slice(0, 6), requested: preferred(v.probs), applied: clean(v.stance, 24), blocked,
    });
  }
  return out;
}

function events(ledger: readonly LedgerRecord[]): HudEvent[] {
  // the last stage of each order: the same order is written at every stage of its life
  const last = new Map<string, LedgerRecord>();
  for (const r of ledger) if (r.kind === "order" && r.symbol !== undefined && r.side !== undefined) last.set(`${r.cycleId}|${r.symbol}|${r.side}`, r);
  const out: HudEvent[] = [];
  for (const r of [...last.values()].sort((a, b) => a.atMs - b.atMs)) {
    if (r.stage !== "executada" && r.stage !== "falhou" && r.stage !== "incerta") continue;
    out.push({ t: r.atMs, side: r.side as "buy" | "sell", s: clean(r.symbol, 14) ?? "token", usd: r.usd ?? 0, stage: r.stage, src: r.source === "protecao" ? "protecao" : "modelo", reason: clean(r.reason, 40) });
  }
  return out.slice(-EVENTS_KEPT);
}

function cycles(ledger: readonly LedgerRecord[]): { t: number; o: string; p: number }[] {
  const sent = new Set(ledger.filter((r) => r.kind === "order" && (r.stage === "executada" || r.stage === "incerta" || r.stage === "enviando")).map((r) => r.cycleId));
  return ledger.filter((r) => r.kind === "cycle").map((r) => ({ t: r.atMs, o: clean(r.outcome ?? "mantido", 12) ?? "mantido", p: sent.has(r.cycleId) ? 1 : 0 })).slice(-CYCLES_KEPT);
}

function positions(status: AgentStatus): HudPosition[] {
  return (status.book?.positions ?? []).map((p) => ({
    s: clean(p.symbol, 14) ?? "token", usd: p.usd, share: p.sharePct, cash: p.isCash,
    plan: p.plan === null ? null : { profile: clean(p.plan.profile, 12) ?? "", sinceEntryPct: p.plan.sinceEntryPct, toTargetPct: p.plan.toTargetPct, toStopPct: p.plan.toStopPct, hoursHeld: p.plan.hoursHeld, hoursLeft: p.plan.hoursLeft },
  }));
}

/** An https address and nothing else: a button that opens a page for the person must never open anything the core did not mean as a web page. */
const httpsOnly = (v: string | null): string | null => {
  if (v === null) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.username === "" && u.password === "" ? u.toString() : null;
  } catch {
    return null;
  }
};

function inFlight(status: AgentStatus, nowMs: number): HudInFlight[] {
  return status.inFlight.map((o) => ({
    key: o.orderKey, symbol: clean(o.symbol, 14) ?? "token", side: o.side, usd: o.usd, ageMin: Math.max(0, Math.round((nowMs - o.atMs) / 60_000)), stage: o.stage,
    needsWord: o.ref === undefined || o.ref === null || o.ref === "", source: o.source, said: o.detail === null || o.detail === undefined ? null : o.detail.replace(/[^A-Za-z0-9 .,;:()%/_-]/g, "").slice(0, 120) || null,
  }));
}

const STAGE_WORD: Readonly<Record<string, string>> = { preparada: "PREPARADA", enviando: "ENVIANDO", executada: "EXECUTADA", falhou: "FALHOU", incerta: "SEM CONFIRMACAO" };
const EVENT_WORD: Readonly<Record<string, string>> = { conectou: "CARTEIRA CONECTADA", desconectou: "CARTEIRA DESCONECTADA", pausou: "COMPRAS NOVAS PAUSADAS", retomou: "COMPRAS NOVAS VOLTARAM" };

/** The newest records of the agent in plain capital letters: the last stage of each order, each cycle and the person's own events. Words from outside never come in raw. */
function systemLog(status: AgentStatus): HudLogLine[] {
  const lines: HudLogLine[] = [];
  const lastStage = new Map<string, LedgerRecord>();
  for (const r of status.ledger) {
    if (r.kind === "order") lastStage.set(`${r.cycleId}|${r.symbol}|${r.side}`, r);
    else if (r.kind === "cycle") {
      const outcome = clean(r.outcome ?? "mantido", 14) ?? "mantido";
      const why = clean(r.reason ?? null, 40);
      lines.push({ t: r.atMs, tone: outcome === "erro" ? "warn" : "info", text: `CICLO ${outcome.toUpperCase()}${why === null ? "" : ", " + reasonText(why).toUpperCase().replace(/\./g, "")}` });
    }
  }
  for (const r of lastStage.values()) {
    const stage = r.stage ?? "";
    lines.push({ t: r.atMs, tone: stage === "executada" ? "ok" : stage === "falhou" ? "warn" : "info", text: `${r.side === "sell" ? "VENDA" : "COMPRA"} ${clean(r.symbol, 14) ?? "TOKEN"} US$ ${Math.round(r.usd ?? 0)}: ${STAGE_WORD[stage] ?? "REGISTRADA"}` });
  }
  for (const e of status.events) lines.push({ t: e.atMs, tone: e.kind === "pausou" ? "warn" : "info", text: EVENT_WORD[e.kind] ?? "EVENTO" });
  return lines.sort((a, b) => b.t - a.t).slice(0, 8).map((l) => ({ ...l, text: l.text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 .,:$()%/-]/g, "").slice(0, 84) }));
}

function system(status: AgentStatus, nowMs: number): HudSystem {
  const w = status.wallet;
  return {
    wallet: { next: w.next, cli: w.cli, login: clean(w.login, 20) ?? "desconhecido", loginUrl: httpsOnly(w.loginUrl), policy: clean(w.policy, 20) ?? "desconhecida", sessionDays: w.sessionLeftMs === null ? null : w.sessionLeftMs / DAY_MS, evm: clean(w.address, 64), solana: clean(w.solanaAddress, 64) },
    inFlight: inFlight(status, nowMs),
    log: systemLog(status),
    mode: clean(status.mode, 20) ?? "-", authority: clean(status.authority.level, 20) ?? "-", profile: clean(status.autopilot?.ownerProfile ?? "livre", 20) ?? "livre",
  };
}

function guards(status: AgentStatus): HudGuards | null {
  const g = status.autopilot.guards;
  return g === null ? null : { impactPct: { ...g.impactPct }, taxPct: g.taxPct, slippagePct: { ...g.slippagePct }, buyCostShareOfStop: g.buyCostShareOfStop, nativeReserve: { kind: g.nativeReserve.kind, usd: g.nativeReserve.usd } };
}

/** The quota of the provider: the age of each reading is the screen's clock minus the moment it was observed, so it advances without a new observation. */
function resources(status: AgentStatus, nowMs: number): HudResources | null {
  const r = status.resources;
  if (r === null) return null;
  const meter = (m: NonNullable<AgentStatus["resources"]>["tiers"]["free"]["local"]): HudMeter => ({
    status: m.status, capEvidence: m.capEvidence, used: m.used, monthlyCap: m.monthlyCap, remaining: m.remainingAtObservation,
    ageMs: m.observedAtMs === null ? null : Math.max(0, nowMs - m.observedAtMs),
  });
  const tier = (id: "free" | "basic" | "premium") => ({ local: meter(r.tiers[id].local), account: meter(r.tiers[id].account) });
  return { monthKey: clean(r.month.key, 7) ?? "-", days: r.month.days, rate: { ...r.accountRateLimits }, tiers: { free: tier("free"), basic: tier("basic"), premium: tier("premium") } };
}

const numberOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function buildHudModel(status: AgentStatus, analysis: Analysis | null, nowMs: number, ui: HudUi = IDLE_UI): HudModel {
  const a = analysis ?? EMPTY_ANALYSIS;
  const ctx = status.context ?? {};
  const book = status.book;
  const cycleRows = cycles(status.ledger);
  const drops = dropped(status);
  return {
    snapshotAtMs: nowMs,
    analysisOk: analysis !== null,
    agent: {
      mode: clean(status.mode, 20) ?? "-", authority: clean(status.authority.level, 20) ?? "-", paused: status.paused, pauseReason: clean(status.pauseReason, 40),
      profile: clean(status.autopilot?.ownerProfile ?? "livre", 20) ?? "livre", model: clean(status.last?.modelo ?? null, 24),
      caps: status.autopilot?.caps ?? null, riskPct: a.runtime.riskPct, reserveShare: status.autopilot?.reserveShare ?? 0, leverage: status.autopilot?.leverage ?? null,
      cycling: status.scheduler.started,
    },
    wallet: {
      total: book?.totalUsd ?? null, cash: book === null || book.totalUsd === null ? null : book.cashUsd, positions: positions(status), unpriced: book?.unpriced ?? 0, readAtMs: book?.atMs ?? null,
      lastReadMs: book !== null && book.totalUsd !== null ? book.atMs : status.performance.series.reduce<number | null>((m, p) => (m === null || p.t > m ? p.t : m), null),
    },
    equity: status.performance.series.map((p) => ({ t: p.t, v: p.v })),
    rhythm: { lastAtMs: status.scheduler.lastAtMs, nextAtMs: status.scheduler.nextAtMs, intervalMin: status.scheduler.intervalMin },
    budget: { consults: status.budget.consults, max: status.budget.maxConsultsPerDay, tokens: a.runtime.tokensToday },
    context: { btc: numberOf(ctx.btc_24h), eth: numberOf(ctx.eth_24h), trend: typeof ctx.tendencia === "string" ? clean(ctx.tendencia, 20) : null },
    last: { atMs: status.last?.atMs ?? null, posture: clean(status.last?.posture ?? null, 12), dropped: drops, streak: streak(status, drops, cycleRows) },
    candidates: candidates(status),
    events: events(status.ledger),
    cycles: cycleRows,
    health: {
      login: clean(status.wallet.login, 20) ?? "desconhecido", sessionDays: status.wallet.sessionLeftMs === null ? null : status.wallet.sessionLeftMs / DAY_MS, modelOk: status.modelConfigured,
      ledgerOk: status.health.ledgerOk, plansOk: status.health.plansOk, lock: status.lock, inFlight: status.inFlight.length,
    },
    a,
    system: system(status, nowMs),
    guards: guards(status),
    resources: resources(status, nowMs),
    ui,
  };
}
