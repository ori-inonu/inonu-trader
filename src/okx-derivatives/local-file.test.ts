import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { MAX_FILE_BYTES, readLocalJson, validateLocalPath } from "./local-file.ts";
import { DerivativesError, type DerivativesErrorCode } from "./types.ts";

const folders: string[] = [];
function folder(): string {
  const created = mkdtempSync(join(tmpdir(), "okx-derivatives-test-"));
  folders.push(created);
  return created;
}

afterAll(() => {
  const base = realpathSync(tmpdir()) + sep;
  for (const created of folders) {
    const target = realpathSync(created);
    if (!target.startsWith(base) || !target.split(sep).at(-1)?.startsWith("okx-derivatives-test-")) throw new Error("unexpected temporary path");
    rmSync(target, { recursive: true, force: true });
  }
});

function fails(action: () => unknown, code: DerivativesErrorCode) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DerivativesError);
    if (!(error instanceof DerivativesError)) throw error;
    expect(error.code).toBe(code);
    expect(error.path).toBe("");
    expect(error.message).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

test("OKX-DERIV D15: a local UTF-8 JSON file is read, relative or absolute, and never rewritten", () => {
  const directory = folder();
  const path = join(directory, "input.json");
  const content = JSON.stringify({ schema: "x", list: [1, 2], text: "café" });
  writeFileSync(path, content);
  expect(readLocalJson(path)).toEqual({ schema: "x", list: [1, 2], text: "café" });
  expect(readLocalJson(relative(process.cwd(), path))).toEqual({ schema: "x", list: [1, 2], text: "café" });
  expect(readFileSync(path, "utf8")).toBe(content);
  // scalars and arrays are valid JSON and are left to the schema validation
  writeFileSync(path, "[1, 2, 3]");
  expect(readLocalJson(path)).toEqual([1, 2, 3]);
  // a byte order mark added by some Windows editors is tolerated
  writeFileSync(path, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"a":1}')]));
  expect(readLocalJson(path)).toEqual({ a: 1 });
});

test("OKX-DERIV D15: strict UTF-8 and strict JSON are required", () => {
  const directory = folder();
  const path = join(directory, "input.json");
  writeFileSync(path, Buffer.concat([Buffer.from('{"private":"'), Buffer.from([0xc3, 0x28]), Buffer.from('"}')]));
  fails(() => readLocalJson(path), "invalid_utf8");
  for (const text of ["", "   ", "{PRIVATE_SENTINEL", "{'a':1}", '{"a":1,}', "undefined", "NaN", '{"a":1} trailing']) {
    writeFileSync(path, text);
    fails(() => readLocalJson(path), "invalid_json");
  }
});

test("OKX-DERIV D15: the file is bounded at exactly one MiB, measured on the open handle", () => {
  const directory = folder();
  const path = join(directory, "input.json");
  const valid = JSON.stringify({ a: 1 });
  expect(MAX_FILE_BYTES).toBe(1_048_576);
  writeFileSync(path, valid + " ".repeat(MAX_FILE_BYTES - Buffer.byteLength(valid)));
  expect(readLocalJson(path)).toEqual({ a: 1 });
  writeFileSync(path, valid + " ".repeat(MAX_FILE_BYTES + 1 - Buffer.byteLength(valid)));
  fails(() => readLocalJson(path), "invalid_file");
});

/** A fake file system boundary: the stat says the file is small while reads keep producing data. */
function fakeOps(options: { statSizes: number[]; chunks?: Buffer[]; endlessChunk?: number; closeThrows?: boolean }) {
  const trace = { opened: 0, closed: 0, requested: [] as number[], returned: 0 };
  let statCalls = 0;
  let readCalls = 0;
  return {
    trace,
    ops: {
      realpath: (path: string) => path,
      open: () => { trace.opened += 1; return 7; },
      fstat: () => ({ isFile: () => true, size: options.statSizes[Math.min(statCalls++, options.statSizes.length - 1)] as number }),
      read: (_fd: number, buffer: Buffer, length: number) => {
        trace.requested.push(length);
        const chunk = options.chunks?.[readCalls++];
        // a real read never returns more bytes than were requested
        if (chunk !== undefined) { const count = Math.min(chunk.length, length); chunk.copy(buffer, 0, 0, count); trace.returned += count; return count; }
        if (options.endlessChunk !== undefined) { const count = Math.min(options.endlessChunk, length); buffer.fill(0x20, 0, count); trace.returned += count; return count; }
        return 0;
      },
      close: () => { trace.closed += 1; if (options.closeThrows) throw new Error("close failed"); },
    },
  };
}

