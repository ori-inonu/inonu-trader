import { startServer } from "../src/server";

function main() {
  const args = process.argv.slice(2);
  const origins: string[] = [];
  let port: number | undefined;
  let stateDir: string | undefined;
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (!value) throw new Error("Preview requires --port, --origin and --state-dir values");
    if (args[i] === "--port" && port === undefined && /^\d+$/.test(value)) port = Number(value);
    else if (args[i] === "--origin") origins.push(value);
    else if (args[i] === "--state-dir" && stateDir === undefined) stateDir = value;
    else throw new Error("Unknown or duplicate preview option");
  }
  if (port === undefined || stateDir === undefined) throw new Error("Preview requires explicit --port, --origin and --state-dir");
  const server = startServer({ model: "none", wallet: null, dryRun: true, market: "local-http-preview", startedAt: Date.now(),
    mode: "read_only", dataSource: "local-http-preview-no-producer" }, () => [], { port, origins, stateDir });
  const shutdown = () => { server.close(); process.off("SIGINT", shutdown); process.off("SIGTERM", shutdown); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  console.log(JSON.stringify({ preview: "read_only", api: `http://127.0.0.1:${port}`, pid: process.pid }));
}

try { main(); } catch (error) { console.error(error instanceof Error ? error.message : "Preview startup failed"); process.exitCode = 1; }
