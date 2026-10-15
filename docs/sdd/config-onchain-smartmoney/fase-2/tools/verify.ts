// Verifies the Fase 2 documents (docs only; no product code).
//
// usage: bun --no-env-file run docs/sdd/config-onchain-smartmoney/fase-2/tools/verify.ts [--strict]
//
// Checks (exit code 1 on any problem):
//  1. relative markdown links resolve to a file or folder (anchors and http links are ignored);
//  2. a backtick span `path:line` or `path:a-b` points to an existing repo file with enough lines;
//  3. ids cross-reference: every F2 requirement is cited by a task or an AC, every AC by a task, tasks cite only existing
//     requirements and ACs, task dependencies are defined (T-F2-* here, T<n>.<m> in the installer TASKS), and A-nn, D3-nn
//     and F2 ids cited in the other documents exist;
//  4. ids of the installer SPEC (API-, SRC-, DOC-, ... , AC-..., T<n>.<m>) and of config-onchain-smartmoney (ECO-) cited in
//     backticks exist in those documents;
//  5. the budget tables 4.2 and 4.3 of SPEC.md add up to the stated totals and the stated monthly capacity;
//  6. no middle dot, em dash or en dash in the markdown (rendered-text rule of CLAUDE.md, applied to docs too);
//  7. no credential-like value (uuid, 32 hex characters, 0x plus 40 hex characters) in any file of the folder, and the probe
//     archive has no value fields;
//  8. the 13 frozen files of the installer SPEC have the sha256 recorded in evidence/baseline-hashes.json (a warning, an
//     error with --strict: a later legitimate revision makes this adendo outdated, see README).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const PKG = join(import.meta.dir, "..");
const REPO = resolve(PKG, "..", "..", "..", "..");
const DESK = join(REPO, "docs", "sdd", "inonu-desktop-v1");
const strict = process.argv.includes("--strict");
const problems: string[] = [];
const warnings: string[] = [];
const bad = (file: string, msg: string) => problems.push(`${relative(REPO, file).replaceAll("\\", "/")}: ${msg}`);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(PKG);
const mdFiles = files.filter((f) => f.endsWith(".md"));
const read = (f: string) => readFileSync(f, "utf8");
const doc = (name: string) => read(join(PKG, name));

