/**
 * Removing the plain text copies of the four secrets from the env files (CFG-6, T2.4). It is a SEPARATE, confirmed step and never
 * automatic: the person asks for the plan, reads it, and only then applies it with an explicit confirmation.
 *
 * What it will and will not do:
 *  - it looks only at the lines of the four names (the `.env` also holds the Kuru trader's private key and `LIVE_ACK`, which are
 *    never read, copied or printed); every other line of every file stays byte for byte;
 *  - it removes a line only when the vault holds the very same value, so nothing is deleted that exists nowhere else; an unknown
 *    (the vault does not answer) is a reason to keep, never to delete;
 *  - a line that is only a `${NAME}` reference is not a secret and is left alone;
 *  - the backup is written BEFORE any file changes and holds only the removed lines of the four names; when it cannot be written
 *    nothing is removed;
 *  - the report shows files, lines and names, never a value; every kept line keeps its own line ending, byte for byte, even in a file with
 *    mixed endings (a restore writes the removed lines back with the first line ending of the file).
 *
 * `restorePlaintext` puts the removed lines back where they were.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { validateSecretValue } from "../settings/store";
import { VAULT_NAMES, type AsyncVault, type VaultName } from "./vault";

const LINE = /^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(.*)$/;
const PLACEHOLDER = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;
const NAMES: readonly string[] = VAULT_NAMES;

export type CleanupOutcome = "would_remove" | "removed" | "kept_not_in_vault" | "kept_different" | "kept_placeholder" | "kept_invalid";

export interface CleanupEntry {
  readonly file: string;
  /** 1-based line number in the file as it was. */
  readonly line: number;
  readonly name: VaultName;
  readonly outcome: CleanupOutcome;
}

export interface CleanupReport {
  readonly entries: CleanupEntry[];
  /** The backup file written, or null when nothing was removed. */
  readonly backup: string | null;
}

export interface CleanupOptions {
  readonly files: readonly string[];
  readonly vault: AsyncVault;
  readonly backupFile: string;
  /** False: only the plan. True: remove, which also needs `confirm`. */
  readonly apply: boolean;
  readonly confirm?: boolean;
  readonly now?: () => number;
}

interface BackupEntry {
  readonly file: string;
  /** 0-based position in the original file. */
  readonly index: number;
  readonly raw: string;
}

interface Backup {
  readonly v: 1;
  readonly savedAtMs: number;
  readonly entries: readonly BackupEntry[];
}

const readText = (file: string): string | null => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

function writeAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, file);
}

