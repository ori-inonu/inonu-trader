import { expect, test } from "bun:test";
import { createOkxReadOnlyClient, OkxApiError, type OkxApiRequest, type OkxFetch, type OkxFetchInit, type TokenIdentity } from "./okx-api";

const credentials = {
  apiKey: "test-api-key",
  secretKey: "test-secret-key",
  passphrase: "test-passphrase",
};
const timestamp = new Date("2026-10-09T20:00:00.000Z");
const jsonResponse = (data: unknown, code: string | number = "0", status = 200) =>
  new Response(JSON.stringify({ code, data, msg: "fixture" }), { status });

function clientWith(fetcher: OkxFetch, timeoutMs = 1_000) {
  return createOkxReadOnlyClient({ credentials, fetcher, now: () => timestamp, timeoutMs, allowLiveRequests: true });
}

function captureFetch(response: Response) {
  const calls: { input: string; init: OkxFetchInit }[] = [];
  const fetcher: OkxFetch = async (input, init) => {
    calls.push({ input, init });
    return response.clone();
  };
  return { fetcher, calls };
}

const token: TokenIdentity = {
  chainIndex: "501",
  tokenContractAddress: "So11111111111111111111111111111111111111112",
};

function recordRequest(call: { input: string; init: OkxFetchInit }): OkxApiRequest {
  const headers = new Headers(call.init?.headers);
  return {
    url: String(call.input),
    method: call.init.method,
    body: call.init.body ?? "",
    headers,
  };
}

test("requires explicit credentials and never sends without them", async () => {
  let calls = 0;
  const fetcher: OkxFetch = async () => {
    calls++;
    return jsonResponse([]);
  };
  expect(() => createOkxReadOnlyClient({
    credentials: { apiKey: "", secretKey: "", passphrase: "" },
    fetcher,
  })).toThrow("Invalid OKX API credentials");
  expect(() => createOkxReadOnlyClient({
    credentials: { apiKey: "  ", secretKey: "test-secret-key", passphrase: "test-passphrase" },
    fetcher,
  })).toThrow("Invalid OKX API credentials");
  expect(calls).toBe(0);
});

test("keeps live requests disabled unless explicitly enabled", async () => {
  let calls = 0;
  const fetcher: OkxFetch = async () => {
    calls++;
    return jsonResponse([]);
  };
  const client = createOkxReadOnlyClient({ credentials, fetcher, now: () => timestamp });
  await expect(client.getMemePumpSupportedChains()).rejects.toThrow("OKX live requests are disabled");
  expect(calls).toBe(0);
});

test("signs the exact fixed GET request path, including its query", async () => {
  const { fetcher, calls } = captureFetch(jsonResponse({
    items: [{ chainIndex: "501", tokenContractAddress: token.tokenContractAddress }],
  }));
  const result = await clientWith(fetcher).getMemePumpTokenList({
    chainIndex: "501",
    stage: "NEW",
    limit: 1,
  });
  const request = recordRequest(calls[0]!);
  expect(result.items).toHaveLength(1);
  expect(request.url).toBe("https://web3.okx.com/api/v6/dex/market/memepump/tokenList?chainIndex=501&stage=NEW&limit=1");
  expect(request.method).toBe("GET");
  expect(request.body).toBe("");
  expect(request.headers.get("OK-ACCESS-TIMESTAMP")).toBe("2026-10-09T20:00:00.000Z");
  expect(request.headers.get("OK-ACCESS-KEY")).toBe(credentials.apiKey);
  expect(request.headers.get("OK-ACCESS-PASSPHRASE")).toBe(credentials.passphrase);
  expect(request.headers.get("OK-ACCESS-SIGN")).toBe("RgK+N7tHR6Z9UhVr0xX/JwHPRmFk8zVkl84vY+GeYqc=");
  expect(request.url).not.toContain(credentials.secretKey);
  expect(calls[0]!.init.redirect).toBe("error");
  expect(calls[0]!.init.credentials).toBe("omit");
  expect(calls[0]!.init.cache).toBe("no-store");
});

test("signs the exact serialized POST body used on the wire", async () => {
  const { fetcher, calls } = captureFetch(jsonResponse([{
    chainIndex: token.chainIndex,
    tokenContractAddress: token.tokenContractAddress,
    time: "1791576000000",
    price: "1.25",
  }]));
  const result = await clientWith(fetcher).getTokenPriceInfo([token]);
  const request = recordRequest(calls[0]!);
  expect(result).toHaveLength(1);
  expect(request.url).toBe("https://web3.okx.com/api/v6/dex/market/price-info");
  expect(request.method).toBe("POST");
  expect(request.body).toBe(JSON.stringify([token]));
  expect(request.headers.get("Content-Type")).toBe("application/json");
  expect(request.headers.get("OK-ACCESS-SIGN")).toBe("//3DI5883aWOOXuQLHfCVAU3s0YzbNoRJl9mS5pVKh4=");
  expect(calls[0]!.init.redirect).toBe("error");
});

