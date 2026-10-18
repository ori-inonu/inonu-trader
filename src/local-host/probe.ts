import { createConnection } from "node:net";

export interface LocalProbeDeps {
  tcp(signal: AbortSignal): Promise<"open" | "closed" | "unknown">;
  fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => ReturnType<typeof fetch>;
}

/** A refusal proves absence. Timeout, a malformed response and a failed request never authorize killing/replacing a process. */
export async function probeLocal(signal: AbortSignal, deps: LocalProbeDeps): Promise<"ours" | "absent" | "other"> {
  const tcp = await deps.tcp(signal);
  if (tcp === "closed") return "absent";
  if (tcp !== "open" || signal.aborted) return "other";
  try {
    const response = await deps.fetch("http://127.0.0.1:3000/health", { method: "GET", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) });
    if (response.status !== 200 || response.body === null) return "other";
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 4096) return "other";
        chunks.push(next.value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    const value: unknown = JSON.parse(new TextDecoder().decode(buffer));
    if (value === null || typeof value !== "object" || Array.isArray(value)) return "other";
    const body = value as Record<string, unknown>;
    return body.ok === true && body.app === "inonu-trader" && typeof body.version === "string" ? "ours" : "other";
  } catch { return "other"; }
}

export function tcpLocal(signal: AbortSignal): Promise<"open" | "closed" | "unknown"> {
  if (signal.aborted) return Promise.resolve("unknown");
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: 3000 });
    let done = false;
    const end = (value: "open" | "closed" | "unknown") => {
      if (done) return;
      done = true;
      signal.removeEventListener("abort", aborted);
      socket.destroy();
      resolve(value);
    };
    const aborted = () => end("unknown");
    signal.addEventListener("abort", aborted, { once: true });
    socket.setTimeout(1500, () => end("unknown"));
    socket.once("connect", () => end("open"));
    socket.once("error", (error: NodeJS.ErrnoException) => end(error.code === "ECONNREFUSED" ? "closed" : "unknown"));
    if (signal.aborted) aborted();
  });
}
