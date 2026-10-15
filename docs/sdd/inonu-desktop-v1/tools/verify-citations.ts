// Verifies the SDD package: links, file:line citations, requirement/AC/task id consistency and typography.
//
// usage: bun --no-env-file run docs/sdd/inonu-desktop-v1/tools/verify-citations.ts
//
// Checks (exit code 1 on any problem):
//  1. relative markdown links resolve to an existing file or folder;
//  2. a backtick span with `path:line`, `path:a-b` or `path:a,b` points to an existing repo file with enough lines
//     (a bare basename like `JevStage.tsx:87` must match exactly one file under src, web/src or scripts);
//  3. a span `okx-docs/<page>.txt` names a page that exists in onchainos-coverage.json;
//  4. every requirement id in SPEC.md is covered by a task (directly, or through an AC that a task references),
//     every AC is referenced by at least one task, and tasks cite only ids that exist;
//  5. task dependencies point to defined tasks;
//  6. no middle dot, em dash or en dash in the package markdown (rendered-text rule of CLAUDE.md, applied to docs too).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const PKG = join(import.meta.dir, "..");
const REPO = resolve(PKG, "..", "..", "..");
const problems: string[] = [];
const bad = (file: string, msg: string) => problems.push(`${relative(REPO, file).replaceAll("\\", "/")}: ${msg}`);

function walk(dir: string, out: string[] = [], skip = new Set(["node_modules", ".next", "out", ".git"])): string[] {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out, skip);
    else out.push(full);
  }
  return out;
}

const mdFiles = walk(PKG).filter((f) => f.endsWith(".md") && !f.includes(`${join(PKG, "evidence")}`));

// ---- basename index for citations like `JevStage.tsx:87`
const byBase = new Map<string, string[]>();
for (const root of ["src", "web/src", "scripts", "python"]) {
  const abs = join(REPO, root);
  if (!existsSync(abs)) continue;
  for (const f of walk(abs)) {
    const base = f.split(/[\\/]/).pop()!;
    byBase.set(base, [...(byBase.get(base) ?? []), f]);
  }
}

const lineCount = (file: string) => readFileSync(file, "utf8").split("\n").length;
const linesOf = (spec: string) => spec.split(/[,-]/).map(Number).filter((n) => Number.isFinite(n));

const coverage = existsSync(join(PKG, "onchainos-coverage.json"))
  ? (JSON.parse(readFileSync(join(PKG, "onchainos-coverage.json"), "utf8")) as { paginas: { path: string }[] })
  : { paginas: [] };
const pages = new Set(coverage.paginas.map((p) => p.path));

