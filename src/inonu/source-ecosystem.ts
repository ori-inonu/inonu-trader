/**
 * The data source of the ecosystem mode of "Pedir ao Inonu" ("as melhores oportunidades"): the OnchainOS networks read together, the tokens with the most independent descriptive support put in
 * front of the model with the facts that support them and the facts that give pause, and the ceiling of what the person's balance allows for each. It runs only when someone clicks.
 *
 *  1. for each network (at most four): the hot list and the purchases of the tracked wallets, two reads (the same ones, with the same parameters, the Radar already made, so the gateway's cache
 *     answers them when they are fresh and they are not counted as sent);
 *  2. the tokens that pass the entry rules and have at least two families of evidence in their favour are put in order (more families first, then the trail of the tracked wallets) and the
 *     first six have their risk read (`token-risk`), with what is left of the budget of the click; a honeypot is never offered;
 *  3. the five best become candidates with their facts, their families, their marks of care and their ceiling from the balance; one Evidence Brief carries them all.
 *
 * The click is refused with a constant code BEFORE the model is asked when there is nothing to choose among (no credential, no data, nothing with support), so it costs nothing. A read that fails is
 * a note in the Brief, never a zero. Only percentages of the balance reach the model; the dollars come back to the page and stay on this machine. The code describes, and never says buy or sell.
 */
import { BriefTooLarge, buildBrief, type BriefCandidate, type BriefInput } from "../intel/brief";
import { tokenCandidate } from "../intel/candidates";
import { liquidityComponent, signalsInputs, type SignalLike } from "../intel/onchain-components";
import { buildOnchainDigest } from "../intel/onchain-digest";
import type { GatewayLike } from "../intel/onchain-nulos";
import { boughtComponent, trailScore, unsoldComponent, walletsComponent } from "../intel/trail";
import { BRIEF_KEYS, briefItem, candidateOf, enters, familiesOf, type EcoCandidate, type EcoContext, type EcoFacts, type Saldo } from "../opportunity/ecosystem";
import { bearishFlags } from "../opportunity/risk-tags";
import type { InternalGatewayResult, OnchainGatewayInternal } from "../onchain-read/gateway";
import { SourceError, type AskRequest, type BriefSource, type BuiltBrief } from "./ask";
import { MAX_ONCHAIN_CALLS } from "./onchain-plan";

export interface EcosystemDeps {
  readonly gateway: Pick<OnchainGatewayInternal, "callInternal">;
  readonly now: () => number;
}

/** The networks read when the person did not choose and the balance does not say: where most tokens and tracked wallets are. */
export const DEFAULT_ECOSYSTEM_CHAINS: readonly string[] = ["501", "8453", "56", "1"];
export const ECOSYSTEM_MAX_CHAINS = 4;
/** How many tokens have their risk read, and how many the model sees. */
const RISK_READS = 6;
export const ECOSYSTEM_CANDIDATES = 5;
/** The most a caller may ask for: the cap of calls of a click (15) leaves room for the risk of about this many after the reads of one network. */
export const ECOSYSTEM_MAX_CANDIDATES = 12;
/** The Brief of this mode carries five candidates with their facts: it is allowed a little more than the 2 KB of the single instrument. */
export const ECOSYSTEM_BRIEF_BYTES = 3584;

/** A token up more than this in the last day (percent) has already run. It may still be a chance, but it is not all of what the model should see: the ranking by evidence puts the ones that ran on top, since they have the most traction. */
export const RAN_PCT = 30;

/**
 * The selection of `take` from a list ranked by evidence in which at most half (and at least two) are tokens that already ran in the last day; the early ones fill the rest, and when there are too few of them the
 * ones that ran do, so nothing is hidden. The selection keeps the order of the ranking. With `withTail` the rest follows it, in the original order (the reads of risk go to the head). Pure; the input is not changed.
 */
