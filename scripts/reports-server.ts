import { fileURLToPath } from "node:url";
import { startReportsServer, type ReportsServerOptions } from "../src/dashboard/reports-server";

const HELP = `Inonu Trader reports server (read-only)
Usage: bun --no-env-file --no-install scripts/reports-server.ts [options]
  --data-dir ABSOLUTE_PATH   Stored reports (default: repository data)
  --port INTEGER            Loopback port 0..65535 (default: 3000)
  --origin HTTP_ORIGIN      Exact local frontend origin; repeat for multiple origins
  --help                    Show this help
Defaults: http://localhost:3001 and http://127.0.0.1:3001
Explicit --origin values replace these defaults. Execution and live feed stay disabled.
`;

function parseArgs(args: string[]): ReportsServerOptions | null {
  if (args.length === 1 && args[0] === "--help") return null;
  let dataDir = fileURLToPath(new URL("../data/", import.meta.url));
  let port = 3000;
  const origins: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (flag !== "--data-dir" && flag !== "--port" && flag !== "--origin") throw new Error("Invalid reports option");
    const value = args[index + 1];
    if (value === undefined || value === "" || (flag !== "--origin" && seen.has(flag))) throw new Error("Missing or duplicate reports option");
    seen.add(flag);
    if (flag === "--data-dir") dataDir = value;
    else if (flag === "--origin") origins.push(value);
    else {
      if (!/^\d+$/.test(value)) throw new Error("Invalid reports port");
      port = Number(value);
    }
  }
  return { dataDir, port, origins: origins.length ? origins : ["http://localhost:3001", "http://127.0.0.1:3001"] };
}

if (import.meta.main) {
  try {
    const options = parseArgs(Bun.argv.slice(2));
    if (options === null) console.log(HELP);
    else {
      const server = startReportsServer(options);
      console.log(`Inonu reports read-only at http://127.0.0.1:${server.port}; execution and live feed disabled.`);
    }
  } catch {
    console.error("Reports server could not start. Check --help and the local configuration.");
    process.exitCode = 1;
  }
}
