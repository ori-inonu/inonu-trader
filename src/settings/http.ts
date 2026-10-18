/**
 * /settings HTTP routes (CFG-3, CFG-4, CFG-5). The main server listens on every interface, so the defence is
 * this handler, not the network: loopback remote IP, a loopback Host header, an Origin that is exactly on the
 * dashboard allowlist and a custom header that forces preflight. Errors carry constant codes and never echo a
 * received value, a file path or a system error, and no secret value is ever returned or logged.
 */
import { loopbackHost, loopbackIp } from "./guards";
import { isSecretId, SettingsError, type SecretId, type SettingsStore } from "./store";

export interface SettingsDeps {
  readonly store: SettingsStore;
  readonly origins: readonly string[];
  /** Signs one free OKX call with the stored credential; absent until the gateway wires it. */
  readonly probeOnchainos?: (c: { apiKey: string; secret: string; passphrase: string }) => Promise<{ ok: boolean; code: string }>;
  readonly now?: () => number;
}

export type SettingsHandler = (req: Request, remoteIp: string | null) => Promise<Response>;

const MAX_BODY = 4096;
const MAX_WRITES_PER_MINUTE = 20;
const ALLOW_METHODS = "GET, PUT, DELETE, POST, OPTIONS";
const ALLOW_HEADERS = "content-type, x-inonu-settings";

export function isSettingsPath(pathname: string): boolean {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}

export function createSettingsHandler(deps: SettingsDeps): SettingsHandler {
  const origins = new Set(deps.origins.map((o) => o.trim()).filter(Boolean));
  const now = deps.now ?? Date.now;
  const writes: number[] = [];

  const base = (origin: string): Record<string, string> => ({
    "content-type": "application/json",
    "cache-control": "no-store",
    vary: "Origin",
    "access-control-allow-origin": origin,
  });
  const fail = (origin: string, code: string, status: number) =>
    new Response(JSON.stringify({ ok: false, code }), { status, headers: base(origin) });
  /** Guard failures answer before the origin is validated, so they never echo it in allow-origin. */
  const deny = (code: string, status: number) =>
    new Response(JSON.stringify({ ok: false, code }), {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store", vary: "Origin" },
    });
  const ok = (origin: string, body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: base(origin) });

  async function body(req: Request, origin: string, allowed: readonly string[]): Promise<{ value?: Record<string, unknown>; error?: Response }> {
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
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return { error: fail(origin, "bad_request", 400) };
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) return { error: fail(origin, "bad_request", 400) };
    for (const key of Object.keys(value)) if (!allowed.includes(key)) return { error: fail(origin, "bad_request", 400) };
    return { value: value as Record<string, unknown> };
  }

  function writeAllowed(origin: string): Response | null {
    const cutoff = now() - 60_000;
    while (writes.length > 0 && writes[0]! <= cutoff) writes.shift();
    if (writes.length >= MAX_WRITES_PER_MINUTE) return fail(origin, "rate_limited", 429);
    writes.push(now());
    return null;
  }

  function storeError(origin: string, error: unknown): Response {
    const code = error instanceof SettingsError ? error.code : "store_error";
    const status = code.startsWith("value_") || code.startsWith("invalid_") ? 400 : 500;
    return fail(origin, code, status);
  }

  return async (req, remoteIp) => {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const origin = req.headers.get("origin");

    // Guards, before anything else. A request without an exact allowed origin still gets a constant 403.
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
    if (req.headers.get("x-inonu-settings") !== "1") return fail(at, "forbidden", 403);

    if (req.method === "GET" && pathname === "/settings") {
      const status = deps.store.status();
      return ok(at, { secrets: status.secrets, okx: status.okx, ...(status.vault === undefined ? {} : { vault: status.vault }), prefs: deps.store.prefs() });
    }

    if (req.method === "PUT" && pathname === "/settings/secrets") {
      const limited = writeAllowed(at);
      if (limited) return limited;
      const parsed = await body(req, at, ["id", "value"]);
      if (parsed.error) return parsed.error;
      const { id, value } = parsed.value!;
      if (!isSecretId(id)) return fail(at, "invalid_id", 400);
      try {
        deps.store.set(id, value as string);
      } catch (error) {
        return storeError(at, error);
      }
      const status = deps.store.status();
      return ok(at, { secrets: status.secrets, okx: status.okx });
    }

    const del = /^\/settings\/secrets\/([A-Za-z]+)$/.exec(pathname);
    if (req.method === "DELETE" && del) {
      const limited = writeAllowed(at);
      if (limited) return limited;
      const id = del[1] as SecretId;
      if (!isSecretId(id)) return fail(at, "invalid_id", 400);
      try {
        deps.store.clear(id);
      } catch (error) {
        return storeError(at, error);
      }
      const status = deps.store.status();
      return ok(at, { secrets: status.secrets, okx: status.okx });
    }

    if (req.method === "PUT" && pathname === "/settings/prefs") {
      const limited = writeAllowed(at);
      if (limited) return limited;
      const parsed = await body(req, at, ["onchain"]);
      if (parsed.error) return parsed.error;
      try {
        const prefs = deps.store.setPrefs({ onchain: parsed.value!.onchain as never });
        return ok(at, { prefs });
      } catch (error) {
        return storeError(at, error);
      }
    }

    if (req.method === "POST" && pathname === "/settings/test/onchainos") {
      // A probe result is a normal answer, not a request error: the body carries ok and code.
      const credentials = deps.store.credentials();
      if (credentials.okx === null) return ok(at, { ok: false, code: "incomplete_credentials" });
      if (!deps.probeOnchainos) return ok(at, { ok: false, code: "not_wired" });
      try {
        const result = await deps.probeOnchainos(credentials.okx);
        return ok(at, { ok: result.ok, code: result.code });
      } catch {
        return ok(at, { ok: false, code: "probe_error" });
      }
    }

    if (req.method === "POST" && pathname === "/settings/test/jev") {
      const credentials = deps.store.credentials();
      if (credentials.typesafeAiApiKey === null) return ok(at, { ok: false, code: "absent" });
      return ok(at, { ok: true, code: "format_ok", tested: false });
    }

    if (req.method !== "GET" && req.method !== "PUT" && req.method !== "DELETE" && req.method !== "POST") return fail(at, "method_not_allowed", 405);
    return fail(at, "not_found", 404);
  };
}
