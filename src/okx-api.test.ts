import { expect, test } from "bun:test";
import { createOkxReadOnlyClient, type OkxApiRequest, type OkxFetch, type OkxFetchInit, type TokenIdentity } from "./okx-api";

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
  expect(request.url).toBe("https://web3.okx.com/api/v6/dex/market/memepump/tokenList?chainIndex=501&stage=NEW");
  expect(request.method).toBe("GET");
  expect(request.body).toBe("");
  expect(request.headers.get("OK-ACCESS-TIMESTAMP")).toBe("2026-10-09T20:00:00.000Z");
  expect(request.headers.get("OK-ACCESS-KEY")).toBe(credentials.apiKey);
  expect(request.headers.get("OK-ACCESS-PASSPHRASE")).toBe(credentials.passphrase);
  expect(request.headers.get("OK-ACCESS-SIGN")).toBe("rAcYrbJIz0vg9xd3Hl0vWV45EHUa+Ze48FVNzZAqhNY=");
  expect(request.url).not.toContain(credentials.secretKey);
  expect(calls[0]!.init.redirect).toBe("error");
  expect(calls[0]!.init.credentials).toBe("omit");
  expect(calls[0]!.init.cache).toBe("no-store");
});

test("keeps the Meme Pump limit local and slices an oversized fake transport response", async () => {
  const items = [
    { chainIndex: token.chainIndex, tokenContractAddress: token.tokenContractAddress },
    { chainIndex: token.chainIndex, tokenContractAddress: "AnotherToken" },
  ];
  const { fetcher, calls } = captureFetch(jsonResponse({ items, cursor: "next-page" }));

  const result = await clientWith(fetcher).getMemePumpTokenList({
    chainIndex: token.chainIndex,
    stage: "NEW",
    limit: 1,
  });

  expect(recordRequest(calls[0]!).url).toBe(
    "https://web3.okx.com/api/v6/dex/market/memepump/tokenList?chainIndex=501&stage=NEW",
  );
  expect(result.items.map(({ tokenContractAddress }) => tokenContractAddress)).toEqual([token.tokenContractAddress]);
  expect(result.cursor).toBe("next-page");
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
    "/api/v6/dex/market/memepump/tokenList?chainIndex=501&stage=MIGRATED",
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
