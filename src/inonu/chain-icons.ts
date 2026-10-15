/**
 * The logo of a NETWORK (inonu-desktop-v1 ICO-2, T3.5): each network of the ecosystem drawn with its own mark, not with the coin it pays gas in and not with
 * letters. The logo URL comes from the provider's own list of networks (`/onchain/networks`, through the gateway); THIS local service fetches it, keeps it
 * on disk and serves it from the desk's own origin, so the browser never contacts a third party.
 *
 * Strict by construction, like the currency icons: the network is a number validated before any file name is built from it; the URL must be https on one of
 * the provider's own hosts (checked again here, not only by the list); only a PNG or a WEBP identified by its BYTES and under 64 KB is accepted (an SVG can carry
 * script); a miss is remembered; concurrent requests for one network share one call; the cache has a file limit.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sniff, type IconType } from "./icons";

const LOGO_HOSTS: ReadonlySet<string> = new Set(["static.coinall.ltd", "static.okx.com", "static.oklink.com"]);
const MAX_BYTES = 65_536;
const CHAIN = /^\d{1,12}$/;
const MISS_TTL_MS = 6 * 3_600_000;
const TRANSIENT_MISS_TTL_MS = 5 * 60_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_FILES = 300;
const MAX_PARALLEL = 4;
const EXTENSION: Record<IconType, string> = { "image/png": "png", "image/webp": "webp" };

export type ChainIconResult = { readonly ok: true; readonly type: IconType; readonly bytes: Uint8Array } | { readonly ok: false; readonly reason: "bad_chain" | "miss" };

export interface ChainIconService {
  get(chainIndex: string): Promise<ChainIconResult>;
}

/** What the service needs from the list of networks: the logo URL of one network, or null when the list does not have it (or has no logo for it). */
export type LogoLookup = (chainIndex: string) => Promise<string | null>;

function allowed(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return url.protocol === "https:" && url.username === "" && url.password === "" && url.port === "" && LOGO_HOSTS.has(url.hostname) ? url : null;
}

export function createChainIconService(options: {
  readonly dir: string;
  readonly logoOf: LogoLookup;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly timeoutMs?: number;
  readonly maxFiles?: number;
}): ChainIconService {
  const send = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const misses = new Map<string, number>();
  const inflight = new Map<string, Promise<ChainIconResult>>();
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

  const fromDisk = (chain: string): ChainIconResult | null => {
    for (const type of ["image/png", "image/webp"] as const) {
      const file = join(options.dir, `chain-${chain}.${EXTENSION[type]}`);
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

  const store = (chain: string, type: IconType, bytes: Uint8Array): void => {
    try {
      mkdirSync(options.dir, { recursive: true });
      if (readdirSync(options.dir).length >= maxFiles) return; // served, but the cache is full
      const file = join(options.dir, `chain-${chain}.${EXTENSION[type]}`);
      writeFileSync(`${file}.tmp`, bytes);
      renameSync(`${file}.tmp`, file);
    } catch {
      // an unwritable cache never breaks the logo
    }
  };

  async function fetchOne(chain: string): Promise<ChainIconResult> {
    const miss = (ttl: number): ChainIconResult => {
      misses.set(chain, now() + ttl);
      return { ok: false, reason: "miss" };
    };
    let raw: string | null;
    try {
      raw = await options.logoOf(chain);
    } catch {
      return miss(TRANSIENT_MISS_TTL_MS);
    }
    const url = raw === null ? null : allowed(raw);
    if (url === null) return miss(raw === null ? TRANSIENT_MISS_TTL_MS : MISS_TTL_MS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        // no redirect: a host of the list that sends the request elsewhere is not followed
        response = await send(url.href, { signal: controller.signal, redirect: "error" });
      } catch {
        return miss(TRANSIENT_MISS_TTL_MS);
      }
      if (response.status !== 200) return miss(response.status === 404 ? MISS_TTL_MS : TRANSIENT_MISS_TTL_MS);
      const declared = Number(response.headers.get("content-length") ?? "0");
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch {
        return miss(TRANSIENT_MISS_TTL_MS);
      }
      const type = declared > MAX_BYTES || bytes.length > MAX_BYTES ? null : sniff(bytes);
      if (type === null) return miss(MISS_TTL_MS);
      memory.set(chain, { type, bytes });
      store(chain, type, bytes);
      return { ok: true, type, bytes };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async get(raw) {
      const chain = typeof raw === "string" ? raw : "";
      if (!CHAIN.test(chain)) return { ok: false, reason: "bad_chain" };
      const hit = memory.get(chain);
      if (hit) return { ok: true, ...hit };
      const disk = fromDisk(chain);
      if (disk) {
        if (disk.ok) memory.set(chain, { type: disk.type, bytes: disk.bytes });
        return disk;
      }
      const missUntil = misses.get(chain);
      if (missUntil !== undefined && missUntil > now()) return { ok: false, reason: "miss" };
      const pending = inflight.get(chain);
      if (pending) return pending;
      const work = slot(() => fetchOne(chain)).finally(() => inflight.delete(chain));
      inflight.set(chain, work);
      return work;
    },
  };
}
