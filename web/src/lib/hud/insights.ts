/**
 * What the Inonu "reads" from its own numbers, as short lines for the person who owns the capital: why nothing was bought, where the money sits, which position is close to its target or its stop, whether the skipped
 * purchases kept rising, what failed. Every line is derived from the model of the screen (never from a guess), says the size of the sample when the sample is small, and promises nothing: no line speaks of profit
 * to come. Pure: the same model gives the same lines, so a test can pin them.
 */
import { readNote } from "./draw/h";
import type { HudModel } from "./types";

export type InsightTone = "ok" | "warn" | "info";
export interface Insight {
  readonly tone: InsightTone;
  /** Capital letters, no accents: the screen writes that way. At most INSIGHT_MAX characters. */
  readonly text: string;
}

export const INSIGHT_MAX = 92;
/** What the screen says first when the core runs no cycles. */
export const STOPPED_TEXT = "AGENTE PARADO, SO ACOMPANHAMENTO, NENHUMA ORDEM SAI";

const pc = (n: number, d = 0): string => n.toFixed(d).replace(".", ",");
const cut = (s: string): string => (s.length <= INSIGHT_MAX ? s : s.slice(0, INSIGHT_MAX - 1) + ".");

export interface BlockedGroup {
  readonly side: "buy" | "sell";
  /** The code's reason in capital letters, the same for every symbol of the group. */
  readonly text: string;
  readonly symbols: readonly string[];
  /** The symbols as a phrase: at most two names, then how many more. */
  readonly names: string;
}

/** What the Jev chose in the last cycle and the code dropped, one group per side and reason, in the order the core listed it. */
export function blockedGroups(D: HudModel): BlockedGroup[] {
  const groups = new Map<string, { side: "buy" | "sell"; text: string; symbols: string[] }>();
  for (const d of D.last.dropped) {
    const key = `${d.side}|${d.code}`;
    const g = groups.get(key) ?? { side: d.side, text: d.text, symbols: [] };
    if (!g.symbols.includes(d.s)) g.symbols.push(d.s);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, names: g.symbols.slice(0, 2).join(" E ") + (g.symbols.length > 2 ? ` E MAIS ${g.symbols.length - 2}` : "") }));
}

/** One line per reason the code gave (at most two), then how long nothing has gone out. The symbols are the ones the Jev chose; the reason is the code's own. */
function blockedLines(D: HudModel): Insight[] {
  const lines: Insight[] = [];
  const streak = D.last.streak;
  const run = streak !== null && streak.exact && streak.cycles >= 2 ? `, ${streak.cycles} CICLOS SEGUIDOS` : "";
  for (const g of blockedGroups(D).slice(0, 2)) lines.push({ tone: "warn", text: `O JEV PEDIU ${g.side === "buy" ? "COMPRAR" : "VENDER"} ${g.names} E O CODIGO BLOQUEOU: ${g.text}${run}` });
  if (streak !== null && !streak.exact && streak.cycles >= 2) lines.push({ tone: "warn", text: `NENHUMA ORDEM SAIU NOS ULTIMOS ${streak.cycles} CICLOS SEGUIDOS` });
  return lines;
}

