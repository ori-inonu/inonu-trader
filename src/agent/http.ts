/**
 * HTTP face of the agent (AUT-12). The same defences as /settings and /inonu: a loopback peer and Host, an Origin exactly on the allowlist, and a custom header (`x-inonu-intent: user`) on every write that
 * forces a preflight and says a person acted. Errors carry constant codes and never echo anything received. Raising the mode needs the phrase the person types; the service, not this file, decides.
 *
 *   GET  /agent/status       everything the screen shows, in one object
 *   GET  /agent/ledger?n=    the last records of the agent's ledger (at most 200)
 *   GET  /agent/analysis     the study of the decisions for the analysis screen (funnel, what was skipped, round trips), read only
 *   POST /agent/connect      { disclosure, managed? } the one authorization: a wallet is connected, the notice read; the agent starts working
 *   POST /agent/disconnect   {}                       the way out: the agent stops at once
 *   POST /agent/wallet       { action }               connecting the wallet the agent trades from: install (the signing tool), login (the page to sign in on), poll (is it done)
 *   POST /agent/run          {}                       one cycle now
 *   PUT  /agent/config       { ...fields }            change what may be changed, all or nothing
 *   POST /agent/resolve      { orderKey, outcome }    the person's word on an order in flight (executada or falhou)
 */
import { loopbackHost, loopbackIp } from "../settings/guards";
import type { AgentService } from "./service";
import type { ConfigPatch } from "./config";

export interface AgentHttpDeps {
  readonly service: AgentService;
  readonly origins: readonly string[];
}

export type AgentHandler = (req: Request, remoteIp: string | null) => Promise<Response>;

const MAX_BODY = 4096;
const ALLOW_METHODS = "GET, POST, PUT, OPTIONS";
const ALLOW_HEADERS = "content-type, x-inonu-intent";
const LEDGER_DEFAULT = 50;
const LEDGER_MAX = 200;

export function isAgentPath(pathname: string): boolean {
  return pathname === "/agent" || pathname.startsWith("/agent/");
}

