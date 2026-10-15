import { statSync } from "node:fs";
import { isAbsolute } from "node:path";

export interface JournalTailSource {
  readonly bytes: number;
  readonly modifiedAtMs: number;
  readonly truncated: boolean;
  readonly incompleteFinalLine: boolean;
  /** Size, modification time and inode matched around this read. This is not
   * source authentication or a guarantee against writers hiding metadata. */
  readonly stability: "metadata_unchanged";
}
export interface JournalReadOptions {
  readonly sourcePath: string;
  /** A live host function is evaluated AFTER the read and final stat. Literal
   * times are caller-reported replay/test clocks. */
  readonly observedAtMs: number | (() => number);
  readonly maxBytes?: number;
}
export type JournalReadFailure = { readonly ok: false; readonly code: "request_invalid" | "source_missing" | "source_unreadable" | "source_changed_during_read" };
export type JournalReadResult = { readonly ok: true; readonly observedAtMs: number; readonly sourceAuthenticated: false; readonly source: JournalTailSource; readonly lines: readonly string[] } | JournalReadFailure;
const clock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Read only. No path creation, output file, model, provider or financial port.
 * A tail cut inside a line is dropped, an exact preceding newline retains it,
 * and an unfinished final line is deferred rather than assigned availability. */
export async function readJournalTail(options: JournalReadOptions): Promise<JournalReadResult> {
  const max = options?.maxBytes ?? 2_000_000;
  if (typeof options?.sourcePath !== "string" || !isAbsolute(options.sourcePath) || !clock(max) || max < 1 || max > 8_000_000 || typeof options.observedAtMs !== "function" && !clock(options.observedAtMs)) return { ok: false, code: "request_invalid" };
  let bytes: number, modifiedAtMs: number, offset: number, completePrefix: boolean, data: Uint8Array;
  try {
    let before;
    try { before = statSync(options.sourcePath); }
    catch (e) { return { ok: false, code: (e as { code?: string }).code === "ENOENT" ? "source_missing" : "source_unreadable" }; }
    if (!before.isFile() || !clock(before.size)) return { ok: false, code: "source_unreadable" };
    bytes = before.size; modifiedAtMs = before.mtimeMs;
    offset = Math.max(0, bytes - max);
    const file = Bun.file(options.sourcePath);
    completePrefix = offset === 0 || new Uint8Array(await file.slice(offset - 1, offset).arrayBuffer())[0] === 10;
    data = new Uint8Array(await file.slice(offset, bytes).arrayBuffer());
    const after = statSync(options.sourcePath);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ino !== before.ino || data.length !== bytes - offset) return { ok: false, code: "source_changed_during_read" };
  } catch { return { ok: false, code: "source_unreadable" }; }
  let observedAtMs: number;
  try { observedAtMs = typeof options.observedAtMs === "function" ? options.observedAtMs() : options.observedAtMs; }
  catch { return { ok: false, code: "request_invalid" }; }
  if (!clock(observedAtMs)) return { ok: false, code: "request_invalid" };
  const incompleteFinalLine = Boolean(new TextDecoder().decode(data.subarray(data.lastIndexOf(10) + 1)).trim());
  const first = completePrefix ? 0 : data.indexOf(10) + 1;
  const end = data.lastIndexOf(10) + 1;
  let lines: string[];
  try {
    // Discard byte prefixes and partial tails BEFORE decoding, so a cut in a
    // UTF-8 codepoint cannot invent replacement characters in a full record.
    const text = !completePrefix && first === 0 || end <= first ? "" : new TextDecoder("utf-8", { fatal: true }).decode(data.subarray(first, end));
    lines = text === "" ? [] : text.slice(0, -1).split("\n");
  } catch { return { ok: false, code: "source_unreadable" }; }
  return { ok: true, observedAtMs, sourceAuthenticated: false, source: { bytes, modifiedAtMs, truncated: offset > 0, incompleteFinalLine, stability: "metadata_unchanged" }, lines };
}
