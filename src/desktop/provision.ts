/**
 * Local provisioning of the four secrets into the Windows vault (T2.2, T2.5, CFG-2, CFG-9, ADR-2).
 *
 * The user already has the OKX Web3 key, secret and passphrase in `data/onchainos.env` and the model key in `.env`. This
 * moves them into the Credential Manager so the installed app starts configured and needs no `.env` at all. It runs on
 * the user's machine from the repository; the installer carries no secret.
 *
 * Only the four names in VAULT_NAMES are looked at. The `.env` also holds the Kuru trader's private key and LIVE_ACK: the
 * parser keeps nothing else, and a test proves the vault is never written with any other name. The report carries no
 * value; a tail is shown only for the two key ids (the same rule as the settings screen).
 */
import { validateSecretValue } from "../settings/store";
import { VAULT_NAMES, type AsyncVault, type VaultName } from "./vault";

export interface ParsedEnv {
  /** The valid values of the four names found in the text. */
  readonly values: Partial<Record<VaultName, string>>;
  /** Names that were present but whose value the vault would refuse (too short, invalid characters). */
  readonly invalid: VaultName[];
}

const PLACEHOLDER = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;
const LINE = /^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(.*)$/;

/** Same reading rules as the settings store: comments, unquoted, single and double quoted, and the escaped dollar. */
export function parseAllowedEnv(text: string): ParsedEnv {
  const values: Partial<Record<VaultName, string>> = {};
  const invalid: VaultName[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = LINE.exec(line);
    const name = m?.[1];
    if (!m || !name || !(VAULT_NAMES as readonly string[]).includes(name)) continue; // nothing else is kept, not even looked at again
    let value = m[2]!;
    if (value.startsWith("'") || value.startsWith('"')) {
      const quote = value[0]!;
      const end = value.lastIndexOf(quote);
      value = (end > 0 ? value.slice(1, end) : value.slice(1)).replace(/\\\$/g, "$");
    } else {
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash);
      value = value.trimEnd();
    }
    const checked = validateSecretValue(value);
    // a value that is only a `${NAME}` reference was never expanded: it names a key, it is not one
    if (checked.ok && !PLACEHOLDER.test(checked.value)) values[name as VaultName] = checked.value;
    else invalid.push(name as VaultName);
  }
  return { values, invalid };
}

export type ProvisionOutcome = "imported" | "would_import" | "already" | "missing" | "invalid" | "failed";

export interface ProvisionEntry {
  readonly name: VaultName;
  readonly outcome: ProvisionOutcome;
  /** The source path the value came from (a path, never a value). */
  readonly source: string | null;
  /** The last four characters, only for the two key ids; null otherwise. */
  readonly last4: string | null;
}

export interface ProvisionReport {
  readonly entries: ProvisionEntry[];
}

export interface ProvisionOptions {
  /** Env files in priority order. */
  readonly sources: readonly string[];
  readonly vault: AsyncVault;
  readonly readFile?: (path: string) => string | null;
  readonly force?: boolean;
  readonly dryRun?: boolean;
}

const SHOW_LAST4: ReadonlySet<VaultName> = new Set(["OKX_WEB3_API_KEY", "TYPESAFE_AI_API_KEY"]);

async function defaultRead(path: string): Promise<string | null> {
  const file = Bun.file(path);
  return (await file.exists()) ? file.text() : null;
}

export async function provision(options: ProvisionOptions): Promise<ProvisionReport> {
  const parsed: { source: string; env: ParsedEnv }[] = [];
  for (const source of options.sources) {
    const text = options.readFile ? options.readFile(source) : await defaultRead(source);
    if (text !== null) parsed.push({ source, env: parseAllowedEnv(text) });
  }

  const entries: ProvisionEntry[] = [];
  for (const name of VAULT_NAMES) {
    const hit = parsed.find((p) => p.env.values[name] !== undefined);
    const value = hit?.env.values[name];
    const anyInvalid = parsed.some((p) => p.env.invalid.includes(name));
    const tail = (v: string | undefined) => (v !== undefined && SHOW_LAST4.has(name) ? v.slice(-4) : null);
    if (hit === undefined || value === undefined) {
      entries.push({ name, outcome: anyInvalid ? "invalid" : "missing", source: null, last4: null });
      continue;
    }
    if (!options.force && (await options.vault.get(name).catch(() => null)) !== null) {
      entries.push({ name, outcome: "already", source: hit.source, last4: tail(value) });
      continue;
    }
    if (options.dryRun) {
      entries.push({ name, outcome: "would_import", source: hit.source, last4: tail(value) });
      continue;
    }
    try {
      await options.vault.set(name, value);
      entries.push({ name, outcome: "imported", source: hit.source, last4: tail(value) });
    } catch {
      entries.push({ name, outcome: "failed", source: hit.source, last4: null }); // nothing of the failure travels
    }
  }
  return { entries };
}
