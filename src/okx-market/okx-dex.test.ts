import { describe, expect, it } from "bun:test";
import { createOkxDexReadOnlyClient } from "./okx-dex";

const credentials = {
  apiKey: "fake-key",
  secret: "fake-secret",
  passphrase: "fake-passphrase",
};
const requestTime = new Date("2026-10-09T12:34:56.000Z");
const success = (data: unknown) => new Response(JSON.stringify({ code: "0", msg: "", data }));

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error : new Error("Promise rejected with a non-Error value.");
  }
  throw new Error("Expected the promise to reject.");
}

async function rejectionValueOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the promise to reject.");
}

function hostileRejection() {
  const inspected: string[] = [];
  const trackedProperties = new Set(["code", "message", "stage", "status"]);
  const target = Object.create(null) as Record<string, unknown>;
  for (const property of trackedProperties) {
    Object.defineProperty(target, property, {
      get() {
        inspected.push(property);
        return `PRIVATE_UPSTREAM_${property.toUpperCase()}_SENTINEL`;
      },
    });
  }

  let proxy!: object;
  proxy = new Proxy(target, {
    getPrototypeOf() {
      inspected.push("getPrototypeOf");
      throw proxy;
    },
    get(target, property, receiver) {
      if (typeof property === "string" && trackedProperties.has(property)) inspected.push(property);
      return Reflect.get(target, property, receiver);
    },
  });
  return { proxy, inspected };
}

