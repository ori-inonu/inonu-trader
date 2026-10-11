/**
 * Fakes used ONLY by the tests of the data layer: a manual clock, a scripted `fetch` and an in-memory file port.
 * Nothing here touches the network, the environment or the disk. Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md.
 */

import type { CaptureFs } from "./capture-types.ts";
import { createOnchainosHttp, type FetchInit, type FetchLike, type FetchResponseLike, type OnchainosHttp, type OnchainosHttpOptions } from "./http.ts";

export interface FakeClock {
  readonly now: () => number;
  /** Resolves at once and moves the clock forward, recording the wait. */
  readonly sleep: (ms: number) => Promise<void>;
  readonly sleeps: number[];
  set(ms: number): void;
  advance(ms: number): void;
}

export const FAKE_START_MS = 1_700_000_000_000;

export function makeClock(startMs: number = FAKE_START_MS): FakeClock {
  let current = startMs;
  const sleeps: number[] = [];
  return {
    now: () => current,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      current += ms;
    },
    sleeps,
    set: (ms: number) => {
      current = ms;
    },
    advance: (ms: number) => {
      current += ms;
    },
  };
}

export interface FakeCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | undefined;
  /** Path without the query string. */
  readonly path: string;
  /** Query string without the question mark. */
  readonly query: string;
  /** The clock reading when the request arrived. */
  readonly atMs: number;
  readonly signal: AbortSignal;
}

export interface FakeReply {
  status?: number;
  /** An object is sent as JSON; a string is sent as it is. */
  body?: unknown;
  /** The injected fetch throws this value. */
  throws?: unknown;
  /** The injected fetch never answers until the signal aborts it. */
  hang?: boolean;
  /** With `hang`: never answers even when aborted (a fetch that ignores the signal). */
  ignoreAbort?: boolean;
  /** The body never arrives (response.text() hangs). */
  hangBody?: boolean;
  /** response.text() rejects. */
  bodyThrows?: boolean;
}

export type FakeScript = readonly FakeReply[] | ((call: FakeCall, index: number) => FakeReply);

export interface FakeFetch {
  readonly fetch: FetchLike;
  readonly calls: FakeCall[];
}

/** The envelope the OKX APIs answer with. */
export function envelope(data: unknown, code: string | number = "0", msg = ""): { code: string | number; msg: string; data: unknown } {
  return { code, msg, data };
}

export function makeFakeFetch(script: FakeScript, clock?: FakeClock): FakeFetch {
  const calls: FakeCall[] = [];
  const fetch: FetchLike = (url: string, init: FetchInit): Promise<FetchResponseLike> => {
    const queryAt = url.indexOf("?");
    const pathStart = url.indexOf("/", "https://".length);
    const call: FakeCall = {
      url,
      method: init.method,
      headers: { ...init.headers },
      body: init.body,
      path: url.slice(pathStart, queryAt === -1 ? url.length : queryAt),
      query: queryAt === -1 ? "" : url.slice(queryAt + 1),
      atMs: clock === undefined ? 0 : clock.now(),
      signal: init.signal,
    };
    const index = calls.length;
    calls.push(call);
    const reply: FakeReply | undefined = typeof script === "function" ? script(call, index) : script[index];
    if (reply === undefined) return Promise.reject(new Error("sem resposta roteirizada para esta chamada"));
    if (reply.throws !== undefined) return Promise.reject(reply.throws);
    if (reply.hang === true) {
      return new Promise<FetchResponseLike>((_resolve, reject) => {
        if (reply.ignoreAbort === true) return;
        const abort = (): void => reject(Object.assign(new Error("abortado"), { name: "AbortError" }));
        if (init.signal.aborted) abort();
        else init.signal.addEventListener("abort", abort, { once: true });
      });
    }
    const status = reply.status ?? 200;
    const text = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body ?? envelope([]));
    return Promise.resolve({
      status,
      text: () => {
        if (reply.bodyThrows === true) return Promise.reject(new Error("corpo ilegível"));
        if (reply.hangBody === true) return new Promise<string>(() => undefined);
        return Promise.resolve(text);
      },
    });
  };
  return { fetch, calls };
}

