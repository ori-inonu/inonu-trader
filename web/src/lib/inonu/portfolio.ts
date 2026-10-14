import type { WalletSnapshot } from "../okx-wallet";
import type { OnchainFocus } from "../onchain/focus";
import { getWalletBalanceFreshness } from "../wallet-freshness";

export interface PortfolioAsset {
  readonly contract: string;
  readonly symbol: string;
  readonly balance: string | null;
}
export interface PortfolioInput {
  readonly chainIndex: string;
  readonly observedAtMs: number;
  readonly coverage: "partial";
  readonly profile: "conservative_no_leverage";
  readonly assets: readonly PortfolioAsset[];
}
export interface PortfolioRequest { readonly modo: "carteira"; readonly carteira: PortfolioInput }
export type PortfolioAction = "buy" | "hold" | "sell" | "abstain";
export interface PortfolioMarket {
  readonly priceUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly changePct: { readonly m5: number | null; readonly h1: number | null; readonly h4: number | null; readonly h24: number | null };
  readonly volumeUsd: { readonly m5: number | null; readonly h1: number | null; readonly h4: number | null; readonly h24: number | null };
  readonly ageMs: number | null;
  readonly stale: boolean;
}
export interface PortfolioAnswer extends Omit<PortfolioInput, "assets"> {
  readonly netWorthUsd: null;
  readonly positionsEmpty: boolean | null;
  readonly assets: readonly (PortfolioAsset & {
    readonly candidateId: string;
    readonly action: PortfolioAction;
    readonly model: string;
    readonly evidence: {
      readonly origin: string;
      readonly ageMs: number | null;
      readonly gaps: readonly string[];
      readonly flow: null | { readonly buyShare: number | null; readonly tradeCount: number | null };
      readonly risk: string | number | null;
      readonly market?: PortfolioMarket | null;
    };
  })[];
}

const token = /^(native|0x[0-9a-fA-F]{40})$/;
const symbol = /^[A-Z0-9]{1,12}$/;
const consultationSymbol = (label: string): string | null => {
  if (!/^[A-Za-z0-9 ._-]{1,24}$/.test(label)) return null;
  const normalized = label.replace(/[ ._-]/g, "").toUpperCase();
  return symbol.test(normalized) ? normalized : null;
};
const balance = /^(0|[1-9]\d*)(\.\d+)?$/;
const rec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nonnegative = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
const finite = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v));

/** The number the provider gives Solana: its contracts are base58 mints, and the case of a mint is part of its identity. */
const SOLANA_CHAIN = "501";
const solanaMint = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const solanaToken = /^(native|[1-9A-HJ-NP-Za-km-z]{32,44})$/;
const evmToken = token;
/** A contract of the answer, by the family of its network: `native`, a hex contract on an EVM network, a mint on Solana. They never mix. */
const tokenOk = (chain: string, contract: string): boolean => (chain === SOLANA_CHAIN ? solanaToken : evmToken).test(contract);
/** Whether two spellings are the same contract: hex has no case, a mint does. */
const sameContract = (chain: string, a: string, b: string): boolean => (chain === SOLANA_CHAIN ? a === b : a.toLowerCase() === b.toLowerCase());
export const portfolioCandidateId = (chain: string, contract: string) => `token:${chain}:${chain === SOLANA_CHAIN ? contract : contract.toLowerCase()}`;

