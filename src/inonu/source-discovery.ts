/**
 * The data source of the discovery mode of "Pedir ao Inonu" (ASK-12, fase-2 SPEC F2-DIG-4 table 4.3): "the best entries now" on ONE
 * network. It runs only when a person clicks, and it is the only thing that reads the ecosystem for the model:
 *
 *  1. the hot list (`hot-tokens`) and the smart money signals (`signals`) of the network, two reads;
 *  2. the three tokens with the best trail so far are looked at more closely: `token-risk`, `clusters` and `pools` of each, up to
 *     nine reads, risk of all three first, so a short budget still checks every candidate's risk before anything else;
 *  3. the Evidence Brief of the network: those three tokens as candidates (best first) and holding.
 *
 * The plan is the one the phase 2 spec fixes (`planDiscoveryMode`, items D1 to D14): the address tracker, the trenches and the batch
 * price are not callable today and are not tried. Every read goes through the gateway with the intent of a click and is cut to the
 * cap of the request (never more than 15); the calls counted are the ones that really left, not the cache hits. A read that fails is
 * a note in the Brief, never a zero. A token with a honeypot sign is never offered to the model.
 *
 * Nothing here calls the model, and when there is nothing to choose among (no signals, no credential, no data, only honeypots) the
 * click is refused with a constant code BEFORE the model is asked, so it costs nothing. The trail is the operational definition of
 * `trail.ts`: it describes, and never says buy or sell.
 */
import { BriefTooLarge, buildBrief, type BriefCandidate, type BriefInput } from "../intel/brief";
import { HOLD_CANDIDATE, tokenCandidate } from "../intel/candidates";
import { liquidityComponent, signalsInputs, type SignalLike } from "../intel/onchain-components";
import { buildOnchainDigest, type OnchainSources } from "../intel/onchain-digest";
import { classifyResult, type GatewayLike } from "../intel/onchain-nulos";
import { boughtComponent, trailScore, unsoldComponent, walletsComponent } from "../intel/trail";
import type { InternalGatewayResult, OnchainGatewayInternal } from "../onchain-read/gateway";
import { SourceError, type AskRequest, type BriefSource, type BuiltBrief } from "./ask";
import { MAX_ONCHAIN_CALLS, cutPlan, planDiscoveryMode, type PlanItem } from "./onchain-plan";

export interface DiscoveryDeps {
  readonly gateway: Pick<OnchainGatewayInternal, "callInternal">;
  readonly now: () => number;
}

const CHAIN = /^\d{1,12}$/;
/** The tokens looked at closely and offered to the model (the plan deepens only the first three). */
const LEADERS = 3;
const CREDENTIAL_ERRORS = new Set(["no_credentials", "incomplete_credentials"]);

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : null);
const rowsOf = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(rec).filter((r): r is Rec => r !== null) : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

const like = (result: InternalGatewayResult): GatewayLike =>
  result.ok ? { ok: true, data: result.data, meta: { ageMs: result.meta.ageMs, stale: result.meta.stale } } : { ok: false, error: result.error };

interface Group {
  readonly address: string;
  readonly rows: Rec[];
  readonly signals: SignalLike[];
}

