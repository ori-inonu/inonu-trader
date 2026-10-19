import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decide, DISCLAIMER } from "../../src/consensus/engine";
import { createJevJudge } from "../../src/consensus/jev-judge";
import { planOf, parseSpec } from "../../src/consensus/spec";
import { enforceCallLimit, loadCheckpoint, projectRoot, saveCheckpoint, type Checkpoint } from "./core";
const args = process.argv.slice(2), [command, ...rest] = args;
const flag = (name: string) => { const i = rest.indexOf(name); return i < 0 ? undefined : rest[i + 1]; };
const fail = (message: string): never => { console.error(message); process.exit(2); };
function readSpec(file?: string) { if (!file) fail("uso: plan|run <spec.json> [--max-calls N]"); try { return parseSpec(JSON.parse(readFileSync(resolve(file!), "utf8"))); } catch { fail("spec recusada: formato invalido ou dado sensivel"); } }
const redact = (error: unknown) => error instanceof Error ? error.message.replace(/(?:sk-[A-Za-z0-9]{8,}|\b[A-Za-z0-9_-]{32,}\b)/g, "[redigido]").slice(0, 240) : "erro interno";
try {
  if (command === "plan") {
    const spec = readSpec(rest[0])!; console.log(JSON.stringify({ specId: spec.id, ...planOf(spec), note: "teto, nao previsao; nada enviado" }, null, 2));
  } else if (command === "run") {
    const spec = readSpec(rest[0])!, raw = flag("--max-calls");
    if (rest.includes("--max-calls") && raw === undefined) fail("max_calls exige um valor quando informado");
    const limit = enforceCallLimit(spec, raw === undefined ? undefined : Number(raw));
    const apiKey = process.env.TYPESAFE_AI_API_KEY;
    if (!apiKey) fail("execucao recusada: credencial ausente no ambiente herdado");
    const judge = createJevJudge({ apiKey: apiKey!, ...(limit.maxCalls === undefined ? {} : { maxCalls: limit.maxCalls }) });
    try { const receipt = await decide(limit.parsed, judge); console.log(JSON.stringify({ receipt, meter: judge.meter(), disclaimer: DISCLAIMER }, null, 2)); }
    catch { console.error("execucao falhou; detalhes omitidos para proteger credenciais"); process.exitCode = 3; }
  } else if (["checkpoint", "status", "next"].includes(command ?? "")) {
    const root = projectRoot(flag("--project") ?? process.cwd());
    if (command === "checkpoint") {
      const objective = flag("--objective"), rawIterations = flag("--iterations"), rawMinutes = flag("--minutes"), iterations = rawIterations === undefined ? undefined : Number(rawIterations), minutes = rawMinutes === undefined ? undefined : Number(rawMinutes);
      if (!objective || objective.trim().length === 0 || objective.length > 500 || (iterations !== undefined && (!Number.isSafeInteger(iterations) || iterations < 1)) || (minutes !== undefined && (!Number.isFinite(minutes) || minutes <= 0))) fail("checkpoint exige --objective; --iterations e --minutes sao anotacoes opcionais e nao limites do runner");
      const s: Checkpoint = { v: 1, project: root, objective: objective!, ...(iterations === undefined ? {} : { iteration: 0, maxIterations: iterations }), ...(minutes === undefined ? {} : { deadlineMs: Date.now() + minutes * 60000 }), updatedAt: Date.now() };
      saveCheckpoint(root, s); console.log(JSON.stringify({ ...s, legacyLimitsAreMetadata: true, autonomousRunner: "scripts/sdd-harness/runner.ts" }, null, 2));
    } else {
      const loaded = loadCheckpoint(root); if (!loaded) fail("nenhum checkpoint para este projeto"); const s = loaded!;
      const next = command === "next" ? { ...s, iteration: (s.iteration ?? 0) + 1, updatedAt: Date.now() } : s;
      if (command === "next") saveCheckpoint(root, next);
      console.log(JSON.stringify({ ...next, legacyLimitsAreMetadata: true, autonomousRunner: "scripts/sdd-harness/runner.ts", manualNextIsNotTheAutonomousScheduler: true }, null, 2));
    }
  } else fail("comandos: plan, run, checkpoint, status, next");
} catch (error) { console.error(`recusado: ${redact(error)}`); process.exitCode = 2; }