/** Copy only the explicit consultation's contract. The account and RPC response never enter its payload. */
export function preparePortfolio(snapshot: WalletSnapshot, now: number, candidate: OnchainFocus | null = null):
  | { ok: true; request: PortfolioRequest; candidateIncluded: boolean }
  | { ok: false; reason: string } {
  const observation = snapshot.observation;
  if (snapshot.status !== "connected" || !snapshot.account || !observation) return { ok: false, reason: "Conecte a carteira e atualize os saldos." };
  if (snapshot.account.toLowerCase() !== observation.account.toLowerCase() || snapshot.chainId !== observation.chainId) return { ok: false, reason: "A conta ou a rede mudou. Atualize os saldos." };
  if (getWalletBalanceFreshness(observation.observedAtMs, now).status !== "fresh") return { ok: false, reason: "Os saldos precisam de uma nova leitura (validade de 60 s)." };
  const chainIndex = observation.chainId === "0x8f" ? "143" : observation.chainId === "0xc4" ? "196" : null;
  if (!chainIndex) return { ok: false, reason: "Use Monad ou X Layer para esta consulta." };
  const assets: PortfolioAsset[] = [];
  for (const asset of observation.assets) {
    const contract = asset.native ? "native" : asset.contract?.toLowerCase();
    const ticker = consultationSymbol(asset.symbol);
    if (!contract || !token.test(contract) || !ticker || (asset.formattedBalance !== null && (asset.formattedBalance.length > 40 || !balance.test(asset.formattedBalance)))) return { ok: false, reason: "A leitura de um ativo nao pode ser verificada." };
    if (assets.some(a => a.contract === contract)) return { ok: false, reason: "A leitura contem um ativo repetido." };
    assets.push({ contract, symbol: ticker, balance: asset.formattedBalance });
  }
  let candidateIncluded = false;
  const candidateSymbol = candidate ? consultationSymbol(candidate.symbol) : null;
  if (candidate?.chainIndex === chainIndex && token.test(candidate.address) && candidateSymbol) {
    const contract = candidate.address.toLowerCase();
    candidateIncluded = assets.some(a => a.contract === contract);
    if (!candidateIncluded && assets.length < 6) { assets.push({ contract, symbol: candidateSymbol, balance: null }); candidateIncluded = true; }
  }
  if (assets.length < 2 || assets.length > 6) return { ok: false, reason: "A consulta precisa de 2 a 6 ativos verificaveis." };
  return { ok: true, candidateIncluded, request: { modo: "carteira", carteira: { chainIndex, observedAtMs: observation.observedAtMs, coverage: "partial", profile: "conservative_no_leverage", assets } } };
}

/** Validate the per-asset decision, including identities and the prohibition on selling an absent position. */
export function parsePortfolioAnswer(raw: unknown): PortfolioAnswer | null {
  if (!rec(raw) || !/^[1-9]\d{0,11}$/.test(String(raw.chainIndex)) || typeof raw.chainIndex !== "string" || typeof raw.observedAtMs !== "number" || !Number.isSafeInteger(raw.observedAtMs) || raw.observedAtMs < 0 || raw.coverage !== "partial" || raw.profile !== "conservative_no_leverage" || raw.netWorthUsd !== null || (raw.positionsEmpty !== null && typeof raw.positionsEmpty !== "boolean") || !Array.isArray(raw.assets) || raw.assets.length < 2 || raw.assets.length > 6) return null;
  const assets: PortfolioAnswer["assets"][number][] = [];
  for (const value of raw.assets) {
    if (!rec(value) || typeof value.contract !== "string" || !tokenOk(raw.chainIndex, value.contract) || typeof value.symbol !== "string" || !symbol.test(value.symbol) || (value.balance !== null && (typeof value.balance !== "string" || !balance.test(value.balance))) || value.candidateId !== portfolioCandidateId(raw.chainIndex, value.contract) || !["buy", "hold", "sell", "abstain"].includes(String(value.action)) || typeof value.model !== "string" || !value.model || value.model.length > 64) return null;
    const contract = value.contract;
    if (assets.some(a => sameContract(raw.chainIndex as string, a.contract, contract))) return null;
    if (value.action === "sell" && (value.balance === null || /^0(?:\.0+)?$/.test(value.balance))) return null;
    const e = value.evidence;
    if (!rec(e) || typeof e.origin !== "string" || e.origin.length > 80 || !nonnegative(e.ageMs) || !Array.isArray(e.gaps) || e.gaps.length > 24 || !e.gaps.every(g => typeof g === "string" && g.length <= 80) || !(e.risk === null || (typeof e.risk === "string" && e.risk.length <= 80) || (typeof e.risk === "number" && Number.isFinite(e.risk)))) return null;
    let flow: PortfolioAnswer["assets"][number]["evidence"]["flow"] = null;
    if (e.flow !== null) {
      if (!rec(e.flow) || !nonnegative(e.flow.buyShare) || (e.flow.buyShare !== null && e.flow.buyShare > 1) || !nonnegative(e.flow.tradeCount)) return null;
      flow = { buyShare: e.flow.buyShare, tradeCount: e.flow.tradeCount };
    }
    let market: PortfolioMarket | null = null;
    // Older responses omit market. When present, copy only the normalized public fields.
    if (e.market !== undefined && e.market !== null) {
      const m = e.market;
      if (!rec(m) || !nonnegative(m.priceUsd) || !nonnegative(m.liquidityUsd) || !nonnegative(m.ageMs) || typeof m.stale !== "boolean" || !rec(m.changePct) || !rec(m.volumeUsd)) return null;
      const c = m.changePct, v = m.volumeUsd;
      // Earlier market responses omitted h4; absence stays unknown, while present invalid values fail closed.
      const changeH4 = c.h4 === undefined ? null : c.h4, volumeH4 = v.h4 === undefined ? null : v.h4;
      if (![c.m5, c.h1, changeH4, c.h24].every(finite) || ![v.m5, v.h1, volumeH4, v.h24].every(nonnegative)) return null;
      market = { priceUsd: m.priceUsd, liquidityUsd: m.liquidityUsd, ageMs: m.ageMs, stale: m.stale, changePct: { m5: c.m5 as number | null, h1: c.h1 as number | null, h4: changeH4 as number | null, h24: c.h24 as number | null }, volumeUsd: { m5: v.m5 as number | null, h1: v.h1 as number | null, h4: volumeH4 as number | null, h24: v.h24 as number | null } };
    }
    assets.push({ contract: value.contract, symbol: value.symbol, balance: value.balance as string | null, candidateId: value.candidateId as string, action: value.action as PortfolioAction, model: value.model, evidence: { origin: e.origin, ageMs: e.ageMs, gaps: e.gaps as string[], flow, risk: e.risk as string | number | null, market } });
  }
  const expectedEmpty = assets.some(a => a.balance !== null && !/^0(?:\.0+)?$/.test(a.balance)) ? false : assets.some(a => a.balance === null) ? null : true;
  if (raw.positionsEmpty !== expectedEmpty) return null;
  return { chainIndex: raw.chainIndex, observedAtMs: raw.observedAtMs, coverage: "partial", profile: "conservative_no_leverage", netWorthUsd: null, positionsEmpty: raw.positionsEmpty, assets };
}