test("uses only the five read-only documented endpoints and validates their response shapes", async () => {
  const fixtures = [
    { data: [{ chainIndex: "501", chainName: "Solana", protocolList: [{ protocolId: "1", protocolName: "PUMP_FUN" }] }], call: (c: ReturnType<typeof clientWith>) => c.getMemePumpSupportedChains() },
    { data: { items: [], cursor: "" }, call: (c: ReturnType<typeof clientWith>) => c.getMemePumpTokenList({ chainIndex: "501", stage: "MIGRATED", limit: 30 }) },
    { data: [{ ...token, time: "", price: "" }], call: (c: ReturnType<typeof clientWith>) => c.getTokenPriceInfo([token]) },
    { data: { chainIndex: token.chainIndex, tokenContractAddress: token.tokenContractAddress, createTime: "" }, call: (c: ReturnType<typeof clientWith>) => c.getTokenAdvancedInfo(token) },
    { data: [{ pool: "TOKEN/SOL", liquidityUsd: "", liquidityAmount: [], poolAddress: "pool" }], call: (c: ReturnType<typeof clientWith>) => c.getTokenTopLiquidity(token) },
  ];
  const paths = [
    "/api/v6/dex/market/memepump/supported/chainsProtocol",
    "/api/v6/dex/market/memepump/tokenList?chainIndex=501&stage=MIGRATED&limit=30",
    "/api/v6/dex/market/price-info",
    "/api/v6/dex/market/token/advanced-info?chainIndex=501&tokenContractAddress=So11111111111111111111111111111111111111112",
    "/api/v6/dex/market/token/top-liquidity?chainIndex=501&tokenContractAddress=So11111111111111111111111111111111111111112",
  ];

  for (let index = 0; index < fixtures.length; index++) {
    const { fetcher, calls } = captureFetch(jsonResponse(fixtures[index]!.data));
    await fixtures[index]!.call(clientWith(fetcher));
    expect(recordRequest(calls[0]!).url).toBe(`https://web3.okx.com${paths[index]}`);
  }

  const { fetcher } = captureFetch(jsonResponse({ unexpected: true }));
  await expect(clientWith(fetcher).getMemePumpSupportedChains()).rejects.toThrow("Unexpected OKX response schema");

  const numericCode = captureFetch(jsonResponse([], 0));
  await expect(clientWith(numericCode.fetcher).getMemePumpSupportedChains()).resolves.toEqual([]);

  const wrongChain = captureFetch(jsonResponse({ items: [{ ...token, chainIndex: "56" }] }));
  await expect(clientWith(wrongChain.fetcher).getMemePumpTokenList({ chainIndex: "501", stage: "NEW", limit: 1 }))
    .rejects.toThrow("Unexpected OKX response schema");

  const wrongToken = captureFetch(jsonResponse([{ ...token, chainIndex: "56", time: "1", price: "1" }]));
  await expect(clientWith(wrongToken.fetcher).getTokenPriceInfo([token]))
    .rejects.toThrow("Unexpected OKX response schema");
});

test("rejects invalid limits, stages, token identities, and batches before network access", async () => {
  let calls = 0;
  const fetcher: OkxFetch = async () => {
    calls++;
    return jsonResponse([]);
  };
  const client = clientWith(fetcher);
  await expect(client.getMemePumpTokenList({ chainIndex: "501", stage: "NEW", limit: 0 })).rejects.toThrow("Invalid OKX request");
  await expect(client.getMemePumpTokenList({ chainIndex: "5/01", stage: "NEW", limit: 1 })).rejects.toThrow("Invalid OKX request");
  await expect(client.getMemePumpTokenList({ chainIndex: "501", stage: "OTHER" as never, limit: 31 })).rejects.toThrow("Invalid OKX request");
  await expect(client.getTokenPriceInfo([])).rejects.toThrow("Invalid OKX request");
  await expect(client.getTokenPriceInfo(Array.from({ length: 31 }, () => token))).rejects.toThrow("Invalid OKX request");
  await expect(client.getTokenAdvancedInfo({ chainIndex: "", tokenContractAddress: "" })).rejects.toThrow("Invalid OKX request");
  expect(calls).toBe(0);
});

test("fails closed on HTTP, API, JSON, and shape errors without exposing response bodies", async () => {
  const secretMarker = "upstream-private-body-marker";
  const cases = [
    new Response(secretMarker, { status: 503 }),
    new Response(JSON.stringify({ code: "50000", data: [], msg: secretMarker }), { status: 200 }),
    new Response(secretMarker, { status: 200 }),
    jsonResponse({ unexpected: secretMarker }),
  ];

  for (const response of cases) {
    const { fetcher, calls } = captureFetch(response);
    await expect(clientWith(fetcher).getMemePumpSupportedChains()).rejects.toThrow();
    expect(calls).toHaveLength(1);
  }

  const { fetcher } = captureFetch(new Response(secretMarker, { status: 503 }));
  await expect(clientWith(fetcher).getMemePumpSupportedChains()).rejects.not.toThrow(secretMarker);
});