export function createDiscoverySource(deps: DiscoveryDeps): BriefSource {
  return {
    async build(request: AskRequest, context): Promise<BuiltBrief> {
      if (request.modo !== "descoberta") throw new SourceError("modo_nao_disponivel");
      const alvo = request.alvo;
      if (alvo === undefined || "instId" in alvo || "address" in alvo || !CHAIN.test(alvo.chainIndex)) throw new SourceError("alvo_invalido");
      if (context.signal.aborted) throw new SourceError("cancelado");
      const chainIndex = alvo.chainIndex;
      const cap = Math.min(MAX_ONCHAIN_CALLS, context.maxOnchainosCalls);

      let attempted = 0;
      let sent = 0;
      let credentialFailures = 0;
      const read = async (item: PlanItem): Promise<InternalGatewayResult> => {
        if (context.signal.aborted) throw new SourceError("cancelado");
        attempted += 1;
        const result = await deps.gateway.callInternal(item.route, item.params, "user");
        if (result.sent) sent += 1;
        if (!result.ok && CREDENTIAL_ERRORS.has(result.error)) credentialFailures += 1;
        return result;
      };

      // 1. the hot list and the signals of the network
      const first = planDiscoveryMode({ chainIndex, leaders: [], trenchesChain: false, trackerEnabled: false });
      const firstPlan = cutPlan(first.filter((i) => i.id === "D1" || i.id === "D2"), cap);
      let hot: InternalGatewayResult | undefined;
      let signals: InternalGatewayResult | undefined;
      for (const item of firstPlan.kept) {
        const result = await read(item);
        if (item.id === "D1") hot = result;
        else signals = result;
      }
      if (attempted > 0 && credentialFailures === attempted) throw new SourceError("sem_credencial_onchainos");
      if (signals === undefined || !signals.ok) throw new SourceError("sem_dados_onchain");
      const signalsAnswer = signals;

      const signalRows = rowsOf(signals.data);
      const groups = new Map<string, Group>();
      for (const row of signalRows) {
        const token = rec(row.token);
        const address = text(token?.address);
        if (address === null) continue;
        const group = groups.get(address) ?? { address, rows: [], signals: [] };
        group.rows.push(row);
        group.signals.push({ amountUsd: num(row.amountUsd) ?? Number.NaN, soldRatioPct: num(row.soldRatioPct), walletCount: num(row.walletCount) ?? Number.NaN });
        groups.set(address, group);
      }
      if (groups.size === 0) throw new SourceError("sem_sinais");

      // who is best so far: purchase not yet sold, wallets, the share not sold and the liquidity, against the other tokens of the network
      const hotRows = hot !== undefined && hot.ok ? rowsOf(hot.data) : [];
      const liquidityOf = new Map<string, number>();
      for (const row of hotRows) {
        const address = text(row.address);
        const liquidity = num(row.liquidityUsd);
        if (address !== null && liquidity !== null) liquidityOf.set(address, liquidity);
      }
      const inputs = new Map([...groups.values()].map((g) => [g.address, signalsInputs(g.signals)] as const));
      const netUnsoldSet = [...inputs.values()].flatMap((i) => (i.netUnsoldUsd === null ? [] : [i.netUnsoldUsd]));
      const liquiditySet = [...liquidityOf.values()];
      const ranked = [...groups.values()]
        .map((group) => {
          const input = inputs.get(group.address)!;
          const liquidity = liquidityOf.get(group.address);
          const nota = trailScore(
            {
              compra: input.netUnsoldUsd === null ? null : boughtComponent(input.netUnsoldUsd, netUnsoldSet),
              carteiras: walletsComponent(input.walletCount),
              naoVendida: unsoldComponent(input.soldPercents),
              qualidade: null,
              concentracao: null,
              risco: null,
              liquidez: liquidity === undefined ? null : liquidityComponent(liquidity, liquiditySet),
              fluxo: null,
              sentimento: null,
            },
            { honeypot: false },
          ).nota;
          return { group, nota };
        })
        .filter((entry): entry is { group: Group; nota: number } => entry.nota !== null)
        .sort((a, b) => b.nota - a.nota || (a.group.address < b.group.address ? -1 : 1));
      const leaders = ranked.slice(0, LEADERS).map((entry) => entry.group);
      if (leaders.length === 0) throw new SourceError("sem_candidatos");

      // 2. risk, concentration and pools of the leaders, with what is left of the budget of the click
      const second = planDiscoveryMode({ chainIndex, leaders: leaders.map((g) => g.address), trenchesChain: false, trackerEnabled: false });
      const deepPlan = cutPlan(second.filter((i) => /^D(?:6|7|8|9|10|11|12|13|14)$/.test(i.id)), Math.max(0, cap - attempted));
      const answers = new Map<string, InternalGatewayResult>();
      for (const item of deepPlan.kept) answers.set(item.id, await read(item));

      // 3. one digest per leader, then the candidates
      const sets = { netUnsoldUsd: netUnsoldSet, liquidityUsd: liquiditySet };
      const candidates: BriefCandidate[] = [];
      let honeypots = 0;
      let unchecked = 0;
      leaders.forEach((group, index) => {
        const sources: { -readonly [K in keyof OnchainSources]: OnchainSources[K] } = { signals: { ok: true, data: group.rows.map(browserSignal), meta: { ageMs: signalsAnswer.meta.ageMs, stale: signalsAnswer.meta.stale } } };
        const slot = (id: string, key: "risk" | "cluster" | "pools") => {
          const answer = answers.get(id);
          if (answer !== undefined) sources[key] = like(answer);
        };
        slot(`D${6 + index}`, "risk");
        slot(`D${9 + index}`, "cluster");
        slot(`D${12 + index}`, "pools");
        const digest = buildOnchainDigest({ sources, sets, quality: null, symbol: { origin: "onchain_token", communityRecognized: null, sameSymbolMatches: 0 } });
        if (digest.honeypot === true) {
          honeypots += 1;
          return;
        }
        const checked = sources.risk !== undefined && sources.risk.ok;
        if (!checked) unchecked += 1;
        const present = Object.entries(digest.trilha.componentes).filter(([, v]) => v !== null).map(([name]) => name);
        candidates.push({
          ...tokenCandidate({ chainIndex, address: group.address, ...(digest.trilha.nota === null ? {} : { nota: digest.trilha.nota }) }),
          fatores: present,
          estado: checked ? "risco_conferido" : "risco_nao_conferido",
        });
      });
      if (candidates.length === 0) throw new SourceError("sem_candidatos");

      // what was read and how old it is, what was not and why: the unknown is a note, never a zero
      const idades: Record<string, number> = {};
      const origens: Record<string, string> = {};
      const nulos: Record<string, string> = { trilha: "por_candidato", risco: "por_candidato", regime: "nao_se_aplica_a_token" };
      for (const [key, result] of [["hot-tokens", hot], ["signals", signals]] as const) {
        const state = result === undefined ? null : classifyResult(like(result));
        if (state === null) nulos[key] = "nao_consultado:nao_pedido";
        else if (state.state === "dado") {
          origens[key] = "onchainos";
          if (state.ageMs !== null) idades[key] = state.ageMs;
        } else nulos[key] = state.nulo;
      }
      for (const item of [...first.filter((i) => !i.available), ...second.filter((i) => !i.available && /^D(?:3|4|5)$/.test(i.id))]) nulos[item.route.replace("/onchain/", "")] = `nao_consultado:${item.reason ?? "nao_disponivel"}`;
      const cutCount = deepPlan.cut.length;
      if (cutCount > 0) nulos.orcamento_do_pedido = `${cutCount}_leituras_nao_feitas`;
      if (honeypots > 0) nulos.honeypot_excluidos = String(honeypots);
      if (unchecked > 0) nulos.risco_nao_conferido = String(unchecked);

      const input: BriefInput = {
        alvo: { chainIndex, escopo: "descoberta" },
        asOfMs: deps.now(),
        familiasHabilitadas: ["trilha"],
        fluxo: { tokensComSinal: groups.size, sinais: signalRows.length, quentes: hotRows.length, lideres: leaders.length },
        candidatos: [...candidates, HOLD_CANDIDATE],
        trilha: null,
        risco: null,
        regime: null,
        idades,
        origens,
        nulos,
      };
      try {
        const { brief } = buildBrief(input);
        return { brief, candidates: brief.candidatos, onchainosCalls: sent };
      } catch (error) {
        if (error instanceof BriefTooLarge) throw new SourceError("brief_grande_demais");
        throw error;
      }
    },
  };
}

/** The digest reads signal rows in the shape the gateway answers to the browser: the same names, no wallet list. */
function browserSignal(row: Rec): Rec {
  return { amountUsd: row.amountUsd, soldRatioPct: row.soldRatioPct, walletCount: row.walletCount, priceUsd: row.priceUsd, walletType: row.walletType, tsMs: row.tsMs, token: row.token };
}