/** The value of an allowed line as the app would read it, or why it is not a secret. */
function judge(line: string): { name: VaultName; value: string | null; why: "placeholder" | "invalid" | null } | null {
  const m = LINE.exec(line);
  const name = m?.[1];
  if (!m || !name || !NAMES.includes(name)) return null;
  const unquoted = m[2]!.replace(/^['"]|['"][ \t]*$/g, "").trim();
  if (PLACEHOLDER.test(unquoted)) return { name: name as VaultName, value: null, why: "placeholder" };
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
  return checked.ok ? { name: name as VaultName, value: checked.value, why: null } : { name: name as VaultName, value: null, why: "invalid" };
}

export async function cleanupPlaintext(options: CleanupOptions): Promise<CleanupReport> {
  if (options.apply && options.confirm !== true) throw new Error("cleanup needs an explicit confirm: nothing was changed");

  const entries: CleanupEntry[] = [];
  const toRemove: { file: string; index: number; raw: string; entryIndex: number }[] = [];
  const texts = new Map<string, string>();
  for (const file of options.files) {
    const text = readText(file);
    if (text === null) continue;
    texts.set(file, text);
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const judged = judge(lines[index]!);
      if (judged === null) continue;
      let outcome: CleanupOutcome;
      if (judged.why === "placeholder") outcome = "kept_placeholder";
      else if (judged.why === "invalid" || judged.value === null) outcome = "kept_invalid";
      else {
        const inVault = await options.vault.get(judged.name).catch(() => null);
        outcome = inVault === null ? "kept_not_in_vault" : inVault !== judged.value ? "kept_different" : "would_remove";
      }
      entries.push({ file, line: index + 1, name: judged.name, outcome });
      if (outcome === "would_remove") toRemove.push({ file, index, raw: lines[index]!, entryIndex: entries.length - 1 });
    }
  }
  if (!options.apply || toRemove.length === 0) return { entries, backup: null };

  // the backup first: when it cannot be written, nothing is removed
  const backup: Backup = { v: 1, savedAtMs: (options.now ?? Date.now)(), entries: toRemove.map(({ file, index, raw }) => ({ file, index, raw })) };
  writeAtomic(options.backupFile, JSON.stringify(backup, null, 1));

  for (const file of new Set(toRemove.map((r) => r.file))) {
    const text = texts.get(file)!;
    const drop = new Set(toRemove.filter((r) => r.file === file).map((r) => r.index));
    // line, line ending, line, line ending, ...: every kept line keeps its own ending, so a file with mixed endings is not normalized
    const pieces = text.split(/(\r\n|\n)/);
    const kept: string[] = [];
    for (let i = 0, lineNo = 0; i < pieces.length; i += 2, lineNo += 1) {
      const line = pieces[i]!;
      const ending = pieces[i + 1] ?? "";
      if (drop.has(lineNo)) {
        // a removed last line has no ending of its own: the file then ends where the previous line ended
        if (ending === "" && kept.length > 0 && (kept[kept.length - 1] === "\n" || kept[kept.length - 1] === "\r\n")) kept.pop();
        continue;
      }
      kept.push(line);
      if (ending !== "") kept.push(ending);
    }
    writeAtomic(file, kept.join(""));
  }
  for (const r of toRemove) entries[r.entryIndex] = { ...entries[r.entryIndex]!, outcome: "removed" };
  return { entries, backup: options.backupFile };
}

/** Puts the lines of a backup back where they were. A name already back in its file is not duplicated; anything off the shape is skipped. */
export function restorePlaintext(options: { readonly backupFile: string }): { restored: number; skipped: number } {
  const raw: unknown = JSON.parse(readFileSync(options.backupFile, "utf8"));
  if (typeof raw !== "object" || raw === null || (raw as { v?: unknown }).v !== 1 || !Array.isArray((raw as { entries?: unknown }).entries)) throw new Error("not a backup of this app");
  const entries = (raw as { entries: unknown[] }).entries;

  let restored = 0;
  let skipped = 0;
  const valid: BackupEntry[] = [];
  for (const item of entries) {
    const e = item as Partial<BackupEntry> | null;
    if (e === null || typeof e !== "object" || typeof e.file !== "string" || typeof e.index !== "number" || !Number.isInteger(e.index) || e.index < 0 || typeof e.raw !== "string") {
      skipped += 1;
      continue;
    }
    const m = LINE.exec(e.raw);
    if (!m || !NAMES.includes(m[1]!) || !existsSync(e.file)) {
      skipped += 1;
      continue;
    }
    valid.push({ file: e.file, index: e.index, raw: e.raw });
  }

  for (const file of new Set(valid.map((v) => v.file))) {
    const text = readText(file)!;
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    let changed = false;
    for (const entry of valid.filter((v) => v.file === file).sort((a, b) => a.index - b.index)) {
      const name = LINE.exec(entry.raw)![1]!;
      if (lines.some((l) => LINE.exec(l)?.[1] === name)) {
        skipped += 1;
        continue;
      }
      lines.splice(Math.min(entry.index, lines.length), 0, entry.raw);
      restored += 1;
      changed = true;
    }
    if (changed) writeAtomic(file, lines.join(eol));
  }
  return { restored, skipped };
}
