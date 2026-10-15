/**
 * Browser client for the local /settings routes. Every call carries the x-inonu-settings header that forces
 * preflight on the backend, carries login cookies only for relative app APIs, and parses answers defensively. A stored secret value is
 * never returned by the API, so nothing here ever holds one after the field that sent it is cleared.
 */
import { backendSession } from "../backend-session";

export type SecretId = "typesafeAiApiKey" | "okxWeb3ApiKey" | "okxWeb3ApiSecret" | "okxWeb3ApiPassphrase";

export interface SecretStatus {
  readonly configured: boolean;
  readonly last4: string | null;
  readonly updatedAtMs: number | null;
  readonly origin?: "local" | "vault" | "process_environment" | "windows_user" | "windows_machine" | null;
}

export type OkxCredentialState = "absent" | "incomplete" | "complete";

export interface OnchainPrefs {
  readonly capBasic: number;
  readonly capPremium: number;
  readonly background: boolean;
  readonly defaultChainIndex: string | null;
}

export interface UserPrefs {
  readonly version: 1;
  readonly onchain: OnchainPrefs;
}

export interface SettingsSnapshot {
  /** Hosted provisioning is immutable through the page; only presence is exposed. */
  readonly readOnly?: boolean;
  readonly secrets: Record<SecretId, SecretStatus>;
  readonly okx: { readonly state: OkxCredentialState };
  /** Present only when the vault of the Windows did not answer: the keys could not be read, which is not the same as absent. */
  readonly vault?: "indisponivel";
  readonly prefs: UserPrefs;
}

/** The body of a successful mutation: the new status without prefs. */
export interface SecretsStatus {
  readonly secrets: Record<SecretId, SecretStatus>;
  readonly okx: { readonly state: OkxCredentialState };
}

export const SECRET_IDS: readonly SecretId[] = ["typesafeAiApiKey", "okxWeb3ApiKey", "okxWeb3ApiSecret", "okxWeb3ApiPassphrase"];

export const SETTINGS_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";

export type SettingsErrorCode = "network" | "http" | "bad_response";

/** One constant failure shape: the server code is data, never an echoed value or path. */
export class SettingsRequestError extends Error {
  readonly code: SettingsErrorCode;
  readonly status: number | null;
  readonly serverCode: string | null;
  constructor(code: SettingsErrorCode, status: number | null = null, serverCode: string | null = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.serverCode = serverCode;
  }
}

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; credentials?: "omit" | "same-origin" }) => Promise<Response>;

function isStatus(v: unknown): v is SecretStatus {
  const s = v as SecretStatus;
  return typeof v === "object" && v !== null && typeof s.configured === "boolean" && (s.last4 === null || typeof s.last4 === "string") && (s.updatedAtMs === null || typeof s.updatedAtMs === "number");
}

function parseSecrets(v: unknown): Record<SecretId, SecretStatus> | null {
  if (typeof v !== "object" || v === null) return null;
  const out = {} as Record<SecretId, SecretStatus>;
  for (const id of SECRET_IDS) {
    const s = (v as Record<string, unknown>)[id];
    if (!isStatus(s)) return null;
    if (s.origin !== undefined && s.origin !== null && !["local", "vault", "process_environment", "windows_user", "windows_machine"].includes(s.origin)) return null;
    out[id] = { configured: s.configured, last4: id === "typesafeAiApiKey" ? null : s.last4, updatedAtMs: s.updatedAtMs, ...(s.origin !== undefined ? { origin: s.origin } : {}) };
  }
  return out;
}

function parsePrefs(v: unknown): UserPrefs | null {
  const p = v as UserPrefs;
  const o = p?.onchain;
  if (typeof v !== "object" || v === null || p.version !== 1 || typeof o !== "object" || o === null) return null;
  if (typeof o.capBasic !== "number" || typeof o.capPremium !== "number" || typeof o.background !== "boolean") return null;
  if (o.defaultChainIndex !== null && typeof o.defaultChainIndex !== "string") return null;
  return p;
}

