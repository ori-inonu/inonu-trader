/**
 * The answer of "Pedir ao Inonu: as melhores oportunidades", read strictly, and the cards a person reads: for each pick the size the Inonu chose with the dollars the core computed from the
 * balance, the family of evidence that weighed most, and, in plain words, every measurement behind it and every mark of care. The model never writes a word of what is shown here: it chose
 * among closed options and the core checked them; the sentences are written from the measurements, so each one can be verified against the market.
 *
 * Pure: no clock, no network, no storage. Every unknown is a dash, never a zero.
 */
import { fmtNumber, fmtPctSigned, priceDecimalsForMagnitude } from "../desk/ui/format";
import { fmtUsd } from "../mesa/onchain-rows";
import { CHAIN_ORDER } from "../onchain/chains";

export const FAMILIES = ["carteiras", "fluxo", "liquidez", "distribuicao", "tracao", "seguranca"] as const;
export type Family = (typeof FAMILIES)[number];
export const MARK_IDS = ["concentracao", "criador", "bundlers", "liquidez_baixa", "poucos_detentores", "risco_alto", "sinal_de_risco"] as const;
export type MarkId = (typeof MARK_IDS)[number];
export type BuySize = "buy_third" | "buy_two_thirds" | "buy_full";
export type Binding = "caixa" | "reserva" | "risco" | "liquidez" | "volume" | "sem_saldo" | "sem_dado" | "minimo";

const SIZES: readonly string[] = ["buy_third", "buy_two_thirds", "buy_full"];
const BINDINGS: readonly string[] = ["caixa", "reserva", "risco", "liquidez", "volume", "sem_saldo", "sem_dado", "minimo"];

export interface PickFacts {
  readonly candidateId: string;
  readonly chainIndex: string;
  readonly address: string;
  readonly symbol: string;
  readonly nota: number | null;
  readonly priceUsd: number | null;
  readonly changePct: number | null;
  readonly volumeUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly holders: number | null;
  readonly buyShare: number | null;
  readonly txs: number | null;
  readonly top10Pct: number | null;
  readonly devPct: number | null;
  readonly bundlePct: number | null;
  readonly riskLevel: number | null;
  readonly riskFlags: readonly string[];
  readonly wallets: number | null;
  readonly walletsUsd: number | null;
  readonly soldPct: number | null;
}

export interface Pick {
  readonly rank: number;
  readonly candidateId: string;
  readonly chainIndex: string;
  readonly address: string;
  readonly symbol: string;
  readonly size: BuySize;
  readonly fraction: number;
  readonly usd: number;
  readonly capUsd: number;
  readonly binding: Binding;
  readonly scaled: boolean;
  readonly driver: Family | null;
  readonly families: readonly Family[];
  readonly marks: readonly MarkId[];
  readonly facts: PickFacts;
}

export interface EcoAnswer {
  readonly observedAtMs: number;
  readonly saldo: { readonly totalUsd: number; readonly cashUsd: number } | null;
  readonly picks: readonly Pick[];
  readonly decisions?: readonly EcoDecision[];
  readonly considered: number;
  readonly excluded: Readonly<Record<string, number>>;
}

export interface EcoDecision {
  readonly candidateId: string;
  readonly chainIndex: string;
  readonly address: string;
  readonly symbol: string;
  readonly stance: BuySize | "watch" | "skip";
  readonly rank: number | null;
  readonly driver: Family | null;
  readonly families: readonly Family[];
  readonly marks: readonly MarkId[];
  readonly facts: PickFacts;
}

function parseDecision(raw: unknown): EcoDecision | null {
  if (!isRec(raw) || typeof raw.stance !== "string" || ![...SIZES, "watch", "skip"].includes(raw.stance)) return null;
  if (raw.rank !== null && (!Number.isInteger(raw.rank) || (raw.rank as number) < 1 || (raw.rank as number) > 3 || raw.stance === "skip")) return null;
  if (raw.driver !== null && !(typeof raw.driver === "string" && (FAMILIES as readonly string[]).includes(raw.driver))) return null;
  if (!Array.isArray(raw.families) || !raw.families.every((f) => (FAMILIES as readonly unknown[]).includes(f)) || new Set(raw.families).size !== raw.families.length) return null;
  if (raw.driver !== null && !raw.families.includes(raw.driver)) return null;
  if (!Array.isArray(raw.marks) || !raw.marks.every((m) => (MARK_IDS as readonly unknown[]).includes(m)) || new Set(raw.marks).size !== raw.marks.length) return null;
  const facts = parseFacts(raw.facts);
  if (facts === null || raw.candidateId !== facts.candidateId || raw.chainIndex !== facts.chainIndex || raw.address !== facts.address || raw.symbol !== facts.symbol || raw.candidateId !== `token:${facts.chainIndex}:${facts.address}`) return null;
  return raw as unknown as EcoDecision;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): v is number | null => v === null || isNum(v);
