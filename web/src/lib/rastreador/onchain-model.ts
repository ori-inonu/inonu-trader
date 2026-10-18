/**
 * The on-chain universe of the Rastreador (RAS-2, RAS-3, RAS-4): the tokens of ONE network from the hot list of the OnchainOS gateway, with the
 * smart money signals of the same network added only when they were read. A value the provider did not give is `null` and the cell shows a dash
 * with the reason, never a made up number. Wallets are the sum of the counts of the signals, an upper bound because one wallet can appear in
 * several; the sold share is weighted by the amount. The pressure of the flow is the measured ratio of buys to sells with a descriptive word,
 * never an instruction (FLX-10).
 *
 * Pure: no clock, no network, no storage.
 */
import { fmtCompact, fmtNumber, fmtPctSigned, priceDecimalsForMagnitude } from "../desk/ui/format";
import type { HotToken, Signal, SignalWalletType } from "../onchain/client";
import type { Cell } from "./cells";
import { pressureLabel } from "./model";

export interface OnchainRow {
  /** `chainIndex:address`: the identity of a token is the pair, never the symbol. */
  readonly id: string;
  readonly chainIndex: string;
  readonly address: string;
  readonly symbol: string;
  readonly preco: number | null;
  readonly var24hPct: number | null;
  readonly volUsd24h: number | null;
  readonly marketCap: number | null;
  readonly liquidityUsd: number | null;
  readonly holders: number | null;
  /** (buys - sells) / (buys + sells) of the transactions, in [-1, 1]; null when the counts are missing or both zero. */
  readonly pressao: number | null;
  readonly txs: number | null;
  readonly riskLevel: number | null;
  readonly top10HoldPct: number | null;
  readonly devHoldPct: number | null;
  readonly bundleHoldPct: number | null;
  /** Null until the signals were read; zero is a reading (the network has no signal for this token). */
  readonly carteiras: number | null;
  readonly carteirasUsd: number | null;
  readonly vendidaPct: number | null;
  readonly tipos: readonly SignalWalletType[];
  /** Position by volume of the day across the tokens read. */
  readonly rank: number | null;
}

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const orNull = (v: number | null | undefined): number | null => (finite(v) ? v : null);
/** The risk level of the OKX is a whole number from 0 to 5; anything else is not a level. */
const riskOrNull = (v: number | null | undefined): number | null => (finite(v) && Number.isInteger(v) && v >= 0 && v <= 5 ? v : null);
/** An EVM address has no case, so the same address in two cases is one token; any other address is case sensitive and kept as it is. */
const addressKey = (address: string): string => (/^0x[0-9a-fA-F]+$/.test(address) ? address.toLowerCase() : address);

function pressureOf(buy: number | null, sell: number | null): { pressao: number | null; txs: number | null } {
  if (!finite(buy) || !finite(sell) || buy < 0 || sell < 0) return { pressao: null, txs: null };
  const total = buy + sell;
  return { pressao: total > 0 ? (buy - sell) / total : null, txs: total };
}

interface Aggregate {
  carteiras: number;
  usd: number;
  weighted: number;
  valid: number;
  tipos: Set<SignalWalletType>;
}

function aggregate(signals: readonly Signal[]): Map<string, Aggregate> {
  const byToken = new Map<string, Aggregate>();
  for (const s of signals) {
    const address = s.token.address === null || s.token.address === "" ? null : addressKey(s.token.address);
    if (address === null) continue;
    const entry = byToken.get(address) ?? { carteiras: 0, usd: 0, weighted: 0, valid: 0, tipos: new Set<SignalWalletType>() };
    if (finite(s.walletCount) && s.walletCount >= 0) entry.carteiras += s.walletCount;
    entry.tipos.add(s.walletType);
    if (s.amountUsd > 0 && finite(s.amountUsd) && finite(s.soldRatioPct) && s.soldRatioPct >= 0 && s.soldRatioPct <= 100) {
      entry.usd += s.amountUsd;
      entry.weighted += s.amountUsd * s.soldRatioPct;
      entry.valid += 1;
    }
    byToken.set(address, entry);
  }
  return byToken;
}

