import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { analyzeReplayJournal } from "../src/backtest-evidence.ts";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] !== "--journal" || (args.length !== 2 &&
    !(args.length === 4 && args[2] === "--manifest"))) {
    throw new Error("usage: bun run scripts/backtest.ts --journal <journal.jsonl> [--manifest <manifest.json>]");
  }

  const journalPath = resolve(args[1]!);
  const contents = await Bun.file(journalPath).text();
  const sha256 = createHash("sha256").update(contents, "utf8").digest("hex");
  const engineContents = await Bun.file(new URL("../src/backtest.ts", import.meta.url)).text();
  const engineSha256 = createHash("sha256").update(engineContents, "utf8").digest("hex");
  let manifest: unknown;
  let manifestError: "unreadable" | "malformed-json" | undefined;
  if (args.length === 4) {
    let manifestContents: string | undefined;
    try {
      manifestContents = await Bun.file(resolve(args[3]!)).text();
    } catch {
      manifestError = "unreadable";
    }
    if (manifestContents !== undefined) {
      try {
        manifest = JSON.parse(manifestContents) as unknown;
      } catch {
        manifestError = "malformed-json";
      }
    }
  }
  const { result, assessment } = analyzeReplayJournal({ journal: contents, engineSha256, manifest, manifestError });
  process.stdout.write(`${JSON.stringify({ ok: true, journal: { path: journalPath, sha256 }, result, assessment }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exitCode = 1;
});