export function portfolioMatches(answer: PortfolioAnswer, request: PortfolioRequest): boolean {
  const sent = request.carteira;
  return answer.chainIndex === sent.chainIndex && answer.observedAtMs === sent.observedAtMs && answer.assets.length === sent.assets.length && answer.assets.every(a => sent.assets.some(s => sameContract(sent.chainIndex, s.contract, a.contract) && s.symbol === a.symbol && s.balance === a.balance));
}

/**
 * One holding of the Solana account as the reading through the local gateway gives it (the rows "Minha carteira" shows). `valueUsd` is only the order the rows came in,
 * largest first: it is not sent, and neither is any price or any address.
 */
export interface SolanaHolding {
  readonly symbol: string;
  /** Null for the coin of the network itself. */
  readonly tokenAddress: string | null;
  readonly balance: number;
  readonly valueUsd: number | null;
  /** The provider's own mark for a token it considers risky. */
  readonly flaggedRisk: boolean;
}

/** A balance as the plain decimal text the server takes (no exponent, no trailing zeros), or null when the number cannot be carried that way. */
function balanceText(n: number): string | null {
  if (!Number.isFinite(n) || n < 0) return null;
  const plain = String(n);
  const text = /e/i.test(plain) ? n.toFixed(18).replace(/0+$/, "").replace(/\.$/, "") : plain;
  return text.length <= 40 && balance.test(text) ? text : null;
}

/**
 * The consultation of the Solana account (T9.1 and T9.4): up to six holdings of a reading made through the local gateway, in the order the reading gave (the largest first),
 * plus the focused Solana token when there is room. A holding the provider marked as risk, one without a symbol or a mint that can be verified and one with nothing in it
 * are left out and counted, never turned into something else. The request carries no address: the account never leaves the browser except to the local gateway.
 */