function parseSnapshot(v: unknown): SettingsSnapshot | null {
  const s = v as SettingsSnapshot;
  if (typeof v !== "object" || v === null) return null;
  if (s.readOnly !== undefined && typeof s.readOnly !== "boolean") return null;
  const secrets = parseSecrets(s.secrets);
  const state = s.okx?.state;
  const prefs = parsePrefs(s.prefs);
  if (!secrets || !prefs || (state !== "absent" && state !== "incomplete" && state !== "complete")) return null;
  return { secrets, okx: { state }, ...(s.readOnly === undefined ? {} : { readOnly: s.readOnly }), ...((v as { vault?: unknown }).vault === "indisponivel" ? { vault: "indisponivel" as const } : {}), prefs };
}

function parseStatusPart(v: unknown): SecretsStatus | null {
  const s = v as SecretsStatus;
  const secrets = parseSecrets(s?.secrets);
  const state = s?.okx?.state;
  if (!secrets || (state !== "absent" && state !== "incomplete" && state !== "complete")) return null;
  return { secrets, okx: { state } };
}

async function request(fetchImpl: FetchLike, base: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(`${base}${path}`, {
      method: init.method ?? "GET",
      credentials: backendSession(base),
      headers: { "x-inonu-settings": "1", ...(init.body !== undefined ? { "content-type": "application/json" } : {}), ...(init.method !== undefined && init.method !== "GET" && backendSession(base) === "same-origin" ? { "x-inonu-intent": "user" } : {}) },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new SettingsRequestError("network");
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* a non json error page still has a status */
  }
  if (!res.ok) {
    const code = typeof body === "object" && body !== null && typeof (body as { code?: unknown }).code === "string" ? (body as { code: string }).code : null;
    throw new SettingsRequestError("http", res.status, code);
  }
  return body;
}

export function createSettingsClient(base: string = SETTINGS_API_URL, fetchImpl: FetchLike = fetch): {
  get(): Promise<SettingsSnapshot>;
  setSecret(id: SecretId, value: string): Promise<SecretsStatus>;
  clearSecret(id: SecretId): Promise<SecretsStatus>;
  setPrefs(patch: { onchain: Partial<OnchainPrefs> }): Promise<UserPrefs>;
  testOnchainos(): Promise<{ ok: boolean; code: string }>;
  testJev(): Promise<{ ok: boolean; code: string; tested?: boolean }>;
} {
  const root = base.replace(/\/+$/, "");
  return {
    async get() {
      const body = await request(fetchImpl, root, "/settings");
      const snapshot = parseSnapshot(body);
      if (!snapshot) throw new SettingsRequestError("bad_response");
      return snapshot;
    },
    async setSecret(id, value) {
      const body = await request(fetchImpl, root, "/settings/secrets", { method: "PUT", body: { id, value } });
      const status = parseStatusPart(body);
      if (!status) throw new SettingsRequestError("bad_response");
      return status;
    },
    async clearSecret(id) {
      const body = await request(fetchImpl, root, `/settings/secrets/${id}`, { method: "DELETE" });
      const status = parseStatusPart(body);
      if (!status) throw new SettingsRequestError("bad_response");
      return status;
    },
    async setPrefs(patch) {
      const body = await request(fetchImpl, root, "/settings/prefs", { method: "PUT", body: patch });
      const prefs = parsePrefs((body as { prefs?: unknown })?.prefs);
      if (!prefs) throw new SettingsRequestError("bad_response");
      return prefs;
    },
    async testOnchainos() {
      const body = await request(fetchImpl, root, "/settings/test/onchainos", { method: "POST" });
      const b = body as { ok?: unknown; code?: unknown };
      if (typeof b?.ok !== "boolean" || typeof b?.code !== "string") throw new SettingsRequestError("bad_response");
      return { ok: b.ok, code: b.code };
    },
    async testJev() {
      const body = await request(fetchImpl, root, "/settings/test/jev", { method: "POST" });
      const b = body as { ok?: unknown; code?: unknown; tested?: unknown };
      if (typeof b?.ok !== "boolean" || typeof b?.code !== "string") throw new SettingsRequestError("bad_response");
      return { ok: b.ok, code: b.code, tested: b.tested === true ? true : false };
    },
  };
}