// the file extension starts with a letter, so `127.0.0.1:3000` (host and port) is not a citation
const CITATION = /^([\w./@\[\]-]+\.[A-Za-z][A-Za-z0-9]*):(\d+(?:[-,]\d+)*)$/;
const MIRROR = /^okx-docs\/(.+)\.txt$/;
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const SPAN = /`([^`\n]+)`/g;

for (const file of mdFiles) {
  const text = readFileSync(file, "utf8");
  const isMatrix = file.endsWith("onchainos-coverage.md");
  for (const m of text.matchAll(LINK)) {
    const target = m[1]!;
    if (/^[a-z]+:/i.test(target) || target.startsWith("#")) continue;
    const path = resolve(dirname(file), target.split("#")[0]!);
    if (!existsSync(path)) bad(file, `broken link ${target}`);
  }
  if (isMatrix) continue;
  for (const m of text.matchAll(SPAN)) {
    const span = m[1]!;
    const mirror = MIRROR.exec(span);
    if (mirror) {
      if (!pages.has(mirror[1]!)) bad(file, `mirror page not in coverage: ${span}`);
      continue;
    }
    const cite = CITATION.exec(span);
    if (!cite) continue;
    const [, path, lines] = cite as unknown as [string, string, string];
    let target: string | undefined;
    if (path.includes("/")) target = join(REPO, path);
    else {
      const hits = byBase.get(path) ?? [];
      if (hits.length === 1) target = hits[0];
      else {
        bad(file, `citation ${span}: basename matches ${hits.length} files`);
        continue;
      }
    }
    if (!target || !existsSync(target)) {
      bad(file, `citation ${span}: file not found`);
      continue;
    }
    const total = lineCount(target);
    for (const n of linesOf(lines)) if (n < 1 || n > total) bad(file, `citation ${span}: line ${n} beyond ${total}`);
  }
  for (const [i, line] of text.split("\n").entries()) {
    if (/[·—–]/.test(line)) bad(file, `line ${i + 1}: middle dot, em dash or en dash`);
  }
}

// ---- id consistency (SPEC.md x TASKS.md)
const ID = /\b(?:WIN|CFG|API|SRC|DOC|CHN|ICO|DAT|FLX|SMT|ING|ASK|RAS|WAL|INF|QLT)-\d+\b/g;
const AC = /\bAC-(?:WIN|CFG|API|SRC|DOC|CHN|ICO|DAT|FLX|SMT|ING|ASK|RAS|WAL|INF|QLT)-\d+\b/g;
const spec = readFileSync(join(PKG, "SPEC.md"), "utf8");
const tasks = readFileSync(join(PKG, "TASKS.md"), "utf8");

const reqRows = [...spec.matchAll(/^\|\s*((?:WIN|CFG|API|SRC|DOC|CHN|ICO|DAT|FLX|SMT|ING|ASK|RAS|WAL|INF|QLT)-\d+)\s*\|/gm)].map((m) => m[1]!);
const acRows = [...spec.matchAll(/^\|\s*(AC-[A-Z]+-\d+)\s*\|\s*([^|]*)\|/gm)].map((m) => ({ ac: m[1]!, reqs: [...m[2]!.matchAll(ID)].map((x) => x[0]) }));
const reqSet = new Set(reqRows);
const acSet = new Set(acRows.map((a) => a.ac));
if (reqSet.size !== reqRows.length) bad(join(PKG, "SPEC.md"), "duplicate requirement id");

const taskRows = [...tasks.matchAll(/^\|\s*(T-DOC-\d+|T\d+\.\d+)\s*\|([^\n]*)$/gm)].map((m) => ({ id: m[1]!, rest: m[2]! }));
const taskIds = new Set(taskRows.map((t) => t.id));
if (taskIds.size !== taskRows.length) bad(join(PKG, "TASKS.md"), "duplicate task id");

const taskReqs = new Set<string>();
const taskAcs = new Set<string>();
for (const t of taskRows) {
  const cols = t.rest.split("|");
  const reqAc = cols[0] ?? "";
  for (const a of reqAc.matchAll(AC)) {
    taskAcs.add(a[0]);
    if (!acSet.has(a[0])) bad(join(PKG, "TASKS.md"), `${t.id}: ${a[0]} not in SPEC.md`);
  }
  for (const q of reqAc.replace(AC, "").matchAll(ID)) {
    taskReqs.add(q[0]);
    if (!reqSet.has(q[0])) bad(join(PKG, "TASKS.md"), `${t.id}: ${q[0]} not in SPEC.md`);
  }
  for (const d of t.rest.matchAll(/\bT(?:-DOC-\d+|\d+\.\d+)\b/g)) {
    if (d[0] !== t.id && !taskIds.has(d[0])) bad(join(PKG, "TASKS.md"), `${t.id}: references undefined task ${d[0]}`);
  }
}
for (const a of acRows) {
  if (!taskAcs.has(a.ac)) bad(join(PKG, "SPEC.md"), `${a.ac} is not referenced by any task`);
  for (const q of a.reqs) if (!reqSet.has(q)) bad(join(PKG, "SPEC.md"), `${a.ac}: requirement ${q} not defined`);
}
const covered = new Set(taskReqs);
for (const a of acRows) if (taskAcs.has(a.ac)) for (const q of a.reqs) covered.add(q);
for (const q of reqSet) if (!covered.has(q)) bad(join(PKG, "SPEC.md"), `${q} has no task (directly or through an AC)`);
// every requirement must also appear in at least one AC
const inAc = new Set(acRows.flatMap((a) => a.reqs));
for (const q of reqSet) if (!inAc.has(q)) bad(join(PKG, "SPEC.md"), `${q} has no acceptance criterion`);

// plan: every task id in PLAN.md must be defined
const plan = readFileSync(join(PKG, "PLAN.md"), "utf8");
for (const m of plan.matchAll(/\bT(?:-DOC-\d+|\d+\.\d+)\b/g)) if (!taskIds.has(m[0])) bad(join(PKG, "PLAN.md"), `undefined task ${m[0]}`);

if (problems.length) {
  console.error(problems.slice(0, 80).join("\n"));
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`ok: ${mdFiles.length} markdown files, ${reqSet.size} requirements, ${acSet.size} acceptance criteria, ${taskIds.size} tasks, links, citations and typography verified`);