export function preparePortfolioSolana(reading: { readonly observedAtMs: number; readonly rows: readonly SolanaHolding[] }, now: number, candidate: OnchainFocus | null = null):
  | { ok: true; request: PortfolioRequest; candidateIncluded: boolean; skipped: number; beyond: number }
  | { ok: false; reason: string } {
  if (getWalletBalanceFreshness(reading.observedAtMs, now).status !== "fresh") return { ok: false, reason: "Os saldos precisam de uma nova leitura (validade de 60 s)." };
  const assets: PortfolioAsset[] = [];
  let skipped = 0;
  let beyond = 0;
  for (const holding of reading.rows) {
    const contract = holding.tokenAddress ?? "native";
    const ticker = consultationSymbol(holding.symbol);
    const text = balanceText(holding.balance);
    if (holding.flaggedRisk || ticker === null || text === null || text === "0" || !solanaToken.test(contract) || assets.some(a => a.contract === contract)) { skipped += 1; continue; }
    if (assets.length >= 6) { beyond += 1; continue; }
    assets.push({ contract, symbol: ticker, balance: text });
  }
  let candidateIncluded = false;
  const candidateSymbol = candidate ? consultationSymbol(candidate.symbol) : null;
  if (candidate?.chainIndex === SOLANA_CHAIN && solanaMint.test(candidate.address) && candidateSymbol) {
    candidateIncluded = assets.some(a => a.contract === candidate.address);
    if (!candidateIncluded && assets.length < 6) { assets.push({ contract: candidate.address, symbol: candidateSymbol, balance: null }); candidateIncluded = true; }
  }
  if (assets.length < 2 || assets.length > 6) {
    const left = skipped > 0 ? ` Foram deixados de fora ${skipped} ativos: sem simbolo ou endereco verificavel, marcados como risco pelo provedor ou sem saldo.` : "";
    return { ok: false, reason: `A consulta precisa de 2 a 6 ativos verificaveis.${left}` };
  }
  return { ok: true, candidateIncluded, skipped, beyond, request: { modo: "carteira", carteira: { chainIndex: SOLANA_CHAIN, observedAtMs: reading.observedAtMs, coverage: "partial", profile: "conservative_no_leverage", assets } } };
}

/**
 * The consultation of an EVM network the wallet holds on (WAL-4, any of the networks the provider lists, not only Monad and X Layer): up to six holdings of a reading made
 * through the local gateway, largest first, plus the focused token of the same network when there is room. The rules are those of the Solana one, with hex contracts (lower
 * case, no case in the identity) in place of mints: a holding the provider marked as risk, one without a symbol or a contract that can be verified and one with nothing in it
 * are left out and counted, never turned into something else. The request carries no address and no value: the account never leaves the browser except to the local gateway.
 */
export function preparePortfolioChain(chainIndex: string, reading: { readonly observedAtMs: number; readonly rows: readonly SolanaHolding[] }, now: number, candidate: OnchainFocus | null = null):
  | { ok: true; request: PortfolioRequest; candidateIncluded: boolean; skipped: number; beyond: number }
  | { ok: false; reason: string } {
  if (!/^[1-9]\d{0,11}$/.test(chainIndex) || chainIndex === SOLANA_CHAIN) return { ok: false, reason: "Esta rede nao tem leitura de carteira EVM." };
  if (getWalletBalanceFreshness(reading.observedAtMs, now).status !== "fresh") return { ok: false, reason: "Os saldos precisam de uma nova leitura (validade de 60 s)." };
  const assets: PortfolioAsset[] = [];
  let skipped = 0;
  let beyond = 0;
  for (const holding of reading.rows) {
    const contract = holding.tokenAddress === null ? "native" : holding.tokenAddress.toLowerCase();
    const ticker = consultationSymbol(holding.symbol);
    const text = balanceText(holding.balance);
    if (holding.flaggedRisk || ticker === null || text === null || text === "0" || !evmToken.test(contract) || assets.some(a => a.contract === contract)) { skipped += 1; continue; }
    if (assets.length >= 6) { beyond += 1; continue; }
    assets.push({ contract, symbol: ticker, balance: text });
  }
  let candidateIncluded = false;
  const candidateSymbol = candidate ? consultationSymbol(candidate.symbol) : null;
  if (candidate?.chainIndex === chainIndex && evmToken.test(candidate.address) && candidateSymbol) {
    const contract = candidate.address.toLowerCase();
    candidateIncluded = assets.some(a => a.contract === contract);
    if (!candidateIncluded && assets.length < 6) { assets.push({ contract, symbol: candidateSymbol, balance: null }); candidateIncluded = true; }
  }
  if (assets.length < 2 || assets.length > 6) {
    const left = skipped > 0 ? ` Foram deixados de fora ${skipped} ativos: sem simbolo ou endereco verificavel, marcados como risco pelo provedor ou sem saldo.` : "";
    return { ok: false, reason: `A consulta precisa de 2 a 6 ativos verificaveis.${left}` };
  }
  return { ok: true, candidateIncluded, skipped, beyond, request: { modo: "carteira", carteira: { chainIndex, observedAtMs: reading.observedAtMs, coverage: "partial", profile: "conservative_no_leverage", assets } } };
}
