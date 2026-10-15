/**
 * HTTP face of "Pedir ao Inonu" (T7.3, ASK-5, ASK-11). Same defences as /settings: the main process listens where the
 * browser can reach it, so the handler checks a loopback peer and Host, an Origin that is exactly on the allowlist, and a
 * custom header (`x-inonu-intent: user`) that forces a preflight and says a person clicked. Errors carry constant codes and
 * never echo anything received.
 *
 *   POST   /inonu/ask          { modo, alvo?, alvos?, textoLivre? }   200 respondido, 202 em andamento, 400 pedido invalido,
 *                                                              429 teto ou cooldown, 503 sem chave, 502 erro
 *   DELETE /inonu/ask/<id>     cancel
 *   GET    /inonu/opportunities the board of the opportunity engine: the liquid pairs with the factors of their own daily history (free public reads, no model)
 *   GET    /inonu/status       whether a model key exists, what runs, what today measured
 *   GET    /inonu/ledger       what the ledger measured (today, month, the latest calls) and the price per token in force
 *   PUT    /inonu/prices       { input, output } dollars per million tokens, or both null to clear
 *   GET    /inonu/providers    the addresses the app talks to (the versioned manifest), read only
 *   GET    /inonu/perfil       what the person chose to risk (capital and the share to lose per operation)
 *   PUT    /inonu/perfil       { capitalUsd, riskPct } or both null to clear
 *   GET    /inonu/placar       the scoreboard of the answers (measured by what the market did next) and the recorder's health
 */
import { loopbackHost, loopbackIp } from "../settings/guards";
import { isAskRequestId, type AskResponse, type AskStatus, type Asker } from "./ask";
import type { ScanState } from "../opportunity/scan";
import type { ChainIconService } from "./chain-icons";
import type { IconService } from "./icons";

export interface InonuHttpDeps {
  readonly asker: Asker;
  readonly origins: readonly string[];
  readonly modelConfigured: () => boolean;
  /** What today's ledger measured; usd is null when some cost is unknown. */
  readonly today: () => { readonly calls: number; readonly usd: number | null };
  /** Currency icons fetched by this process and served from the desk's own origin. Absent: the route does not exist. */
  readonly icons?: IconService;
  /** The logo of each network, from the provider's own list of networks. Absent: the route does not exist. */
  readonly chainIcons?: ChainIconService;
  /** The live engine's progress: feed state, messages per second, and the warm-up of each instrument. */
  readonly engine?: () => unknown;
  /** The board of the opportunity engine (free public exchange reads, no model): what the scan has now, starting one when the board is old. Absent: the route does not exist. */
  readonly opportunities?: () => ScanState;
  /** What the model would receive for an instrument, built from the same sources, without calling the model. */
  /** The chart layer's data for an instrument (free: the model is never involved). */
  readonly overlay?: (instId: string) => Promise<({ ok: true } & object) | { ok: false; code: string }>;
  readonly preview?: (instId: string) => Promise<{ ok: true; brief: unknown; bytes: number; candidates: string[] } | { ok: false; code: string }>;
  /** What the ledger measured and the prices in force (T7.4). Absent: the route does not exist. */
  readonly usage?: () => { readonly today: unknown; readonly month: unknown; readonly recent: readonly unknown[]; readonly prices: { readonly input: number | null; readonly output: number | null } };
  /** The Placar of the answers and the health of the recorder (INT-0.10). Absent: the route does not exist. */
  readonly placar?: () => unknown;
  /** What the person chose to risk (INT-1.7). `write` is false for anything that is not a sensible profile. Absent: the route does not exist. */
  readonly perfil?: { readonly read: () => unknown; readonly write: (value: unknown) => boolean };
  /** The manifest of addresses (src/settings/providers.json). Absent: the route does not exist. */
  readonly providers?: () => readonly unknown[];
  /** Stores the price per million tokens; false when it could not be stored. */
  readonly setPrices?: (prices: { readonly input: number | null; readonly output: number | null }) => boolean;
}

export type InonuHandler = (req: Request, remoteIp: string | null) => Promise<Response>;

const MAX_BODY = 2048;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const ALLOW_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
/** A price above this per million tokens is a typing mistake, not a price. */
const MAX_USD_PER_MTOK = 10_000;
const ALLOW_HEADERS = "content-type, x-inonu-intent, x-inonu-request-id";

export function isInonuPath(pathname: string): boolean {
  return pathname.startsWith("/inonu/");
}

const STATUS_CODE: Record<AskStatus, number> = { respondido: 200, em_andamento: 202, teto_atingido: 429, cooldown: 429, sem_chave: 503, cancelado: 200, erro: 502 };

