import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createGevPilotController, GEV_PILOT_ENDPOINT, pilotEndpoint } from "./gev-pilot-client";
import { pilotContextKey, type PilotCycle, type PilotRequest } from "./gev-pilot-protocol";
import type { WalletSnapshot } from "./okx-wallet";
import { resolvePilotPorts } from "../../../src/pilot/ports";

// D-A11 and C-A5. The page reaches the pilot at 127.0.0.1:3020 unless NEXT_PUBLIC_PILOT_PORT says otherwise. Next replaces
// only the literal process.env.NEXT_PUBLIC_PILOT_PORT in the browser bundle, so the read has to stay a literal access.

const NOW = 1_800_000_000_000;
const account = "0x1111111111111111111111111111111111111111";
const wallet = (): WalletSnapshot => ({ status: "connected", account, chainId: "0xc4", observedAtMs: NOW, error: null,
  balances: { network: "xlayer", okb: "1", usdt: "20", usdt0: "0", nativeUsdc: "0", usdcBridged: "0", usdcE: "0", block: "0x7b" } });
function hold(request: PilotRequest): PilotCycle {
  return { protocol: "gev-wallet-pilot-v1", sessionId: request.sessionId, requestId: request.requestId,
    contextKey: pilotContextKey(request), cycleId: "cycle-0001", maskedAccount: "0x1111...1111", chainId: "0xc4", chainIndex: "196",
    mode: "simulation", execution: "disabled", status: "hold", source: "unavailable", dataVersion: null, observedAtMs: null,
    coverage: { status: "unknown", chains: [], valueComplete: null, unitsQualified: null, quoteCostsComplete: null, assetCount: null }, quoteObservedAtMs: null,
    completedAtMs: NOW, validUntilMs: NOW, knownValueUsd: null, candidates: [], verdicts: [], decision: null, plan: null,
    reasons: ["source_unavailable"], inferenceCostUsd: null, billedCostUsd: null, realizedProfitUsd: null };
}
function reply(value: unknown, url = ""): Response {
  const response = new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  if (url) Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("D-A11 the pilot endpoint of the page", () => {
  it("is still port 3020 when nothing is configured", () => {
    expect(pilotEndpoint(undefined)).toBe("http://127.0.0.1:3020/pilot/cycles");
    expect(GEV_PILOT_ENDPOINT).toBe(pilotEndpoint(process.env.NEXT_PUBLIC_PILOT_PORT));
  });

  it.each([["4020"], ["1"], ["80"], ["65535"]])("follows NEXT_PUBLIC_PILOT_PORT=%s", (port: string) => {
    expect(pilotEndpoint(port)).toBe(`http://127.0.0.1:${port}/pilot/cycles`);
  });

  it.each(["", " 3020", "3020 ", "0", "-1", "65536", "99999", "3020.5", "3e3", "0x10", "abc", "03020", "3020/evil", "3020@evil.example", "3020?x=1", "٣٠٢٠"])("refuses %j instead of falling back to the default or building another address", (text: string) => {
    expect(() => pilotEndpoint(text)).toThrow("invalid_pilot_port");
  });

  it("accepts and refuses exactly what the service side accepts and refuses", () => {
    for (const text of ["1", "80", "3020", "4020", "65535", "", "0", "65536", "03020", "abc", "3020.5", " 3020"]) {
      const service = (() => { try { return resolvePilotPorts({ PILOT_PORT: text, PILOT_UI_PORT: "9" }).port; } catch { return null; } })();
      const page = (() => { try { return Number(/^http:\/\/127\.0\.0\.1:(\d+)\/pilot\/cycles$/.exec(pilotEndpoint(text))?.[1]); } catch { return null; } })();
      expect({ text, page }).toEqual({ text, page: service });
    }
  });

  it("posts the cycle to the configured endpoint and refuses an answer that comes from another address", async () => {
    const endpoint = pilotEndpoint("4020");
    const urls: string[] = [];
    const run = async (answerUrl: string) => {
      const controller = createGevPilotController({ sessionId: "session-0001", now: () => NOW, nonce: () => "request-0001", endpoint,
        fetch: async (url, init) => { urls.push(url); return reply(hold(JSON.parse(String(init.body))), answerUrl); } });
      controller.setWallet(wallet());
      await controller.evaluate();
      const state = controller.getSnapshot();
      controller.dispose();
      return state;
    };
    const fine = await run(endpoint);
    expect(urls).toEqual([endpoint]);
    expect(fine.status).toBe("hold");
    const moved = await run(pilotEndpoint(undefined));
    expect(moved.status).toBe("error");
    expect(moved.reason).toBe("invalid_response");
  });

  it("refuses a controller endpoint that is not a loopback pilot address", () => {
    for (const endpoint of ["http://127.0.0.1:3020/pilot", "https://127.0.0.1:3020/pilot/cycles", "http://localhost:3020/pilot/cycles", "http://127.0.0.1:0/pilot/cycles", "http://evil.example:3020/pilot/cycles", "http://127.0.0.1:3020/pilot/cycles?x=1"]) {
      expect(() => createGevPilotController({ endpoint }), endpoint).toThrow("invalid_pilot_options");
    }
  });

  it("reads the port with the literal access that Next replaces in the browser bundle, and reads nothing else from the environment", () => {
    const source = readFileSync(join(import.meta.dir, "gev-pilot-client.ts"), "utf8");
    expect(source.match(/process\.env\.NEXT_PUBLIC_PILOT_PORT/g)?.length).toBe(1);
    expect(source.match(/process\.env/g)?.length).toBe(1);
  });
});
