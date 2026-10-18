import { closeSync, fstatSync, openSync, readSync, realpathSync } from "node:fs";
import { DerivativesError, type DerivativesErrorCode } from "./types.ts";

// Reads one local JSON file and nothing else: no network, no remote scheme, no device, no alternate
// data stream. The size bound is enforced on the open handle (including growth while reading),
// the text must be strict UTF-8 and strict JSON, and errors carry a finite code only, never the
// path or any content.

export const MAX_FILE_BYTES = 1_048_576;

const CHUNK_BYTES = 65_536;
const RESERVED_DEVICE = /^(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])$/i;

/** The file system boundary, injectable so that the growth-while-reading path can be tested without module mocking. */
export interface FileOps {
  realpath(path: string): string;
  open(path: string): number;
  fstat(fd: number): { isFile(): boolean; size: number };
  read(fd: number, buffer: Buffer, length: number): number;
  close(fd: number): void;
}

const realOps: FileOps = {
  realpath: (path) => realpathSync(path),
  open: (path) => openSync(path, "r"),
  fstat: (fd) => fstatSync(fd),
  read: (fd, buffer, length) => readSync(fd, buffer, 0, length, null),
  close: (fd) => closeSync(fd),
};

function refuse(code: DerivativesErrorCode): never {
  throw new DerivativesError(code);
}

/** Rejects empty paths, NUL, UNC and device namespaces, URL schemes, alternate streams and Windows device names. */
export function validateLocalPath(path: string): void {
  if (path.length === 0 || path.includes("\0") || path.startsWith("\\") || path.startsWith("//")) refuse("invalid_file");
  const driveAbsolute = /^[A-Za-z]:[\\/]/.test(path);
  const withoutDrive = driveAbsolute ? path.slice(2) : path;
  if (withoutDrive.includes(":")) refuse("invalid_file");
  for (const segment of withoutDrive.split(/[\\/]/)) {
    const base = (segment.split(".")[0] ?? "").trimEnd();
    if (RESERVED_DEVICE.test(base)) refuse("invalid_file");
  }
}

/** Parsed JSON of a regular local file of at most one MiB. Throws DerivativesError with a finite code. */
export function readLocalJson(path: string, ops: FileOps = realOps): unknown {
  let fd: number | undefined;
  try {
    validateLocalPath(path);
    const resolved = ops.realpath(path);
    validateLocalPath(resolved);
    fd = ops.open(resolved);
    const initial = ops.fstat(fd);
    if (!initial.isFile() || initial.size > MAX_FILE_BYTES) refuse("invalid_file");
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      // read at most the bound plus one sentinel byte, even if the file grows while it is open
      const length = Math.min(CHUNK_BYTES, MAX_FILE_BYTES - total + 1);
      const buffer = Buffer.alloc(length);
      const count = ops.read(fd, buffer, length);
      if (count === 0) break;
      total += count;
      if (total > MAX_FILE_BYTES) refuse("invalid_file");
      chunks.push(buffer.subarray(0, count));
    }
    const final = ops.fstat(fd);
    if (!final.isFile() || final.size > MAX_FILE_BYTES) refuse("invalid_file");
    let decoded: string;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total));
    } catch {
      return refuse("invalid_utf8");
    }
    try {
      return JSON.parse(decoded);
    } catch {
      return refuse("invalid_json");
    }
  } catch (error) {
    if (error instanceof DerivativesError) throw error;
    return refuse("invalid_file");
  } finally {
    if (fd !== undefined) {
      try {
        ops.close(fd);
      } catch {
        // the read has already finished; a failing close must not replace its result
      }
    }
  }
}