export function insights(D: HudModel): Insight[] {
  const out: Insight[] = [];
  const open = D.candidates.filter((c) => !c.closed);
  const closed = D.candidates.length - open.length;
  // what the Jev asked for is his own stance on a purchase (his choice is the decision: the code has no bar of its own to pass)
  const asked = open.filter((c) => c.applied !== null && c.applied !== "skip");

  // an agent that runs no cycles says so first, and nothing the last consult chose is told as if it were happening now
  const live = D.agent.cycling;
  if (!live) out.push({ tone: "warn", text: STOPPED_TEXT });

  // 0. what the Jev chose and the code did not turn into an order comes first: a request that was dropped is not a decision carried out, and it must never look as if nothing was decided
  if (live) out.push(...blockedLines(D));

  // 1. why nothing was bought, or what went through
  const best = [...open].filter((c) => c.pbuy !== null).sort((a, b) => (b.pbuy ?? 0) - (a.pbuy ?? 0))[0];
  const sent = asked.filter((c) => c.blocked === null);
  if (live) {
    if (sent.length > 0) out.push({ tone: "ok", text: `O JEV PEDIU COMPRAR NA ULTIMA CONSULTA: ${sent.map((c) => c.s).slice(0, 3).join(", ")}` });
    else if (asked.length === 0 && best !== undefined && best.pbuy !== null) out.push({ tone: "info", text: `O JEV NAO PEDIU COMPRA NA ULTIMA CONSULTA, MAIOR PREFERENCIA: ${best.s} ${pc(best.pbuy * 100)}%` });
    else if (D.candidates.length === 0) out.push({ tone: "info", text: "AINDA SEM CANDIDATOS NA ULTIMA CONSULTA" });
  }

  // 2. how much the code closed before the model could choose
  if (live && D.candidates.length >= 3 && closed / D.candidates.length >= 0.5) out.push({ tone: "info", text: `${closed} DE ${D.candidates.length} CANDIDATOS FORAM FECHADOS PELO CODIGO ANTES DO JEV` });

  // 3. the position nearest to its target or to its stop
  const planned = D.wallet.positions.filter((p) => p.plan !== null && !p.cash);
  const near = planned
    .map((p) => ({ p, toT: p.plan!.toTargetPct, toS: p.plan!.toStopPct }))
    .filter((x) => x.toT !== null || x.toS !== null)
    .sort((a, b) => Math.min(a.toT ?? 99, a.toS ?? 99) - Math.min(b.toT ?? 99, b.toS ?? 99))[0];
  if (near !== undefined) {
    const c = near.toS !== null && near.toS < 2;
    out.push({ tone: c ? "warn" : "info", text: cut(`${near.p.s}: FALTAM ${near.toT === null ? "-" : pc(Math.max(0, near.toT), 1)}% AO ALVO E ${near.toS === null ? "-" : pc(Math.max(0, near.toS), 1)}% AO STOP, ${Math.max(0, Math.round(near.p.plan!.hoursLeft))} H DE PRAZO`) });
  }
  const loose = D.wallet.positions.filter((p) => !p.cash && p.plan === null && p.usd !== null && p.usd > 0);
  if (loose.length > 0) out.push({ tone: "warn", text: `${loose.length} TOKEN(S) SEM PLANO DE SAIDA: O AGENTE NAO ADMINISTRA ESSA PARTE` });

  // 4. the money that is idle
  const total = D.wallet.total ?? 0;
  if (D.wallet.total === null) out.push({ tone: "warn", text: D.wallet.lastReadMs === null ? "SEM LEITURA DA CARTEIRA ATE AGORA" : readNote(D.wallet.lastReadMs) });
  if (total > 0 && D.wallet.cash !== null) {
    const share = D.wallet.cash / total;
    if (share >= 0.7) out.push({ tone: "info", text: `CAIXA LIVRE ${pc(share * 100)}% DA CARTEIRA, EM USDC E SEM RENDIMENTO` });
  }

  // 5. the skipped purchases, measured afterwards (a counterfactual, with its sample size)
  if (D.analysisOk) {
    const g = D.a.placar.skipped["1h"];
    if (g.n >= 5 && g.mean !== null) out.push({ tone: "info", text: `DAS PULADAS: ${g.up} DE ${g.n} SUBIRAM EM 1 H, MEDIA ${g.mean > 0 ? "+" : ""}${pc(g.mean, 1)}%, ANTES DE CUSTO` });
    else if (g.n > 0) out.push({ tone: "info", text: `SO ${g.n} PULADA(S) JA MEDIDA(S) EM 1 H: POUCAS PARA CONCLUIR` });
    const fail = D.a.orders.outcomes.falhou ?? 0;
    const ok = D.a.orders.outcomes.executada ?? 0;
    if (fail > 0) out.push({ tone: "warn", text: `${fail} ORDEM(NS) FALHARAM NA CADEIA CONTRA ${ok} EXECUTADA(S)` });
    const net = D.a.trips.reduce((a, t) => a + (t.out - t.in), 0);
    if (D.a.trips.length > 0) out.push({ tone: net >= 0 ? "ok" : "warn", text: `${D.a.trips.length} VOLTA(S) FECHADA(S): CAIXA ${net > 0 ? "+" : ""}${pc(net, 3)} USDC, ANTES DA TAXA EM SOL` });
  }

  // 6. the things that need the person
  if (D.agent.paused) out.push({ tone: "warn", text: `COMPRAS NOVAS PAUSADAS${D.agent.pauseReason === null ? "" : ": " + D.agent.pauseReason.replace(/_/g, " ").toUpperCase()}` });
  if (D.health.inFlight > 0) out.push({ tone: "warn", text: `${D.health.inFlight} ORDEM(NS) SEM RECIBO: ABRA OS CONTROLES PARA RESOLVER` });
  if (D.health.sessionDays !== null && D.health.sessionDays < 3) out.push({ tone: "warn", text: `A SESSAO DA CARTEIRA ACABA EM ${Math.max(0, Math.round(D.health.sessionDays))} DIA(S)` });

  // the lines that ask for attention come first, the rest keep their order
  const rank: Record<InsightTone, number> = { warn: 0, ok: 1, info: 2 };
  return out.map((x, i) => ({ x, i })).sort((a, b) => rank[a.x.tone] - rank[b.x.tone] || a.i - b.i).map(({ x }) => ({ tone: x.tone, text: cut(x.text) }));
}
