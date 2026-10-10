import { request } from "node:https";
import { createHash, randomBytes } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import type { Socket } from "node:net";
import { BoundedIngress } from "./ingress";
import { ENDPOINTS } from "./plan";
import type { CaptureTransport, TransportContext } from "./runner";
import type { Instrument, CapturePlan, RuntimeCapabilities } from "./plan";
import type { TransportEvent } from "./observations";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const capability: RuntimeCapabilities = Object.freeze({ version: 1, runtime: `node-${process.versions.node}-raw-https-rfc6455-identity`, evidence: "unknown", incrementalEncoded: false, incrementalDecoded: true, aggregateHeld: false, interruptible: false, sharedDeadline: false });
// Actual Node 26.9.0/TLS held-buffer allocation and cancellation evidence is absent.
// This gate cannot be changed by a plan, receipt, environment variable or constructor option.
function requireQualifiedRuntime(): void { if (capability.evidence !== "qualified") throw Error("runtime_capability_unqualified"); }
export function validatePublicHandshake(status: number, headers: IncomingHttpHeaders, key: string): boolean {
  const expected = createHash("sha1").update(key + GUID).digest("base64");
  return status === 101 && typeof headers.upgrade === "string" && headers.upgrade.toLowerCase() === "websocket" && typeof headers.connection === "string" && headers.connection.toLowerCase().split(/\s*,\s*/).includes("upgrade") && headers["sec-websocket-accept"] === expected && headers["sec-websocket-extensions"] === undefined && headers["sec-websocket-protocol"] === undefined;
}
/** Client frames always mask with fresh cryptographic randomness; no compression. */
export function encodeClientFrame(opcode: number, payload: Uint8Array): Buffer {
  if (![1, 2, 8, 9, 10].includes(opcode) || payload.length > 1048576 || (opcode >= 8 && payload.length > 125)) throw Error("invalid_client_frame");
  const lengthBytes = payload.length < 126 ? 0 : payload.length <= 65535 ? 2 : 8, maskOffset = 2 + lengthBytes;
  const result = Buffer.alloc(maskOffset + 4 + payload.length), mask = randomBytes(4);
  result[0] = 0x80 | opcode; result[1] = 0x80 | (lengthBytes === 0 ? payload.length : lengthBytes === 2 ? 126 : 127);
  if (lengthBytes === 2) result.writeUInt16BE(payload.length, 2); if (lengthBytes === 8) result.writeBigUInt64BE(BigInt(payload.length), 2);
  mask.copy(result, maskOffset); for (let i = 0; i < payload.length; i++) result[maskOffset + 4 + i] = payload[i]! ^ mask[i % 4]!;
  return result;
}
function validateInstrument(i: Instrument): void { if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(i.id) || !["SPOT", "SWAP"].includes(i.kind)) throw Error("invalid_instrument"); }
function parser(context: TransportContext, emit: (e: TransportEvent) => void, source: "metadata" | "websocket", instrument: string | undefined, abort: () => void, control?: (opcode: number, bytes: Buffer) => void): BoundedIngress {
  return new BoundedIngress(context.ingress.limits, {
    message: m => emit({ type: "message", source, instrument, payload: m.payload, reservation: m.reservation }),
    incomplete: e => { emit({ type: "incomplete", ...e }); abort(); },
    control: (opcode, bytes) => { emit({ type: "control", opcode, payload: bytes }); control?.(opcode, bytes); }
  }, context.ingress);
}
/** Real raw transport implementation, dormant until its runtime is independently qualified. */
export function createNodeTransport(): CaptureTransport {
  return Object.freeze({
    capabilities: capability,
    async requestMetadata(instrument: Instrument, signal: AbortSignal, emit: (e: TransportEvent) => void, context: TransportContext): Promise<void> {
      requireQualifiedRuntime(); validateInstrument(instrument);
      if (signal.aborted) throw Error("cancelled");
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const finish = (error?: Error) => { if (done) return; done = true; signal.removeEventListener("abort", cancel); error ? reject(error) : resolve(); };
        const req = request({ protocol: "https:", hostname: "www.okx.com", port: 443, method: "GET", path: `/api/v5/public/instruments?instType=${instrument.kind}&instId=${encodeURIComponent(instrument.id)}`, agent: false, rejectUnauthorized: true, maxHeaderSize: 16384, headers: { Accept: "application/json", "Accept-Encoding": "identity", Connection: "close" } });
        const ingress = parser(context, emit, "metadata", instrument.id, () => req.destroy());
        const cancel = () => { ingress.abort("cancelled"); req.destroy(); finish(Error("cancelled")); };
        signal.addEventListener("abort", cancel, { once: true });
        req.on("response", res => {
          if (res.statusCode !== 200) { res.destroy(); req.destroy(); finish(Error(res.statusCode === 429 ? "provider_throttled" : "provider_refusal")); return; }
          ingress.beginHttp(instrument.id, typeof res.headers["content-encoding"] === "string" ? res.headers["content-encoding"] : undefined);
          res.on("data", (chunk: Buffer) => ingress.pushHttp(instrument.id, chunk));
          res.on("end", () => { ingress.endHttp(instrument.id); finish(); });
          res.on("aborted", () => { ingress.abort("http_body_interrupted"); finish(Error("connection_io")); });
          res.on("error", () => { ingress.abort("http_body_interrupted"); finish(Error("connection_io")); });
        });
        req.on("error", () => { ingress.abort("connection_io"); finish(Error(signal.aborted ? "cancelled" : "connection_io")); }); req.end();
      });
    },
    async connect(plan: CapturePlan, _attempt: number, signal: AbortSignal, emit: (e: TransportEvent) => void, context: TransportContext) {
      requireQualifiedRuntime();
      if (plan.endpoints.rest !== ENDPOINTS.rest || plan.endpoints.websocket !== ENDPOINTS.websocket || signal.aborted) throw Error("unqualified_connection");
      return await new Promise<{ closed: Promise<{ reason: string; retryable: boolean }>; abort(): void }>((resolve, reject) => {
        const key = randomBytes(16).toString("base64"); let socket: Socket | null = null, upgraded = false, ended = false;
        let close!: (value: { reason: string; retryable: boolean }) => void;
        const closed = new Promise<{ reason: string; retryable: boolean }>(r => { close = r; });
        const req = request({ protocol: "https:", hostname: "ws.okx.com", port: 8443, path: "/ws/v5/public", method: "GET", agent: false, rejectUnauthorized: true, maxHeaderSize: 16384, headers: { Upgrade: "websocket", Connection: "Upgrade", "Sec-WebSocket-Key": key, "Sec-WebSocket-Version": "13", "Accept-Encoding": "identity" } });
        const finish = (reason: string, retryable = false) => { if (ended) return; ended = true; signal.removeEventListener("abort", cancel); ingress.abort(reason); socket?.destroy(); req.destroy(); if (upgraded) close({ reason, retryable }); else reject(Error(reason)); };
        const cancel = () => finish("cancelled");
        const ingress = parser(context, emit, "websocket", undefined, () => finish("transport_rejected"), (opcode, bytes) => {
          if (opcode === 8) finish("server_close");
          else if (opcode === 9 && socket && !ended) socket.write(encodeClientFrame(10, bytes));
        });
        signal.addEventListener("abort", cancel, { once: true });
        req.on("upgrade", (res, stream, head) => {
          if (!validatePublicHandshake(res.statusCode ?? 0, res.headers, key)) { stream.destroy(); finish("invalid_websocket_handshake"); return; }
          upgraded = true; socket = stream; socket.on("data", chunk => { if (typeof chunk === "string") finish("unexpected_transport_text_encoding"); else ingress.pushWebSocket(chunk); });
          socket.on("error", () => finish("connection_io", true)); socket.on("close", () => finish("connection_io", true));
          const args = plan.streams.map(s => ({ channel: s.channel, instId: s.instrument }));
          socket.write(encodeClientFrame(1, Buffer.from(JSON.stringify({ op: "subscribe", args }))));
          if (head.length) ingress.pushWebSocket(head);
          resolve({ closed, abort: () => finish("cancelled") });
        });
        req.on("response", res => { res.destroy(); finish(res.statusCode === 429 ? "provider_throttled" : "provider_refusal"); });
        req.on("error", () => finish(signal.aborted ? "cancelled" : "connection_io", !signal.aborted)); req.end();
      });
    }
  });
}
