/**
 * Local settings store (CFG-2, CFG-7): API keys live in dotenv files under a data directory the caller picks,
 * in the same `--env-file` format the scripts already use, and non-secret server preferences live in
 * settings/user.json. Values are serialized inside single quotes because the Bun env loader treats that form
 * as literal text: every other byte combination that the loader cannot reproduce faithfully is rejected at
 * validation time instead of being corrupted on write. Nothing here logs or returns a stored value.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveRuntimeKey, type RuntimeKeyOrigin, type RuntimeKeyResolver } from "./runtime-key";

export type SecretId = "typesafeAiApiKey" | "okxWeb3ApiKey" | "okxWeb3ApiSecret" | "okxWeb3ApiPassphrase";

export interface SecretStatus {
  readonly configured: boolean;
  readonly origin?: "local" | "vault" | RuntimeKeyOrigin | null;
  /** The last four characters, only where the id allows them to be shown. */
  readonly last4: string | null;
  readonly updatedAtMs: number | null;
}

export type OkxCredentialState = "absent" | "incomplete" | "complete";

export interface SettingsStatus {
  readonly secrets: Record<SecretId, SecretStatus>;
  readonly okx: { readonly state: OkxCredentialState };
  /**
   * Present only when the vault of the Windows did not answer when the app started: the keys could not be read, which is not the same as
   * the keys being absent, and nothing is ever shown as configured without the vault confirming it (CFG-1). Absent when the vault answered.
   */
  readonly vault?: "indisponivel";
}

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

export type PrefsPatch = {
  readonly onchain?: {
    readonly capBasic?: unknown;
    readonly capPremium?: unknown;
    readonly background?: unknown;
    readonly defaultChainIndex?: unknown;
  };
};

export interface SettingsStore {
  status(): SettingsStatus;
  set(id: SecretId, value: string): void;
  clear(id: SecretId): void;
  credentials(): { okx: { apiKey: string; secret: string; passphrase: string } | null; typesafeAiApiKey: string | null };
  prefs(): UserPrefs;
  setPrefs(patch: PrefsPatch): UserPrefs;
}

export class SettingsError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export const SECRET_IDS: readonly SecretId[] = ["typesafeAiApiKey", "okxWeb3ApiKey", "okxWeb3ApiSecret", "okxWeb3ApiPassphrase"];

const ENV_KEY: Record<SecretId, string> = {
  typesafeAiApiKey: "TYPESAFE_AI_API_KEY",
  okxWeb3ApiKey: "OKX_WEB3_API_KEY",
  okxWeb3ApiSecret: "OKX_WEB3_API_SECRET",
  okxWeb3ApiPassphrase: "OKX_WEB3_API_PASSPHRASE",
};

const ENV_FILE: Record<SecretId, string> = {
  typesafeAiApiKey: "jev.env",
  okxWeb3ApiKey: "onchainos.env",
  okxWeb3ApiSecret: "onchainos.env",
  okxWeb3ApiPassphrase: "onchainos.env",
};

/** Only these ids may expose a tail; a secret or a passphrase never shows a single character. */
const LAST4_ALLOWED: ReadonlySet<SecretId> = new Set(["okxWeb3ApiKey"]);

const MAX_SECRET_LEN = 256;
const MIN_SECRET_LEN = 8;

export function isSecretId(id: unknown): id is SecretId {
  return typeof id === "string" && (SECRET_IDS as readonly string[]).includes(id);
}

/**
 * The loader contract, verified by the roundtrip test through the real `bun --env-file` loader: printable
 * ASCII only; `'` corrupts the literal single-quoted form and is rejected; `$` is written as `\$` (the loader
 * keeps that literal) except bare at the very end where it already survives; a value that mixes `\` and `$`,
 * doubles a backslash or ends in `\` cannot be represented unambiguously and is rejected. A rejected value is
 * refused with a constant code, never written mangled.
 */
export function validateSecretValue(value: unknown): { ok: true; value: string } | { ok: false; code: string } {
  if (typeof value !== "string") return { ok: false, code: "value_not_string" };
  if (value.length < MIN_SECRET_LEN) return { ok: false, code: "value_too_short" };
  if (value.length > MAX_SECRET_LEN) return { ok: false, code: "value_too_long" };
  for (const ch of value) {
    const c = ch.codePointAt(0)!;
    if (c < 0x20 || c > 0x7e) return { ok: false, code: "value_invalid_chars" };
  }
  if (value.includes("'")) return { ok: false, code: "value_invalid_chars" };
  if (value.endsWith("\\")) return { ok: false, code: "value_invalid_chars" };
  if (value.includes("\\\\")) return { ok: false, code: "value_invalid_chars" };
  if (value.includes("\\") && value.includes("$")) return { ok: false, code: "value_invalid_chars" };
  return { ok: true, value };
}