export function diversifyRan<T extends { readonly facts: { readonly changePct: number | null } }>(sorted: readonly T[], take: number, withTail = false): T[] {
  const ran = (e: T): boolean => e.facts.changePct !== null && Number.isFinite(e.facts.changePct) && e.facts.changePct > RAN_PCT;
  const cap = Math.max(2, Math.floor(take / 2));
  const chosen = new Set<T>();
  let ranCount = 0;
  for (const e of sorted) {
    if (chosen.size >= take) break;
    if (ran(e)) {
      if (ranCount >= cap) continue;
      ranCount += 1;
    }
    chosen.add(e);
  }
  for (const e of sorted) {
    if (chosen.size >= take) break;
    chosen.add(e);
  }
  const head = sorted.filter((e) => chosen.has(e));
  return withTail ? [...head, ...sorted.filter((e) => !chosen.has(e))] : head;
}

const CREDENTIAL_ERRORS = new Set(["no_credentials", "incomplete_credentials"]);
const FLAG = /^[a-zA-Z0-9_.-]{1,40}$/;

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : null);
const rowsOf = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(rec).filter((r): r is Rec => r !== null) : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Source age is independent of the click clock; absence never asserts freshness. */
type SourceMeta = [ageMs: number | null, stale: boolean | null];
type HotMeta = [ageMs: number | null, stale: boolean | null, timeFrame: "4"];
const sourceMeta = (result: InternalGatewayResult): SourceMeta | null => {
  if (!result.ok) return null;
  const age = num(result.meta.ageMs);
  return [age !== null && age >= 0 ? age : null, typeof result.meta.stale === "boolean" ? result.meta.stale : null];
};

const like = (result: InternalGatewayResult): GatewayLike =>
  result.ok ? { ok: true, data: result.data, meta: { ageMs: result.meta.ageMs, stale: result.meta.stale } } : { ok: false, error: result.error };

/** The chains to read: the person's choice, else the networks where the balance holds cash (most cash first), else the default. */
export function chainsFor(request: AskRequest): string[] {
  const chosen = request.redes?.length ? [...request.redes] : request.saldo === undefined ? [] : [...request.saldo.chains].filter((c) => c.cashUsd > 0).sort((a, b) => b.cashUsd - a.cashUsd).map((c) => c.chainIndex);
  const list = chosen.length > 0 ? chosen : [...DEFAULT_ECOSYSTEM_CHAINS];
  return [...new Set(list)].slice(0, ECOSYSTEM_MAX_CHAINS);
}

interface ChainRead {
  readonly chainIndex: string;
  readonly facts: EcoFacts[];
  /** The nota of each token with purchases of tracked wallets is in its facts; this is only the count of hot rows. */
  readonly hotRows: number;
  readonly signalRows: number;
}

