/**
 * Fakes used ONLY by the tests of the data layer: a manual clock, a scripted `fetch` and an in-memory file port.
 * Nothing here touches the network, the environment or the disk. Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md.
 */

import type { FetchInit, FetchLike, FetchResponseLike } from "./http.ts";

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
// In-memory file port for the capture recorder tests (same shape as the real one)
// ---------------------------------------------------------------------------

export interface MemoryFsState {
  readonly files: Map<string, string>;
  readonly directories: Set<string>;
  /** Names of the operations performed, in order, for assertions about atomicity. */
  readonly log: string[];
}

export function makeMemoryFsState(): MemoryFsState {
  return { files: new Map(), directories: new Set(), log: [] };
}