const sameList = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
const sameFacts = (a: PickFacts, b: PickFacts): boolean => (Object.keys(a) as (keyof PickFacts)[]).every((k) => k === "riskFlags" ? sameList(a.riskFlags, b.riskFlags) : a[k] === b[k]) && Object.keys(a).length === Object.keys(b).length;
const CHAIN = /^[1-9]\d{0,11}$/;
const SYMBOL = /^[A-Za-z0-9]{1,20}$/;
const ADDRESS = /^[A-Za-z0-9]{20,64}$/;

function parseFacts(raw: unknown): PickFacts | null {
  if (!isRec(raw)) return null;
  for (const k of ["nota", "priceUsd", "changePct", "volumeUsd", "liquidityUsd", "marketCapUsd", "holders", "buyShare", "txs", "top10Pct", "devPct", "bundlePct", "riskLevel", "wallets", "walletsUsd", "soldPct"] as const) if (!numOrNull(raw[k])) return null;
  if (typeof raw.candidateId !== "string" || typeof raw.chainIndex !== "string" || !CHAIN.test(raw.chainIndex) || typeof raw.address !== "string" || !ADDRESS.test(raw.address) || typeof raw.symbol !== "string" || !SYMBOL.test(raw.symbol)) return null;
  if (!Array.isArray(raw.riskFlags) || raw.riskFlags.length > 8 || !raw.riskFlags.every((f) => typeof f === "string" && /^[a-zA-Z0-9_.-]{1,40}$/.test(f))) return null;
  return raw as unknown as PickFacts;
}

function parsePick(raw: unknown): Pick | null {
  if (!isRec(raw)) return null;
  if (!Number.isInteger(raw.rank) || (raw.rank as number) < 1 || (raw.rank as number) > 3) return null;
  if (typeof raw.size !== "string" || !SIZES.includes(raw.size) || typeof raw.binding !== "string" || !BINDINGS.includes(raw.binding)) return null;
  if (!isNum(raw.fraction) || raw.fraction <= 0 || raw.fraction > 1 || !isNum(raw.usd) || raw.usd < 0 || !isNum(raw.capUsd) || raw.capUsd < 0 || raw.usd > raw.capUsd || typeof raw.scaled !== "boolean") return null;
  if (raw.driver !== null && !(typeof raw.driver === "string" && (FAMILIES as readonly string[]).includes(raw.driver))) return null;
  if (!Array.isArray(raw.families) || !raw.families.every((f) => typeof f === "string" && (FAMILIES as readonly string[]).includes(f))) return null;
  if (!Array.isArray(raw.marks) || !raw.marks.every((m) => typeof m === "string" && (MARK_IDS as readonly string[]).includes(m))) return null;
  const facts = parseFacts(raw.facts);
  if (facts === null) return null;
  if (typeof raw.candidateId !== "string" || raw.candidateId !== facts.candidateId || raw.chainIndex !== facts.chainIndex || raw.address !== facts.address || raw.symbol !== facts.symbol) return null;
  return raw as unknown as Pick;
}