export function createAgentHandler(deps: AgentHttpDeps): AgentHandler {
  const origins = new Set(deps.origins.map((o) => o.trim()).filter(Boolean));
  const headers = (origin: string): Record<string, string> => ({ "content-type": "application/json", "cache-control": "no-store", vary: "Origin", "access-control-allow-origin": origin });
  const json = (origin: string, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: headers(origin) });
  const fail = (origin: string, code: string, status: number) => json(origin, { ok: false, code }, status);
  const deny = (code: string) => new Response(JSON.stringify({ ok: false, code }), { status: 403, headers: { "content-type": "application/json", "cache-control": "no-store", vary: "Origin" } });

  async function readBody(req: Request, origin: string): Promise<{ value?: Record<string, unknown>; error?: Response }> {
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
      return { value: value as Record<string, unknown> };
    } catch {
      return { error: fail(origin, "bad_request", 400) };
    }
  }

  return async (req, remoteIp) => {
    if (!loopbackIp(remoteIp) || !loopbackHost(req.headers.get("host"))) return deny("forbidden");
    const origin = req.headers.get("origin");
    if (origin === null || !origins.has(origin)) return deny("origin_not_allowed");
    const url = new URL(req.url);
    const { pathname } = url;

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "cache-control": "no-store", vary: "Origin", "access-control-allow-origin": origin, "access-control-allow-methods": ALLOW_METHODS, "access-control-allow-headers": ALLOW_HEADERS } });
    }
    const writes = req.method === "POST" || req.method === "PUT" || req.method === "DELETE";
    if (writes && req.headers.get("x-inonu-intent") !== "user") return deny("intent_required");

    if (pathname === "/agent/status") {
      if (req.method !== "GET") return fail(origin, "method_not_allowed", 405);
      return json(origin, { ok: true, status: deps.service.status() });
    }

    if (pathname === "/agent/analysis") {
      if (req.method !== "GET") return fail(origin, "method_not_allowed", 405);
      if (deps.service.analysis === undefined) return fail(origin, "sem_analise", 404);
      return json(origin, { ok: true, analysis: deps.service.analysis() });
    }

    if (pathname === "/agent/ledger") {
      if (req.method !== "GET") return fail(origin, "method_not_allowed", 405);
      const n = Number(url.searchParams.get("n") ?? LEDGER_DEFAULT);
      const count = Number.isInteger(n) && n > 0 ? Math.min(n, LEDGER_MAX) : LEDGER_DEFAULT;
      return json(origin, { ok: true, records: deps.service.ledgerTail(count) });
    }

    if (pathname === "/agent/connect") {
      if (req.method !== "POST") return fail(origin, "method_not_allowed", 405);
      const body = await readBody(req, origin);
      if (body.error) return body.error;
      const { disclosure, managed } = body.value!;
      const keys = Object.keys(body.value!);
      if (typeof disclosure !== "string" || disclosure.length > 40 || keys.some((k) => k !== "disclosure" && k !== "managed")) return fail(origin, "bad_request", 400);
      let wallet: ConfigPatch["managed"];
      if (managed !== undefined) {
        const m = managed as Record<string, unknown> | null;
        if (m === null || typeof m !== "object" || Array.isArray(m) || Object.keys(m).length !== 3 || (m.kind !== "propria" && m.kind !== "agentica") || !(m.evm === null || typeof m.evm === "string") || !(m.solana === null || typeof m.solana === "string")) return fail(origin, "bad_request", 400);
        wallet = { kind: m.kind, evm: m.evm as string | null, solana: m.solana as string | null };
      }
      const result = deps.service.connect({ disclosure, ...(wallet === undefined ? {} : { managed: wallet }) });
      return result.ok ? json(origin, { ok: true, state: result.state }) : fail(origin, result.reason, result.reason === "carteira_invalida" ? 400 : result.reason === "nao_gravou" ? 500 : 409);
    }

    if (pathname === "/agent/wallet") {
      if (req.method !== "POST") return fail(origin, "method_not_allowed", 405);
      const body = await readBody(req, origin);
      if (body.error) return body.error;
      const { action } = body.value!;
      if (Object.keys(body.value!).length !== 1 || (action !== "install" && action !== "login" && action !== "poll")) return fail(origin, "bad_request", 400);
      const result = await deps.service.wallet(action);
      return result.ok ? json(origin, { ok: true, wallet: result.wallet }) : fail(origin, /^[a-z_]{1,50}$/.test(result.reason) ? result.reason : "wallet_falhou", 409);
    }

    if (pathname === "/agent/disconnect") {
      if (req.method !== "POST") return fail(origin, "method_not_allowed", 405);
      deps.service.disconnect();
      return json(origin, { ok: true });
    }

    if (pathname === "/agent/run") {
      if (req.method !== "POST") return fail(origin, "method_not_allowed", 405);
      return json(origin, { ok: true, report: await deps.service.runNow() });
    }

    if (pathname === "/agent/resolve") {
      if (req.method !== "POST") return fail(origin, "method_not_allowed", 405);
      const body = await readBody(req, origin);
      if (body.error) return body.error;
      const { orderKey, outcome } = body.value!;
      if (Object.keys(body.value!).length !== 2 || typeof orderKey !== "string" || !/^[A-Za-z0-9_.:@|-]{1,300}$/.test(orderKey) || (outcome !== "executada" && outcome !== "falhou")) return fail(origin, "bad_request", 400);
      const result = deps.service.resolve(orderKey, outcome);
      return result.ok ? json(origin, { ok: true }) : fail(origin, result.reason, result.reason === "nao_gravou" ? 500 : 409);
    }

    if (pathname === "/agent/config") {
      if (req.method !== "PUT") return fail(origin, "method_not_allowed", 405);
      const body = await readBody(req, origin);
      if (body.error) return body.error;
      const result = deps.service.updateConfig(body.value as ConfigPatch);
      if (result.ok) return json(origin, { ok: true, config: result.config });
      return fail(origin, result.reason, result.reason === "configuracao_invalida" ? 400 : result.reason === "nao_gravou" ? 500 : 409);
    }

    return fail(origin, "not_found", 404);
  };
}
