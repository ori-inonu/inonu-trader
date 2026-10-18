/**
 * The Windows vault for the four secrets (T2.1, CFG-1, CFG-3, ADR-2).
 *
 * `Bun.secrets` (Credential Manager) is asynchronous and the `SettingsStore` the HTTP handlers use is synchronous. The
 * bridge keeps the store interface exactly as it is:
 *  - reads: the four values are loaded once at start (`createVaultSettingsStore` is async) into a memory cache;
 *  - writes: `set` and `clear` call a SYNCHRONOUS writer that runs the vault write in a child of this same program
 *    (`InonuTrader.exe --vault set <NAME>`, value on stdin, never on the command line) and only then updates the cache.
 *    So the store never says "configured" for something the vault did not confirm, and a failure is a constant
 *    `vault_error` that carries nothing from the failure.
 * Only the four names in VAULT_NAMES are ever read or written: the `.env` of this machine also holds the Kuru trader's
 * private key, which this app must never touch (WIN-12). Prefs (non secret) stay in the existing file store.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SECRET_IDS, SettingsError, createSettingsStore, isSecretId, validateSecretValue, type SecretId, type SecretStatus, type SettingsStatus, type SettingsStore } from "../settings/store";
import { resolveRuntimeKey, type RuntimeKeyResolver } from "../settings/runtime-key";

export const VAULT_SERVICE = "InonuTrader";
export const VAULT_NAMES = ["OKX_WEB3_API_KEY", "OKX_WEB3_API_SECRET", "OKX_WEB3_API_PASSPHRASE", "TYPESAFE_AI_API_KEY"] as const;
export type VaultName = (typeof VAULT_NAMES)[number];

const NAME_OF: Record<SecretId, VaultName> = {
  okxWeb3ApiKey: "OKX_WEB3_API_KEY",
  okxWeb3ApiSecret: "OKX_WEB3_API_SECRET",
  okxWeb3ApiPassphrase: "OKX_WEB3_API_PASSPHRASE",
  typesafeAiApiKey: "TYPESAFE_AI_API_KEY",
};
/** Only these ids may expose a tail; a secret or a passphrase never shows a single character. */
const LAST4_ALLOWED: ReadonlySet<SecretId> = new Set(["okxWeb3ApiKey"]);

export const isVaultName = (name: unknown): name is VaultName => typeof name === "string" && (VAULT_NAMES as readonly string[]).includes(name);

/** Carries no detail on purpose: whatever failed, nothing of it (path, value, system error) may travel. */
export class VaultError extends Error {
  constructor(message = "vault error") {
    super(message);
    this.name = "VaultError";
  }
}

export interface VaultReader {
  getAll(names: readonly string[]): Promise<Record<string, string | null>>;
}

export interface VaultWriter {
  set(name: string, value: string): void;
  delete(name: string): void;
}

/** The asynchronous vault itself: Bun.secrets under the product's service name. */
export interface AsyncVault {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<boolean>;
}

export function createBunVault(service: string = VAULT_SERVICE): AsyncVault {
  return {
    get: (name) => Bun.secrets.get({ service, name }),
    set: (name, value) => Bun.secrets.set({ service, name, value }),
    delete: (name) => Bun.secrets.delete({ service, name }),
  };
}

export function createBunVaultReader(vault: AsyncVault = createBunVault()): VaultReader {
  return {
    async getAll(names) {
      // a key that is simply not there is null; a vault that FAILS to answer is an error, never an absent key (CFG-1)
      const entries = await Promise.all(
        names.map(async (name) => {
          try {
            return [name, await vault.get(name)] as const;
          } catch {
            throw new VaultError();
          }
        }),
      );
      return Object.fromEntries(entries);
    },
  };
}

type SpawnSync = (command: string[], options: { stdin: Uint8Array; stdout: "ignore"; stderr: "ignore" }) => ReturnType<typeof Bun.spawnSync>;

/** Writes through a child process: `<command...> set <NAME>` with the value on stdin, `<command...> delete <NAME>`. */
export function createSpawnVaultWriter(command: () => string[], spawnSync: SpawnSync = (cmd, options) => Bun.spawnSync(cmd, options)): VaultWriter {
  const run = (verb: "set" | "delete", name: string, stdin: string) => {
    if (!isVaultName(name)) throw new VaultError();
    let exitCode: number | null | undefined;
    try {
      exitCode = spawnSync([...command(), verb, name], { stdin: Buffer.from(stdin, "utf8"), stdout: "ignore", stderr: "ignore" }).exitCode;
    } catch {
      throw new VaultError();
    }
    if (exitCode !== 0) throw new VaultError();
  };
  return { set: (name, value) => run("set", name, value), delete: (name) => run("delete", name, "") };
}

export interface VaultCliDeps {
  readonly stdin: () => Promise<string>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly backend: AsyncVault;
}