/** The closed shape of the answer, or null: nothing outside it is trusted, and a pick that is not exactly the shape makes the whole answer null (a wrong amount must not be shown). */
export function parseEcoAnswer(raw: unknown): EcoAnswer | null {
  if (!isRec(raw) || !isNum(raw.observedAtMs) || !Array.isArray(raw.picks) || raw.picks.length > 3 || !isNum(raw.considered) || !isRec(raw.excluded)) return null;
  if (!Object.values(raw.excluded).every((v) => isNum(v) && v >= 0)) return null;
  let saldo: EcoAnswer["saldo"] = null;
  if (raw.saldo !== null) {
    if (!isRec(raw.saldo) || !isNum(raw.saldo.totalUsd) || !isNum(raw.saldo.cashUsd) || raw.saldo.totalUsd < 0 || raw.saldo.cashUsd < 0) return null;
    saldo = { totalUsd: raw.saldo.totalUsd, cashUsd: raw.saldo.cashUsd };
  }
  const picks: Pick[] = [];
  for (const item of raw.picks) {
    const pick = parsePick(item);
    if (pick === null) return null;
    picks.push(pick);
  }
  if (picks.some((p, i) => p.rank !== i + 1)) return null;
  let decisions: EcoDecision[] | undefined;
  if (raw.decisions !== undefined) {
    if (!Array.isArray(raw.decisions) || raw.decisions.length !== raw.considered) return null;
    decisions = [];
    for (const item of raw.decisions) {
      const decision = parseDecision(item);
      if (decision === null || decisions.some((d) => d.candidateId === decision.candidateId || (decision.rank !== null && d.rank === decision.rank))) return null;
      decisions.push(decision);
    }
    const ranked = decisions.filter((d) => d.rank !== null).sort((a, b) => a.rank! - b.rank!);
    const buys = ranked.filter((d) => SIZES.includes(d.stance));
    if (buys.length !== picks.length || buys.some((d, i) => d.candidateId !== picks[i]!.candidateId || d.stance !== picks[i]!.size || d.driver !== picks[i]!.driver || !sameList(d.families, picks[i]!.families) || !sameList(d.marks, picks[i]!.marks) || !sameFacts(d.facts, picks[i]!.facts))) return null;
  }
  return { observedAtMs: raw.observedAtMs, saldo, picks, ...(decisions === undefined ? {} : { decisions }), considered: raw.considered, excluded: raw.excluded as Record<string, number> };
}

/* ---------------------------------------------------------------- the words of the cards */

export const FAMILY_LABEL: Readonly<Record<Family, string>> = {
  carteiras: "Carteiras rastreadas",
  fluxo: "Fluxo de compras",
  liquidez: "Liquidez",
  distribuicao: "Distribuicao da oferta",
  tracao: "Tracao",
  seguranca: "Seguranca",
};

export const SIZE_LABEL: Readonly<Record<BuySize, string>> = { buy_third: "Pequeno", buy_two_thirds: "Medio", buy_full: "Cheio" };
const SIZE_NOTE: Readonly<Record<BuySize, string>> = { buy_third: "um terco do teto", buy_two_thirds: "dois tercos do teto", buy_full: "o teto inteiro" };

const BINDING_TEXT: Readonly<Record<Binding, string>> = {
  risco: "O teto vem do risco: quanto da carteira voce aceita perder numa operacao",
  liquidez: "O teto vem da liquidez do pool: uma ordem maior moveria o preco",
  volume: "O teto vem do volume de 24 h do token",
  caixa: "O teto vem do caixa da rede",
  reserva: "A reserva de caixa da carteira nao deixa gastar mais",
  sem_saldo: "Nao ha caixa em moeda estavel nesta rede",
  sem_dado: "O saldo nao foi lido",
  minimo: "O teto fica abaixo da ordem minima de US$ 10",
};

const pct = (v: number | null, digits = 0): string => (v === null ? "-" : `${fmtNumber(v, digits)}%`);

export function chainName(chainIndex: string): string {
  return CHAIN_ORDER.find((c) => c.chainIndex === chainIndex)?.name ?? `Rede ${chainIndex}`;
}

/** What each family means for this pick, as a measurement in a sentence: the same numbers the core used to say it was in the pick's favour. */
export function familyText(family: Family, f: PickFacts): string {
  switch (family) {
    case "carteiras":
      return `${f.wallets === null ? "-" : fmtNumber(f.wallets, 0)} carteiras rastreadas compraram${f.walletsUsd === null ? "" : ` ${fmtUsd(f.walletsUsd)}`}${f.soldPct === null ? "" : `, ${pct(f.soldPct)} ja vendido`}`;
    case "fluxo":
      return `compras sao ${f.buyShare === null ? "-" : pct(f.buyShare * 100)} dos ${f.txs === null ? "-" : fmtNumber(f.txs, 0)} negocios`;
    case "liquidez":
      return `pool de ${fmtUsd(f.liquidityUsd)}`;
    case "distribuicao":
      return `as 10 maiores carteiras tem ${pct(f.top10Pct)}${f.devPct === null ? "" : `, o criador ${pct(f.devPct)}`}${f.bundlePct === null ? "" : `, bundlers ${pct(f.bundlePct)}`}`;
    case "tracao":
      return `${f.changePct === null ? "-" : fmtPctSigned(f.changePct)} em 24 h com ${fmtUsd(f.volumeUsd)} negociados`;
    case "seguranca":
      return `nivel de risco ${f.riskLevel === null ? "-" : `${f.riskLevel} de 5`} na OKX e nenhum alerta de risco`;
  }
}

