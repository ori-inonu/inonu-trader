/**
 * Wrapper for the Python analytics collector (python/jev_analytics): a read-only digest of the public OKX API,
 * standard library only, that writes data/jev-analytics/latest.json for the Jev producer to consume.
 *
 *   bun run analytics            collect every 30 s into the default pack path
 *   bun run analytics:once       one collection pass, then exit
 *   bun run analytics:test       the Python unit tests (no extra arguments)
 *
 * Extra args after `--` are forwarded to the collector, for example
 *   bun --no-env-file run analytics:once -- --out /tmp/pack.json --insts BTC-USDT,ETH-USDT
 * The Python executable is JEV_PYTHON when set, otherwise `python`.
 */

import { resolve } from "node:path";
import { buildPythonCommand } from "../src/jev-read/analytics-runner";

const ROOT = resolve(import.meta.dir, "..");
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const mode = args[0] ?? "run";
const extraArgs = args.slice(1);

if (mode !== "run" && mode !== "once" && mode !== "test") {
  console.error(`uso: bun run analytics[:once|:test] [-- args]\n  modos: run (a cada 30 s), once (uma passada), test (testes Python)\n  recebi: ${mode}`);
  process.exit(2);
}

let command;
try {
  command = buildPythonCommand(mode, extraArgs, process.env, ROOT);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const child = Bun.spawn(command.cmd as string[], {
  cwd: command.cwd,
  env: command.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

const forward = (signal: "SIGINT" | "SIGTERM") => {
  try {
    child.kill(signal === "SIGINT" ? 2 : 15);
  } catch {
    // Child already exited.
  }
};
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

process.exit(await child.exited);
