import { describe, expect, test } from "bun:test";
import { handleDevAgentProxy } from "./dev-agent-proxy";
import type { DevAgentFetch } from "./dev-agent-proxy";

const HOST = "127.0.0.1:3001";
const ORIGIN = `http://${HOST}`;
const REQUEST_URL = `${ORIGIN}/api/dev-agent/agent/analysis`;

function request(url = REQUEST_URL, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("Host", new URL(url).host);
  return new Request(url, { ...init, headers });
}

describe("development agent read-only proxy", () => {
  test("fetches only allowed fixed GET endpoints with the one permitted header", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
    const upstreamFetch: DevAgentFetch = async (input, init) => {
      calls.push({ url: input as string | URL | Request, init });
      return Response.json({ status: "ok" });
    };

    for (const endpoint of ["analysis", "dev-status"]) {
      const response = await handleDevAgentProxy(
        request(`${ORIGIN}/api/dev-agent/agent/${endpoint}`, {
          headers: {
            Origin: ORIGIN,
            "Sec-Fetch-Site": "same-origin",
            Cookie: "session=secret",
            Authorization: "Bearer secret",
            "X-Inonu-Intent": "write",
            "X-Arbitrary": "untrusted",
          },
        }),
        upstreamFetch,
        "development",
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ status: "ok" });
    }

    expect(calls.map(({ url }) => url)).toEqual([
      "http://127.0.0.1:3000/agent/analysis",
      "http://127.0.0.1:3000/agent/dev-status",
    ]);
    for (const { init } of calls) {
      expect(init?.method).toBe("GET");
      expect([...new Headers(init?.headers).entries()]).toEqual([
        ["origin", "http://127.0.0.1:3000"],
      ]);
      expect(init?.body).toBe(undefined);
      expect(init?.redirect).toBe("error");
      expect(init?.cache).toBe("no-store");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  test("accepts matching localhost Host and Origin for the analysis endpoint", async () => {
    const response = await handleDevAgentProxy(
      request("http://localhost:3001/api/dev-agent/agent/analysis", {
        headers: {
          Origin: "http://localhost:3001",
        },
      }),
      async () => Response.json({ status: "ok" }),
      "development",
    );
    expect(response.status).toBe(200);
  });

  test("keeps paged analysis queries and rejects every dev-status query", async () => {
    const calls: string[] = [];
    const upstreamFetch: DevAgentFetch = async (input) => {
      calls.push(String(input));
      return Response.json({ ok: true });
    };
    const analysis = await handleDevAgentProxy(
      request(`${ORIGIN}/api/dev-agent/agent/analysis?reviewPage=3`),
      upstreamFetch,
      "development",
    );
    expect(analysis.status).toBe(200);
    expect(calls).toEqual(["http://127.0.0.1:3000/agent/analysis?reviewPage=3"]);

    for (const query of ["?x=1", "?reviewPage=1", "?reviewPage=", "?reviewPage=1&reviewPage=2"]) {
      const response = await handleDevAgentProxy(
        request(`${ORIGIN}/api/dev-agent/agent/dev-status${query}`),
        upstreamFetch,
        "development",
      );
      expect(response.status).toBe(400);
    }
    expect(calls).toHaveLength(1);
  });

  test("refuses production, foreign hosts/origins, cross-site metadata, query, paths, and methods before fetch", async () => {
    let fetches = 0;
    const noFetch: DevAgentFetch = async () => {
      fetches += 1;
      return Response.json({});
    };
    const rejected: Request[] = [
      ...["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) =>
        request(REQUEST_URL, { method }),
      ),
      request(`${ORIGIN}/api/dev-agent/agent/status`),
      request(`${ORIGIN}/api/dev-agent/agent/status?x=1`),
      request(`${ORIGIN}/api/dev-agent/agent/ledger`),
      request(`${ORIGIN}/api/dev-agent/agent/status/`),
      new Request(REQUEST_URL, { headers: { Host: "example.com:3001" } }),
      request(REQUEST_URL, { headers: { Origin: "https://evil.example" } }),
      request(REQUEST_URL, { headers: { "Sec-Fetch-Site": "cross-site" } }),
      request(REQUEST_URL, { headers: { "Sec-Fetch-Site": "same-site" } }),
    ];

    for (const invalid of rejected) {
      const response = await handleDevAgentProxy(invalid, noFetch, "development");
      expect(response.status).not.toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }

    const productionResponse = await handleDevAgentProxy(request(), noFetch, "production");
    expect(productionResponse.status).toBe(404);
    expect(fetches).toBe(0);
  });

  test("turns upstream failures into a generic non-cacheable response", async () => {
    const response = await handleDevAgentProxy(request(), async () => {
      throw new Error("sensitive upstream details");
    }, "development");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "upstream_unavailable" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