/** The facts of every token of one network that the hot list names, with what the tracked wallets did in it. */
function readChain(chainIndex: string, hot: InternalGatewayResult | undefined, signals: InternalGatewayResult | undefined): ChainRead | null {
  if (hot === undefined || !hot.ok) return null;
  const hotRows = rowsOf(hot.data);
  const signalRows = signals !== undefined && signals.ok ? rowsOf(signals.data) : [];
  const read = signals !== undefined && signals.ok;

  const groups = new Map<string, { rows: SignalLike[]; usd: number; weightedSold: number; soldUsd: number; priceWeightedUsd: number; pricedUsd: number }>();
  for (const row of signalRows) {
    const address = text(rec(row.token)?.address);
    if (address === null) continue;
    const key = /^0x/i.test(address) ? address.toLowerCase() : address;
    const group = groups.get(key) ?? { rows: [], usd: 0, weightedSold: 0, soldUsd: 0, priceWeightedUsd: 0, pricedUsd: 0 };
    const amountUsd = num(row.amountUsd);
    const sold = num(row.soldRatioPct);
    const sigPrice = num(row.priceUsd);
    group.rows.push({ amountUsd: amountUsd ?? Number.NaN, soldRatioPct: sold, walletCount: num(row.walletCount) ?? Number.NaN });
    if (amountUsd !== null && amountUsd > 0) {
      group.usd += amountUsd;
      if (sold !== null && sold >= 0 && sold <= 100) {
        group.weightedSold += amountUsd * sold;
        group.soldUsd += amountUsd;
      }
      if (sigPrice !== null && sigPrice > 0) {
        group.priceWeightedUsd += amountUsd * sigPrice;
        group.pricedUsd += amountUsd;
      }
    }
    groups.set(key, group);
  }
  const inputs = new Map([...groups].map(([key, g]) => [key, signalsInputs(g.rows)] as const));
  const netUnsoldSet = [...inputs.values()].flatMap((i) => (i.netUnsoldUsd === null ? [] : [i.netUnsoldUsd]));
  const liquiditySet = hotRows.flatMap((r) => (num(r.liquidityUsd) === null ? [] : [num(r.liquidityUsd)!]));

  const facts: EcoFacts[] = [];
  const seen = new Set<string>();
  for (const row of hotRows) {
    const address = text(row.address);
    const symbol = text(row.symbol);
    if (address === null || symbol === null || !/^[A-Za-z0-9]{1,20}$/.test(symbol)) continue;
    const key = /^0x/i.test(address) ? address.toLowerCase() : address;
    if (seen.has(key)) continue;
    seen.add(key);
    const group = groups.get(key);
    const input = inputs.get(key);
    const buys = num(row.txsBuy);
    const sells = num(row.txsSell);
    const txs = buys !== null && sells !== null && buys >= 0 && sells >= 0 ? buys + sells : null;
    const liquidityUsd = num(row.liquidityUsd);
    const nota =
      !read || group === undefined || input === undefined
        ? null
        : trailScore(
            {
              compra: input.netUnsoldUsd === null ? null : boughtComponent(input.netUnsoldUsd, netUnsoldSet),
              carteiras: walletsComponent(input.walletCount),
              naoVendida: unsoldComponent(input.soldPercents),
              qualidade: null,
              concentracao: null,
              risco: null,
              liquidez: liquidityUsd === null ? null : liquidityComponent(liquidityUsd, liquiditySet),
              fluxo: null,
              sentimento: null,
            },
            { honeypot: false },
          ).nota;
    facts.push({
      candidateId: tokenCandidate({ chainIndex, address }).id,
      chainIndex,
      address: key,
      symbol,
      nota,
      priceUsd: num(row.price),
      changePct: num(row.changePct),
      volumeUsd: num(row.volumeUsd),
      liquidityUsd,
      marketCapUsd: num(row.marketCap),
      holders: num(row.holders),
      buyShare: txs !== null && txs > 0 ? buys! / txs : null,
      txs,
      top10Pct: num(row.top10HoldPct),
      devPct: num(row.devHoldPct),
      bundlePct: num(row.bundleHoldPct),
      riskLevel: num(row.riskLevel),
      riskFlags: [],
      wallets: group === undefined ? (read ? 0 : null) : input?.walletCount ?? null,
      walletsUsd: group === undefined ? (read ? 0 : null) : group.usd,
      soldPct: group === undefined || group.soldUsd <= 0 ? null : group.weightedSold / group.soldUsd,
      smartPriceUsd: group === undefined || group.pricedUsd <= 0 ? null : group.priceWeightedUsd / group.pricedUsd,
      inflowUsd: num(row.inflowUsd),
      uniqueTraders: num(row.uniqueTraders),
    });
  }
  return { chainIndex, facts, hotRows: hotRows.length, signalRows: signalRows.length };
}

const order = (a: { facts: EcoFacts; families: readonly string[] }, b: { facts: EcoFacts; families: readonly string[] }): number =>
  b.families.length - a.families.length || (b.facts.nota ?? -1) - (a.facts.nota ?? -1) || (b.facts.liquidityUsd ?? -1) - (a.facts.liquidityUsd ?? -1) || (a.facts.candidateId < b.facts.candidateId ? -1 : 1);