const KEY_LINE = (key: string) => new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=[^\\n\\r]*`, "m");

/** Minimal dotenv reader aligned with what the Bun loader accepts: comments, unquoted, single and double quoted values. */
function parseDotenv(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2]!;
    if (value.startsWith("'") || value.startsWith('"')) {
      const q = value[0]!;
      const end = value.lastIndexOf(q);
      value = end > 0 ? value.slice(1, end) : value.slice(1);
      // `\$` inside quotes is how a literal dollar survives the loader's variable expansion.
      value = value.replace(/\\\$/g, "$");
    } else {
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash);
      value = value.trimEnd();
    }
    out.set(m[1]!, value);
  }
  return out;
}

/** fsync-free atomic write: a temp file in the same directory renamed over the target, retried for Windows locks. */
function writeAtomic(path: string, content: string): void {
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(tmp, content, { mode: 0o600 });
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      renameSync(tmp, path);
      try { chmodSync(path, 0o600); } catch { /* best effort on Windows */ }
      return;
    } catch (error) {
      last = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EBUSY") throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
    }
  }
  throw new SettingsError(`io_error:${(last as NodeJS.ErrnoException)?.code ?? "unknown"}`);
}

const DEFAULT_PREFS: UserPrefs = {
  version: 1,
  onchain: { capBasic: 50_000, capPremium: 50_000, background: false, defaultChainIndex: null },
};

function capOk(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100_000;
}

function chainIndexOk(v: unknown): v is string | null {
  return v === null || (typeof v === "string" && v.length <= 12 && /^[0-9]+$/.test(v));
}

export function createSettingsStore(dir: string, options: { readonly runtimeKey?: RuntimeKeyResolver } = {}): SettingsStore {
  const runtimeKey = options.runtimeKey ?? resolveRuntimeKey;
  const envPath = (id: SecretId) => join(dir, ENV_FILE[id]);
  const prefsPath = join(dir, "settings", "user.json");
  const cache = new Map<string, { mtimeMs: number; size: number; values: Map<string, string> }>();

  /** Reads one env file keyed by mtime and size so unchanged files are never re-parsed. */
  function readEnv(path: string): { values: Map<string, string>; mtimeMs: number | null } {
    try {
      const st = statSync(path);
      if (!st.isFile()) return { values: new Map(), mtimeMs: null };
      const hit = cache.get(path);
      if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return { values: hit.values, mtimeMs: hit.mtimeMs };
      const values = parseDotenv(readFileSync(path, "utf8"));
      cache.set(path, { mtimeMs: st.mtimeMs, size: st.size, values });
      return { values, mtimeMs: st.mtimeMs };
    } catch {
      return { values: new Map(), mtimeMs: null };
    }
  }

  function valueOf(id: SecretId): { value: string | null; mtimeMs: number | null; origin: SecretStatus["origin"] } {
    const { values, mtimeMs } = readEnv(envPath(id));
    const value = values.get(ENV_KEY[id]);
    if (value && value.length > 0) return { value, mtimeMs, origin: "local" };
    if (id === "typesafeAiApiKey") {
      try {
        const ambient = runtimeKey();
        if (ambient) return { value: ambient.value, mtimeMs: null, origin: ambient.origin };
      } catch { /* unavailable discovery never exposes system errors */ }
    }
    return { value: null, mtimeMs: null, origin: null };
  }

  function rewrite(path: string, key: string, serialized: string | null): void {
    const text = existsSync(path) ? readFileSync(path, "utf8") : "";
    const re = KEY_LINE(key);
    let next: string;
    if (serialized === null) {
      next = re.test(text) ? text.replace(new RegExp(`${re.source}(\\r?\\n)?`, "m"), "") : text;
    } else if (re.test(text)) {
      next = text.replace(re, `${key}=${serialized}`);
    } else {
      next = text.length > 0 && !text.endsWith("\n") ? `${text}\n${key}=${serialized}\n` : `${text}${key}=${serialized}\n`;
    }
    writeAtomic(path, next);
    cache.delete(path);
  }

  function readPrefs(): UserPrefs {
    try {
      const raw = JSON.parse(readFileSync(prefsPath, "utf8")) as unknown;
      if (typeof raw !== "object" || raw === null) return DEFAULT_PREFS;
      const root = raw as { version?: unknown; onchain?: unknown };
      if (root.version !== 1 || typeof root.onchain !== "object" || root.onchain === null) return DEFAULT_PREFS;
      const o = root.onchain as Record<string, unknown>;
      const d = DEFAULT_PREFS.onchain;
      return {
        version: 1,
        onchain: {
          capBasic: capOk(o.capBasic) ? o.capBasic : d.capBasic,
          capPremium: capOk(o.capPremium) ? o.capPremium : d.capPremium,
          background: typeof o.background === "boolean" ? o.background : d.background,
          defaultChainIndex: chainIndexOk(o.defaultChainIndex) ? o.defaultChainIndex : d.defaultChainIndex,
        },
      };
    } catch {
      return DEFAULT_PREFS;
    }
  }

  return {
    status(): SettingsStatus {
      const secrets = {} as Record<SecretId, SecretStatus>;
      const okxFlags: boolean[] = [];
      for (const id of SECRET_IDS) {
        const { value, mtimeMs, origin } = valueOf(id);
        const configured = value !== null;
        if (id !== "typesafeAiApiKey") okxFlags.push(configured);
        secrets[id] = {
          configured,
          origin,
          last4: configured && LAST4_ALLOWED.has(id) ? value!.slice(-4) : null,
          updatedAtMs: configured ? mtimeMs : null,
        };
      }
      const okxCount = okxFlags.filter(Boolean).length;
      const state: OkxCredentialState = okxCount === 0 ? "absent" : okxCount === 3 ? "complete" : "incomplete";
      return { secrets, okx: { state } };
    },

    set(id: SecretId, value: string): void {
      if (!isSecretId(id)) throw new SettingsError("invalid_id");
      const check = validateSecretValue(value);
      if (!check.ok) throw new SettingsError(check.code);
      mkdirSync(dir, { recursive: true });
      // A `$` survives the loader only escaped (`\$` collapses to `$`) or bare at the end of the value.
      rewrite(envPath(id), ENV_KEY[id], `'${check.value.replace(/\$(?=.)/g, "\\$")}'`);
    },

    clear(id: SecretId): void {
      if (!isSecretId(id)) throw new SettingsError("invalid_id");
      const path = envPath(id);
      if (!existsSync(path)) return;
      rewrite(path, ENV_KEY[id], null);
    },

    credentials() {
      const key = valueOf("typesafeAiApiKey").value;
      const apiKey = valueOf("okxWeb3ApiKey").value;
      const secret = valueOf("okxWeb3ApiSecret").value;
      const passphrase = valueOf("okxWeb3ApiPassphrase").value;
      return { okx: apiKey && secret && passphrase ? { apiKey, secret, passphrase } : null, typesafeAiApiKey: key };
    },

    prefs(): UserPrefs {
      return readPrefs();
    },

    setPrefs(patch: PrefsPatch): UserPrefs {
      if (typeof patch !== "object" || patch === null) throw new SettingsError("invalid_prefs");
      const current = readPrefs().onchain;
      const next: { -readonly [K in keyof OnchainPrefs]: OnchainPrefs[K] } = { ...current };
      const o = patch.onchain;
      if (o !== undefined) {
        if (typeof o !== "object" || o === null) throw new SettingsError("invalid_prefs");
        if (o.capBasic !== undefined) { if (!capOk(o.capBasic)) throw new SettingsError("invalid_cap_basic"); next.capBasic = o.capBasic; }
        if (o.capPremium !== undefined) { if (!capOk(o.capPremium)) throw new SettingsError("invalid_cap_premium"); next.capPremium = o.capPremium; }
        if (o.background !== undefined) { if (typeof o.background !== "boolean") throw new SettingsError("invalid_background"); next.background = o.background; }
        if (o.defaultChainIndex !== undefined) { if (!chainIndexOk(o.defaultChainIndex)) throw new SettingsError("invalid_chain_index"); next.defaultChainIndex = o.defaultChainIndex; }
      }
      const prefs: UserPrefs = { version: 1, onchain: next };
      mkdirSync(join(dir, "settings"), { recursive: true });
      writeAtomic(prefsPath, `${JSON.stringify(prefs, null, 2)}\n`);
      return prefs;
    },
  };
}
