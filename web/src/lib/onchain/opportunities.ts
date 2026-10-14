/**
 * The opportunity board of the ecosystem (Radar, "Ecossistema"): the tokens of SEVERAL networks that the OKX OnchainOS shows at once with more than one independent
 * reading in their favour, with the facts that give a person pause beside each one. It is the answer to "where should I look, beyond what I already hold": the hot list of each
 * network crossed with the purchases of the wallets the provider tracks, pure and without a clock of its own.
 *
 * The code DESCRIBES and keeps no verdict. A token is shown with up to three readings, each a measurement written in words, and each one counts only when it passes a limit named
 * in this file (`EVIDENCE_LIMITS`); the order of the list is how many of them hold, then how much the tracked wallets put in, then the volume. The marks of care are measurements too
 * (`OPPORTUNITY_CARE`). **Every limit is a choice of this code, not a calibrated one**: nothing here was measured to predict a price, and the screen says so. What is worth doing
 * is the Inonu's call, asked by a click on the token (the click opens its chart and its holders). A value the provider left out is never a zero: it is simply not a reading.
 */
import { fmtNumber, fmtPctSigned, priceDecimalsForMagnitude } from "../desk/ui/format";
import { changeTone, type ChangeTone } from "../desk/ui/instrument-header";
import { fmtUsd } from "../mesa/onchain-rows";
import { buildOnchainRows, type OnchainRow } from "../rastreador/onchain-model";
import type { HotToken, Signal, SignalWalletType } from "./client";

/** The three independent readings. They share no input: the tracked wallets, the count of buys against sells, and the move with its volume. */
export type EvidenceId = "smart" | "fluxo" | "tracao";

export const EVIDENCE_ORDER: readonly EvidenceId[] = ["smart", "fluxo", "tracao"];

export const EVIDENCE_LABEL: Readonly<Record<EvidenceId, string>> = { smart: "Dinheiro esperto", fluxo: "Fluxo", tracao: "Tracao" };

/** The limit that makes a reading count. Chosen by this code, not calibrated. */
export const EVIDENCE_LIMITS = {
  /** At least this many tracked wallets bought the token... */
  smartWallets: 2,
  /** ...and the amount-weighted share they already sold is at most this (a token they left is not a reading in its favour). */
  smartMaxSoldPct: 60,
  /** The count of buys and sells needs this many transactions to say anything... */
  flowMinTxs: 100,
  /** ...and (buys - sells) / (buys + sells) at least this much on the side of the buys. */
  flowMinPressure: 0.1,
  /** The 24h change at least this many percent... */
  tractionMinPct: 3,
  /** ...with at least this many dollars traded in the day, so a big percentage of nothing is not a reading. */
  tractionMinVolumeUsd: 100_000,
} as const;

/** The limit that makes a fact a mark of care. Chosen by this code, not calibrated. */
export const OPPORTUNITY_CARE = {
  liquidityUsd: 50_000,
  holders: 300,
  top10Pct: 50,
  devPct: 10,
  bundlePct: 20,
  /** The OKX risk level is a whole number from 0 to 5 (the Rastreador reads it the same way). */
  riskLevel: 4,
} as const;

/** What one network gave: the hot list and the purchases of tracked wallets, each with the reason when it could not be read. A list that is null is not an empty list. */
export interface ChainScan {
  readonly chainIndex: string;
  readonly chainName: string;
  readonly hot: readonly HotToken[] | null;
  readonly signals: readonly Signal[] | null;
  /** In words, ready to show. */
  readonly hotError: string | null;
  readonly signalsError: string | null;
  readonly atMs: number;
}

export interface OpportunityEvidence {
  readonly id: EvidenceId;
  readonly label: string;
  /** The measurement in a sentence. */
  readonly text: string;
}

export interface OpportunityRow {
  readonly key: string;
  readonly chainIndex: string;
  readonly chainName: string;
  readonly address: string;
  readonly symbol: string;
  readonly price: string;
  readonly change: { readonly text: string; readonly tone: ChangeTone };
  readonly volume: string;
  readonly liquidity: string;
  /** The readings that hold, in the fixed order of `EVIDENCE_ORDER`. */
  readonly evidence: readonly OpportunityEvidence[];
  readonly marks: readonly string[];
}

export type ChainState = "ok" | "parcial" | "falhou";

export interface ChainStatus {
  readonly chainIndex: string;
  readonly chainName: string;
  readonly state: ChainState;
  /** How many tokens of the hot list were read. */
  readonly tokens: number;
  /** Why it is partial or failed, in words; null when all was read. */
  readonly note: string | null;
}

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

const TYPE_WORD: Readonly<Record<SignalWalletType, string>> = { smart_money: "smart money", kol: "KOL", whale: "baleia" };