export function createEcosystemSource(deps: EcosystemDeps): BriefSource {
  return {
    async build(request: AskRequest, context): Promise<BuiltBrief> {
      if (request.modo !== "ecossistema") throw new SourceError("modo_nao_disponivel");
      if (context.signal.aborted) throw new SourceError("cancelado");
      const chains = chainsFor(request);
      const cap = Math.min(MAX_ONCHAIN_CALLS, context.maxOnchainosCalls);
      // the click wants the usual few; a caller that decides by itself (the agent) may ask for a wider pool so that enough of them stay open after the code's entry rules
      const take = Math.min(ECOSYSTEM_MAX_CANDIDATES, Math.max(ECOSYSTEM_CANDIDATES, Math.floor(context.candidates ?? ECOSYSTEM_CANDIDATES)));
      const riskReads = take === ECOSYSTEM_CANDIDATES ? RISK_READS : Math.min(take + 2, ECOSYSTEM_MAX_CANDIDATES + 2);
      const saldo: Saldo | null = request.saldo ?? null;

      let attempted = 0;
      let sent = 0;
      let credentialFailures = 0;
      const read = async (route: string, params: Record<string, string>): Promise<InternalGatewayResult> => {
        if (context.signal.aborted) throw new SourceError("cancelado", sent);
        attempted += 1;
        const result = await deps.gateway.callInternal(route, params, "user");
        if (result.sent) sent += 1;
        if (!result.ok && CREDENTIAL_ERRORS.has(result.error)) credentialFailures += 1;
        return result;
      };

      // 1. the hot list and the tracked wallets of each network, one network after the other
      const reads: ChainRead[] = [];
      const missing: string[] = [];
      const sourceByChain: Record<string, [HotMeta | null, SourceMeta | null]> = {};
      let hotAge: number | null = null;
      let signalsRead = 0;
      for (const chainIndex of chains) {
        if (attempted + 2 > cap) {
          missing.push(chainIndex);
          continue;
        }
        const hot = await read("/onchain/hot-tokens", { chainIndex, timeFrame: "4", limit: "100" });
        const signals = await read("/onchain/signals", { chainIndex, walletType: "1,2,3", limit: "100" });
        const hotMeta = sourceMeta(hot);
        sourceByChain[chainIndex] = [hotMeta === null ? null : [...hotMeta, "4"], sourceMeta(signals)];
        const chain = readChain(chainIndex, hot, signals);
        if (chain === null) {
          missing.push(chainIndex);
          continue;
        }
        if (signals.ok) signalsRead += 1;
        if (hotMeta?.[0] !== null && hotMeta?.[0] !== undefined) hotAge = Math.max(hotAge ?? 0, hotMeta[0]);
        reads.push(chain);
      }
      if (attempted > 0 && credentialFailures === attempted) throw new SourceError("sem_credencial_onchainos", sent);
      if (reads.length === 0) throw new SourceError("sem_dados_onchain", sent);

      // 2. who has support, and the risk of the first of them
      const excluded: Record<string, number> = {};
      const bump = (reason: string) => void (excluded[reason] = (excluded[reason] ?? 0) + 1);
      const pool: { facts: EcoFacts; families: ReturnType<typeof familiesOf> }[] = [];
      for (const chain of reads) {
        for (const facts of chain.facts) {
          if (!enters(facts)) {
            bump("pool_ou_detentores");
            continue;
          }
          const families = familiesOf(facts);
          if (families.length < 2) {
            bump("pouco_apoio");
            continue;
          }
          pool.push({ facts, families });
        }
      }
      pool.sort(order);
      if (pool.length === 0) throw new SourceError("sem_candidatos", sent);
      // the reads of risk go to the ones the model will see: not only the ones that already ran in the last day
      const ranked = diversifyRan(pool, riskReads, true);

      const checked = new Set<string>();
      const riskFacts = new Map<string, EcoFacts>();
      const riskMeta = new Map<string, SourceMeta | null>();
      let riskUnchecked = 0;
      for (const entry of ranked.slice(0, riskReads)) {
        if (attempted + 1 > cap) {
          riskUnchecked += 1;
          continue;
        }
        const result = await read("/onchain/token-risk", { chainIndex: entry.facts.chainIndex, token: entry.facts.address });
        riskMeta.set(entry.facts.candidateId, sourceMeta(result));
        const digest = buildOnchainDigest({ sources: { risk: like(result) }, sets: { netUnsoldUsd: [], liquidityUsd: [] }, quality: null, symbol: { origin: "onchain_token", communityRecognized: null, sameSymbolMatches: 0 } });
        if (digest.honeypot === true) {
          bump("honeypot");
          riskFacts.set(entry.facts.candidateId, { ...entry.facts, riskFlags: ["honeypot"] });
          checked.add(entry.facts.candidateId);
          continue;
        }
        if (result.ok) checked.add(entry.facts.candidateId);
        else riskUnchecked += 1;
        const validFlags = (digest.risco?.flags ?? []).filter((flag) => FLAG.test(flag));
        const warnFlags = bearishFlags(validFlags);
        const flags = [...warnFlags, ...validFlags.filter((flag) => !warnFlags.includes(flag))].slice(0, 3);
        riskFacts.set(entry.facts.candidateId, { ...entry.facts, riskFlags: flags });
      }
      riskUnchecked += Math.max(0, Math.min(pool.length, take + 1) - Math.min(pool.length, riskReads));

      // 3. the best five, with their ceilings (a tail token whose token-risk was not read when others were cannot claim the "seguranca" family to leapfrog checked tokens)
      const refined = diversifyRan(
        pool
          .map((entry) => {
            const facts = riskFacts.get(entry.facts.candidateId) ?? entry.facts;
            const families = familiesOf(facts).filter((f) => f !== "seguranca" || checked.has(entry.facts.candidateId) || checked.size === 0);
            return { facts, families };
          })
          .filter((entry) => !entry.facts.riskFlags.includes("honeypot"))
          .filter((entry) => entry.families.length >= 2)
          .sort(order),
        take,
      );
      if (refined.length === 0) throw new SourceError("sem_candidatos", sent);
      const candidates: EcoCandidate[] = refined.map((entry) => {
        const cand = candidateOf(entry.facts, saldo);
        return checked.has(entry.facts.candidateId) || checked.size === 0 ? cand : { ...cand, families: entry.families };
      });

      const itens: Record<string, unknown> = {};
      const briefCandidates: BriefCandidate[] = candidates.map((c) => {
        itens[c.facts.candidateId] = { ...briefItem(c, saldo === null ? null : saldo.totalUsd), q: riskMeta.get(c.facts.candidateId) ?? null };
        return { ...tokenCandidate({ chainIndex: c.facts.chainIndex, address: c.facts.address, ...(c.facts.nota === null ? {} : { nota: c.facts.nota }) }), fatores: [...c.families], estado: checked.has(c.facts.candidateId) ? "risco_conferido" : "risco_nao_conferido" };
      });

      const idades: Record<string, number> = {};
      const origens: Record<string, string> = { "hot-tokens": "onchainos", "signals": "onchainos" };
      const nulos: Record<string, string> = { trilha: "por_candidato", risco: "por_candidato", regime: "nao_se_aplica_a_token" };
      if (hotAge !== null) idades["hot-tokens"] = hotAge;
      if (signalsRead < reads.length) nulos.signals = `${reads.length - signalsRead}_redes_sem_compras_de_carteiras`;
      if (missing.length > 0) nulos.redes_sem_leitura = missing.join(",");
      if (riskUnchecked > 0) nulos.risco_nao_conferido = String(riskUnchecked);
      if (saldo === null) nulos.saldo = "nao_lido:sem_tamanho";

      const input: BriefInput = {
        alvo: { escopo: "ecossistema", chainIndexes: reads.map((r) => r.chainIndex) },
        asOfMs: deps.now(),
        familiasHabilitadas: ["ecossistema"],
        fluxo: {
          ecossistema: {
            redes: reads.length,
            lidos: reads.reduce((s, r) => s + r.hotRows, 0),
            caixaPct: saldo === null || saldo.totalUsd <= 0 ? null : Math.round((saldo.cashUsd / saldo.totalUsd) * 100),
            chaves: BRIEF_KEYS as unknown as Record<string, string>,
            fontes: { origem: "onchainos", redes: sourceByChain },
            itens: itens as never,
          },
        },
        candidatos: briefCandidates,
        trilha: null,
        risco: null,
        regime: null,
        idades,
        origens,
        nulos,
      };
      try {
        const { brief } = buildBrief(input, { maxBytes: Math.ceil((ECOSYSTEM_BRIEF_BYTES * take) / ECOSYSTEM_CANDIDATES) });
        const ecosystem: EcoContext = { observedAtMs: deps.now(), saldo, candidates, excluded };
        return { brief, candidates: brief.candidatos, onchainosCalls: sent, ecosystem };
      } catch (error) {
        if (error instanceof BriefTooLarge) throw new SourceError("brief_grande_demais", sent);
        throw error;
      }
    },
  };
}