test("OKX-DERIV D15: growth while reading is stopped at the bound plus one byte, even if the stat said the file was small", () => {
  const { ops, trace } = fakeOps({ statSizes: [10], endlessChunk: 65_536 });
  fails(() => readLocalJson("input.json", ops), "invalid_file");
  expect(trace.opened).toBe(1);
  expect(trace.closed).toBe(1);
  expect(trace.requested.every((length) => length <= 65_536 && length >= 1)).toBe(true);
  // never more than the bound plus the one sentinel byte (and the chunk that crossed it)
  expect(trace.returned).toBeLessThanOrEqual(MAX_FILE_BYTES + 65_536);
  expect(trace.returned).toBeGreaterThan(MAX_FILE_BYTES);
  expect(trace.requested.at(-1)).toBeLessThanOrEqual(65_536);
  // exactly the bound is accepted: 15 chunks of whitespace and a last chunk "{}" plus whitespace, 1048576 bytes in total
  const filler = () => Buffer.alloc(65_536, 0x20);
  const last = () => Buffer.from("{}" + " ".repeat(65_534));
  const exact = fakeOps({ statSizes: [10], chunks: [...Array.from({ length: 15 }, filler), last()] });
  expect(readLocalJson("input.json", exact.ops)).toEqual({});
  expect(exact.trace.returned).toBe(MAX_FILE_BYTES);
  expect(exact.trace.closed).toBe(1);
  // one more byte is refused: the sentinel read at the bound finds data
  const over = fakeOps({ statSizes: [10], chunks: [...Array.from({ length: 15 }, filler), last(), Buffer.from(" ")] });
  fails(() => readLocalJson("input.json", over.ops), "invalid_file");
  expect(over.trace.returned).toBe(MAX_FILE_BYTES + 1);
  expect(over.trace.requested.at(-1)).toBe(1);
  expect(over.trace.closed).toBe(1);
});

test("OKX-DERIV D15: a file that grows after being read is refused by the final stat, and a failing close never replaces the result", () => {
  const grown = fakeOps({ statSizes: [10, MAX_FILE_BYTES + 1], chunks: [Buffer.from("{}")] });
  fails(() => readLocalJson("input.json", grown.ops), "invalid_file");
  expect(grown.trace.closed).toBe(1);
  const closeFails = fakeOps({ statSizes: [2], chunks: [Buffer.from("{}")], closeThrows: true });
  expect(readLocalJson("input.json", closeFails.ops)).toEqual({});
  const notRegular = { ...fakeOps({ statSizes: [2] }).ops, fstat: () => ({ isFile: () => false, size: 2 }) };
  fails(() => readLocalJson("input.json", notRegular), "invalid_file");
});

test("OKX-DERIV D15: missing files, directories and empty paths are finite file errors without echoing the path", () => {
  const directory = folder();
  fails(() => readLocalJson(directory), "invalid_file");
  fails(() => readLocalJson(join(directory, "missing_PRIVATE_SENTINEL.json")), "invalid_file");
  fails(() => readLocalJson(""), "invalid_file");
  mkdirSync(join(directory, "sub"));
  fails(() => readLocalJson(join(directory, "sub")), "invalid_file");
  try {
    readLocalJson(join(directory, "missing_PRIVATE_SENTINEL.json"));
  } catch (error) {
    expect(String((error as Error).message)).not.toContain("PRIVATE_SENTINEL");
  }
});

test("OKX-DERIV D15/D16: remote schemes, UNC paths, devices and alternate streams are rejected before any read", () => {
  const rejected = [
    "https://example.invalid/PRIVATE_SENTINEL", "http://example.invalid/x", "file:///C:/PRIVATE_SENTINEL", "data:PRIVATE_SENTINEL", "ftp://host/x",
    "\\\\server\\PRIVATE_SENTINEL", "//server/PRIVATE_SENTINEL", "\\\\?\\C:\\PRIVATE_SENTINEL", "\\\\.\\pipe\\PRIVATE_SENTINEL",
    "C:relative_PRIVATE_SENTINEL", "capture.json:PRIVATE_SENTINEL", "C:/capture.json:PRIVATE_SENTINEL",
    "NUL", "NUL.json", "CON", "AUX", "PRN", "COM1", "LPT1", "CONIN$", "CONOUT$", "directory/NUL.txt", "directory/com\u00b9.txt", "a\0b.json",
  ];
  for (const path of rejected) {
    fails(() => validateLocalPath(path), "invalid_file");
    fails(() => readLocalJson(path), "invalid_file");
  }
  for (const accepted of ["input.json", "./input.json", "../data/input.json", "folder/sub folder/input.json", "C:/data/input.json", "C:\\data\\input.json", "console.json", "nul_file.json"]) {
    expect(() => validateLocalPath(accepted)).not.toThrow();
  }
});