function evidenceOf(row: OnchainRow): OpportunityEvidence[] {
  const out: OpportunityEvidence[] = [];
  const L = EVIDENCE_LIMITS;
  // 1. the tracked wallets bought it and mostly still hold it (read only when the purchases of the network were read)
  if (row.carteiras !== null && row.carteiras >= L.smartWallets && (row.vendidaPct === null || row.vendidaPct <= L.smartMaxSoldPct)) {
    const who = row.tipos.length === 0 ? "" : ` (${row.tipos.map((t) => TYPE_WORD[t]).join(", ")})`;
    const amount = row.carteirasUsd === null ? "" : ` com ${fmtUsd(row.carteirasUsd)}`;
    const sold = row.vendidaPct === null ? "" : `, ${fmtNumber(row.vendidaPct, 0)}% ja vendido`;
    out.push({ id: "smart", label: EVIDENCE_LABEL.smart, text: `${fmtNumber(row.carteiras, 0)} carteiras rastreadas${who} compraram${amount}${sold}` });
  }
  // 2. buys are most of the transactions
  if (row.pressao !== null && row.txs !== null && row.txs >= L.flowMinTxs && row.pressao >= L.flowMinPressure) {
    const share = Math.round(((1 + row.pressao) / 2) * 100);
    out.push({ id: "fluxo", label: EVIDENCE_LABEL.fluxo, text: `compras sao ${share}% dos ${fmtNumber(row.txs, 0)} negocios` });
  }
  // 3. it rises in the day with real volume
  if (row.var24hPct !== null && row.volUsd24h !== null && row.var24hPct >= L.tractionMinPct && row.volUsd24h >= L.tractionMinVolumeUsd) {
    out.push({ id: "tracao", label: EVIDENCE_LABEL.tracao, text: `${fmtPctSigned(row.var24hPct)} em 24 h com ${fmtUsd(row.volUsd24h)} negociados` });
  }
  return out;
}

function marksOf(row: OnchainRow): string[] {
  const C = OPPORTUNITY_CARE;
  const marks: string[] = [];
  if (row.liquidityUsd !== null && row.liquidityUsd < C.liquidityUsd) marks.push(`liquidez de so ${fmtUsd(row.liquidityUsd)}`);
  if (row.holders !== null && row.holders < C.holders) marks.push(`so ${fmtNumber(row.holders, 0)} detentores`);
  if (row.top10HoldPct !== null && row.top10HoldPct >= C.top10Pct) marks.push(`as 10 maiores carteiras tem ${fmtNumber(row.top10HoldPct, 0)}%`);
  if (row.devHoldPct !== null && row.devHoldPct >= C.devPct) marks.push(`o criador tem ${fmtNumber(row.devHoldPct, 0)}%`);
  if (row.bundleHoldPct !== null && row.bundleHoldPct >= C.bundlePct) marks.push(`bundlers com ${fmtNumber(row.bundleHoldPct, 0)}%`);
  if (row.riskLevel !== null && row.riskLevel >= C.riskLevel) marks.push(`nivel de risco ${row.riskLevel} de 5 na OKX`);
  return marks;
}

function statusOf(scan: ChainScan, tokens: number): ChainStatus {
  const base = { chainIndex: scan.chainIndex, chainName: scan.chainName, tokens };
  if (scan.hot === null) return { ...base, state: "falhou", note: scan.hotError ?? "A lista de tokens nao foi lida" };
  if (scan.signals === null) return { ...base, state: "parcial", note: `${scan.signalsError ?? "As compras de carteiras rastreadas nao foram lidas"}: so fluxo e tracao puderam ser lidos` };
  return { ...base, state: "ok", note: null };
}

const price = (p: number | null): string => (p === null ? "-" : `US$ ${fmtNumber(p, priceDecimalsForMagnitude(p))}`);

/**
 * The board: every token of every scanned network that has at least one reading in its favour, most readings first. `total` is how many qualified before the cut to `max`
 * (the budget of a tab of the dock is twelve, INF-1), and `chains` says what each network gave, so a network that failed is not mistaken for one with nothing in it.
 */
export function opportunityBoard(scans: readonly ChainScan[], max = 12): { readonly rows: readonly OpportunityRow[]; readonly total: number; readonly chains: readonly ChainStatus[] } {
  const ranked: { readonly row: OpportunityRow; readonly smartUsd: number; readonly volume: number }[] = [];
  const chains: ChainStatus[] = [];
  for (const scan of scans) {
    const built = scan.hot === null ? [] : buildOnchainRows(scan.hot, scan.signals);
    chains.push(statusOf(scan, built.length));
    for (const r of built) {
      const evidence = evidenceOf(r);
      if (evidence.length === 0) continue;
      ranked.push({
        row: {
          key: r.id,
          chainIndex: r.chainIndex,
          chainName: scan.chainName,
          address: r.address,
          symbol: r.symbol,
          price: price(r.preco),
          change: { text: r.var24hPct === null ? "-" : fmtPctSigned(r.var24hPct), tone: changeTone(r.var24hPct) },
          volume: fmtUsd(r.volUsd24h),
          liquidity: fmtUsd(r.liquidityUsd),
          evidence,
          marks: marksOf(r),
        },
        smartUsd: finite(r.carteirasUsd) ? r.carteirasUsd : -1,
        volume: finite(r.volUsd24h) ? r.volUsd24h : -1,
      });
    }
  }
  ranked.sort((a, b) => b.row.evidence.length - a.row.evidence.length || b.smartUsd - a.smartUsd || b.volume - a.volume || (a.row.key < b.row.key ? -1 : 1));
  return { rows: ranked.slice(0, Math.max(0, max)).map((r) => r.row), total: ranked.length, chains };
}
