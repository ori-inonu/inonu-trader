/**
 * Moves the four secrets from the local env files into the Windows vault, so the installed Inonu Trader starts
 * configured and needs no `.env` at all (T2.5, CFG-9). Run it on this machine from the repository:
 *
 *   bun --no-env-file run scripts/provision.ts [--from <repo folder>] [--dry-run] [--force]
 *   bun --no-env-file run scripts/provision.ts --cleanup [--from <repo folder>]          # the plan: what would leave the env files
 *   bun --no-env-file run scripts/provision.ts --cleanup --yes [--from <repo folder>]    # does it (a backup is written first)
 *   bun --no-env-file run scripts/provision.ts --restore <backup file>                   # puts the removed lines back
 *
 * Sources, in order: data/onchainos.env, data/jev.env, .env. Only OKX_WEB3_API_KEY, OKX_WEB3_API_SECRET,
 * OKX_WEB3_API_PASSPHRASE and TYPESAFE_AI_API_KEY are looked at: the .env also holds the Kuru trader's private key, which
 * this tool never reads, copies or prints. A value already in the vault is kept unless --force. The report shows no value;
 * a tail of four characters appears only for the two key ids. The env files are neither changed nor deleted, except by the
 * separate, confirmed --cleanup step (CFG-6): it removes only the lines of those four names, only when the vault holds the very
 * same value, and writes a backup of exactly those lines first.
 */
import { join, resolve } from "node:path";
import { cleanupPlaintext, restorePlaintext } from "../src/desktop/cleanup";
import { provision } from "../src/desktop/provision";
import { VAULT_SERVICE, createBunVault } from "../src/desktop/vault";

const flag = (name: string) => Bun.argv.includes(name);
const option = (name: string) => {
  const i = Bun.argv.indexOf(name);
  return i >= 0 ? Bun.argv[i + 1] : undefined;
};

const root = resolve(option("--from") ?? join(import.meta.dir, ".."));
const sources = [join(root, "data", "onchainos.env"), join(root, "data", "jev.env"), join(root, ".env")];
const service = process.env.INONU_VAULT_SERVICE || VAULT_SERVICE;

if (option("--restore") !== undefined) {
  const result = restorePlaintext({ backupFile: resolve(option("--restore")!) });
  console.log(`restored ${result.restored} line(s), skipped ${result.skipped}`);
  process.exit(0);
}

if (flag("--cleanup")) {
  const apply = flag("--yes");
  const backupFile = join(root, "data", "backups", `plaintext-secrets-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const cleanup = await cleanupPlaintext({ files: sources, vault: createBunVault(service), backupFile, apply, confirm: apply });
  console.log(`vault: Windows Credential Manager, service "${service}"${apply ? "" : " (plan: nothing written; add --yes to apply)"}\n`);
  for (const entry of cleanup.entries) {
    const file = entry.file.startsWith(root) ? entry.file.slice(root.length + 1) : entry.file;
    console.log(`${entry.name.padEnd(26)} ${entry.outcome.padEnd(18)} ${file}:${entry.line}`);
  }
  if (cleanup.entries.length === 0) console.log("no line of the four names in any file");
  if (cleanup.backup) console.log(`\nbackup of the removed lines: ${cleanup.backup}\nrestore with: --restore <that file>. The backup holds the same values in plain text: delete it once the app works.`);
  process.exit(0);
}

const report = await provision({ sources, vault: createBunVault(service), force: flag("--force"), dryRun: flag("--dry-run") });

console.log(`vault: Windows Credential Manager, service "${service}"${flag("--dry-run") ? " (dry run: nothing written)" : ""}\n`);
for (const entry of report.entries) {
  const from = entry.source ? `  from ${entry.source.startsWith(root) ? entry.source.slice(root.length + 1) : entry.source}` : "";
  const tail = entry.last4 ? `  ends with ${entry.last4}` : "";
  console.log(`${entry.name.padEnd(26)} ${entry.outcome.padEnd(12)}${from}${tail}`);
}
const failed = report.entries.filter((e) => e.outcome === "failed").length;
const missing = report.entries.filter((e) => e.outcome === "missing" || e.outcome === "invalid").map((e) => e.name);
if (missing.length) console.log(`\nnot found in any source: ${missing.join(", ")} (add it on the Configuracoes screen)`);
console.log("\nThe env files were not changed. Removing them is a separate, confirmed step (CFG-6).");
process.exit(failed ? 1 : 0);
