import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildLearningDataset, MAX_RECORDS, type DatasetOptions } from "../src/learning-evidence/dataset";
import { parseLabel, parseSnapshot } from "../src/outcomes/store";
import { HORIZONS, type Horizon } from "../src/outcomes/types";

const MAX_BYTES = 64 * 1024 * 1024;
const FILE_NAME = /^(snapshots|labels)-\d{4}-\d{2}-\d{2}\.jsonl$/;
const FLAGS = new Set(["--dir", "--horizon", "--as-of-ms", "--min-train-groups", "--test-groups", "--embargo-ms"]);
const DATASET_ERRORS = new Set(["invalid_options", "record_limit", "invalid_snapshot", "invalid_label",
  "conflicting_snapshot", "conflicting_label", "duplicate_observation", "fold_index_limit"]);

class InputError extends Error {}

function argumentsFor(args: readonly string[]) {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]!, value = args[i + 1];
    if (!FLAGS.has(flag) || values.has(flag) || !value || value.startsWith("--")) throw new InputError("invalid_arguments");
    values.set(flag, value);
  }
  const dir = values.get("--dir"), horizon = values.get("--horizon"), asOf = values.get("--as-of-ms");
  if (!dir || !horizon || !asOf || !(HORIZONS as readonly string[]).includes(horizon)) throw new InputError("invalid_arguments");
  const numberFor = (flag: string, fallback?: number): number => {
    const value = values.get(flag);
    if (value === undefined && fallback !== undefined) return fallback;
    if (value === undefined || !/^\d+$/.test(value)) throw new InputError("invalid_arguments");
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw new InputError("invalid_arguments");
    return parsed;
  };
  const options: DatasetOptions = { horizon: horizon as Horizon, asOfMs: numberFor("--as-of-ms"),
    minTrainGroups: numberFor("--min-train-groups", 30), testGroups: numberFor("--test-groups", 12),
    embargoMs: numberFor("--embargo-ms", 0) };
  // Validate even when the directory has no records.
  buildLearningDataset([], [], options);
  return { dir, options };
}

async function readRecorder(dir: string) {
  const names = (await readdir(dir)).filter((name) => FILE_NAME.test(name)).sort();
  const snapshots: unknown[] = [], labels: unknown[] = [];
  const sources: { name: string; bytes: number; sha256: string }[] = [];
  let totalBytes = 0;
  for (const name of names) {
    const path = join(dir, name), stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new InputError("non_regular_file: " + name);
    if (stat.size > MAX_BYTES - totalBytes) throw new InputError("byte_limit: " + name);
    // Bound the actual read too, in case a recorder appends after lstat.
    const bytes = await Bun.file(path).slice(0, MAX_BYTES - totalBytes + 1).arrayBuffer();
    if (bytes.byteLength > MAX_BYTES - totalBytes) throw new InputError("byte_limit: " + name);
    const after = await lstat(path);
    if (!after.isFile() || after.isSymbolicLink() || stat.size !== bytes.byteLength ||
      stat.size !== after.size || stat.mtimeMs !== after.mtimeMs || stat.ino !== after.ino) {
      throw new InputError("source_changed: " + name);
    }
    totalBytes += bytes.byteLength;
    let contents: string;
    try { contents = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new InputError("invalid_utf8: " + name); }
    const destination = name.startsWith("snapshots-") ? snapshots : labels;
    const parse = name.startsWith("snapshots-") ? parseSnapshot : parseLabel;
    const lines = contents.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trim().length === 0) continue;
      if (snapshots.length + labels.length >= MAX_RECORDS) throw new InputError("record_limit: " + name + ":" + (i + 1));
      let raw: unknown;
      try { raw = JSON.parse(line); }
      catch { throw new InputError("invalid_json: " + name + ":" + (i + 1)); }
      if (!parse(raw)) throw new InputError("invalid_record: " + name + ":" + (i + 1));
      destination.push(raw);
    }
    sources.push({ name, bytes: bytes.byteLength, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") });
  }
  return { snapshots, labels, sources };
}

if (import.meta.main) {
  try {
    if (Bun.argv.slice(2).length === 1 && Bun.argv[2] === "--help") {
      console.log("bun --no-env-file scripts/learning-dataset.ts --dir <recorder> --horizon <15m|1h|4h> --as-of-ms <integer> [--min-train-groups 30] [--test-groups 12] [--embargo-ms 0]");
    } else {
      const { dir, options } = argumentsFor(Bun.argv.slice(2));
      const input = await readRecorder(dir);
      const dataset = buildLearningDataset(input.snapshots, input.labels, options);
      console.log(JSON.stringify({ ...dataset, sources: input.sources }));
    }
  } catch (error) {
    const code = error instanceof InputError ? error.message :
      error instanceof Error && DATASET_ERRORS.has(error.message) ? error.message : "input_unavailable";
    console.error("learning_dataset: " + code);
    process.exitCode = 1;
  }
}
