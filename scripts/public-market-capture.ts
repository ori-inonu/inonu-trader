import { closeSync, lstatSync, openSync, readSync } from "node:fs";
import { runCapture, readCapture } from "../src/public-market-capture";
import { createNodeTransport } from "../src/public-market-capture/node-adapter";

const usage = `Public market capture (offline by default)
  bun --no-env-file scripts/public-market-capture.ts
  bun --no-env-file scripts/public-market-capture.ts --inspect <capture-directory>
  bun --no-env-file scripts/public-market-capture.ts --capture --plan <plan.json> --access <access.json>
The actual raw Node transport is unqualified and refuses capture before egress.
`;
function localJson(path: string): unknown {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw Error("local_input_bounds");
  const fd = openSync(path, "r"), bytes = Buffer.alloc(65537);
  try {
    let length = 0;
    while (length < bytes.length) { const n = readSync(fd, bytes, length, bytes.length - length, null); if (!n) break; length += n; }
    if (length > 65536) throw Error("local_input_bounds");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)));
  } finally { closeSync(fd); }
}
async function main(args: string[]): Promise<void> {
  if (args.length === 1 && args[0] === "--help") { process.stdout.write(usage); return; }
  const transport = createNodeTransport();
  let report: any;
  if (!args.length || (args.length === 1 && args[0] === "--offline")) report = await runCapture({ mode: "offline" }, { transport });
  else if (args.length === 2 && args[0] === "--inspect" && args[1]) {
    report = readCapture(args[1]);
    process.exitCode = report.errors.length || report.untrustedTail ? 2 : 0;
  } else if (args.length === 5 && args[0] === "--capture" && args[1] === "--plan" && args[2] && args[3] === "--access" && args[4]) {
    try { report = await runCapture(localJson(args[2]), { transport, access: localJson(args[4]) as any }); }
    catch (e) { report = await runCapture({ mode: "offline" }, { transport }); report.stopReason = e instanceof Error && e.message === "local_input_bounds" ? e.message : "local_input_invalid"; }
    process.exitCode = report.outcome === "not_started" || report.outcome === "failed_incomplete" ? 2 : 0;
  } else { report = await runCapture({ mode: "offline" }, { transport }); report.stopReason = "invalid_cli_arguments"; process.exitCode = 2; }
  process.stdout.write(JSON.stringify(report) + "\n");
}
if (import.meta.main) main(process.argv.slice(2)).catch(() => {
  process.stdout.write(JSON.stringify({ version: 1, outcome: "failed_incomplete", stopReason: "local_inspection_failure", strategyQualified: false, executionQualified: false, profitEvidence: false }) + "\n");
  process.exitCode = 2;
});
