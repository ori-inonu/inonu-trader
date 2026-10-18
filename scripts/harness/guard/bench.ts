/**
 * Mede a latência do PROCESSO REAL da guarda (partida do Bun incluída): N execuções de `bun guard.ts` com stdin de
 * exemplo e GUARD_HOME temporário. Também mede um script vazio como piso da partida do Bun na máquina.
 * Uso: bun scripts/harness/guard/bench.ts [N=100] [observe|enforce=enforce]
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const n = Number(process.argv[2] ?? 100);
const mode = process.argv[3] === "observe" ? "observe" : "enforce";
const guard = resolve(import.meta.dir, "guard.ts");
const home = mkdtempSync(join(tmpdir(), "guard-bench-"));
// o piso usa um script vazio NA PASTA DA GUARDA: a partida do Bun depende do caminho (pai com milhares de arquivos, como %TEMP%, custa ~200 ms a mais)
const empty = join(import.meta.dir, ".bench-empty.ts");
writeFileSync(join(home, "mode"), `${mode}\n`);
writeFileSync(empty, "");

const base = { session_id: "bench", cwd: home, permission_mode: "auto" };
const inputs = [
  { ...base, tool_name: "Bash", tool_input: { command: "git status" } },
  { ...base, tool_name: "Bash", tool_input: { command: "git push --force origin main" } },
  { ...base, tool_name: "PowerShell", tool_input: { command: "Get-ChildItem -Recurse src | Select-String TODO" } },
  { ...base, tool_name: "Edit", tool_input: { file_path: "C:\\work\\proj\\src\\agent\\cycle.ts", old_string: "a", new_string: "b" } },
].map((i) => new TextEncoder().encode(JSON.stringify(i)));

const time = (args: string[], stdin: Uint8Array): number => {
  const t = performance.now();
  Bun.spawnSync([process.execPath, "--no-env-file", ...args], { stdin, env: { ...process.env, GUARD_HOME: home }, stdout: "pipe", stderr: "pipe" });
  return performance.now() - t;
};
const stats = (xs: number[]): string => {
  const s = [...xs].sort((a, b) => a - b);
  const p = (q: number): number => s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] ?? 0;
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return `n=${s.length} min=${s[0]?.toFixed(0)} p50=${p(0.5).toFixed(0)} p95=${p(0.95).toFixed(0)} max=${s[s.length - 1]?.toFixed(0)} média=${mean.toFixed(0)} (ms)`;
};

time([guard], inputs[0] ?? new Uint8Array()); // aquece o cache de disco
const floor: number[] = [];
const runs: number[] = [];
for (let k = 0; k < n; k++) {
  floor.push(time([empty], new Uint8Array()));
  runs.push(time([guard], inputs[k % inputs.length] ?? new Uint8Array()));
}
console.log(`piso (script vazio):  ${stats(floor)}`);
console.log(`guarda (${mode}):  ${stats(runs)}`);
rmSync(home, { recursive: true, force: true });
rmSync(empty, { force: true });
