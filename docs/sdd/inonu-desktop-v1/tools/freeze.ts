// Freezes (or verifies) the SHA-256 of the files whose content defines the acceptance of this SDD.
//
// freeze: bun --no-env-file run docs/sdd/inonu-desktop-v1/tools/freeze.ts --freeze --revision <id> [--date 2026-10-12]
// check:  bun --no-env-file run docs/sdd/inonu-desktop-v1/tools/freeze.ts --check
//
// Freezing only records hashes; changing a frozen file afterwards makes --check fail until a new, explicitly authorised
// revision is frozen (history is kept in FREEZE.json "revisoes").
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PKG = join(import.meta.dir, "..");
const FILE = join(PKG, "FREEZE.json");

// Acceptance and design are frozen. PLAN.md, TASKS.md, OWNERSHIP.md and CHECKPOINT.md carry progress (statuses, evidence) that
// changes with every task, so they are tracked by git and by CHECKPOINT.md, not frozen: freezing them would make a status edit look like
// a change of acceptance. The acceptance criteria themselves live in SPEC.md, which stays frozen.
const FROZEN = ["SPEC.md", "flow-engine.md", "rastreador.md", "info-diet.md", "wallet.md", "onchainos-coverage.json", "onchainos-coverage.md"];
const frozenFiles = () => [...FROZEN, ...readdirSync(join(PKG, "adr")).filter((f) => f.endsWith(".md")).sort().map((f) => `adr/${f}`)];

const sha = (file: string) => createHash("sha256").update(readFileSync(join(PKG, file))).digest("hex");
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

type Revision = { revisao: string; congeladoEm: string; hashes: Record<string, string> };
const load = (): { revisoes: Revision[] } => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { revisoes: [] });

if (process.argv.includes("--freeze")) {
  const revisao = arg("--revision");
  if (!revisao) throw new Error("--revision <id> required");
  const data = load();
  data.revisoes.push({ revisao, congeladoEm: arg("--date") ?? new Date().toISOString().slice(0, 10), hashes: Object.fromEntries(frozenFiles().map((f) => [f, sha(f)])) });
  writeFileSync(FILE, JSON.stringify(data, null, 1) + "\n");
  console.log(`frozen revision ${revisao}: ${frozenFiles().length} files`);
} else if (process.argv.includes("--check")) {
  const data = load();
  const last = data.revisoes.at(-1);
  if (!last) {
    console.error("no frozen revision");
    process.exit(1);
  }
  const problems = frozenFiles().filter((f) => last.hashes[f] !== sha(f)).map((f) => `${f}: changed since revision ${last.revisao}`);
  for (const f of Object.keys(last.hashes)) if (!frozenFiles().includes(f)) problems.push(`${f}: no longer part of the package`);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`ok: revision ${last.revisao} (${last.congeladoEm}) matches ${Object.keys(last.hashes).length} files`);
} else {
  console.error("usage: --freeze --revision <id> | --check");
  process.exit(2);
}