// ---------------------------------------------------------------------------
// A complete authenticated stack over the fakes
// ---------------------------------------------------------------------------

/** Canary credentials: they must never appear in any error, event or output. */
export const CANARY_KEY = "canary-key-3f2a9c1d-77aa-4d1e-9bb0-aaaaaaaaaaaa";
export const CANARY_SECRET = "canary-secret-KAT-0123456789abcdef";
export const CANARY_PASSPHRASE = "canary-pass-Zq9!x";
export const CANARY_CREDENTIALS = Object.freeze({ apiKey: CANARY_KEY, secretKey: CANARY_SECRET, passphrase: CANARY_PASSPHRASE });

export interface FakeStack {
  readonly clock: FakeClock;
  readonly fake: FakeFetch;
  readonly http: OnchainosHttp;
}

/** An authenticated client over a scripted fetch and a manual clock. The rate is high so tests do not wait. */
export function makeStack(script: FakeScript, extra: Partial<OnchainosHttpOptions> = {}): FakeStack {
  const clock = makeClock();
  const fake = makeFakeFetch(script, clock);
  const http = createOnchainosHttp({
    fetch: fake.fetch,
    now: clock.now,
    sleep: clock.sleep,
    credentials: CANARY_CREDENTIALS,
    allowNetwork: true,
    requestsPerSecond: 10,
    burst: 10,
    ...extra,
  });
  return { clock, fake, http };
}

// ---------------------------------------------------------------------------
// In-memory file port for the capture recorder tests (same contract as the real one)
// ---------------------------------------------------------------------------

export interface MemoryFsState {
  readonly files: Map<string, string>;
  readonly directories: Set<string>;
  /** Operations performed, in order, as "<operation>:<file name>" (for assertions about atomicity). */
  readonly log: string[];
}

export function makeMemoryFsState(): MemoryFsState {
  return { files: new Map(), directories: new Set(), log: [] };
}

export interface MemoryFsHooks {
  /** Called before an operation; throwing simulates a crash at that point. `count` is how many times this operation ran on this file. */
  readonly before?: (operation: string, path: string, count: number) => void;
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

/** An in memory implementation of the recorder file port, with optional fault injection. Sizes and cuts are in BYTES. */
export function makeMemoryFs(state: MemoryFsState = makeMemoryFsState(), hooks: MemoryFsHooks = {}): CaptureFs {
  const counts = new Map<string, number>();
  const note = (operation: string, path: string): void => {
    const key = `${operation}:${baseName(path)}`;
    const count = counts.get(key) ?? 0;
    counts.set(key, count + 1);
    hooks.before?.(operation, baseName(path), count);
    state.log.push(key);
  };
  const need = (path: string): string => {
    const value = state.files.get(path);
    if (value === undefined) throw new Error(`arquivo ausente: ${baseName(path)}`);
    return value;
  };
  return {
    exists: (path) => state.files.has(path) || state.directories.has(path),
    isDirectory: (path) => state.directories.has(path),
    mkdirp: (path) => {
      note("mkdirp", path);
      state.directories.add(path);
    },
    readBytes: (path) => new Uint8Array(Buffer.from(need(path), "utf8")),
    size: (path) => Buffer.byteLength(need(path), "utf8"),
    append: (path, text) => {
      note("append", path);
      state.files.set(path, need(path) + text);
    },
    writeAtomic: (path, text) => {
      note("writeAtomic", path);
      state.files.set(path, text);
    },
    createExclusive: (path, text) => {
      note("createExclusive", path);
      if (state.files.has(path)) throw new Error(`já existe: ${baseName(path)}`);
      state.files.set(path, text);
    },
    truncate: (path, size) => {
      note("truncate", path);
      state.files.set(path, Buffer.from(need(path), "utf8").subarray(0, size).toString("utf8"));
    },
  };
}