export function markText(mark: MarkId, f: PickFacts): string {
  switch (mark) {
    case "concentracao":
      return `as 10 maiores carteiras tem ${pct(f.top10Pct)} da oferta`;
    case "criador":
      return `o criador tem ${pct(f.devPct)} da oferta`;
    case "bundlers":
      return `bundlers com ${pct(f.bundlePct)} da oferta`;
    case "liquidez_baixa":
      return `liquidez de so ${fmtUsd(f.liquidityUsd)}`;
    case "poucos_detentores":
      return `so ${f.holders === null ? "-" : fmtNumber(f.holders, 0)} detentores`;
    case "risco_alto":
      return `nivel de risco ${f.riskLevel === null ? "-" : `${f.riskLevel} de 5`} na OKX`;
    case "sinal_de_risco":
      return `a OKX marca um alerta de risco${f.riskFlags.length === 0 ? "" : `: ${f.riskFlags.join(", ")}`}`;
  }
}

export interface PickCard {
  readonly rank: number;
  readonly candidateId: string;
  readonly chainIndex: string;
  readonly address: string;
  readonly symbol: string;
  readonly chain: string;
  readonly price: string;
  readonly change: string;
  readonly size: BuySize;
  readonly sizeLabel: string;
  readonly sizeNote: string;
  /** "US$ 133" or why there is no amount. */
  readonly amount: string;
  /** The same amount as a number of dollars, zero when there is none: what the order panel offers as the size. */
  readonly usd: number;
  /** "1,3% da carteira" when there is an amount and a portfolio. */
  readonly share: string | null;
  /** Why the ceiling is what it is. */
  readonly capNote: string;
  readonly hasAmount: boolean;
  readonly driver: { readonly id: Family; readonly label: string } | null;
  /** Every family that is in its favour, the one the Inonu said weighed most marked. */
  readonly families: readonly { readonly id: Family; readonly label: string; readonly text: string; readonly main: boolean }[];
  readonly marks: readonly string[];
  readonly supportLine: string;
}

export interface TokenCard {
  readonly chainIndex: string;
  readonly address: string;
  readonly symbol: string;
}

export interface WatchCard extends TokenCard {
  readonly action: "watch";
  readonly rank: number;
  readonly candidateId: string;
  readonly chain: string;
  readonly price: string;
  readonly change: string;
  readonly driver: PickCard["driver"];
  readonly families: PickCard["families"];
  readonly marks: PickCard["marks"];
  readonly supportLine: string;
}

export type DecisionCard = WatchCard | (PickCard & { readonly action: "buy" });

/** Only priorities returned by the model. Legacy answers retain their buy cards. */
export function decisionCards(answer: EcoAnswer): DecisionCard[] {
  const buys = pickCards(answer);
  if (answer.decisions === undefined) return buys.map((p) => ({ ...p, action: "buy" }));
  return answer.decisions.filter((d) => d.rank !== null && d.stance !== "skip").sort((a, b) => a.rank! - b.rank!).flatMap((d): DecisionCard[] => {
    if (d.stance !== "watch") {
      const p = buys.find((p) => p.candidateId === d.candidateId);
      return p === undefined ? [] : [{ ...p, rank: d.rank!, action: "buy" }];
    }
    const f = d.facts;
    return [{ action: "watch", rank: d.rank!, candidateId: d.candidateId, chainIndex: d.chainIndex, address: d.address, symbol: d.symbol,
      chain: chainName(d.chainIndex), price: f.priceUsd === null ? "-" : `US$ ${fmtNumber(f.priceUsd, priceDecimalsForMagnitude(f.priceUsd))}`, change: f.changePct === null ? "-" : fmtPctSigned(f.changePct),
      driver: d.driver === null ? null : { id: d.driver, label: FAMILY_LABEL[d.driver] },
      families: d.families.map((id) => ({ id, label: FAMILY_LABEL[id], text: familyText(id, f), main: id === d.driver })),
      marks: d.marks.map((m) => markText(m, f)), supportLine: `${d.families.length} de ${FAMILIES.length} familias de evidencia a favor` }];
  });
}

