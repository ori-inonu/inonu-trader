/**
 * Icons of currencies (T3.5, ICO-1 to ICO-3). The browser never talks to a third party: this LOCAL service fetches the icon
 * from OKX's public icon host, keeps it on disk, and the desk loads it from its own origin.
 *
 * Strict by construction: the symbol is validated before any URL or file name is built from it (lowercase letters and
 * digits, 1 to 15), the host is fixed, only a PNG or a WEBP identified by its BYTES and under 64 KB is accepted (an SVG
 * can carry script and is refused), and a miss is remembered so a symbol the host does not have is not asked for again
 * every time the screen draws. Concurrent requests for one symbol share one network call. The cache has a file limit.
 *
 * It serves CURRENCIES by symbol (the base of an OKX instrument, the native token of a network). A network's own brand
 * logo and an on-chain token's logo need the provider's `tokenLogoUrl` through the gateway, which is a separate task.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ICON_HOST_PREFIX = "https://static.okx.com/cdn/oksupport/asset/currency/icon/";

const MAX_BYTES = 65_536;
const SYMBOL = /^[a-z0-9]{1,15}$/;
const MISS_TTL_MS = 24 * 3_600_000;
const TRANSIENT_MISS_TTL_MS = 5 * 60_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_FILES = 1_000;
/** A screen draws dozens of symbols at once; the host is asked for a few at a time. */
const MAX_PARALLEL = 4;

export type IconType = "image/png" | "image/webp";
export type IconResult = { readonly ok: true; readonly type: IconType; readonly bytes: Uint8Array } | { readonly ok: false; readonly reason: "bad_symbol" | "miss" };

export interface IconService {
  get(symbol: string): Promise<IconResult>;
}

/** The type of an image from its first bytes, or null: the header the server sent is not trusted. */
export function sniff(bytes: Uint8Array): IconType | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length > png.length && png.every((b, i) => bytes[i] === b)) return "image/png";
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  if (bytes.length > 12 && riff.every((b, i) => bytes[i] === b) && webp.every((b, i) => bytes[8 + i] === b)) return "image/webp";
  return null;
}

const EXTENSION: Record<IconType, string> = { "image/png": "png", "image/webp": "webp" };

export function createIconService(options: { readonly dir: string; readonly fetch?: typeof fetch; readonly now?: () => number; readonly timeoutMs?: number; readonly maxFiles?: number }): IconService {
  const send = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const misses = new Map<string, number>(); // symbol -> when the miss expires
  const inflight = new Map<string, Promise<IconResult>>();
  const memory = new Map<string, { type: IconType; bytes: Uint8Array }>();
  let running = 0;
  const waiting: (() => void)[] = [];
  const slot = async <T,>(work: () => Promise<T>): Promise<T> => {
    if (running >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
    running += 1;
    try {
      return await work();
    } finally {
      running -= 1;
      waiting.shift()?.();
    }
  };

  const fromDisk = (symbol: string): IconResult | null => {
    for (const type of ["image/png", "image/webp"] as const) {
      const file = join(options.dir, `${symbol}.${EXTENSION[type]}`);
      if (!existsSync(file)) continue;
      try {
        const bytes = new Uint8Array(readFileSync(file));
        if (sniff(bytes) === type) return { ok: true, type, bytes };
      } catch {
        // an unreadable file is a cache miss
      }
    }
    return null;
  };

  const store = (symbol: string, type: IconType, bytes: Uint8Array): void => {
    try {
      mkdirSync(options.dir, { recursive: true });
      if (readdirSync(options.dir).length >= maxFiles) return; // served, but the cache is full
      const file = join(options.dir, `${symbol}.${EXTENSION[type]}`);
      writeFileSync(`${file}.tmp`, bytes);
      renameSync(`${file}.tmp`, file);
    } catch {
      // an unwritable cache never breaks the icon
    }
  };

  async function fetchOne(symbol: string): Promise<IconResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        response = await send(`${ICON_HOST_PREFIX}${symbol}.png`, { signal: controller.signal });
      } catch {
        misses.set(symbol, now() + TRANSIENT_MISS_TTL_MS);
        return { ok: false, reason: "miss" };
      }
      if (response.status !== 200) {
        misses.set(symbol, now() + (response.status === 404 ? MISS_TTL_MS : TRANSIENT_MISS_TTL_MS));
        return { ok: false, reason: "miss" };
      }
      const declared = Number(response.headers.get("content-length") ?? "0");
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch {
        misses.set(symbol, now() + TRANSIENT_MISS_TTL_MS);
        return { ok: false, reason: "miss" };
      }
      const type = declared > MAX_BYTES || bytes.length > MAX_BYTES ? null : sniff(bytes);
      if (type === null) {
        misses.set(symbol, now() + MISS_TTL_MS);
        return { ok: false, reason: "miss" };
      }
      memory.set(symbol, { type, bytes });
      store(symbol, type, bytes);
      return { ok: true, type, bytes };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async get(raw) {
      const symbol = typeof raw === "string" ? raw.toLowerCase() : "";
      if (!SYMBOL.test(symbol)) return { ok: false, reason: "bad_symbol" };
      const hit = memory.get(symbol);
      if (hit) return { ok: true, ...hit };
      const disk = fromDisk(symbol);
      if (disk) {
        if (disk.ok) memory.set(symbol, { type: disk.type, bytes: disk.bytes });
        return disk;
      }
      const missUntil = misses.get(symbol);
      if (missUntil !== undefined) {
        if (now() < missUntil) return { ok: false, reason: "miss" };
        misses.delete(symbol);
      }
      const pending = inflight.get(symbol);
      if (pending) return pending;
      const started = slot(() => fetchOne(symbol)).finally(() => inflight.delete(symbol));
      inflight.set(symbol, started);
      return started;
    },
  };
}