test("reports timeout without exposing fetch errors", async () => {
  const fetcher: OkxFetch = (_input, init) => new Promise((_, reject) => {
    const fail = () => reject(new Error("secret-bearing endpoint and response"));
    if (init.signal.aborted) fail();
    else init.signal.addEventListener("abort", fail, { once: true });
  });
  await expect(clientWith(fetcher, 1).getMemePumpSupportedChains()).rejects.toMatchObject({ kind: "timeout" });
  await expect(clientWith(fetcher, 1).getMemePumpSupportedChains()).rejects.not.toThrow("secret-bearing endpoint");
});

test("does not retry a failed API call", async () => {
  let calls = 0;
  const fetcher: OkxFetch = async () => {
    calls++;
    return jsonResponse([], "50000");
  };
  await expect(clientWith(fetcher).getMemePumpSupportedChains()).rejects.toThrow("OKX API returned a non-success code");
  expect(calls).toBe(1);
});

test("matches EVM price identities case-insensitively but keeps non-EVM identity exact", async () => {
  const evm = { chainIndex: "1", tokenContractAddress: "0xAaBb" };
  const evmResponse = captureFetch(jsonResponse([{
    chainIndex: "1", tokenContractAddress: "0xaabb", time: "1", price: "2",
  }]));
  await expect(clientWith(evmResponse.fetcher).getTokenPriceInfo([evm])).resolves.toHaveLength(1);

  for (const [chainIndex, tokenContractAddress] of [
    ["501", "So11111111111111111111111111111111111111112"],
    ["195", "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8"],
    ["999999", "UnknownAaCase"],
  ] as const) {
    const mismatch = captureFetch(jsonResponse([{
      chainIndex, tokenContractAddress: tokenContractAddress.toLowerCase(), time: "1", price: "2",
    }]));
    await expect(clientWith(mismatch.fetcher).getTokenPriceInfo([{ chainIndex, tokenContractAddress }]))
      .rejects.toThrow("Unexpected OKX response schema");
  }
});

test("matches advanced EVM identity casing without weakening the chain check", async () => {
  const requested = { chainIndex: "1", tokenContractAddress: "0xAaBb" };
  const evm = captureFetch(jsonResponse({ chainIndex: "1", tokenContractAddress: "0xaabb", riskControlLevel: "1" }));
  await expect(clientWith(evm.fetcher).getTokenAdvancedInfo(requested)).resolves.toMatchObject({ riskControlLevel: "1" });

  const wrongChain = captureFetch(jsonResponse({ chainIndex: "56", tokenContractAddress: "0xaabb" }));
  await expect(clientWith(wrongChain.fetcher).getTokenAdvancedInfo(requested)).rejects.toThrow("Unexpected OKX response schema");
});

test("rejects duplicate price identities instead of accepting a missing requested token", async () => {
  const first = { chainIndex: "1", tokenContractAddress: "0xAaBb" };
  const second = { chainIndex: "1", tokenContractAddress: "0xCcDd" };
  const response = captureFetch(jsonResponse([
    { ...first, time: "1", price: "2" },
    { ...first, time: "2", price: "3" },
  ]));
  await expect(clientWith(response.fetcher).getTokenPriceInfo([first, second]))
    .rejects.toThrow("Unexpected OKX response schema");
});

test("does not trust hostile or caller-created API errors from the transport", async () => {
  const privateText = "PRIVATE_TRANSPORT_SENTINEL";
  const hostile = new Proxy({}, { getPrototypeOf() { throw new Error(privateText); } });
  const transportErrors = [hostile, new OkxApiError("schema", privateText)];

  for (const transportError of transportErrors) {
    const fetcher: OkxFetch = async () => { throw transportError; };
    const failure = await clientWith(fetcher).getMemePumpSupportedChains().then(() => null, error => error);
    expect(failure).toBeInstanceOf(OkxApiError);
    expect(failure).toMatchObject({ kind: "network", message: "OKX request failed" });
    expect((failure as Error).message).not.toContain(privateText);
  }
});

test("tracks factory-created adapter identity without blessing copies, wrappers, or caller markers", async () => {
  const api = await import("./okx-api") as unknown as {
    isOkxReadOnlyClient?: (value: unknown) => boolean;
  };
  const isFactoryClient = api.isOkxReadOnlyClient;
  const factoryClient = clientWith(async () => jsonResponse([]));

  expect(typeof isFactoryClient).toBe("function");
  expect(isFactoryClient?.(factoryClient)).toBe(true);
  expect(isFactoryClient?.({ ...factoryClient })).toBe(false);
  expect(isFactoryClient?.(new Proxy(factoryClient, {}))).toBe(false);
  expect(isFactoryClient?.(Object.assign({ ...factoryClient }, {
    implementationProvenance: "okx_api_factory",
    source: "okx_authenticated",
  }))).toBe(false);
});
