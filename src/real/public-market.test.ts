import { describe, expect, test } from "bun:test";
import { createPublicOkxHttp } from "../onchainos/public-okx.ts";
import { createPublicMarket } from "./public-market.ts";
import { createPublicClock } from "./public-clock.ts";

const observed = 1_790_000_000_000;
const instrument = { instType: "SWAP", instId: "BTC-USDT-SWAP", state: "live", settleCcy: "USDT", ctValCcy: "BTC", ctType: "linear", ctVal: "0.01", tickSz: "0.1", lotSz: "0.01", minSz: "0.01" };
const funding = { instId: "BTC-USDT-SWAP", method: "current_period", fundingRate: "0.000123456789012345", nextFundingRate: "", fundingTime: "1790006400000", nextFundingTime: "1790035200000", settState: "settled", settFundingRate: "-0.0001", ts: "1790000000000" };
const mark = { instId: "BTC-USDT-SWAP", markPx: "20000.120000000000001", ts: "1790000000000" };

function transport(rows: Record<string, unknown> = {}) {
  const sent: { url: string; method: string; headers: Record<string, string> }[] = [];
  const http = createPublicOkxHttp({
    allowNetwork: true, now: () => observed, sleep: async () => {}, requestsPerSecond: 5, burst: 3, maxRetries: 0,
    fetch: async (url, init) => {
      sent.push({ url, method: init.method, headers: init.headers });
      const path = new URL(url).pathname;
      const value = rows[path] ?? (path.endsWith("/instruments") ? instrument : path.endsWith("/funding-rate") ? funding : mark);
      return { status: 200, text: async () => JSON.stringify({ code: "0", data: [value], msg: "" }) };
    },
  });
  return { http, sent };
}