/** The child side: `set <NAME>` (value on stdin), `delete <NAME>`, `has <NAME>`. Exit 0 ok, 2 usage, 3 vault failure. */
export async function vaultCli(argv: readonly string[], deps: VaultCliDeps): Promise<number> {
  const [verb, name] = argv;
  if (!isVaultName(name)) {
    deps.stderr("usage: --vault <set|delete|has> <NAME> (NAME must be one of the four vault names)\n");
    return 2;
  }
  try {
    if (verb === "set") {
      const value = (await deps.stdin()).replace(/\r?\n$/, "");
      if (value === "") {
        deps.stderr("empty value is not stored\n");
        return 2;
      }
      await deps.backend.set(name, value);
      return 0;
    }
    if (verb === "delete") {
      await deps.backend.delete(name);
      return 0;
    }
    if (verb === "has") {
      deps.stdout((await deps.backend.get(name)) === null ? "no\n" : "yes\n"); // never the value
      return 0;
    }
  } catch {
    deps.stderr("vault error\n");
    return 3;
  }
  deps.stderr("usage: --vault <set|delete|has> <NAME>\n");
  return 2;
}

export interface VaultSettingsStoreOptions {
  readonly dataDir: string;
  readonly reader: VaultReader;
  readonly writer: VaultWriter;
  readonly now?: () => number;
  readonly runtimeKey?: RuntimeKeyResolver;
}

type Meta = Partial<Record<SecretId, number>>;

function readMeta(file: string): Meta {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Meta) : {};
  } catch {
    return {};
  }
}

/** A SettingsStore whose four secrets live in the vault. Prefs and everything non secret stay in the file store. */
export async function createVaultSettingsStore(options: VaultSettingsStoreOptions): Promise<SettingsStore> {
  const now = options.now ?? Date.now;
  const metaFile = join(options.dataDir, "settings", "secrets-meta.json");
  const inner = createSettingsStore(options.dataDir, { runtimeKey: () => null });
  const runtimeKey = options.runtimeKey ?? resolveRuntimeKey;
  let vaultDown = false;
  let loaded: Record<string, string | null> = {};
  try {
    loaded = await options.reader.getAll(VAULT_NAMES);
  } catch {
    vaultDown = true; // nothing is configured without the vault confirming it, and the status says why instead of calling the keys absent
  }
  const meta = readMeta(metaFile);
  const cache = new Map<SecretId, { value: string; updatedAtMs: number | null }>();
  for (const id of SECRET_IDS) {
    const value = loaded[NAME_OF[id]];
    if (typeof value === "string" && value !== "") cache.set(id, { value, updatedAtMs: meta[id] ?? null });
  }

  const saveMeta = () => {
    try {
      mkdirSync(join(options.dataDir, "settings"), { recursive: true });
      writeFileSync(metaFile, JSON.stringify(Object.fromEntries([...cache].filter(([, v]) => v.updatedAtMs !== null).map(([id, v]) => [id, v.updatedAtMs]))));
    } catch {
      // the timestamp is a convenience; the secret itself is already in the vault
    }
  };
  const need = (id: unknown): SecretId => {
    if (!isSecretId(id)) throw new SettingsError("invalid_id");
    return id;
  };
  const modelKey = (): { value: string; origin: SecretStatus["origin"]; updatedAtMs: number | null } | null => {
    const local = cache.get("typesafeAiApiKey");
    if (local) return { ...local, origin: "vault" };
    try {
      const ambient = runtimeKey();
      return ambient ? { ...ambient, updatedAtMs: null } : null;
    } catch { return null; }
  };

  return {
    status(): SettingsStatus {
      const secrets = {} as Record<SecretId, SecretStatus>;
      for (const id of SECRET_IDS) {
        const model = id === "typesafeAiApiKey" ? modelKey() : null;
        const entry = model ?? cache.get(id);
        secrets[id] = { configured: entry != null, origin: model?.origin ?? (entry ? "vault" : null), last4: entry && LAST4_ALLOWED.has(id) ? entry.value.slice(-4) : null, updatedAtMs: entry?.updatedAtMs ?? null };
      }
      const okxCount = (["okxWeb3ApiKey", "okxWeb3ApiSecret", "okxWeb3ApiPassphrase"] as const).filter((id) => cache.has(id)).length;
      return { secrets, okx: { state: okxCount === 0 ? "absent" : okxCount === 3 ? "complete" : "incomplete" }, ...(vaultDown ? { vault: "indisponivel" as const } : {}) };
    },
    set(idInput, valueInput) {
      const id = need(idInput);
      const checked = validateSecretValue(valueInput);
      if (!checked.ok) throw new SettingsError(checked.code);
      try {
        options.writer.set(NAME_OF[id], checked.value);
      } catch {
        throw new SettingsError("vault_error");
      }
      cache.set(id, { value: checked.value, updatedAtMs: now() });
      saveMeta();
    },
    clear(idInput) {
      const id = need(idInput);
      try {
        options.writer.delete(NAME_OF[id]);
      } catch {
        throw new SettingsError("vault_error");
      }
      cache.delete(id);
      saveMeta();
    },
    credentials() {
      const key = cache.get("okxWeb3ApiKey")?.value;
      const secret = cache.get("okxWeb3ApiSecret")?.value;
      const passphrase = cache.get("okxWeb3ApiPassphrase")?.value;
      return { okx: key && secret && passphrase ? { apiKey: key, secret, passphrase } : null, typesafeAiApiKey: modelKey()?.value ?? null };
    },
    prefs: () => inner.prefs(),
    setPrefs: (patch) => inner.setPrefs(patch),
  };
}