/** A path piece decoded, or the empty text when it is not valid percent encoding: the icon stores then answer "no such icon" instead of the handler throwing. */
function safeDecode(piece: string): string {
  try {
    return decodeURIComponent(piece);
  } catch {
    return "";
  }
}

export function createInonuHandler(deps: InonuHttpDeps): InonuHandler {
  const origins = new Set(deps.origins.map((o) => o.trim()).filter(Boolean));

  const headers = (origin: string): Record<string, string> => ({ "content-type": "application/json", "cache-control": "no-store", vary: "Origin", "access-control-allow-origin": origin });
  const json = (origin: string, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: headers(origin) });
  const fail = (origin: string, code: string, status: number) => json(origin, { ok: false, code, advisory: true, execution: "never" }, status);
  const deny = (code: string) => new Response(JSON.stringify({ ok: false, code }), { status: 403, headers: { "content-type": "application/json", "cache-control": "no-store", vary: "Origin" } });

  async function readBody(req: Request, origin: string): Promise<{ value?: unknown; error?: Response }> {
    const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (type !== "application/json") return { error: fail(origin, "unsupported_media_type", 415) };
    const length = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > MAX_BODY) return { error: fail(origin, "payload_too_large", 413) };
    let raw = "";
    try {
      raw = await req.text();
    } catch {
      return { error: fail(origin, "bad_request", 400) };
    }
    if (new TextEncoder().encode(raw).length > MAX_BODY) return { error: fail(origin, "payload_too_large", 413) };
    try {
      const value: unknown = JSON.parse(raw);
      if (value === null || typeof value !== "object" || Array.isArray(value)) return { error: fail(origin, "bad_request", 400) };
      return { value };
    } catch {
      return { error: fail(origin, "bad_request", 400) };
    }
  }

  return async (req, remoteIp) => {
    if (!loopbackIp(remoteIp) || !loopbackHost(req.headers.get("host"))) return deny("forbidden");
    const origin = req.headers.get("origin");
    if (origin === null || !origins.has(origin)) return deny("origin_not_allowed");
    const { pathname } = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "cache-control": "no-store", vary: "Origin", "access-control-allow-origin": origin, "access-control-allow-methods": ALLOW_METHODS, "access-control-allow-headers": ALLOW_HEADERS } });
    }

    const writes = req.method === "POST" || req.method === "DELETE" || req.method === "PUT";
    if (writes && req.headers.get("x-inonu-intent") !== "user") return deny("intent_required");

    if (pathname.startsWith("/inonu/icon/") && deps.icons) {
      if (req.method !== "GET") return fail(origin, "method_not_allowed", 405);
      const icon = await deps.icons.get(safeDecode(pathname.slice("/inonu/icon/".length)));
      if (!icon.ok) return fail(origin, icon.reason === "bad_symbol" ? "bad_request" : "not_found", icon.reason === "bad_symbol" ? 400 : 404);
      return new Response(icon.bytes, { status: 200, headers: { "content-type": icon.type, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'", vary: "Origin", "access-control-allow-origin": origin } });
    }

    if (pathname.startsWith("/inonu/chain-icon/") && deps.chainIcons) {
      if (req.method !== "GET") return fail(origin, "method_not_allowed", 405);
      const logo = await deps.chainIcons.get(safeDecode(pathname.slice("/inonu/chain-icon/".length)));
      if (!logo.ok) return fail(origin, logo.reason === "bad_chain" ? "bad_request" : "not_found", logo.reason === "bad_chain" ? 400 : 404);
      return new Response(logo.bytes, { status: 200, headers: { "content-type": logo.type, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'", vary: "Origin", "access-control-allow-origin": origin } });
    }

    if (pathname === "/inonu/opportunities" && deps.opportunities) {
      if (req.method !== "GET") return fail(origin, "method_not_allowed", 405);
      return json(origin, { ok: true, advisory: true, execution: "never", ...deps.opportunities() });
    }

    if (pathname === "/inonu/engine" && deps.overlay) {
      if (req.method !== "GET") return fail(origin, "method_not_allowed", 405);
      const instId = new URL(req.url).searchParams.get("instId") ?? "";
      if (!/^[A-Z0-9-]{3,60}$/.test(instId)) return fail(origin, "alvo_invalido", 400);
      const result = await deps.overlay(instId);
      return result.ok ? json(origin, result) : fail(origin, result.code, 400);
    }

    if (pathname === "/inonu/brief" && deps.preview) {
      if (req.method !== "GET") return fail(origin, "method_not_allowed", 405);
      const instId = new URL(req.url).searchParams.get("instId") ?? "";
      if (!/^[A-Z0-9-]{3,60}$/.test(instId)) return fail(origin, "alvo_invalido", 400);
      const result = await deps.preview(instId);
      return result.ok ? json(origin, { ok: true, brief: result.brief, bytes: result.bytes, candidates: result.candidates, advisory: true, execution: "never" }) : fail(origin, result.code, 400);
    }

    if (pathname === "/inonu/ledger" && deps.usage) {
      if (req.method !== "GET") return fail(origin, "method_not_allowed", 405);
      const usage = deps.usage();
      return json(origin, { ok: true, today: usage.today, month: usage.month, recent: usage.recent, prices: usage.prices, advisory: true, execution: "never" });
    }

    if (pathname === "/inonu/placar" && deps.placar) {
      if (req.method !== "GET") return fail(origin, "method_not_allowed", 405);
      return json(origin, { ok: true, ...(deps.placar() as object), advisory: true, execution: "never" });
    }

    if (pathname === "/inonu/perfil" && deps.perfil) {
      if (req.method === "GET") return json(origin, { ok: true, perfil: deps.perfil.read(), advisory: true, execution: "never" });
      if (req.method !== "PUT") return fail(origin, "method_not_allowed", 405);
      const body = await readBody(req, origin);
      if (body.error) return body.error;
      if (!deps.perfil.write(body.value)) return fail(origin, "perfil_invalido", 400);
      return json(origin, { ok: true, perfil: deps.perfil.read(), advisory: true, execution: "never" });
    }

    if (pathname === "/inonu/providers" && deps.providers) {
      if (req.method !== "GET") return fail(origin, "method_not_allowed", 405);
      return json(origin, { ok: true, providers: deps.providers(), advisory: true, execution: "never" });
    }

    if (pathname === "/inonu/prices" && deps.setPrices) {
      if (req.method !== "PUT") return fail(origin, "method_not_allowed", 405);
      const body = await readBody(req, origin);
      if (body.error) return body.error;
      const value = body.value as Record<string, unknown>;
      const keys = Object.keys(value);
      const price = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= MAX_USD_PER_MTOK;
      const both = keys.length === 2 && "input" in value && "output" in value;
      const clear = both && value.input === null && value.output === null;
      if (!both || (!clear && !(price(value.input) && price(value.output)))) return fail(origin, "precos_invalidos", 400);
      const prices = clear ? { input: null, output: null } : { input: value.input as number, output: value.output as number };
      if (!deps.setPrices(prices)) return fail(origin, "nao_foi_possivel_salvar", 500);
      return json(origin, { ok: true, prices, advisory: true, execution: "never" });
    }

    if (pathname === "/inonu/status") {
      if (req.method !== "GET") return fail(origin, "method_not_allowed", 405);
      const running = deps.asker.running();
      return json(origin, { ok: true, modelConfigured: deps.modelConfigured(), running: running === null ? null : { id: running.id }, today: deps.today(), engine: deps.engine?.() ?? { feed: null, messagesPerSecond: 0, instruments: [] }, advisory: true, execution: "never" });
    }

    if (pathname === "/inonu/ask") {
      if (req.method !== "POST") return fail(origin, "method_not_allowed", 405);
      const requestId = req.headers.get("x-inonu-request-id");
      if (requestId !== null && !isAskRequestId(requestId)) return fail(origin, "request_id_invalido", 400);
      const body = await readBody(req, origin);
      if (body.error) return body.error;
      const response: AskResponse = await deps.asker.ask(body.value as never, requestId === null ? undefined : { requestId: requestId.toLowerCase() });
      const status = response.status === "erro" && response.motivo === "pedido_invalido" ? 400 : STATUS_CODE[response.status];
      return json(origin, response, status);
    }

    if (pathname.startsWith("/inonu/request/")) {
      if (req.method !== "DELETE") return fail(origin, "method_not_allowed", 405);
      const requestId = pathname.slice("/inonu/request/".length);
      if (!isAskRequestId(requestId)) return fail(origin, "request_id_invalido", 400);
      if (!deps.asker.cancelRequest) return fail(origin, "not_found", 404);
      return deps.asker.cancelRequest(requestId.toLowerCase()) ? json(origin, { ok: true, advisory: true, execution: "never" }) : fail(origin, "teto_de_pedidos", 429);
    }

    if (pathname.startsWith("/inonu/ask/")) {
      if (req.method !== "DELETE") return fail(origin, "method_not_allowed", 405);
      const id = pathname.slice("/inonu/ask/".length);
      if (!ID.test(id)) return fail(origin, "bad_request", 400);
      return deps.asker.cancel(id) ? json(origin, { ok: true, advisory: true, execution: "never" }) : fail(origin, "not_found", 404);
    }

    return fail(origin, "not_found", 404);
  };
}
