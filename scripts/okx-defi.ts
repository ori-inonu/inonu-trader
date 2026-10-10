import { buildDefiReport, DefiReportError } from "../src/okx-defi/report.ts";
import { DEFI_DEMO_MAX_AGE_MS, DEFI_DEMO_NOW_MS, syntheticDefiCaptures } from "../src/okx-defi/fixture.ts";
import { closeSync, fstatSync, openSync, readSync, realpathSync } from "node:fs";

const HELP = "Observações DeFi offline a partir de capturas locais.\nDemo sintética: bun --no-env-file run okx:defi\nImportar: bun --no-env-file run okx:defi --search <arquivo> --detail <arquivo> --max-age-ms <inteiro de 1 a 3600000>\nAs observações e a correspondência são não verificadas; execução não qualificada.\n";

function argumentsForImport(args: string[]) {
  if (args.length !== 6) throw new DefiReportError("invalid_arguments");
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !["--search", "--detail", "--max-age-ms"].includes(flag) || flags.has(flag) || !value || value.startsWith("--")) throw new DefiReportError("invalid_arguments");
    flags.set(flag, value);
  }
  const maxAge = flags.get("--max-age-ms")!;
  if (/^[1-9][0-9]*$/.exec(maxAge)?.[0] !== maxAge || maxAge.length > 7) throw new DefiReportError("invalid_arguments");
  const maxAgeMs = Number(maxAge);
  if (maxAgeMs > 3600000) throw new DefiReportError("invalid_arguments");
  return { searchPath: flags.get("--search")!, detailPath: flags.get("--detail")!, maxAgeMs };
}

function validateLocalPath(path: string): void {
  if (path.includes("\0") || path.startsWith("\\") || path.startsWith("//")) throw new DefiReportError("invalid_file");
  const driveAbsolute = /^[A-Za-z]:[\\/]/.test(path);
  const withoutDrive = driveAbsolute ? path.slice(2) : path;
  if (withoutDrive.includes(":")) throw new DefiReportError("invalid_file");
  for (const segment of withoutDrive.split(/[\\/]/)) {
    const base = segment.split(".")[0]!.trimEnd();
    if (/^(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])$/i.test(base)) throw new DefiReportError("invalid_file");
  }
}

function readCapture(path: string): unknown {
  const maxBytes = 1048576;
  let fd: number | undefined;
  try {
    validateLocalPath(path);
    const resolved = realpathSync(path);
    validateLocalPath(resolved);
    fd = openSync(resolved, "r");
    const initial = fstatSync(fd);
    if (!initial.isFile() || initial.size > maxBytes) throw new DefiReportError("invalid_file");
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      // Read at most the bound plus one sentinel byte, even if the file grows.
      const buffer = Buffer.alloc(Math.min(65536, maxBytes - total + 1));
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      total += count;
      if (total > maxBytes) throw new DefiReportError("invalid_file");
      chunks.push(buffer.subarray(0, count));
    }
    const final = fstatSync(fd);
    if (!final.isFile() || final.size > maxBytes) throw new DefiReportError("invalid_file");
    let decoded: string;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total));
    } catch {
      throw new DefiReportError("invalid_utf8");
    }
    try {
      return JSON.parse(decoded);
    } catch {
      throw new DefiReportError("invalid_json");
    }
  } catch (error) {
    if (error instanceof DefiReportError) throw error;
    throw new DefiReportError("invalid_file");
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { throw new DefiReportError("invalid_file"); }
    }
  }
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(HELP);
  } else {
    let input: Parameters<typeof buildDefiReport>[0];
    if (args.length === 0) {
      input = { ...syntheticDefiCaptures(), nowMs: DEFI_DEMO_NOW_MS, maxAgeMs: DEFI_DEMO_MAX_AGE_MS };
    } else {
      const parsed = argumentsForImport(args);
      validateLocalPath(parsed.searchPath);
      validateLocalPath(parsed.detailPath);
      input = { search: readCapture(parsed.searchPath), detail: readCapture(parsed.detailPath), nowMs: Date.now(), maxAgeMs: parsed.maxAgeMs };
    }
    process.stdout.write(`${JSON.stringify(buildDefiReport(input))}\n`);
  }
} catch (error) {
  const code = error instanceof DefiReportError ? error.code : "invalid_capture";
  process.stderr.write(`okx-defi: ${code}\n`);
  process.exitCode = 1;
}
