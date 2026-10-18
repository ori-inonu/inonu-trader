import { expect, test, spyOn } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJournalTail } from "./journal-reader";

const pathOf = () => join(mkdtempSync(join(tmpdir(), "synthetic-decision-reader-")), "fixture.jsonl");

test("complete bounded journal read reports unchanged metadata without authenticating a source", async () => {
  const sourcePath = pathOf(); await Bun.write(sourcePath, '{"synthetic":1}\n\n{"synthetic":2}\n');
  expect(await readJournalTail({ sourcePath, observedAtMs: 2000 })).toMatchObject({ ok: true, observedAtMs: 2000, lines: ['{"synthetic":1}', '', '{"synthetic":2}'], source: { truncated: false, incompleteFinalLine: false, stability: "metadata_unchanged" } });
});

test("tail at an exact newline boundary retains its first record, while a cut prefix is discarded", async () => {
  const sourcePath = pathOf(), last = '{"synthetic":"last"}\n';
  await Bun.write(sourcePath, '{"synthetic":"older"}\n' + last);
  expect(await readJournalTail({ sourcePath, observedAtMs: 2000, maxBytes: new TextEncoder().encode(last).length })).toMatchObject({ ok: true, lines: [last.trim()], source: { truncated: true } });
  expect(await readJournalTail({ sourcePath, observedAtMs: 2000, maxBytes: last.length + 5 })).toMatchObject({ ok: true, lines: [last.trim()], source: { truncated: true } });
});

test("an unfinished final line is deferred and remains available only after its newline", async () => {
  const sourcePath = pathOf(); await Bun.write(sourcePath, '{"synthetic":1}\n{"synthetic":');
  expect(await readJournalTail({ sourcePath, observedAtMs: 2000 })).toMatchObject({ ok: true, lines: ['{"synthetic":1}'], source: { incompleteFinalLine: true } });
  await Bun.write(sourcePath, '{"synthetic":1}\n{"synthetic":2}\n');
  expect(await readJournalTail({ sourcePath, observedAtMs: 3000 })).toMatchObject({ ok: true, lines: ['{"synthetic":1}', '{"synthetic":2}'], source: { incompleteFinalLine: false } });
  await Bun.write(sourcePath, '{}\n \t\r');
  expect(await readJournalTail({ sourcePath, observedAtMs: 4000 })).toMatchObject({ ok: true, lines: ['{}'], source: { incompleteFinalLine: false } });
});

test("byte cuts inside UTF-8 prefixes and partial codepoints never corrupt complete records", async () => {
  const sourcePath = pathOf(), last = '{"synthetic":"último"}\n';
  await Bun.write(sourcePath, '{"synthetic":"ááá"}\n' + last);
  expect(await readJournalTail({ sourcePath, observedAtMs: 2000, maxBytes: new TextEncoder().encode(last).length + 4 })).toMatchObject({ ok: true, lines: [last.trim()], source: { truncated: true } });
  const bytes = new TextEncoder().encode('{}\n{"synthetic":"á');
  await Bun.write(sourcePath, bytes.subarray(0, bytes.length - 1));
  expect(await readJournalTail({ sourcePath, observedAtMs: 3000 })).toMatchObject({ ok: true, lines: ['{}'], source: { incompleteFinalLine: true } });
});

test("the host observation clock is read after the snapshot, and invalid clocks fail closed", async () => {
  const sourcePath = pathOf(); await Bun.write(sourcePath, '{}\n'); let calls = 0;
  const value = await readJournalTail({ sourcePath, observedAtMs: () => { calls++; return 3000; } });
  expect(value).toMatchObject({ ok: true, observedAtMs: 3000, lines: ['{}'] }); expect(calls).toBe(1);
  expect(await readJournalTail({ sourcePath, observedAtMs: () => NaN })).toMatchObject({ ok: false, code: "request_invalid" });
  expect(await readJournalTail({ sourcePath, observedAtMs: () => { throw new Error("private path"); } })).toEqual({ ok: false, code: "request_invalid" });
});

test("missing sources and invalid paths or byte bounds never become healthy empty data", async () => {
  const sourcePath = pathOf();
  expect(await readJournalTail({ sourcePath, observedAtMs: 2000 })).toEqual({ ok: false, code: "source_missing" });
  for (const maxBytes of [0, -1, 8_000_001, NaN, 1.5]) expect(await readJournalTail({ sourcePath, observedAtMs: 2000, maxBytes })).toEqual({ ok: false, code: "request_invalid" });
  expect(await readJournalTail({ sourcePath: "relative.jsonl", observedAtMs: 2000 })).toEqual({ ok: false, code: "request_invalid" });
});

test("a source changed between read and final stat is rejected without reading a host clock", async () => {
  const sourcePath = pathOf(); await Bun.write(sourcePath, '{}\n');
  const original = Bun.file.bind(Bun); let calls = 0;
  const mocked = spyOn(Bun, "file").mockImplementation(((path: string) => {
    const actual = original(path);
    return { exists: () => actual.exists(), slice: (start: number, end: number) => ({ arrayBuffer: async () => { const bytes = await actual.slice(start, end).arrayBuffer(); await Bun.write(sourcePath, '{}\n{}\n'); return bytes; } }) };
  }) as typeof Bun.file);
  try { expect(await readJournalTail({ sourcePath, observedAtMs: () => { calls++; return 2000; } })).toEqual({ ok: false, code: "source_changed_during_read" }); expect(calls).toBe(0); }
  finally { mocked.mockRestore(); }
});
