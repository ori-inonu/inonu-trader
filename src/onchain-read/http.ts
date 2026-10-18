/**
 * /onchain/* HTTP routes (ONC-7, ONC-8): GET only, same guard order as /settings (loopback IP, loopback Host,
 * exact Origin), preflight with x-inonu-intent, parameters only through the query string. Unknown routes get
 * a constant 404 before any provider call; /onchain/budget and /onchain/status are local. No secret ever
 * leaves through this handler.
 */
import { loopbackHost, loopbackIp } from "../settings/guards";
import { endpointFor } from "./catalog";
import type { OnchainGateway } from "./gateway";

export interface OnchainHttpDeps {
  readonly gateway: OnchainGateway;
  readonly origins: readonly string[];
}

export type OnchainHandler = (req: Request, remoteIp: string | null) => Promise<Response>;

const ALLOW_METHODS = "GET, OPTIONS";
const ALLOW_HEADERS = "content-type, x-inonu-intent";

export function isOnchainPath(pathname: string): boolean {
  return pathname.startsWith("/onchain/");
}

export function createOnchainHandler(deps: OnchainHttpDeps): OnchainHandler {
  const origins = new Set(deps.origins.map((o) => o.trim()).filter(Boolean));

  const base = (origin: string): Record<string, string> => ({
    "content-type": "application/json",
    "cache-control": "no-store",
    vary: "Origin",
    "access-control-allow-origin": origin,
  });
  const fail = (origin: string, code: string, status: number) =>
    new Response(JSON.stringify({ ok: false, error: code }), { status, headers: base(origin) });
  const deny = (code: string, status: number) =>
    new Response(JSON.stringify({ ok: false, error: code }), {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store", vary: "Origin" },
    });
  const ok = (origin: string, body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: base(origin) });

  return async (req, remoteIp) => {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const origin = req.headers.get("origin");

    if (!loopbackIp(remoteIp)) return deny("forbidden", 403);
    if (!loopbackHost(req.headers.get("host"))) return deny("forbidden", 403);
    if (origin === null || !origins.has(origin)) return deny("forbidden", 403);
    const at = origin;
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "cache-control": "no-store",
          vary: "Origin",
          "access-control-allow-origin": at,
          "access-control-allow-methods": ALLOW_METHODS,
          "access-control-allow-headers": ALLOW_HEADERS,
        },
      });
    }
    if (req.method !== "GET") return fail(at, "method_not_allowed", 405);

    const intent = req.headers.get("x-inonu-intent") === "user" ? "user" : "background";

    if (pathname === "/onchain/budget") return ok(at, deps.gateway.budget());
    if (pathname === "/onchain/status") return ok(at, deps.gateway.status());

    // Unknown route: constant 404 before anything touches the network.
    if (endpointFor(pathname) === undefined) return fail(at, "not_found", 404);

    const params: Record<string, string> = {};
    for (const [k, v] of url.searchParams) params[k] = v;
    const result = await deps.gateway.call(pathname, params, intent);
    if (!result.ok) {
      return fail(at, result.error, result.error === "bad_request" ? 400 : 200);
    }
    return ok(at, result);
  };
}