describe("public Exchange market snapshot", () => {
  test("calibrated public time converts source expiry conservatively without widening TTL or certifying injected reads", async () => {
    const { http } = transport({ "/api/v5/public/funding-rate": { ...funding, ts: String(observed + 70_000) }, "/api/v5/public/mark-price": { ...mark, ts: String(observed + 70_000) } });
    const clock = createPublicClock({ now: () => observed, monotonic: () => 0, fetch: async () => new Response(JSON.stringify({ code: '0', data: [{ ts: String(observed + 70_000) }] }), { headers: { Date: new Date(observed + 70_000).toUTCString() } }) });
    const snapshot = await createPublicMarket({ http, now: () => observed, clock }).read();
    expect(snapshot.status).toBe('ready'); expect(snapshot.mode).toBe('unverified');
    expect(snapshot.mark?.tsMs).toBe(observed + 70_000);
    expect(snapshot.expiresAtMs).toBe(observed + 60_000 - 251);
    expect(snapshot.clock?.offsetMs).toBe(70_000);
  });

  test("an invalid clock blocks otherwise successful public values", async () => {
    const { http } = transport();
    const clock = createPublicClock({ now: () => observed, fetch: async () => new Response('{}', { status: 500 }) });
    const snapshot = await createPublicMarket({ http, now: () => observed, clock }).read();
    expect(snapshot.status).toBe('blocked'); expect(snapshot.expiresAtMs).toBe(observed);
    expect(snapshot.dependencies.join(' ')).toContain('tempo');
  });
  test("preserves exact public strings and settlement semantics without qualifying injected HTTP as real", async () => {
    const { http, sent } = transport();
    const snapshot = await createPublicMarket({ http, now: () => observed }).read();
    expect(snapshot.source).toBe("okx-public-v5");
    expect(snapshot.mode).toBe("unverified");
    expect(snapshot.status).toBe("ready");
    expect(snapshot.observedAtMs).toBe(observed);
    expect(snapshot.expiresAtMs).toBe(1_790_000_060_000);
    expect(snapshot.funding?.fundingRate).toBe("0.000123456789012345");
    expect(snapshot.funding?.nextFundingRate).toBeNull();
    expect(snapshot.funding?.settFundingRate).toBe("-0.0001");
    expect(snapshot.mark?.markPx).toBe("20000.120000000000001");
    expect(snapshot.capability.exercisedReal).toBe(false);
    expect(snapshot.capability.financiallyQualified).toBe(false);
    expect(snapshot.requests.map(({ method, endpoint, code }) => ({ method, endpoint, code }))).toEqual([
      { method: "GET", endpoint: "/api/v5/public/instruments", code: "0" },
      { method: "GET", endpoint: "/api/v5/public/funding-rate", code: "0" },
      { method: "GET", endpoint: "/api/v5/public/mark-price", code: "0" },
    ]);
    expect(sent).toHaveLength(3);
    expect(sent.every(({ url, method, headers }) => method === "GET" && new URL(url).searchParams.get("instId") === "BTC-USDT-SWAP" && !Object.keys(headers).some((name) => /ok-access|authorization/i.test(name)))).toBe(true);
  });

  test("an old source timestamp expires the snapshot and blocks a current market interpretation", async () => {
    const { http } = transport({ "/api/v5/public/mark-price": { ...mark, ts: "1789999939000" } });
    const snapshot = await createPublicMarket({ http, now: () => observed }).read();
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.expiresAtMs).toBe(1_789_999_999_000);
    expect(snapshot.dependencies.join(" ")).toContain("mark vencido");
    expect(snapshot.capability.exercisedReal).toBe(false);
  });

  test("a non-live inverse instrument cannot qualify the BTC USDT mark unit", async () => {
    const { http } = transport({ "/api/v5/public/instruments": { ...instrument, state: "preopen", ctType: "inverse", settleCcy: "BTC" } });
    const snapshot = await createPublicMarket({ http, now: () => observed }).read();
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.dependencies.join(" ")).toContain("SWAP linear BTC/USDT ativo");
    expect(snapshot.capability.financiallyQualified).toBe(false);
  });

  test("deprecated next-period funding stays visible as raw data and blocks supported forecast interpretation", async () => {
    const { http } = transport({ "/api/v5/public/funding-rate": { ...funding, method: "next_period", nextFundingRate: "0.0002" } });
    const snapshot = await createPublicMarket({ http, now: () => observed }).read();
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.funding?.method).toBe("next_period");
    expect(snapshot.funding?.nextFundingRate).toBe("0.0002");
    expect(snapshot.dependencies.join(" ")).toContain("next_period");
  });

  test("missing decimal data and unknown settlement time stay null and block dependent interpretation", async () => {
    const { http } = transport({ "/api/v5/public/funding-rate": { ...funding, fundingRate: "", fundingTime: "" }, "/api/v5/public/mark-price": { ...mark, markPx: "not-a-decimal" } });
    const snapshot = await createPublicMarket({ http, now: () => observed }).read();
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.funding?.fundingRate).toBeNull();
    expect(snapshot.funding?.fundingTimeMs).toBeNull();
    expect(snapshot.mark?.markPx).toBeNull();
    expect(snapshot.dependencies.join(" ")).toContain("taxa e instante");
    expect(snapshot.dependencies.join(" ")).toContain("mark válido");
  });

  test("a different transport source cannot be relabelled as public Exchange data", async () => {
    const { http } = transport();
    const foreign = { get: async (...args: Parameters<typeof http.get>) => {
      const result = await http.get(...args);
      return { ...result, meta: { ...result.meta, source: "onchainos-rest-v6" as const } };
    } };
    const snapshot = await createPublicMarket({ http: foreign, now: () => observed }).read();
    expect(snapshot.status).toBe("error");
    expect(snapshot.instrument).toBeNull();
    expect(snapshot.funding).toBeNull();
    expect(snapshot.mark).toBeNull();
    expect(snapshot.capability.exercisedReal).toBe(false);
    expect(snapshot.requests).toHaveLength(3);
  });

  test("failed HTTP leaves a sanitized receipt and unknown data without echoing provider text", async () => {
    const http = createPublicOkxHttp({ allowNetwork: true, now: () => observed, sleep: async () => {}, requestsPerSecond: 5, burst: 3, maxRetries: 0, fetch: async () => ({ status: 500, text: async () => JSON.stringify({ code: "50000", msg: "untrusted-private-provider-text", data: [] }) }) });
    const snapshot = await createPublicMarket({ http, now: () => observed }).read();
    expect(snapshot.status).toBe("error");
    expect(snapshot.mark).toBeNull();
    expect(snapshot.requests).toHaveLength(3);
    expect(snapshot.requests.every((request) => request.httpStatus === 500)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("untrusted-private-provider-text");
  });

  test("the public view labels injected data and keeps settled funding separate from forecast", async () => {
    const componentPath = "../../web/src/components/RealPipeline/PublicMarket.tsx";
    const rendererPath = "../../web/node_modules/react-dom/server.js";
    const reactPath = "../../web/node_modules/react/index.js";
    const { PublicMarketView } = await import(componentPath);
    const { renderToStaticMarkup } = await import(rendererPath);
    const { createElement } = await import(reactPath);
    const { http } = transport();
    const snapshot = await createPublicMarket({ http, now: () => observed }).read();
    const html = renderToStaticMarkup(createElement(PublicMarketView, { snapshot, nowMs: observed, busy: false, error: null, onRetry() {} }));
    expect(html).toContain("okx-public-v5");
    expect(html).toContain("Leitura não verificada");
    expect(html).toContain("Taxa da liquidação anterior");
    expect(html).toContain("Previsão de funding do ciclo corrente");
    expect(html).toContain("0.000123456789012345");
    expect(html).toContain("Não qualificada");
  });

  test("expired public values are hidden while clock dependencies and source timestamps remain visible", async () => {
    const componentPath = "../../web/src/components/RealPipeline/PublicMarket.tsx";
    const rendererPath = "../../web/node_modules/react-dom/server.js";
    const reactPath = "../../web/node_modules/react/index.js";
    const { PublicMarketView } = await import(componentPath);
    const { renderToStaticMarkup } = await import(rendererPath);
    const { createElement } = await import(reactPath);
    const { http } = transport({ "/api/v5/public/mark-price": { ...mark, ts: "1790000070000" } });
    const snapshot = await createPublicMarket({ http, now: () => observed }).read();
    const html = renderToStaticMarkup(createElement(PublicMarketView, { snapshot, nowMs: observed, busy: false, error: null, onRetry() {} }));
    expect(html).toContain("Hold");
    expect(html).toContain("compatível com o relógio");
    expect(html).toContain("Timestamp da fonte");
    expect(html).not.toContain("20000.120000000000001");
    expect(html).not.toContain("0.000123456789012345");
  });
});