// 1 and 2: links and citations
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const SPAN = /`([^`\n]+)`/g;
const CITATION = /^([\w./@\[\]-]+\.[A-Za-z][A-Za-z0-9]*):(\d+(?:[-,]\d+)*)$/;
const lineCount = (f: string) => read(f).split("\n").length;
for (const file of mdFiles) {
  const text = read(file);
  for (const m of text.matchAll(LINK)) {
    const target = m[1]!;
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = decodeURIComponent(target.split("#")[0]!);
    if (path === "") continue;
    if (!existsSync(resolve(dirname(file), path))) bad(file, `broken link ${target}`);
  }
  for (const m of text.matchAll(SPAN)) {
    const c = CITATION.exec(m[1]!);
    if (!c) continue;
    const abs = resolve(REPO, c[1]!);
    if (!existsSync(abs)) {
      bad(file, `citation to a missing file ${m[1]}`);
      continue;
    }
    const need = Math.max(...c[2]!.split(/[,-]/).map(Number));
    if (lineCount(abs) < need) bad(file, `citation ${m[1]} is beyond the end of the file`);
  }
}

// 3: ids inside this folder
const spec = doc("SPEC.md");
const tasks = doc("TASKS.md");
const reqIds = new Set([...spec.matchAll(/^\| (F2-(?:DIG|MED|OCX|UI|GOV)-\d+) \|/gm)].map((m) => m[1]!));
const acIds = new Set([...spec.matchAll(/^\| (AC-F2-[A-Z]+-\d+) \|/gm)].map((m) => m[1]!));
const taskRows = [...tasks.matchAll(/^\| (T-F2-[A-Z]\d+) \|(.*)$/gm)].map((m) => ({ id: m[1]!, cols: m[2]!.split("|").map((s) => s.trim()) }));
const taskIds = new Set(taskRows.map((t) => t.id));
const deskTasks = read(join(DESK, "TASKS.md"));
const deskTaskIds = new Set([...deskTasks.matchAll(/^\| (T[\w-]+\.?\d*) \|/gm)].map((m) => m[1]!));
const cited = new Set<string>();
for (const t of taskRows) {
  // cols: Req/AC | Resultado | Owner e arquivos | Dep | Estado | Check
  const [reqCol = "", , , depCol = ""] = t.cols;
  for (const id of reqCol.match(/(?:AC-F2-[A-Z]+-\d+|F2-(?:DIG|MED|OCX|UI|GOV)-\d+)/g) ?? []) {
    cited.add(id);
    if (!reqIds.has(id) && !acIds.has(id)) bad(join(PKG, "TASKS.md"), `${t.id} cites unknown id ${id}`);
  }
  for (const dep of depCol.match(/T-F2-[A-Z]\d+|`?T\d+\.\d+`?/g) ?? []) {
    const id = dep.replaceAll("`", "");
    if (id.startsWith("T-F2-") ? !taskIds.has(id) : !deskTaskIds.has(id)) bad(join(PKG, "TASKS.md"), `${t.id} depends on undefined ${id}`);
  }
}
for (const row of spec.matchAll(/^\| (AC-F2-[A-Z]+-\d+) \| ([^|]*) \|/gm)) for (const id of row[2]!.match(/F2-(?:DIG|MED|OCX|UI|GOV)-\d+/g) ?? []) cited.add(id);
for (const id of reqIds) if (!cited.has(id)) bad(join(PKG, "SPEC.md"), `requirement ${id} is not cited by any task or AC`);
for (const id of acIds) if (!cited.has(id)) bad(join(PKG, "SPEC.md"), `${id} is not cited by any task`);
const aIds = new Set([...doc("ACHADOS.md").matchAll(/^\| (A-\d+) \|/gm)].map((m) => m[1]!));
const dIds = new Set([...doc("ADENDO-REV3.md").matchAll(/^## (D3-\d+) /gm)].map((m) => m[1]!));
for (const file of mdFiles) {
  const text = read(file);
  for (const m of text.matchAll(/\bA-(\d+)\b/g)) if (!aIds.has(`A-${m[1]}`) && /^\d+$/.test(m[1]!) && !text.slice(Math.max(0, m.index! - 3), m.index!).match(/[A-Za-z]-$/)) bad(file, `unknown finding A-${m[1]}`);
  for (const m of text.matchAll(/\bD3-(\d+)\b/g)) if (!dIds.has(`D3-${m[1]}`)) bad(file, `unknown delta D3-${m[1]}`);
  for (const m of text.matchAll(/\bF2-(?:DIG|MED|OCX|UI|GOV)-\d+\b/g)) if (!reqIds.has(m[0])) bad(file, `unknown requirement ${m[0]}`);
}

// 4: installer ids and ECO ids
const deskSpec = read(join(DESK, "SPEC.md"));
const deskIds = new Set([...deskSpec.matchAll(/^\| ([A-Z]+-\d+) \|/gm)].map((m) => m[1]!));
const deskAcs = new Set([...deskSpec.matchAll(/^\| (AC-[A-Z]+-\d+) \|/gm)].map((m) => m[1]!));
const ownSpec = read(join(PKG, "..", "spec.md"));
const ecoIds = new Set([...ownSpec.matchAll(/\*\*(ECO-\d+)[ .]/g)].map((m) => m[1]!));
const DESK_PREFIX = /^(API|SRC|DOC|CHN|ICO|DAT|ASK|WAL|CFG|WIN|FLX|SMT|ING|RAS|INF|QLT)-\d+$/;
for (const file of mdFiles) {
  for (const m of read(file).matchAll(SPAN)) {
    const s = m[1]!;
    if (DESK_PREFIX.test(s) && !deskIds.has(s)) bad(file, `installer requirement ${s} does not exist`);
    else if (/^AC-(?!F2)[A-Z]+-\d+$/.test(s) && !deskAcs.has(s)) bad(file, `installer AC ${s} does not exist`);
    else if (/^T\d+\.\d+$/.test(s) && !deskTaskIds.has(s)) bad(file, `installer task ${s} does not exist`);
    else if (/^ECO-\d+$/.test(s) && !ecoIds.has(s)) bad(file, `${s} does not exist in config-onchain-smartmoney/spec.md`);
  }
}

// 5: budget tables
function budget(prefix: string, label: string) {
  const rows = [...spec.matchAll(new RegExp(`^\\| ${prefix}\\d+ \\| .* \\| (Basic\\*|Basic|Premium|Free) \\| [^|]* \\|$`, "gm"))].map((m) => m[1]!);
  const total = rows.length;
  const basic = rows.filter((c) => c === "Basic").length;
  const premium = rows.filter((c) => c === "Premium").length;
  const unknown = rows.filter((c) => c === "Basic*").length;
  const line = new RegExp(`Totais modo ${label}: (\\d+) chamadas, (\\d+) Basic, (\\d+) Premium, (\\d+) desconhecida`).exec(spec);
  if (!line) return bad(join(PKG, "SPEC.md"), `missing totals line for ${label}`);
  const stated = line.slice(1).map(Number);
  if (stated[0] !== total || stated[1] !== basic || stated[2] !== premium || stated[3] !== unknown) bad(join(PKG, "SPEC.md"), `totals of ${label} say ${stated.join("/")} but the table has ${total}/${basic}/${premium}/${unknown}`);
  if (total > 15) bad(join(PKG, "SPEC.md"), `${label} plan has ${total} calls, above the cap of 15`);
  return { basic: basic + unknown, premium };
}
const token = budget("T", "token");
const discovery = budget("D", "descoberta");
if (token && discovery) {
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  for (const n of [Math.floor(50_000 / token.basic), Math.floor(50_000 / token.premium), Math.floor(50_000 / discovery.premium), Math.floor(50_000 / discovery.basic)]) {
    if (!spec.includes(fmt(n))) bad(join(PKG, "SPEC.md"), `monthly capacity ${fmt(n)} is missing from the capacity paragraph`);
  }
}

// 6: typography
for (const file of mdFiles) {
  const text = read(file);
  for (const ch of ["\u00b7", "\u2014", "\u2013"]) if (text.includes(ch)) bad(file, `contains U+${ch.codePointAt(0)!.toString(16).padStart(4, "0")}`);
}

// 7: secrets and archive shape
const SECRET = [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, /\b[0-9A-F]{32}\b/, /\b0x[0-9a-fA-F]{40}\b/, /OKX_WEB3_API_(?:KEY|SECRET|PASSPHRASE)\s*=\s*\S/];
for (const file of files) {
  if (file.endsWith("verify.ts")) continue;
  const text = read(file);
  for (const re of SECRET) if (re.test(text)) bad(file, `contains a credential-like value (${re})`);
}
const probePath = join(PKG, "evidence", "probe-2026-10-12.json");
if (existsSync(probePath)) {
  const allowed = new Set(["id", "tier", "method", "path", "http", "code", "msg", "shape"]);
  for (const row of (JSON.parse(read(probePath)) as { linhas: Record<string, unknown>[] }).linhas) {
    for (const key of Object.keys(row)) if (!allowed.has(key)) bad(probePath, `row ${String(row.id)} has a non-allowed field ${key}`);
  }
} else bad(probePath, "missing");

// 8: baseline of the installer SPEC
const baselinePath = join(PKG, "evidence", "baseline-hashes.json");
if (existsSync(baselinePath)) {
  const baseline = JSON.parse(read(baselinePath)) as { congelados: Record<string, { atual: string }> };
  for (const [name, entry] of Object.entries(baseline.congelados)) {
    const file = join(DESK, name);
    const now = existsSync(file) ? createHash("sha256").update(readFileSync(file)).digest("hex") : "missing";
    if (now !== entry.atual) (strict ? problems : warnings).push(`installer file ${name} changed since the baseline: this adendo is outdated, read it again before use`);
  }
} else bad(baselinePath, "missing");

for (const w of warnings) console.warn(`warning: ${w}`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`ok: ${mdFiles.length} markdown files, ${reqIds.size} requirements, ${acIds.size} ACs, ${taskIds.size} tasks, ${aIds.size} findings, ${dIds.size} deltas`);
