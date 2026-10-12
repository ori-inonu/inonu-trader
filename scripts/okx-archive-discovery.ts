/** Import-safe metadata CLI. Use Bun --no-env-file; only --public permits one GET. */
import { ARCHIVE_QUALIFICATION, ARCHIVE_SCHEMA_VERSION, createArchiveDiscoveryClient, normalizeArchiveRequest } from "../src/onchainos/archive-discovery.ts";
import { OnchainosError } from "../src/onchainos/errors.ts";
import type { FetchLike } from "../src/onchainos/http.ts";

export interface ArchiveDiscoveryCliPorts {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly fetch: FetchLike;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
}
const HELP = "Usage: bun --no-env-file scripts/okx-archive-discovery.ts --module <1|2|3|4|5|6|11> --inst-type <SPOT|FUTURES|SWAP|OPTION> --instruments <comma-separated IDs or families> --aggregation <daily|monthly> --begin <Unix-ms decimal string> --end <Unix-ms decimal string> [--public]\nDefault: dry run. --public makes one unauthenticated metadata GET, zero retries, zero archive downloads.\n--help prints this usage.";
const VALUE_FLAGS = ["--module", "--inst-type", "--instruments", "--aggregation", "--begin", "--end"] as const;
function usage(): never { throw new OnchainosError("invalid_request", "invalid archive discovery arguments"); }

function argumentsFor(argv: readonly string[]): { help: true } | { help: false; publicRead: boolean; request: ReturnType<typeof normalizeArchiveRequest> } {
  if (!Array.isArray(argv) || Object.getPrototypeOf(argv) !== Array.prototype || argv.length > 13) return usage();
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const values = new Map<string, string>();
  let publicRead = false;
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (typeof flag !== "string" || flag.length > 1024) return usage();
    if (flag === "--public") {
      if (publicRead) return usage();
      publicRead = true;
      continue;
    }
    if (!VALUE_FLAGS.includes(flag as typeof VALUE_FLAGS[number]) || values.has(flag)) return usage();
    const value = argv[++index];
    if (typeof value !== "string" || value.length < 1 || value.length > 809 || value.startsWith("--") || /:\/\//.test(value)) return usage();
    values.set(flag, value);
  }
  if (values.size !== VALUE_FLAGS.length) return usage();
  const instType = values.get("--inst-type");
  const request = normalizeArchiveRequest({ module: values.get("--module"), instType, [instType === "SPOT" ? "instIdList" : "instFamilyList"]: values.get("--instruments"), dateAggrType: values.get("--aggregation"), begin: values.get("--begin"), end: values.get("--end") });
  return { help: false, publicRead, request };
}

/** Injected IO/network; returns 0 for a plan/listing, 2 for usage, 1 for other failures. */
export async function runArchiveDiscoveryCli(argv: readonly string[], ports: ArchiveDiscoveryCliPorts): Promise<number> {
  try {
    const parsed = argumentsFor(argv);
    if (parsed.help) { ports.stdout(HELP); return 0; }
    if (!parsed.publicRead) {
      ports.stdout(JSON.stringify({ mode: "dry_run", schemaVersion: ARCHIVE_SCHEMA_VERSION, networkEnabled: false, request: parsed.request, qualification: ARCHIVE_QUALIFICATION }, null, 2));
      return 0;
    }
    const client = createArchiveDiscoveryClient({ fetch: ports.fetch, now: ports.now, sleep: ports.sleep, allowNetwork: true });
    const result = await client.discover(parsed.request.query);
    ports.stdout(JSON.stringify({ mode: "public_metadata", ...result }, null, 2));
    return 0;
  } catch (error) {
    const kind = error instanceof OnchainosError ? error.kind : "internal_error";
    // Untrusted provider/input/exception text is deliberately absent from CLI output.
    ports.stderr(`archive discovery failed: ${kind}`);
    return kind === "invalid_request" ? 2 : 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runArchiveDiscoveryCli(Bun.argv.slice(2), { stdout: (text) => { console.log(text); }, stderr: (text) => { console.error(text); }, fetch: (url, init) => fetch(url, init), now: Date.now, sleep: (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }) });
}