export function pickCards(answer: EcoAnswer): PickCard[] {
  return answer.picks.map((p): PickCard => {
    const f = p.facts;
    const hasAmount = p.usd > 0;
    const total = answer.saldo?.totalUsd ?? null;
    return {
      rank: p.rank,
      candidateId: p.candidateId,
      chainIndex: p.chainIndex,
      address: p.address,
      symbol: p.symbol,
      chain: chainName(p.chainIndex),
      price: f.priceUsd === null ? "-" : `US$ ${fmtNumber(f.priceUsd, priceDecimalsForMagnitude(f.priceUsd))}`,
      change: f.changePct === null ? "-" : fmtPctSigned(f.changePct),
      size: p.size,
      sizeLabel: SIZE_LABEL[p.size],
      sizeNote: SIZE_NOTE[p.size],
      amount: answer.saldo === null ? "Saldo nao lido: sem valor" : hasAmount ? `US$ ${fmtNumber(p.usd, 0)}` : p.capUsd > 0 ? "Sem caixa para este tamanho agora" : "Sem valor: nao ha teto",
      share: hasAmount && total !== null && total > 0 ? `${fmtNumber((p.usd / total) * 100, p.usd / total < 0.1 ? 1 : 0)}% da carteira` : null,
      capNote: p.capUsd > 0 ? `${BINDING_TEXT[p.binding]} (teto de US$ ${fmtNumber(p.capUsd, 0)}${p.scaled && hasAmount ? ", reduzido pelo caixa" : ""})` : BINDING_TEXT[p.binding],
      hasAmount,
      usd: hasAmount ? p.usd : 0,
      driver: p.driver === null ? null : { id: p.driver, label: FAMILY_LABEL[p.driver] },
      families: p.families.map((id) => ({ id, label: FAMILY_LABEL[id], text: familyText(id, f), main: id === p.driver })),
      marks: p.marks.map((m) => markText(m, f)),
      supportLine: `${p.families.length} de ${FAMILIES.length} familias de evidencia a favor${p.marks.length === 0 ? ", nenhuma marca de cuidado" : `, ${p.marks.length} ${p.marks.length === 1 ? "marca" : "marcas"} de cuidado`}`,
    };
  });
}

/* ---------------------------------------------------------------- what was left out, and how old the reading is */

const EXCLUDED_TEXT: Readonly<Record<string, string>> = {
  honeypot: "a OKX marca como honeypot, token que trava a saida",
  pool_ou_detentores: "sem pool de US$ 20 mil ou sem 100 detentores",
  pouco_apoio: "com menos de 2 familias de evidencia a favor",
};

/** One sentence about the candidates: how many reached the Inonu and what the code left out before it, by reason. Never a guess: it is the count the core reported. */
export function excludedLine(answer: EcoAnswer): string {
  const left = Object.entries(answer.excluded).filter(([, n]) => n > 0);
  const head = `${answer.considered} ${answer.considered === 1 ? "candidato chegou" : "candidatos chegaram"} ao Inonu`;
  if (left.length === 0) return `${head}.`;
  const parts = left.map(([reason, n]) => `${n} ${EXCLUDED_TEXT[reason] ?? "fora por outra regra de entrada"}`);
  return `${head}. Ficaram de fora antes dele: ${parts.join("; ")}.`;
}

/** After this the reading is old for a decision about prices that move in minutes: the screen says so and asks for another. */
export const PICKS_STALE_MS = 15 * 60_000;

export function picksAgeText(atMs: number, nowMs: number): string {
  if (!Number.isFinite(atMs) || !Number.isFinite(nowMs)) return "-";
  const s = Math.max(0, Math.round((nowMs - atMs) / 1000));
  if (s < 60) return "ha menos de 1 min";
  const m = Math.floor(s / 60);
  if (m < 60) return `ha ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `ha ${h} h` : `ha ${Math.floor(h / 24)} d`;
}