const TYPE_ORDER: readonly SignalWalletType[] = ["smart_money", "kol", "whale"];

/** The rows of one network. `signals` is null while they were not read, which is different from a network that has none. */
export function buildOnchainRows(hot: readonly HotToken[], signals: readonly Signal[] | null): OnchainRow[] {
  const seen = new Set<string>();
  const kept: HotToken[] = [];
  for (const t of hot) {
    if (t.symbol === "" || t.address === "" || t.chainIndex === "") continue;
    const id = `${t.chainIndex}:${addressKey(t.address)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    kept.push({ ...t, address: addressKey(t.address) });
  }
  const ranked = kept
    .filter((t) => finite(t.volumeUsd))
    .sort((a, b) => b.volumeUsd - a.volumeUsd || (a.address < b.address ? -1 : 1));
  const position = new Map(ranked.map((t, i) => [t.address, i + 1]));
  const sums = signals === null ? null : aggregate(signals);
  const rows = kept.map((t): OnchainRow => {
    const { pressao, txs } = pressureOf(t.txsBuy, t.txsSell);
    const agg = sums === null ? null : sums.get(t.address) ?? null;
    return {
      id: `${t.chainIndex}:${t.address}`,
      chainIndex: t.chainIndex,
      address: t.address,
      symbol: t.symbol,
      preco: finite(t.price) && t.price > 0 ? t.price : null,
      var24hPct: orNull(t.changePct),
      volUsd24h: orNull(t.volumeUsd),
      marketCap: orNull(t.marketCap),
      liquidityUsd: orNull(t.liquidityUsd),
      holders: orNull(t.holders),
      pressao,
      txs,
      riskLevel: riskOrNull(t.riskLevel),
      top10HoldPct: orNull(t.top10HoldPct),
      devHoldPct: orNull(t.devHoldPct),
      bundleHoldPct: orNull(t.bundleHoldPct),
      carteiras: sums === null ? null : agg === null ? 0 : agg.carteiras,
      carteirasUsd: sums === null ? null : agg === null ? 0 : agg.valid > 0 ? agg.usd : null,
      vendidaPct: agg === null || agg.valid === 0 || agg.usd <= 0 ? null : agg.weighted / agg.usd,
      tipos: agg === null ? [] : TYPE_ORDER.filter((type) => agg.tipos.has(type)),
      rank: position.get(t.address) ?? null,
    };
  });
  return rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || (a.id < b.id ? -1 : 1));
}

// ------------------------------------------------------------------------------------------------------------------ filters

export interface OnchainFilters {
  readonly busca: string;
  readonly volUsdMin: number | null;
  readonly liquidezMin: number | null;
  readonly holdersMin: number | null;
  /** Wallets in the signals; does nothing while the signals were not read. */
  readonly carteirasMin: number | null;
  readonly varMin: number | null;
  readonly varMax: number | null;
  readonly riscoMax: number | null;
}

export const DEFAULT_ONCHAIN_FILTERS: OnchainFilters = { busca: "", volUsdMin: null, liquidezMin: null, holdersMin: null, carteirasMin: null, varMin: null, varMax: null, riscoMax: null };

/**
 * A row that does not have the data of an active filter is left out: an unknown value cannot satisfy a limit. The one exception is the
 * wallet filter before the signals were read, which would otherwise hide every row for a reading nobody has made.
 */
export function applyOnchainFilters(rows: readonly OnchainRow[], f: OnchainFilters): OnchainRow[] {
  const needle = f.busca.trim().toLowerCase();
  const atLeast = (value: number | null, min: number | null): boolean => min === null || (value !== null && value >= min);
  return rows.filter((r) => {
    if (needle !== "" && !r.symbol.toLowerCase().includes(needle) && !r.address.toLowerCase().includes(needle)) return false;
    if (!atLeast(r.volUsd24h, f.volUsdMin) || !atLeast(r.liquidityUsd, f.liquidezMin) || !atLeast(r.holders, f.holdersMin)) return false;
    if (r.carteiras !== null && !atLeast(r.carteiras, f.carteirasMin)) return false;
    if (!atLeast(r.var24hPct, f.varMin)) return false;
    if (f.varMax !== null && (r.var24hPct === null || r.var24hPct > f.varMax)) return false;
    if (f.riscoMax !== null && (r.riskLevel === null || r.riskLevel > f.riscoMax)) return false;
    return true;
  });
}

// ------------------------------------------------------------------------------------------------------------------ sort

export type OnchainSortKey =
  | "rank" | "ativo" | "preco" | "var24h" | "vol" | "mcap" | "liquidez" | "holders" | "pressao" | "carteiras" | "usd" | "vendida" | "risco" | "top10" | "dev" | "bundlers";

export interface OnchainSort {
  readonly key: OnchainSortKey;
  readonly dir: "asc" | "desc";
}

export const DEFAULT_ONCHAIN_SORT: OnchainSort = { key: "vol", dir: "desc" };

function valueFor(row: OnchainRow, key: OnchainSortKey): number | string | null {
  switch (key) {
    case "rank": return row.rank;
    case "ativo": return row.symbol.toLowerCase();
    case "preco": return row.preco;
    case "var24h": return row.var24hPct;
    case "vol": return row.volUsd24h;
    case "mcap": return row.marketCap;
    case "liquidez": return row.liquidityUsd;
    case "holders": return row.holders;
    case "pressao": return row.pressao;
    case "carteiras": return row.carteiras;
    case "usd": return row.carteirasUsd;
    case "vendida": return row.vendidaPct;
    case "risco": return row.riskLevel;
    case "top10": return row.top10HoldPct;
    case "dev": return row.devHoldPct;
    case "bundlers": return row.bundleHoldPct;
  }
}

/** Stable: a tie keeps the order of the rank, so the table does not jump. A row with no value is always last, whichever way it is sorted. */
export function sortOnchain(rows: readonly OnchainRow[], sort: OnchainSort): OnchainRow[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = valueFor(a, sort.key);
    const y = valueFor(b, sort.key);
    if (x === null && y === null) return (a.rank ?? Infinity) - (b.rank ?? Infinity);
    if (x === null) return 1;
    if (y === null) return -1;
    const order = typeof x === "string" && typeof y === "string" ? (x < y ? -1 : x > y ? 1 : 0) : (x as number) - (y as number);
    return order !== 0 ? sign * order : (a.rank ?? Infinity) - (b.rank ?? Infinity) || (a.id < b.id ? -1 : 1);
  });
}

// ------------------------------------------------------------------------------------------------------------------ views

export type OnchainCellId = "rank" | "ativo" | "preco" | "var24h" | "vol" | "mcap" | "liquidez" | "holders" | "pressao" | "carteiras" | "usd" | "vendida" | "tipo" | "risco" | "top10" | "dev" | "bundlers";
export type OnchainViewId = "geral" | "smart" | "risco";

export interface OnchainColumn {
  readonly id: OnchainCellId;
  readonly label: string;
  readonly numeric: boolean;
  readonly sortKey: OnchainSortKey | null;
  readonly tip: string;
}

export interface OnchainView {
  readonly id: OnchainViewId;
  readonly label: string;
  /** The view needs the signals of the network; they are read when it is opened, not before. */
  readonly needsSignals: boolean;
  readonly columns: readonly OnchainColumn[];
}

const COL: Readonly<Record<OnchainCellId, OnchainColumn>> = {
  rank: { id: "rank", label: "Rank", numeric: true, sortKey: "rank", tip: "Posicao pelo volume em USD de 24 h entre os tokens lidos" },
  ativo: { id: "ativo", label: "Ativo", numeric: false, sortKey: "ativo", tip: "Simbolo; o endereco esta no detalhe" },
  preco: { id: "preco", label: "Preco", numeric: true, sortKey: "preco", tip: "Ultimo preco em USD" },
  var24h: { id: "var24h", label: "Var 24h", numeric: true, sortKey: "var24h", tip: "Variacao do preco em 24 horas" },
  vol: { id: "vol", label: "Vol USD 24h", numeric: true, sortKey: "vol", tip: "Volume negociado em USD nas ultimas 24 horas" },
  mcap: { id: "mcap", label: "Valor de mercado", numeric: true, sortKey: "mcap", tip: "Valor de mercado em USD informado pela OKX" },
  liquidez: { id: "liquidez", label: "Liquidez", numeric: true, sortKey: "liquidez", tip: "Liquidez em USD informada pela OKX" },
  holders: { id: "holders", label: "Holders", numeric: true, sortKey: "holders", tip: "Enderecos com saldo" },
  pressao: { id: "pressao", label: "Pressao de fluxo", numeric: true, sortKey: "pressao", tip: "Diferenca entre as transacoes de compradores e de vendedores, dividida pelo total; descreve o lado que mais negociou" },
  carteiras: { id: "carteiras", label: "Carteiras", numeric: true, sortKey: "carteiras", tip: "Soma das carteiras dos registros: um limite superior, porque a mesma carteira pode estar em mais de um" },
  usd: { id: "usd", label: "USD rastreado", numeric: true, sortKey: "usd", tip: "Soma dos valores dos registros com fracao vendida conhecida" },
  vendida: { id: "vendida", label: "Fracao vendida", numeric: true, sortKey: "vendida", tip: "Parte do que foi comprado que ja foi vendida, ponderada pelo valor" },
  tipo: { id: "tipo", label: "Tipo", numeric: false, sortKey: null, tip: "SM carteira inteligente, KOL, Baleia" },
  risco: { id: "risco", label: "Risco", numeric: true, sortKey: "risco", tip: "Nivel de risco informado pela OKX, de 0 a 5" },
  top10: { id: "top10", label: "% top 10", numeric: true, sortKey: "top10", tip: "Parte da oferta nas 10 maiores carteiras" },
  dev: { id: "dev", label: "% dev", numeric: true, sortKey: "dev", tip: "Parte da oferta com o criador" },
  bundlers: { id: "bundlers", label: "% bundlers", numeric: true, sortKey: "bundlers", tip: "Parte da oferta com carteiras agrupadas na criacao" },
};

export const ONCHAIN_VIEW_ORDER: readonly OnchainViewId[] = ["geral", "smart", "risco"];

export const ONCHAIN_VIEWS: Readonly<Record<OnchainViewId, OnchainView>> = {
  geral: { id: "geral", label: "Visao geral", needsSignals: false, columns: [COL.rank, COL.ativo, COL.preco, COL.var24h, COL.vol, COL.mcap, COL.liquidez, COL.holders, COL.pressao] },
  smart: { id: "smart", label: "Smart money", needsSignals: true, columns: [COL.ativo, COL.carteiras, COL.usd, COL.vendida, COL.tipo] },
  risco: { id: "risco", label: "Risco", needsSignals: false, columns: [COL.ativo, COL.risco, COL.top10, COL.dev, COL.bundlers, COL.liquidez, COL.holders] },
};

// ------------------------------------------------------------------------------------------------------------------ cells

export type OnchainCells = Readonly<Record<OnchainCellId, Cell>>;

const NONE = (title: string): Cell => ({ text: "-", tone: "none", title });
const toneOf = (v: number): Cell["tone"] => (Math.abs(v) < 0.005 ? "none" : v > 0 ? "up" : "down");
const pressureTone = (v: number): Cell["tone"] => (v >= 0.1 ? "up" : v <= -0.1 ? "down" : "none");
const signed = (v: number): string => {
  const rounded = Math.round(v * 100) / 100;
  // a value that rounds to zero has no sign
  if (rounded === 0) return "0,00";
  return `${rounded > 0 ? "+" : "-"}${Math.abs(rounded).toFixed(2).replace(".", ",")}`;
};
const TYPE_LABEL: Readonly<Record<SignalWalletType, string>> = { smart_money: "SM", kol: "KOL", whale: "Baleia" };
const NO_SIGNALS = "Os registros de carteiras rastreadas ainda nao foram lidos";
/** The records are one page of the network (up to 100, in the order the provider gave): a zero says the token is not among them, never that the network has none. */
const ZERO_RECORDS = "Nenhum registro deste token entre os registros lidos da rede (uma pagina de ate 100)";

function plain(v: number | null, format: (n: number) => string, reason: string): Cell {
  return v === null ? NONE(reason) : { text: format(v), tone: "none" };
}

export function onchainCells(row: OnchainRow): OnchainCells {
  const percent = (v: number | null, reason: string): Cell => plain(v, (n) => `${fmtNumber(n, 1)}%`, reason);
  const read = row.carteiras !== null;
  const noneFound = read && row.carteiras === 0;
  return {
    rank: row.rank === null ? NONE("Sem volume conhecido, sem posicao") : { text: String(row.rank), tone: "none" },
    ativo: { text: row.symbol, tone: "none", title: row.id },
    preco: row.preco === null ? NONE("A OKX nao informou o preco") : { text: fmtNumber(row.preco, priceDecimalsForMagnitude(row.preco)), tone: "none" },
    var24h: row.var24hPct === null ? NONE("A OKX nao informou a variacao de 24 horas") : { text: fmtPctSigned(row.var24hPct), tone: toneOf(row.var24hPct) },
    vol: plain(row.volUsd24h, fmtCompact, "A OKX nao informou o volume"),
    mcap: plain(row.marketCap, fmtCompact, "A OKX nao informou o valor de mercado"),
    liquidez: plain(row.liquidityUsd, fmtCompact, "A OKX nao informou a liquidez"),
    holders: plain(row.holders, (n) => fmtNumber(n, 0), "A OKX nao informou os holders"),
    pressao:
      row.pressao === null
        ? NONE(row.txs === 0 ? "Sem transacoes na janela da OKX" : "A OKX nao informou a contagem de transacoes")
        : { text: `${signed(row.pressao)} ${pressureLabel(row.pressao)}`, tone: pressureTone(row.pressao), title: `${fmtNumber(row.txs ?? 0, 0)} transacoes na janela da OKX` },
    carteiras: row.carteiras === null ? NONE(NO_SIGNALS) : { text: String(row.carteiras), tone: "none", ...(noneFound ? { title: ZERO_RECORDS } : {}) },
    usd: !read ? NONE(NO_SIGNALS) : noneFound ? NONE(ZERO_RECORDS) : row.carteirasUsd === null ? NONE("Nenhum registro com valor e fracao vendida conhecidos") : { text: fmtCompact(row.carteirasUsd), tone: "none" },
    vendida: !read ? NONE(NO_SIGNALS) : noneFound ? NONE(ZERO_RECORDS) : row.vendidaPct === null ? NONE("Nenhum registro com fracao vendida conhecida") : { text: `${fmtNumber(row.vendidaPct, 0)}%`, tone: "none" },
    tipo: !read ? NONE(NO_SIGNALS) : row.tipos.length === 0 ? NONE(ZERO_RECORDS) : { text: row.tipos.map((t) => TYPE_LABEL[t]).join(", "), tone: "none" },
    risco: row.riskLevel === null ? NONE("A OKX nao informou o nivel de risco") : { text: `Nivel ${row.riskLevel} de 5`, tone: "none" },
    top10: percent(row.top10HoldPct, "A OKX nao informou a parte do top 10"),
    dev: percent(row.devHoldPct, "A OKX nao informou a parte do criador"),
    bundlers: percent(row.bundleHoldPct, "A OKX nao informou a parte dos bundlers"),
  };
}
