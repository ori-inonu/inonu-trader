import { expect, test } from "bun:test";
import { createNodeTransport, validatePublicHandshake, encodeClientFrame } from "./node-adapter";
import { fixturePlan, fixtureAccess } from "./capture.test";
import { runCapture } from "./index";
import { existsSync } from "node:fs";
import { join } from "node:path";

test("C01 C08 installed raw Node adapter refuses unknown live allocation/deadline capability", async () => {
  const plan = fixturePlan(); const transport = createNodeTransport();
  expect(transport.capabilities.evidence).toBe("unknown");
  const report = await runCapture(plan, { access: { ...fixtureAccess, evidence: "factual" }, transport, clock: { identity: "offline-node-test", sample: () => ({ wallMs: 2000, monoNs: "1" }), wait: async () => {}, offsetMs: null, uncertaintyMs: null } });
  expect(report.outcome).toBe("not_started"); expect(report.stopReason).toBe("runtime_capability_unqualified");
  expect(existsSync(join(plan.outputRoot, plan.experimentId))).toBe(false);
});

test("C08 RFC6455 handshake rejects extension/compression and unexpected Accept before frame decode", () => {
  const key = "dGhlIHNhbXBsZSBub25jZQ==";
  const headers = { upgrade: "websocket", connection: "Upgrade", "sec-websocket-accept": "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=" };
  expect(validatePublicHandshake(101, headers, key)).toBe(true);
  expect(validatePublicHandshake(101, { ...headers, "sec-websocket-extensions": "permessage-deflate" }, key)).toBe(false);
  expect(validatePublicHandshake(101, { ...headers, "sec-websocket-accept": "wrong" }, key)).toBe(false);
  expect(validatePublicHandshake(302, headers, key)).toBe(false);
});

test("C08 client public subscription frame is masked and preserves its exact application bytes", () => {
  const payload = Buffer.from('{"op":"subscribe","args":[]}'); const a = encodeClientFrame(1, payload), b = encodeClientFrame(1, payload);
  expect(a[0]).toBe(129); expect(a[1]! & 128).toBe(128);
  const unmasked = Buffer.from(a.subarray(6)); for (let i = 0; i < unmasked.length; i++) unmasked[i] = unmasked[i]! ^ a[2 + i % 4]!;
  expect(unmasked.equals(payload)).toBe(true); expect(a.subarray(2,6).equals(b.subarray(2,6))).toBe(false);
});