describe("OKX DEX read-only client", () => {
  it("signs the exact supported-chain GET path and returns data", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const client = createOkxDexReadOnlyClient({
      credentials,
      now: () => new Date(requestTime),
      fetch: async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return success([{ chainIndex: "1", chainName: "Ethereum" }]);
      },
    });

    await expect(client.supportedChain("1")).resolves.toEqual([{ chainIndex: "1", chainName: "Ethereum" }]);
    expect(requestUrl).toBe("https://web3.okx.com/api/v6/dex/aggregator/supported/chain?chainIndex=1");
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.redirect).toBe("error");
    expect((requestInit?.headers as Record<string, string>)["OK-ACCESS-TIMESTAMP"]).toBe("2026-10-09T12:34:56.000Z");
    expect((requestInit?.headers as Record<string, string>)["OK-ACCESS-SIGN"]).toBe("vIpwcuaja01fLCXFSBhxNzMG4R5+bhl4a0mukUky00Y=");
  });

  it("uses only the fixed exact-in quote query and lowercases EVM token addresses", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const client = createOkxDexReadOnlyClient({
      credentials,
      now: () => new Date(requestTime),
      fetch: async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return success([{ toTokenAmount: "900719925474099312345" }]);
      },
    });

    await expect(client.quote({
      chainIndex: "1",
      fromTokenAddress: "0xAbC",
      toTokenAddress: "0xDeF",
      amount: "123",
      priceImpactProtectionPercent: 1.5,
    })).resolves.toEqual([{ toTokenAmount: "900719925474099312345" }]);
    expect(requestUrl).toBe(
      "https://web3.okx.com/api/v6/dex/aggregator/quote?chainIndex=1&amount=123&fromTokenAddress=0xabc&toTokenAddress=0xdef&swapMode=exactIn&singleRouteOnly=true&priceImpactProtectionPercent=1.5",
    );
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.redirect).toBe("error");
    expect((requestInit?.headers as Record<string, string>)["OK-ACCESS-SIGN"]).toBe("QsroEvT1EzfpSdIqH6KWhUuAMNzFoVLw9qbrqkH/yX8=");
    expect(requestUrl).not.toMatch(/wallet|slippage|ttl|cursor|limit/i);
  });

  it("preserves Solana token address case", async () => {
    let requestUrl = "";
    const client = createOkxDexReadOnlyClient({
      credentials,
      fetch: async (input) => {
        requestUrl = String(input);
        return success([]);
      },
    });

    await client.quote({
      chainIndex: "501",
      fromTokenAddress: "SoLaNaMintA",
      toTokenAddress: "SoLaNaMintB",
      amount: "1",
      priceImpactProtectionPercent: 1,
    });
    expect(requestUrl).toContain("fromTokenAddress=SoLaNaMintA&toTokenAddress=SoLaNaMintB");
  });

  it("preserves the published mixed-case TRON contract in the quote query", async () => {
    let requestUrl = "";
    const client = createOkxDexReadOnlyClient({
      credentials,
      fetch: async (input) => {
        requestUrl = String(input);
        return success([]);
      },
    });
    await client.quote({ chainIndex: "195", fromTokenAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      toTokenAddress: "TVjsykeQKpR7xR6M9U5W3uV2WcXB4Qv8wE", amount: "1", priceImpactProtectionPercent: 1 });
    const query = new URL(requestUrl).searchParams;
    expect(query.get("fromTokenAddress")).toBe("TJRabPrwbZy45sbavfcjinPJC18kjpRTv8");
    expect(query.get("toTokenAddress")).toBe("TVjsykeQKpR7xR6M9U5W3uV2WcXB4Qv8wE");
  });

  it("validates chain, addresses, atomic amount and protection before fetch", async () => {
    let fetchCount = 0;
    const client = createOkxDexReadOnlyClient({
      credentials,
      fetch: async () => {
        fetchCount += 1;
        return success([]);
      },
    });
    const base = {
      chainIndex: "1",
      fromTokenAddress: "0xabc",
      toTokenAddress: "0xdef",
      amount: "1",
      priceImpactProtectionPercent: 1,
    };

    const invalidQuotes = [
      { ...base, chainIndex: "01" },
      { ...base, chainIndex: "not-a-chain" },
      { ...base, fromTokenAddress: "" },
      { ...base, fromTokenAddress: "token with space" },
      { ...base, toTokenAddress: "token,with,comma" },
      { ...base, amount: "0" },
      { ...base, amount: "01" },
      { ...base, amount: "1.0" },
      { ...base, amount: "9".repeat(79) },
      { ...base, priceImpactProtectionPercent: 100 },
      { ...base, priceImpactProtectionPercent: Number.NaN },
      { ...base, toTokenAddress: "0xabc" },
    ];

    for (const input of invalidQuotes) {
      await expect(client.quote(input)).rejects.toThrow();
    }
    await expect(client.supportedChain("0")).rejects.toThrow();
    await expect(client.supportedChain(" 1")).rejects.toThrow();
    expect(fetchCount).toBe(0);
  });

  it("rejects an invalid clock before fetch", async () => {
    let fetchCount = 0;
    const client = createOkxDexReadOnlyClient({
      credentials,
      now: () => new Date(Number.NaN),
      fetch: async () => {
        fetchCount += 1;
        return success([]);
      },
    });

    await expect(client.supportedChain("1")).rejects.toThrow("Invalid request clock.");
    expect(fetchCount).toBe(0);
  });

  it("rejects invalid credentials and timing bounds at construction", () => {
    expect(() => createOkxDexReadOnlyClient({ credentials: { ...credentials, apiKey: " " } })).toThrow(
      "Invalid API credentials.",
    );
    expect(() => createOkxDexReadOnlyClient({ credentials, timeoutMs: 0 })).toThrow("Invalid timeoutMs");
    expect(() => createOkxDexReadOnlyClient({ credentials, minRequestIntervalMs: -1 })).toThrow(
      "Invalid minRequestIntervalMs",
    );
    expect(() => createOkxDexReadOnlyClient({ credentials, timeoutMs: Number.POSITIVE_INFINITY })).toThrow(
      "Invalid timeoutMs",
    );
  });

  it("spaces concurrent request starts by the configured interval", async () => {
    let clockMs = requestTime.getTime();
    const waits: number[] = [];
    const starts: number[] = [];
    const client = createOkxDexReadOnlyClient({
      credentials,
      now: () => new Date(clockMs),
      wait: async (ms) => {
        waits.push(ms);
        clockMs += ms;
      },
      fetch: async () => {
        starts.push(clockMs);
        return success([]);
      },
    });

    await Promise.all([client.supportedChain("1"), client.supportedChain("2"), client.supportedChain("3")]);
    expect(waits).toEqual([1100, 1100]);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(1100);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(1100);
  });

  it("applies the timeout across the JSON body and does not retry", async () => {
    let fetchCount = 0;
    let requestSignal: AbortSignal | undefined;
    const client = createOkxDexReadOnlyClient({
      credentials,
      timeoutMs: 5,
      fetch: async (_input, init) => {
        fetchCount += 1;
        requestSignal = init?.signal as AbortSignal | undefined;
        return {
          ok: true,
          status: 200,
          json: () => new Promise<never>(() => undefined),
        } as unknown as Response;
      },
    });

    const error = await rejectionOf(client.supportedChain("1"));
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("OKX request timed out.");
    expect(fetchCount).toBe(1);
    expect((error as Error).message).not.toContain("fake-secret");
    expect((error as Error).message).not.toContain("web3.okx.com");
    expect(requestSignal?.aborted).toBe(true);
  });

  it("sanitizes hostile async fetch rejections without inspecting proxy fields", async () => {
    const { proxy, inspected } = hostileRejection();
    let fetchCount = 0;
    const client = createOkxDexReadOnlyClient({
      credentials,
      minRequestIntervalMs: 0,
      fetch: () => {
        fetchCount += 1;
        return Promise.reject(proxy);
      },
    });

    const error = await rejectionValueOf(client.supportedChain("1"));

    expect(inspected).toEqual([]);
    expect(Object.is(error, proxy)).toBe(false);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("OKX request failed.");
    expect((error as Error).message).not.toContain("PRIVATE_UPSTREAM");
    expect(fetchCount).toBe(1);
  });

  it("sanitizes synchronous hostile throws and ordinary fetch errors without retrying", async () => {
    const { proxy, inspected } = hostileRejection();
    let hostileFetchCount = 0;
    const hostileClient = createOkxDexReadOnlyClient({
      credentials,
      minRequestIntervalMs: 0,
      fetch: () => {
        hostileFetchCount += 1;
        throw proxy;
      },
    });

    const hostileError = await rejectionValueOf(hostileClient.supportedChain("1"));

    expect(inspected).toEqual([]);
    expect(Object.is(hostileError, proxy)).toBe(false);
    expect(hostileError).toBeInstanceOf(Error);
    expect((hostileError as Error).message).toBe("OKX request failed.");
    expect(hostileFetchCount).toBe(1);

    let ordinaryFetchCount = 0;
    const ordinaryClient = createOkxDexReadOnlyClient({
      credentials,
      minRequestIntervalMs: 0,
      fetch: () => {
        ordinaryFetchCount += 1;
        throw new Error("PRIVATE_ORDINARY_FETCH_SENTINEL");
      },
    });
    const ordinaryError = await rejectionOf(ordinaryClient.supportedChain("1"));
    expect(ordinaryError.message).toBe("OKX request failed.");
    expect(ordinaryError.message).not.toContain("PRIVATE_ORDINARY_FETCH_SENTINEL");
    expect(ordinaryFetchCount).toBe(1);
  });

  it("sanitizes hostile response-body rejections as invalid JSON", async () => {
    const { proxy, inspected } = hostileRejection();
    let fetchCount = 0;
    let bodyReadCount = 0;
    const client = createOkxDexReadOnlyClient({
      credentials,
      minRequestIntervalMs: 0,
      fetch: async () => {
        fetchCount += 1;
        return {
          ok: true,
          status: 200,
          json: () => {
            bodyReadCount += 1;
            return Promise.reject(proxy);
          },
        } as unknown as Response;
      },
    });

    const error = await rejectionValueOf(client.quote({
      chainIndex: "1",
      fromTokenAddress: "0xabc",
      toTokenAddress: "0xdef",
      amount: "1",
      priceImpactProtectionPercent: 1,
    }));

    expect(inspected).toEqual([]);
    expect(Object.is(error, proxy)).toBe(false);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("OKX API returned invalid JSON.");
    expect((error as Error).message).not.toContain("PRIVATE_UPSTREAM");
    expect(fetchCount).toBe(1);
    expect(bodyReadCount).toBe(1);
  });

  it("does not inspect hostile response classifiers or promote unsafe status values", async () => {
    const responseFactories: Array<(proxy: object) => Response> = [
      (proxy) => ({
        get ok() { throw proxy; },
        status: 200,
        json: async () => ({}),
      } as unknown as Response),
      (proxy) => ({
        ok: false,
        get status() { throw proxy; },
        json: async () => ({}),
      } as unknown as Response),
      (proxy) => ({
        ok: false,
        status: proxy,
        json: async () => ({}),
      } as unknown as Response),
    ];

    for (const makeResponse of responseFactories) {
      const { proxy, inspected } = hostileRejection();
      let fetchCount = 0;
      const client = createOkxDexReadOnlyClient({
        credentials,
        minRequestIntervalMs: 0,
        fetch: () => {
          fetchCount += 1;
          return Promise.resolve(makeResponse(proxy));
        },
      });

      const error = await rejectionValueOf(client.supportedChain("1"));

      expect(inspected).toEqual([]);
      expect(Object.is(error, proxy)).toBe(false);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("OKX request failed.");
      expect((error as Error).message).not.toContain("PRIVATE_UPSTREAM");
      expect(fetchCount).toBe(1);
    }
  });

  it("sanitizes invalid JSON", async () => {
    const marker = "PRIVATE_JSON_MARKER";
    const client = createOkxDexReadOnlyClient({
      credentials,
      fetch: async () => new Response(marker),
    });
    const error = await rejectionOf(client.supportedChain("1"));
    expect(error.message).toBe("OKX API returned invalid JSON.");
    expect(error.message).not.toContain(marker);
  });

  it("sanitizes network and HTTP/API failures without retrying or exposing bodies", async () => {
    const bodyMarker = "PRIVATE_RESPONSE_MARKER";
    let networkFetchCount = 0;
    const networkClient = createOkxDexReadOnlyClient({
      credentials,
      fetch: async () => {
        networkFetchCount += 1;
        throw new Error(`secret fake-secret ${bodyMarker} https://web3.okx.com/path`);
      },
    });
    const networkError = await rejectionOf(networkClient.supportedChain("1"));
    expect(networkError.message).toBe("OKX request failed.");
    expect(networkError.message).not.toContain(bodyMarker);
    expect(networkFetchCount).toBe(1);

    let httpFetchCount = 0;
    const httpClient = createOkxDexReadOnlyClient({
      credentials,
      fetch: async () => {
        httpFetchCount += 1;
        return new Response(bodyMarker, { status: 429 });
      },
    });
    const httpError = await rejectionOf(httpClient.supportedChain("1"));
    expect(httpError.message).toBe("OKX request failed with HTTP 429.");
    expect(httpError.message).not.toContain(bodyMarker);
    expect(httpFetchCount).toBe(1);

    const apiClient = createOkxDexReadOnlyClient({
      credentials,
      fetch: async () => new Response(JSON.stringify({ code: "500", msg: bodyMarker, data: [] })),
    });
    const apiError = await rejectionOf(apiClient.supportedChain("1"));
    expect(apiError.message).toBe("OKX API returned a non-zero response code.");
    expect(apiError.message).not.toContain(bodyMarker);
  });

  it("rejects malformed data arrays without exposing response content", async () => {
    const marker = "SECRET_SCHEMA_MARKER";
    const client = createOkxDexReadOnlyClient({
      credentials,
      fetch: async () => new Response(JSON.stringify({ code: "0", msg: "", data: [{ leaked: marker }, null] })),
    });
    const error = await rejectionOf(client.supportedChain("1"));
    expect(error.message).toBe("OKX API returned an unexpected response schema.");
    expect(error.message).not.toContain(marker);
  });

  it("requires a string message in the documented response envelope", async () => {
    for (const payload of [
      { code: "0", data: [] },
      { code: "0", msg: 42, data: [] },
      { code: "0", msg: null, data: [] },
    ]) {
      const client = createOkxDexReadOnlyClient({
        credentials,
        minRequestIntervalMs: 0,
        fetch: async () => new Response(JSON.stringify(payload)),
      });
      await expect(client.supportedChain("1")).rejects.toThrow("OKX API returned an unexpected response schema.");
    }
  });
});
