import { expect, test } from "bun:test";
import { BoundedIngress, IngressBudget } from "./index";

function frame(opcode: number, payload: string | Buffer, fin = true): Buffer {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  if (bytes.length >= 126) throw Error("fixture_frame_length");
  return Buffer.concat([Buffer.from([(fin ? 0x80 : 0) | opcode, bytes.length]), bytes]);
}

test("C08 incrementally reject oversized metadata before a complete application callback", () => {
  const events: any[] = []; const messages: any[] = [];
  const ingress = new BoundedIngress({ payloadBytes: 8, ingressBytes: 32, pending: 4 }, { message: (v: any) => messages.push(v), incomplete: (e: any) => events.push(e) });
  ingress.beginHttp("metadata", "identity");
  ingress.pushHttp("metadata", Buffer.from("12345678"));
  ingress.pushHttp("metadata", Buffer.from("9"));
  expect(messages).toHaveLength(0);
  expect(events[0]).toMatchObject({ reason: "encoded_body_limit", size: 9, provenance: "observed_lower_bound" });
  expect(ingress.heldBytes).toBe(0);
});

test("C08 a giant declared frame length is retained exactly before allocation", () => {
  const events: any[] = [], messages: any[] = [];
  const ingress = new BoundedIngress({ payloadBytes: 1048576, ingressBytes: 8388608, pending: 16 }, { message: v => messages.push(v), incomplete: e => events.push(e) });
  const header = Buffer.from([0x82, 0x7f, 0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  for (const byte of header) ingress.pushWebSocket(Buffer.from([byte]));
  expect(events[0]).toMatchObject({ reason: "encoded_frame_limit", size: "9223372036854775807", provenance: "source_declared", completeHash: null, callbackTime: null });
  expect(messages).toHaveLength(0); expect(ingress.heldBytes).toBe(0);
});

test("C08 control-frame buffers share the aggregate budget", () => {
  const events: any[] = [], controls: any[] = [];
  const ingress = new BoundedIngress({ payloadBytes: 8, ingressBytes: 1, pending: 4 }, { message: v => v.release(), incomplete: e => events.push(e), control: (opcode, payload) => controls.push({ opcode, payload }) });
  ingress.pushWebSocket(frame(9, "ab"));
  expect(controls).toHaveLength(0);
  expect(events[0]).toMatchObject({ reason: "aggregate_ingress_limit", units: 1, completeHash: null });
  expect(ingress.heldBytes).toBe(0); expect(ingress.pendingUnits).toBe(0);
});

test("C08 identity-only refusal precedes expansion-bearing allocation", () => {
  for (const encoding of ["gzip", "br", "deflate", "identity, gzip"]) {
    const events: any[] = [], messages: any[] = [];
    const ingress = new BoundedIngress({ payloadBytes: 8, ingressBytes: 16, pending: 4 }, { message: v => messages.push(v), incomplete: e => events.push(e) });
    ingress.beginHttp("expanding", encoding); ingress.pushHttp("expanding", Buffer.alloc(1048576)); ingress.endHttp("expanding");
    expect(events).toHaveLength(1); expect(events[0].reason).toBe("unsupported_content_encoding");
    expect(messages).toHaveLength(0); expect(ingress.heldBytes).toBe(0);
  }
  const events: any[] = [];
  const ingress = new BoundedIngress({ payloadBytes: 8, ingressBytes: 16, pending: 4 }, { message: v => v.release(), incomplete: e => events.push(e) });
  ingress.pushWebSocket(Buffer.from([0xc2, 126])); ingress.pushWebSocket(Buffer.alloc(1048576));
  expect(events[0].reason).toBe("unsupported_websocket_compression"); expect(ingress.heldBytes).toBe(0);
});

test("C08 many fragments stop at assembled-message ceiling before callback", () => {
  const events: any[] = [], messages: any[] = [];
  const ingress = new BoundedIngress({ payloadBytes: 8, ingressBytes: 32, pending: 4 }, { message: v => messages.push(v), incomplete: e => events.push(e) });
  ingress.pushWebSocket(frame(2, "a", false));
  for (let n = 0; n < 8; n++) ingress.pushWebSocket(frame(0, "a", false));
  expect(messages).toHaveLength(0); expect(events[0]).toMatchObject({ reason: "assembled_message_limit", size: 9, provenance: "source_declared" });
  expect(ingress.heldBytes).toBe(0); expect(ingress.pendingUnits).toBe(0);
});

test("C08 HTTP, fragmented WS and queued complete messages share bytes and units", () => {
  const events: any[] = [], messages: any[] = [], controls: string[] = [];
  const budget = new IngressBudget({ payloadBytes: 8, ingressBytes: 16, pending: 2 });
  const ingress = new BoundedIngress(budget.limits, { message: v => messages.push(v), incomplete: e => events.push(e), control: (_, bytes) => controls.push(bytes.toString()) }, budget);
  ingress.beginHttp("metadata", "identity"); ingress.pushHttp("metadata", Buffer.from("abc")); ingress.endHttp("metadata");
  ingress.pushWebSocket(frame(2, "de", false)); ingress.pushWebSocket(frame(0, "f"));
  expect(messages.map(v => v.payload.toString())).toEqual(["abc", "def"]); expect(budget.units).toBe(2); expect(budget.bytes).toBe(6);
  ingress.beginHttp("third", "identity"); expect(events[0].reason).toBe("backpressure_limit");
  for (const v of messages) v.release(); expect(budget.units).toBe(0); expect(budget.bytes).toBe(0); expect(controls).toEqual([]);
});

test("C08 concatenation transient memory is counted and abort salvages no complete payload", () => {
  const events: any[] = [], messages: any[] = [];
  const ingress = new BoundedIngress({ payloadBytes: 8, ingressBytes: 8, pending: 4 }, { message: v => messages.push(v), incomplete: e => events.push(e) });
  ingress.beginHttp("body", undefined); ingress.pushHttp("body", Buffer.from("12345")); ingress.endHttp("body");
  expect(events[0].reason).toBe("aggregate_ingress_limit"); expect(messages).toHaveLength(0); expect(ingress.heldBytes).toBe(0);
  const partial: any[] = [];
  const stopped = new BoundedIngress({ payloadBytes: 8, ingressBytes: 32, pending: 4 }, { message: v => v.release(), incomplete: e => partial.push(e) });
  stopped.beginHttp("metadata", "identity"); stopped.pushHttp("metadata", Buffer.from("xx")); stopped.pushWebSocket(frame(2, "yy", false)); stopped.abort();
  expect(partial[0]).toMatchObject({ units: 2, completeHash: null, callbackTime: null }); expect(stopped.heldBytes).toBe(0);
});
