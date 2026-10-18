/**
 * The decision log (INT-0.9, JEV-4): wraps the asker of "Pedir ao Inonu" and, without changing a single thing it answers,
 *
 *  - takes a snapshot of the instrument at the moment of the click (before the model is asked, so the labels measure from the price
 *    the person saw, not from the price a few seconds later) when the click is about one OKX instrument;
 *  - writes one DecisionRecord for every answer the model gave, with the id of that snapshot, so the outcome can be joined later.
 *
 * For a click about one OKX instrument it also composes the Veredito (src/verdict) from that snapshot and attaches it to the response
 * as `veredito`; every other field of the response is the asker's, untouched. The action in the Veredito is always the model's.
 * It adds no call to the model, spends no OnchainOS quota, and a failure of the recorder never changes the answer: without a snapshot
 * the Veredito has no plan and no reasons (and says so), and the response is otherwise exactly what the asker produced. A reused answer is recorded as reused so the Placar does not count it twice, and a
 * second click on the same instrument within a minute reuses the snapshot of the first instead of reading the market again.
 */
import type { Asker, AskResponse } from "../inonu/ask";
import { composeVerdict } from "../verdict/compose";
import { targetsFrom } from "../verdict/targets";
import type { RiskProfile, Verdict } from "../verdict/types";
import type { OutcomeStore } from "./store";
import type { Snapshot } from "./types";

const REUSE_SNAPSHOT_MS = 60_000;
const SNAPSHOT_WAIT_MS = 8_000;

export interface DecisionLogDeps {
  readonly recorder: { snapshotNow(instId: string, origem: Snapshot["origem"], signal?: AbortSignal): Promise<Snapshot | null> };
  readonly store: OutcomeStore;
  readonly now: () => number;
  /** Decision logging follows the same switch as the recorder. */
  readonly enabled: () => boolean;
  /** What the person chose to risk; read at the moment of each answer, since they can change it while the app runs. */
  readonly profile?: () => RiskProfile;
  /** Whether the Placar already has a number. */
  readonly placarMeasured?: () => boolean;
  /** What the model call left about its own answers (consistency, orderings), taken once by the hash of the Brief. Absent: the Veredito says it is not informed. */
  readonly insights?: { take(briefHash: string | null): { readonly consistency: number | null; readonly orderingsAgree: boolean | null } | null };
  /** How long the answer waits for the snapshot of the click before giving the Veredito without it. */
  readonly snapshotWaitMs?: number;
}

export type AnswerWithVerdict = AskResponse & { readonly veredito?: Verdict };

/**
 * What the log wraps. It is wider than `Asker` on purpose: the asker of the core can take a second argument (the options of the
 * caller, such as the id of the request it owns) and can cancel a request by that id. The log forwards both untouched, so wrapping
 * the asker never changes who owns a request or who may cancel it.
 */
export interface DecisionLogAsker {
  ask(request: never, options?: never): Promise<AskResponse>;
  cancel(id: string): boolean;
  running(): ReturnType<Asker["running"]>;
  cancelRequest?(id: string): boolean;
}

/** The OKX instrument a request is about, or null (a ranking, a token, a whole network, a filter, or anything malformed). */
export function instrumentOf(request: unknown): string | null {
  if (request === null || typeof request !== "object") return null;
  const r = request as { modo?: unknown; alvo?: unknown };
  if (r.modo !== "ativo" || r.alvo === null || typeof r.alvo !== "object") return null;
  const instId = (r.alvo as { instId?: unknown }).instId;
  return typeof instId === "string" && /^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}(-SWAP)?$/.test(instId) ? instId : null;
}

/** The value, or null when it did not come in time. The timer is cleared as soon as the race is over, so nothing is left behind. */
function within<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

const marketOf = (instId: string): "spot" | "perp" => (instId.endsWith("-SWAP") ? "perp" : "spot");

function verdictFor(instId: string, response: AskResponse, snapshot: Snapshot | null, deps: DecisionLogDeps): Verdict {
  const decisao = response.decisao!;
  const side = decisao.action === "sell" ? "venda" : "compra";
  const zoneId = decisao.candidateId?.startsWith("zona:") === true ? decisao.candidateId.slice(5) : null;
  const zone = zoneId === null ? null : snapshot?.zones.todas?.find((z) => z.id === zoneId) ?? null;
  return composeVerdict({
    action: decisao.action,
    market: snapshot?.market ?? marketOf(instId),
    price: snapshot?.price ?? null,
    jev: deps.insights?.take(response.briefHash) ?? null, // null: the card says the consistency is not informed
    features: snapshot?.features ?? null,
    zone,
    atr15m: snapshot?.atr15m ?? null,
    costRoundTripBps: snapshot?.costRoundTripBps ?? null,
    targets: snapshot === null ? [] : targetsFrom(snapshot, side),
    profile: deps.profile?.() ?? null,
    placarMedido: deps.placarMeasured?.() ?? false,
  });
}

export function withDecisionLog<A extends DecisionLogAsker>(asker: A, deps: DecisionLogDeps): A {
  const recent = new Map<string, { readonly atMs: number; readonly snapshot: Promise<Snapshot | null> }>();

  const snapshotFor = (instId: string): Promise<Snapshot | null> => {
    const hit = recent.get(instId);
    if (hit !== undefined && deps.now() - hit.atMs < REUSE_SNAPSHOT_MS) return hit.snapshot;
    const snapshot = deps.recorder.snapshotNow(instId, "pedido").catch(() => null);
    recent.set(instId, { atMs: deps.now(), snapshot });
    return snapshot;
  };

  const inner = asker as unknown as { ask(request: unknown, options?: unknown): Promise<AskResponse> };
  const wrapped = {
    async ask(request: unknown, options?: unknown) {
      const instId = deps.enabled() ? instrumentOf(request) : null;
      const pending = instId === null ? Promise.resolve(null) : snapshotFor(instId);
      const response: AskResponse = options === undefined ? await inner.ask(request) : await inner.ask(request, options);
      if (!deps.enabled() || response.status !== "respondido" || response.decisao === undefined) return response;
      try {
        const wait = deps.snapshotWaitMs ?? SNAPSHOT_WAIT_MS;
        const snapshot = await within(pending, wait);
        let veredito: Verdict | null = null;
        try {
          veredito = instId === null ? null : verdictFor(instId, response, snapshot, deps);
        } catch {
          veredito = null; // the record of the answer must not depend on the words around it
        }
        const modo = typeof (request as { modo?: unknown } | null)?.modo === "string" ? String((request as { modo: string }).modo) : "desconhecido";
        deps.store.appendDecision({
          id: response.id,
          atMs: deps.now(),
          instId,
          modo,
          action: response.decisao.action,
          candidateId: response.decisao.candidateId,
          briefHash: response.briefHash,
          snapshotId: snapshot?.id ?? null,
          reutilizado: response.reutilizado === true,
          probabilidades: null,
          veredito: veredito === null ? null : { selo: veredito.selo, forcadoPor: veredito.forcadoPor },
        });
        return veredito === null ? response : ({ ...response, veredito } satisfies AnswerWithVerdict);
      } catch {
        // the log is an extra: it never changes what the person is told
        return response;
      }
    },
    cancel: (id: string) => asker.cancel(id),
    running: () => asker.running(),
    ...(asker.cancelRequest === undefined ? {} : { cancelRequest: (id: string) => asker.cancelRequest!(id) }),
  };
  return wrapped as unknown as A;
}
