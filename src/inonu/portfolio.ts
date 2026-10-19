/** Manual, address-free portfolio consultation. No valuation or action is inferred here. */
import { BriefTooLarge, buildBrief, type BriefCandidate, type Json } from "../intel/brief";
import { SourceError } from "./source-error";
import type { BriefSource } from "./ask";
import { sanitizeTags } from "../intel/onchain-risk";

export const PORTFOLIO_OBSERVATION_MAX_AGE_MS = 60_000;
export const PORTFOLIO_MIN_ASSETS = 2;
export const PORTFOLIO_MAX_ASSETS = 6;
export type PortfolioAction = "buy" | "hold" | "sell" | "abstain";
export interface PortfolioAsset { readonly contract: string; readonly symbol: string; readonly balance: string | null }
export interface PortfolioInput {
  readonly chainIndex: string;
  readonly observedAtMs: number;
  readonly coverage: "partial";
  readonly profile: "conservative_no_leverage";
  readonly assets: readonly PortfolioAsset[];
}
export interface PortfolioMarket {
  readonly priceUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly changePct: { readonly m5: number | null; readonly h1: number | null; readonly h4: number | null; readonly h24: number | null };
  readonly volumeUsd: { readonly m5: number | null; readonly h1: number | null; readonly h4: number | null; readonly h24: number | null };
  readonly ageMs: number | null;
  readonly stale: boolean;
}
export interface PortfolioEvidence {
  readonly origin: "onchainos" | "unavailable";
  readonly ageMs: number | null;
  readonly gaps: readonly string[];
  readonly flow: { readonly buyShare: number | null; readonly tradeCount: number | null } | null;
  readonly risk: string | number | null;
  readonly market?: PortfolioMarket | null;
  readonly riskDetails?: PortfolioRiskDetails | null;
  readonly concentration?: PortfolioConcentration | null;
  readonly poolLiquidity?: PortfolioPoolLiquidity | null;
}
interface EvidenceFreshness { readonly origin: "onchainos"; readonly ageMs: number | null; readonly stale: boolean }
export interface PortfolioRiskDetails extends EvidenceFreshness {
  readonly level: number | null;
  readonly tags: readonly string[];
  readonly lpBurnedPct: number | null;
  readonly devCreateCount: number | null;
  readonly devLaunchedCount: number | null;
  readonly devRugCount: number | null;
}
export interface PortfolioConcentration extends EvidenceFreshness {
  readonly top10HoldPct: number | null;
  readonly devHoldPct: number | null;
  readonly bundleHoldPct: number | null;
  readonly sniperHoldPct: number | null;
  readonly suspiciousHoldPct: number | null;
}
export interface PortfolioPoolLiquidity extends EvidenceFreshness {
  readonly poolCount: number;
  readonly topPoolsLiquidityUsd: number | null;
  /** Share of the returned (at most five) pools, never share of the entire market. */
  readonly largestPoolSharePct: number | null;
  readonly partial: true;
}
export interface PortfolioPosition extends PortfolioAsset { readonly candidateId: string; readonly evidence: PortfolioEvidence }
export interface PortfolioContext extends Omit<PortfolioInput, "assets"> {
  readonly netWorthUsd: null;
  readonly positionsEmpty: boolean | null;
  readonly assets: readonly PortfolioPosition[];
}
export interface PortfolioResult extends Omit<PortfolioContext, "assets"> { readonly assets: readonly (PortfolioPosition & { readonly action: PortfolioAction; readonly model: string })[] }
/** The number the provider gives Solana: its contracts are base58 mints and their case is part of their identity. */
const PORTFOLIO_SOLANA_CHAIN = "501";
const EVM_CONTRACT = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** A contract as the consultation keeps it, or null: `native`; on Solana a mint exactly as given; anywhere else a hex contract in lower case. The two families never mix. */
const contractOf = (chainIndex: string, raw: string): string | null => {
  if (raw === "native") return raw;
  if (chainIndex === PORTFOLIO_SOLANA_CHAIN) return SOLANA_MINT.test(raw) ? raw : null;
  return EVM_CONTRACT.test(raw) ? raw.toLowerCase() : null;
};
/** Whether two spellings are the same contract: hex has no case, a mint does. */
const sameContract = (chainIndex: string, a: string, b: string): boolean => (chainIndex === PORTFOLIO_SOLANA_CHAIN ? a === b : a.toLowerCase() === b.toLowerCase());
const exactKeys = (obj: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(obj).length === keys.length && keys.every((key) => Object.hasOwn(obj, key));
const record = (raw: unknown): Record<string, unknown> | null => raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
const positive = (balance: string | null): boolean => balance !== null && /[1-9]/.test(balance);
const finite = (value: unknown, signed = false): number | null => typeof value === "number" && Number.isFinite(value) && (signed || value >= 0) ? value : null;
function marketOf(raw: unknown): PortfolioMarket | null {
  const value = record(raw);
  if (!value || typeof value.stale !== "boolean") return null;
  const window = (raw: unknown, signed = false) => {
    const values = record(raw);
    return { m5: finite(values?.m5, signed), h1: finite(values?.h1, signed), h4: finite(values?.h4, signed), h24: finite(values?.h24, signed) };
  };
  return { priceUsd: finite(value.priceUsd), liquidityUsd: finite(value.liquidityUsd), changePct: window(value.changePct, true), volumeUsd: window(value.volumeUsd), ageMs: finite(value.ageMs), stale: value.stale };
}
const percent = (raw: unknown): number | null => { const value = finite(raw); return value !== null && value <= 100 ? value : null; };
const count = (raw: unknown): number | null => { const value = finite(raw); return value !== null && Number.isSafeInteger(value) ? value : null; };
function freshness(value: Record<string, unknown>): EvidenceFreshness | null {
  if (value.origin !== "onchainos" || typeof value.stale !== "boolean") return null;
  const ageMs = finite(value.ageMs);
  return { origin: "onchainos", ageMs, stale: value.stale || ageMs === null };
}
function riskDetailsOf(raw: unknown): PortfolioRiskDetails | null {
  const value = record(raw), meta = value && freshness(value);
  if (!value || !meta) return null;
  const level = count(value.level);
  return { ...meta, level: !meta.stale && level !== null && level >= 1 && level <= 5 ? level : null, tags: sanitizeTags(Array.isArray(value.tags) ? value.tags : []).flags, lpBurnedPct: percent(value.lpBurnedPct), devCreateCount: count(value.devCreateCount), devLaunchedCount: count(value.devLaunchedCount), devRugCount: count(value.devRugCount) };
}
function concentrationOf(raw: unknown): PortfolioConcentration | null {
  const value = record(raw), meta = value && freshness(value);
  if (!value || !meta) return null;
  return { ...meta, top10HoldPct: percent(value.top10HoldPct), devHoldPct: percent(value.devHoldPct), bundleHoldPct: percent(value.bundleHoldPct), sniperHoldPct: percent(value.sniperHoldPct), suspiciousHoldPct: percent(value.suspiciousHoldPct) };
}
function poolLiquidityOf(raw: unknown): PortfolioPoolLiquidity | null {
  const value = record(raw), meta = value && freshness(value);
  if (!value || !meta || value.partial !== true) return null;
  const poolCount = count(value.poolCount);
  if (poolCount === null || poolCount > 5) return null;
  return { ...meta, poolCount, topPoolsLiquidityUsd: finite(value.topPoolsLiquidityUsd), largestPoolSharePct: percent(value.largestPoolSharePct), partial: true };
}
/** These are collection labels, not model reasons or a coded action policy. Flow is optional at the two-call cap. */
function gapLabel(key: string, reason: string): string {
  const kind = key === "regime" ? "not_applicable" : ["price-info", "token-risk", "risco", "honeypot"].includes(key) ? "essential" : "optional";
  const detail = /^[a-zA-Z0-9_:.-]{1,40}$/.test(reason) ? `:${reason}` : "";
  return `${kind}:${key}${detail}`.slice(0, 80);
}
const portfolioCandidateId = (chainIndex: string, contract: string): string => `token:${chainIndex}:${contract}`;

/** A closed schema deliberately rejects account, address, raw RPC, leverage and caller-written prose. */
export function parsePortfolioInput(raw: unknown): PortfolioInput | null {
  const input = record(raw);
  if (!input || !exactKeys(input, ["chainIndex", "observedAtMs", "coverage", "profile", "assets"])) return null;
  if (typeof input.chainIndex !== "string" || !/^[1-9]\d{0,11}$/.test(input.chainIndex) || !Number.isSafeInteger(input.observedAtMs) || (input.observedAtMs as number) <= 0 || input.coverage !== "partial" || input.profile !== "conservative_no_leverage") return null;
  if (!Array.isArray(input.assets) || input.assets.length < PORTFOLIO_MIN_ASSETS || input.assets.length > PORTFOLIO_MAX_ASSETS) return null;
  const assets: PortfolioAsset[] = [];
  for (const rawAsset of input.assets) {
    const asset = record(rawAsset);
    if (!asset || !exactKeys(asset, ["contract", "symbol", "balance"]) || typeof asset.contract !== "string" || typeof asset.symbol !== "string" || !/^[A-Z0-9]{1,12}$/.test(asset.symbol)) return null;
    if (asset.balance !== null && (typeof asset.balance !== "string" || asset.balance.length > 40 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(asset.balance))) return null;
    const contract = contractOf(input.chainIndex, asset.contract);
    if (contract === null || assets.some((a) => a.contract === contract)) return null;
    assets.push({ contract, symbol: asset.symbol, balance: asset.balance as string | null });
  }
  return { chainIndex: input.chainIndex, observedAtMs: input.observedAtMs as number, coverage: "partial", profile: "conservative_no_leverage", assets };
}

export function isPortfolioFresh(input: PortfolioInput, nowMs: number): boolean {
  return Number.isFinite(nowMs) && input.observedAtMs <= nowMs && nowMs - input.observedAtMs <= PORTFOLIO_OBSERVATION_MAX_AGE_MS;
}

export function validatePortfolioDecision(raw: unknown, context: PortfolioContext): { ok: true; choices: readonly { candidateId: string; action: PortfolioAction }[] } | { ok: false; reason: string } {
  const obj = record(raw);
  if (!obj || !exactKeys(obj, ["choices"]) || !Array.isArray(obj.choices) || obj.choices.length !== context.assets.length) return { ok: false, reason: "portfolio_choices_invalid" };
  const choices: { candidateId: string; action: PortfolioAction }[] = [];
  for (const rawChoice of obj.choices) {
    const choice = record(rawChoice);
    if (!choice || !exactKeys(choice, ["candidateId", "action"]) || typeof choice.candidateId !== "string" || !["buy", "hold", "sell", "abstain"].includes(choice.action as string)) return { ok: false, reason: "portfolio_choice_invalid" };
    const asset = context.assets.find((a) => a.candidateId === choice.candidateId);
    if (!asset || choices.some((a) => a.candidateId === choice.candidateId)) return { ok: false, reason: "portfolio_candidate_invalid" };
    if (choice.action === "sell" && !positive(asset.balance)) return { ok: false, reason: "portfolio_sell_without_position" };
    choices.push({ candidateId: choice.candidateId, action: choice.action as PortfolioAction });
  }
  return { ok: true, choices };
}

export function createPortfolioSource(deps: { readonly token: BriefSource; readonly now: () => number }): BriefSource {
  return {
    async build(request, context) {
      const input = parsePortfolioInput(request.carteira);
      if (request.modo !== "carteira" || !input) throw new SourceError("carteira_invalida", 0);
      if (!isPortfolioFresh(input, deps.now())) throw new SourceError("carteira_vencida", 0);
      const tokenCount = input.assets.filter((a) => a.contract !== "native").length;
      const budget = Math.max(0, Math.floor(Math.min(15, context.maxOnchainosCalls)));
      const perAssetCap = tokenCount === 0 ? 0 : Math.floor(budget / tokenCount);
      const remainder = tokenCount === 0 ? 0 : budget % tokenCount;
      // Collection priority is stable identity order, never an investment rank or the input's presentation order.
      const tokenOrder = input.assets.filter(a => a.contract !== "native").map(a => portfolioCandidateId(input.chainIndex, a.contract)).sort();
      let calls: number | null = 0;
      const assets: PortfolioPosition[] = [];
      for (const asset of input.assets) {
        if (context.signal.aborted) throw new SourceError("cancelado", calls);
        let evidence: PortfolioEvidence = { origin: "unavailable", ageMs: null, gaps: [asset.contract === "native" ? "native_market_unavailable" : "market_unavailable"], flow: null, risk: null, market: null, riskDetails: null, concentration: null, poolLiquidity: null };
        const assetCap = perAssetCap + (tokenOrder.indexOf(portfolioCandidateId(input.chainIndex, asset.contract)) < remainder ? 1 : 0);
        if (asset.contract !== "native" && assetCap > 0) {
          try {
            const built = await deps.token.build({ modo: "carteira", alvo: { chainIndex: input.chainIndex, address: asset.contract } }, { ...context, maxOnchainosCalls: assetCap });
            if (built.onchainosCalls !== null && built.onchainosCalls > assetCap) throw new SourceError("teto_onchainos", built.onchainosCalls);
            calls = calls === null || built.onchainosCalls === null ? null : calls + built.onchainosCalls;
            const target = built.brief.alvo;
            const identityMatches = "chainIndex" in target && "address" in target && target.chainIndex === input.chainIndex && sameContract(input.chainIndex, target.address, asset.contract) && built.candidates.some((c) => c.id === portfolioCandidateId(input.chainIndex, asset.contract) && c.tipo === "token");
            if (!identityMatches) {
              assets.push({ ...asset, candidateId: portfolioCandidateId(input.chainIndex, asset.contract), evidence: { ...evidence, gaps: ["market_identity_mismatch"] } });
              continue;
            }
            const ages = Object.values(built.brief.idades).filter((a) => Number.isFinite(a) && a >= 0);
            const share = built.brief.fluxo?.buyShare;
            const buyShare = typeof share === "number" && Number.isFinite(share) && share >= 0 && share <= 1 ? share : null;
            const riskDetails = riskDetailsOf(built.brief.fluxo?.riskDetails);
            const flags = [...(built.brief.risco?.flags ?? []), ...(riskDetails?.tags ?? [])].filter((flag) => /^[a-zA-Z0-9_.-]{1,60}$/.test(flag)).map((flag) => `risk_flag:${flag}`);
            const allGaps = [...new Set([...flags, ...Object.entries(built.brief.nulos).filter(([key]) => /^[a-zA-Z0-9_.-]{1,40}$/.test(key)).map(([key, reason]) => gapLabel(key, reason)).sort()])];
            const gaps = allGaps.length <= 24 ? allGaps : [...allGaps.slice(0, 23), `additional_market_gaps:${allGaps.length - 23}`];
            const level = built.brief.risco?.nivel;
            const risk = (typeof level === "number" && Number.isFinite(level)) || (typeof level === "string" && level.length <= 80) ? level : null;
            const tradeCount = finite(built.brief.fluxo?.tradeCount);
            evidence = { origin: Object.keys(built.brief.origens).length ? "onchainos" : "unavailable", ageMs: ages.length ? Math.max(...ages) : null, gaps, flow: buyShare === null && tradeCount === null ? null : { buyShare, tradeCount }, risk, market: marketOf(built.brief.fluxo?.market), riskDetails, concentration: concentrationOf(built.brief.fluxo?.concentration), poolLiquidity: poolLiquidityOf(built.brief.fluxo?.poolLiquidity) };
          } catch (error) {
            if (context.signal.aborted) throw new SourceError("cancelado", calls === null || !(error instanceof SourceError) || error.onchainosCalls === null ? null : calls + error.onchainosCalls);
            if (error instanceof SourceError && error.code === "teto_onchainos") throw new SourceError("teto_onchainos", calls === null || error.onchainosCalls === null ? null : calls + error.onchainosCalls);
            calls = calls === null || !(error instanceof SourceError) || error.onchainosCalls === null ? null : calls + error.onchainosCalls;
            evidence = { ...evidence, gaps: [error instanceof SourceError && error.code === "sem_credencial_onchainos" ? "onchainos_credentials_unavailable" : "market_unavailable"] };
          }
        }
        assets.push({ ...asset, candidateId: portfolioCandidateId(input.chainIndex, asset.contract), evidence });
      }
      if (context.signal.aborted) throw new SourceError("cancelado", calls);
      if (!isPortfolioFresh(input, deps.now())) throw new SourceError("carteira_vencida", calls);
      const portfolio: PortfolioContext = { ...input, assets, netWorthUsd: null, positionsEmpty: assets.some((a) => positive(a.balance)) ? false : assets.some((a) => a.balance === null) ? null : true };
      const candidates: BriefCandidate[] = assets.map((a) => ({ id: a.candidateId, tipo: "token" }));
      // Parallel arrays follow candidatos order; symbols are presentation hints, never market identity or a wallet address.
      const ordered = [...assets].sort((a, b) => a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0);
      // Repeated gap labels use one dictionary so exact balances and public market windows fit the existing byte cap.
      const modelGaps = ordered.map(a => {
        const gaps = a.evidence.gaps.filter(gap => !gap.startsWith("optional:") || /^optional:(trades|pools|concentration):/.test(gap)).map(gap => gap.split(":").slice(0, 2).join(":"));
        if (typeof a.evidence.risk === "string" && a.evidence.risk.length > 24) gaps.push("risk_detail_omitted");
        return gaps;
      });
      const gapKeys = [...new Set(modelGaps.flat())].sort();
      const items: Json[] = ordered.map((a, index) => {
        const compactGaps: Json[] = modelGaps[index]!.map(gap => gapKeys.indexOf(gap));
        const risk = typeof a.evidence.risk === "string" && a.evidence.risk.length > 24 ? null : a.evidence.risk;
        return [a.symbol, a.balance, a.evidence.flow?.buyShare ?? null, risk, a.evidence.ageMs, compactGaps, a.evidence.origin];
      });
      const marketRows = new Map<string, number>();
      const market: Json[] = ordered.map((a, index) => {
        const m = a.evidence.market;
        if (!m) return null;
        const row: Json[] = [m.priceUsd, m.liquidityUsd, m.changePct.m5, m.changePct.h1, m.changePct.h4, m.changePct.h24, m.volumeUsd.m5, m.volumeUsd.h1, m.volumeUsd.h4, m.volumeUsd.h24, m.ageMs, m.stale];
        // Only byte-identical observations share a row; identity still belongs to each aligned candidate.
        const key = JSON.stringify(row), previous = marketRows.get(key);
        if (previous !== undefined) return previous;
        marketRows.set(key, index);
        return row;
      });
      const riskDetails: Json[] = ordered.map(a => { const r = a.evidence.riskDetails; return r ? [r.lpBurnedPct, r.devCreateCount, r.devLaunchedCount, r.devRugCount, r.ageMs, r.stale] : null; });
      const concentration: Json[] = ordered.map(a => { const c = a.evidence.concentration; if (!c) return null; const row: Json[] = [c.top10HoldPct, c.devHoldPct, c.bundleHoldPct, c.sniperHoldPct, c.suspiciousHoldPct]; while (row.length && row.at(-1) === null) row.pop(); return row; });
      const poolRows = new Map<string, number>();
      const poolLiquidity: Json[] = ordered.map((a, index) => {
        const p = a.evidence.poolLiquidity;
        if (!p) return null;
        const row: Json[] = [p.poolCount, p.topPoolsLiquidityUsd, p.largestPoolSharePct, p.ageMs, p.stale];
        const key = JSON.stringify(row), previous = poolRows.get(key);
        if (previous !== undefined) return previous;
        poolRows.set(key, index);
        return row;
      });
      // asOfMs already holds the observation timestamp; aligned items already hold the market origin.
      try {
        // Fixed array legends live in the model questions, leaving the state budget for measured values.
        const { brief } = buildBrief({ alvo: { chainIndex: input.chainIndex, escopo: "descoberta" }, asOfMs: input.observedAtMs, familiasHabilitadas: ["carteira"], fluxo: { carteira: { coverage: input.coverage, profile: input.profile, netWorthUsd: null, positionsEmpty: portfolio.positionsEmpty, items, market, riskDetails, concentration, poolLiquidity, gapKeys } }, candidatos: candidates, trilha: null, risco: null, regime: null, idades: { carteira: deps.now() - input.observedAtMs }, origens: { carteira: "okx_wallet_read" }, nulos: { netWorthUsd: "valuation_unavailable", pnl: "cost_basis_unavailable" } });
        return { brief, candidates, onchainosCalls: calls, portfolio };
      } catch (error) {
        if (error instanceof BriefTooLarge) throw new SourceError("brief_grande_demais", calls);
        throw error;
      }
    },
  };
}
