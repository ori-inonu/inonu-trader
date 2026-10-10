import { describe, expect, test } from "bun:test";
import { createOkxReadOnlyClient, OkxIdentityMismatchError } from "./okx-api";

const credentials = {
  apiKey: "test-api-key",
  secret: "test-secret",
  passphrase: "test-passphrase",
};
type FetchMock = (...args: Parameters<typeof globalThis.fetch>) => ReturnType<typeof globalThis.fetch>;

describe("createOkxReadOnlyClient", () => {
  test("discovers protocols with the fixed host and a signature over the exact GET path", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchMock: FetchMock = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        code: "0",
        data: [{ chainIndex: "501", chainName: "Solana", protocolList: [{ protocolId: "1", protocolName: "PUMP_FUN" }] }],
      }));
    };
    const client = createOkxReadOnlyClient({
      credentials,
      fetch: fetchMock,
      now: () => new Date("2026-10-09T12:00:00.000Z"),
    });

    const result = await client.protocols();

    expect(result).toEqual([{ chainIndex: "501", chainName: "Solana", protocolList: [{ protocolId: "1", protocolName: "PUMP_FUN" }] }]);
    expect(capturedUrl).toBe("https://web3.okx.com/api/v6/dex/market/memepump/supported/chainsProtocol");
    expect(capturedInit?.redirect).toBe("error");
    expect((capturedInit?.headers as Record<string, string>)["OK-ACCESS-TIMESTAMP"]).toBe("2026-10-09T12:00:00.000Z");
    expect((capturedInit?.headers as Record<string, string>)["OK-ACCESS-SIGN"]).toBe("N87iGpscxUjBm8jur0x4PUjP/dh8rTS5hBuJUW5dPAQ=");
  });

  test("requires an explicit stage and applies the local limit without sending pagination or wallet data", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const fetchMock: FetchMock = async (input, init) => {
      requests.push({ url: String(input), init });
      const data = requests.length === 1
        ? [{ chainIndex: "501", chainName: "Solana", protocolList: [{ protocolId: "1", protocolName: "PUMP_FUN" }] }]
        : {
            cursor: "next-page-secret-like-value",
            items: [
              { chainIndex: "501", tokenContractAddress: "TokenA" },
              { chainIndex: "501", tokenContractAddress: "TokenB" },
              { chainIndex: "501", tokenContractAddress: "TokenC" },
            ],
          };
      return new Response(JSON.stringify({ code: "0", data }));
    };
    const client = createOkxReadOnlyClient({ credentials, fetch: fetchMock });

    await client.protocols();
    const result = await client.listMemePump({ chainIndex: "501", stage: "NEW", protocolIdList: ["1"], limit: 2 });

    expect(requests[1]?.url).toBe("https://web3.okx.com/api/v6/dex/market/memepump/tokenList?chainIndex=501&stage=NEW&protocolIdList=1");
    expect(result).toEqual({
      cursor: "next-page-secret-like-value",
      items: [
        { chainIndex: "501", tokenContractAddress: "TokenA" },
        { chainIndex: "501", tokenContractAddress: "TokenB" },
      ],
    });
  });

  test("a fresh protocol discovery removes prior chain coverage before the next list request", async () => {
    let calls = 0;
    const client = createOkxReadOnlyClient({
      credentials,
      fetch: async () => {
        calls += 1;
        const data = calls === 1
          ? [{ chainIndex: "501", chainName: "Solana", protocolList: [{ protocolId: "1", protocolName: "PUMP_FUN" }] }]
          : [{ chainIndex: "1", chainName: "Ethereum", protocolList: [{ protocolId: "2", protocolName: "DEX" }] }];
        return new Response(JSON.stringify({ code: "0", data }));
      },
    });

    await client.protocols();
    await client.protocols();
    await expect(client.listMemePump({
      chainIndex: "501",
      stage: "NEW",
      protocolIdList: ["1"],
      limit: 1,
    })).rejects.toThrow("protocolIdList must match protocols discovered for chainIndex.");
    expect(calls).toBe(2);
  });

  test("validates positive numeric chain indexes for meme-pump listings before fetch", async () => {
    let calls = 0;
    const client = createOkxReadOnlyClient({
      credentials,
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({ code: "0", data: { cursor: null, items: [] } }));
      },
    });
    const invalidChainIndexes = ["not-a-chain", "", " 1", "1\n", "0", "-1", "01"];
    const outcomes: string[] = [];

    for (const chainIndex of invalidChainIndexes) {
      try {
        await client.listMemePump({ chainIndex, stage: "NEW", limit: 1 });
        outcomes.push("resolved");
      } catch (error) {
        outcomes.push(error instanceof Error ? error.message : "rejected");
      }
    }

    expect(calls).toBe(0);
    expect(outcomes).toEqual(invalidChainIndexes.map(() => "Invalid chainIndex."));
  });

  test("uses the positive numeric chain contract for all identity-based methods before fetch", async () => {
    let calls = 0;
    const client = createOkxReadOnlyClient({
      credentials,
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({ code: "0", data: [] }));
      },
    });
    const invalidChainIndexes = ["0", "-1", "01", "not-a-chain", " 1", "1\n"];
    const outcomes: string[] = [];

    for (const chainIndex of invalidChainIndexes) {
      const identity = { chainIndex, tokenContractAddress: "anything" };
      const methods = [
        () => client.prices([identity]),
        () => client.advanced(identity),
        () => client.pools(identity),
      ];
      for (const method of methods) {
        try {
          await method();
          outcomes.push("resolved");
        } catch (error) {
          outcomes.push(error instanceof Error ? error.message : "rejected");
        }
      }
    }

    expect(calls).toBe(0);
    expect(outcomes).toEqual(invalidChainIndexes.flatMap(() => Array(3).fill("Invalid token identity.")));
  });

  test("prices send at most 30 identities with EVM lowercase and Solana case preserved", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchMock: FetchMock = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ code: "0", data: [{ chainIndex: "1", tokenContractAddress: "0xabcdef", price: "2.5" }] }));
    };
    const client = createOkxReadOnlyClient({
      credentials,
      fetch: fetchMock,
      now: () => new Date("2026-10-09T12:00:00.000Z"),
    });

    const result = await client.prices([
      { chainIndex: "1", tokenContractAddress: "0xAbCDef" },
      { chainIndex: "501", tokenContractAddress: "AbCDeF" },
    ]);

    expect(capturedUrl).toBe("https://web3.okx.com/api/v6/dex/market/price-info");
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.body).toBe('[{"chainIndex":"1","tokenContractAddress":"0xabcdef"},{"chainIndex":"501","tokenContractAddress":"AbCDeF"}]');
    expect((capturedInit?.headers as Record<string, string>)["OK-ACCESS-SIGN"]).toBe("d3o5MSpp1AICsGJ41b8Sah88fu4ZIy3tMb4q2Pd/z9Q=");
    expect(result).toEqual([{ chainIndex: "1", tokenContractAddress: "0xabcdef", price: "2.5" }]);

    const mismatchedClient = createOkxReadOnlyClient({
      credentials,
      fetch: async () => new Response(JSON.stringify({
        code: "0",
        data: [{ chainIndex: "1", tokenContractAddress: "0xnot-requested", price: "2.5" }],
      })),
    });
    const mismatch = await mismatchedClient.prices([
      { chainIndex: "1", tokenContractAddress: "0xabcdef" },
    ]).then(() => null, (error: unknown) => error);
    expect(mismatch).toBeInstanceOf(OkxIdentityMismatchError);
    if (mismatch instanceof OkxIdentityMismatchError) {
      expect(mismatch.endpoint).toBe("prices");
      expect(mismatch.message).toBe("OKX API returned an identity mismatch.");
      expect(mismatch.message).not.toContain("0xnot-requested");
      expect(mismatch.message).not.toContain("test-secret");
    }

    const malformedClient = createOkxReadOnlyClient({
      credentials,
      fetch: async () => new Response(JSON.stringify({
        code: "0",
        data: [{ tokenContractAddress: "0xabcdef", price: "2.5" }],
      })),
    });
    await expect(malformedClient.prices([
      { chainIndex: "1", tokenContractAddress: "0xabcdef" },
    ])).rejects.toThrow("OKX API returned an unexpected response schema.");

    const solanaCaseClient = createOkxReadOnlyClient({
      credentials,
      fetch: async () => new Response(JSON.stringify({
        code: "0",
        data: [{ chainIndex: "501", tokenContractAddress: "tokena", price: "2.5" }],
      })),
    });
    const solanaCaseMismatch = await solanaCaseClient.prices([
      { chainIndex: "501", tokenContractAddress: "TokenA" },
    ]).then(() => null, (error: unknown) => error);
    expect(solanaCaseMismatch).toBeInstanceOf(OkxIdentityMismatchError);
    if (solanaCaseMismatch instanceof OkxIdentityMismatchError) {
      expect(solanaCaseMismatch.endpoint).toBe("prices");
    }
  });

  test("rejects invalid chain and token address text before fetch without imposing address format", async () => {
    let calls = 0;
    const client = createOkxReadOnlyClient({
      credentials,
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({ code: "0", data: [] }));
      },
    });
    const invalidIdentities = [
      { chainIndex: "eip155:1", tokenContractAddress: "0xabc" },
      { chainIndex: "1", tokenContractAddress: "0xab c" },
      { chainIndex: "1", tokenContractAddress: "0xabc,0xdef" },
      { chainIndex: "1", tokenContractAddress: "0xabc\r\ndef" },
      { chainIndex: 1, tokenContractAddress: "0xabc" },
    ] as unknown[];

    for (const identity of invalidIdentities) {
      await expect(client.prices([identity as { chainIndex: string; tokenContractAddress: string }])).rejects.toThrow(
        "Invalid token identity.",
      );
    }
    expect(calls).toBe(0);
  });

  test("advanced and pool lookups use the fixed paths and sign the exact identity query", async () => {
    const urls: string[] = [];
    const signatures: string[] = [];
    const fetchMock: FetchMock = async (input, init) => {
      urls.push(String(input));
      signatures.push(((init?.headers as Record<string, string>) ?? {})["OK-ACCESS-SIGN"] ?? "");
      const data = urls.length === 1
        ? { chainIndex: "1", tokenContractAddress: "0xabcdef", observedField: "kept as supplied", totalFee: "" }
        : [{
            liquidityAmount: [
              { tokenContractAddress: "0xabcdef", tokenAmount: "10", tokenSymbol: "TOK" },
              { tokenContractAddress: "0xquote", tokenAmount: "5", tokenSymbol: "Q" },
            ],
            liquidityProviderFeePercent: "",
          }];
      return new Response(JSON.stringify({ code: "0", data }));
    };
    const client = createOkxReadOnlyClient({
      credentials,
      fetch: fetchMock,
      now: () => new Date("2026-10-09T12:00:00.000Z"),
    });
    const identity = { chainIndex: "1", tokenContractAddress: "0xAbCDef" };

    const advanced = await client.advanced(identity);
    const pools = await client.pools(identity);

    expect(urls).toEqual([
      "https://web3.okx.com/api/v6/dex/market/token/advanced-info?chainIndex=1&tokenContractAddress=0xabcdef",
      "https://web3.okx.com/api/v6/dex/market/token/top-liquidity?chainIndex=1&tokenContractAddress=0xabcdef",
    ]);
    expect(signatures[0]).toBe("NHYCekV67lXLjQpfzhGbWsQyG6BMxwhfSIlJJb/QNmQ=");
    expect(signatures[1]).toBe("/R2KyXrqj/UMHTHlRZiy57/5ycWkZxCti+pv9bZtzSg=");
    expect(advanced).toEqual([{ chainIndex: "1", tokenContractAddress: "0xabcdef", observedField: "kept as supplied", totalFee: "" }]);
    expect(pools).toEqual([{
      liquidityAmount: [
        { tokenContractAddress: "0xabcdef", tokenAmount: "10", tokenSymbol: "TOK" },
        { tokenContractAddress: "0xquote", tokenAmount: "5", tokenSymbol: "Q" },
      ],
      liquidityProviderFeePercent: "",
    }]);
  });

  test("rejects top-liquidity records that do not contain the requested token", async () => {
    let calls = 0;
    const client = createOkxReadOnlyClient({
      credentials,
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({
          code: "0",
          data: [{ liquidityAmount: [{ tokenContractAddress: "0xother" }] }],
        }));
      },
    });

    const mismatch = await client.pools({ chainIndex: "1", tokenContractAddress: "0xABCDEF" })
      .then(() => null, (error: unknown) => error);
    expect(mismatch).toBeInstanceOf(OkxIdentityMismatchError);
    if (mismatch instanceof OkxIdentityMismatchError) {
      expect(mismatch.endpoint).toBe("pools");
      expect(mismatch.message).toBe("OKX API returned an identity mismatch.");
      expect(mismatch.message).not.toContain("0xother");
      expect(mismatch.message).not.toContain("test-secret");
    }
    expect(calls).toBe(1);
  });

  test("treats advanced-info data as one object and rejects an array", async () => {
    let data: unknown = [{ riskControlLevel: "2" }];
    const client = createOkxReadOnlyClient({
      credentials,
      fetch: async () => new Response(JSON.stringify({ code: "0", data })),
    });

    await expect(client.advanced({ chainIndex: "501", tokenContractAddress: "SoL" })).rejects.toThrow(
      "OKX API returned an unexpected response schema.",
    );
    data = { riskControlLevel: "2" };
    await expect(client.advanced({ chainIndex: "501", tokenContractAddress: "SoL" })).rejects.toThrow(
      "OKX API returned an unexpected response schema.",
    );
    data = { chainIndex: "501", tokenContractAddress: "SoL", riskControlLevel: "2" };
    expect(await client.advanced({ chainIndex: "501", tokenContractAddress: "SoL" })).toEqual([
      { chainIndex: "501", tokenContractAddress: "SoL", riskControlLevel: "2" },
    ]);
  });

  test("advanced lookups distinguish valid identity mismatches and preserve Solana case", async () => {
    const evmClient = createOkxReadOnlyClient({
      credentials,
      fetch: async () => new Response(JSON.stringify({
        code: "0",
        data: { chainIndex: "1", tokenContractAddress: "0xother", providerDetail: "private remote detail" },
      })),
    });
    const evmMismatch = await evmClient.advanced({ chainIndex: "1", tokenContractAddress: "0xrequested" })
      .then(() => null, (error: unknown) => error);
    expect(evmMismatch).toBeInstanceOf(OkxIdentityMismatchError);
    if (evmMismatch instanceof OkxIdentityMismatchError) {
      expect(evmMismatch.endpoint).toBe("advanced");
      expect(evmMismatch.message).toBe("OKX API returned an identity mismatch.");
      expect(evmMismatch.message).not.toContain("0xother");
      expect(evmMismatch.message).not.toContain("private remote detail");
      expect(evmMismatch.message).not.toContain("test-secret");
    }

    const solanaCaseClient = createOkxReadOnlyClient({
      credentials,
      fetch: async () => new Response(JSON.stringify({
        code: "0",
        data: { chainIndex: "501", tokenContractAddress: "sol", riskControlLevel: "1" },
      })),
    });
    const solanaMismatch = await solanaCaseClient.advanced({ chainIndex: "501", tokenContractAddress: "SoL" })
      .then(() => null, (error: unknown) => error);
    expect(solanaMismatch).toBeInstanceOf(OkxIdentityMismatchError);
    if (solanaMismatch instanceof OkxIdentityMismatchError) {
      expect(solanaMismatch.endpoint).toBe("advanced");
    }
  });

  test("pools reject malformed identity-bearing asset entries as schema errors", async () => {
    const client = createOkxReadOnlyClient({
      credentials,
      fetch: async () => new Response(JSON.stringify({
        code: "0",
        data: [{ liquidityAmount: [{ tokenAmount: "10" }] }],
      })),
    });

    await expect(client.pools({ chainIndex: "1", tokenContractAddress: "0xrequested" })).rejects.toThrow(
      "OKX API returned an unexpected response schema.",
    );
  });

  test("Solana pool assets match case-sensitively while EVM asset casing is normalized", async () => {
    const evmClient = createOkxReadOnlyClient({
      credentials,
      fetch: async () => new Response(JSON.stringify({
        code: "0",
        data: [{ liquidityAmount: [{ tokenContractAddress: "0xAbCdEf" }] }],
      })),
    });
    await expect(evmClient.pools({ chainIndex: "1", tokenContractAddress: "0xabcdef" })).resolves.toEqual([
      { liquidityAmount: [{ tokenContractAddress: "0xAbCdEf" }] },
    ]);

    const solanaClient = createOkxReadOnlyClient({
      credentials,
      fetch: async () => new Response(JSON.stringify({
        code: "0",
        data: [{ liquidityAmount: [{ tokenContractAddress: "tokena" }] }],
      })),
    });
    const mismatch = await solanaClient.pools({ chainIndex: "501", tokenContractAddress: "TokenA" })
      .then(() => null, (error: unknown) => error);
    expect(mismatch).toBeInstanceOf(OkxIdentityMismatchError);
    if (mismatch instanceof OkxIdentityMismatchError) expect(mismatch.endpoint).toBe("pools");
  });

  test("validates local limits before fetch and redacts HTTP, API, and transport failures", async () => {
    let calls = 0;
    const client = createOkxReadOnlyClient({
      credentials,
      fetch: async () => {
        calls += 1;
        return new Response("private response body", { status: 429 });
      },
    });

    const tooManyIdentities = Array.from({ length: 31 }, (_, index) => ({
      chainIndex: "1",
      tokenContractAddress: `0x${index}`,
    }));
    await expect(client.listMemePump({ chainIndex: "501", stage: "NEW", limit: 31 })).rejects.toThrow(
      "Invalid limit; expected an integer from 1 to 30.",
    );
    await expect(client.prices(tooManyIdentities)).rejects.toThrow(
      "Invalid identities; expected an array with 1 to 30 tokens.",
    );
    expect(calls).toBe(0);
    let httpMessage = "";
    try {
      await client.protocols();
    } catch (error) {
      httpMessage = error instanceof Error ? error.message : "";
    }
    expect(httpMessage).toBe("OKX request failed with HTTP 429.");
    expect(httpMessage).not.toContain("private response body");
    expect(httpMessage).not.toContain("https://web3.okx.com");
    expect(calls).toBe(1);

    const apiError = createOkxReadOnlyClient({
      credentials,
      fetch: async () => new Response(JSON.stringify({ code: "50001", msg: "private api detail", data: [] })),
    });
    let apiMessage = "";
    try {
      await apiError.protocols();
    } catch (error) {
      apiMessage = error instanceof Error ? error.message : "";
    }
    expect(apiMessage).toBe("OKX API returned a non-zero response code.");
    expect(apiMessage).not.toContain("private api detail");

    const transportError = createOkxReadOnlyClient({
      credentials,
      fetch: async () => { throw new Error("private transport detail"); },
    });
    let transportMessage = "";
    try {
      await transportError.protocols();
    } catch (error) {
      transportMessage = error instanceof Error ? error.message : "";
    }
    expect(transportMessage).toBe("OKX request failed.");
    expect(transportMessage).not.toContain("private transport detail");
  });

  test("aborts a hung request after the finite timeout without retrying", async () => {
    let calls = 0;
    const client = createOkxReadOnlyClient({
      credentials,
      timeoutMs: 5,
      fetch: async (_input, init) => {
        calls += 1;
        return new Promise((resolve) => {
          init?.signal?.addEventListener("abort", () => resolve(new Response("late")), { once: true });
        });
      },
    });

    await expect(client.protocols()).rejects.toThrow("OKX request timed out.");
    expect(calls).toBe(1);
  });

  test("times out a pending response body after fetch resolves without retrying or exposing body errors", async () => {
    let calls = 0;
    let requestSignal: AbortSignal | undefined;
    const client = createOkxReadOnlyClient({
      credentials,
      timeoutMs: 5,
      fetch: async (_input, init) => {
        calls += 1;
        requestSignal = init?.signal as AbortSignal | undefined;
        return {
          ok: true,
          status: 200,
          json: () => new Promise<unknown>(() => {}),
        } as Response;
      },
    });

    const requestResult = client.protocols().then(
      () => "resolved",
      (error: unknown) => error instanceof Error ? error.message : "rejected",
    );
    const message = await Promise.race([
      requestResult,
      new Promise<string>((resolve) => setTimeout(() => resolve("still pending"), 50)),
    ]);
    expect(message).toBe("OKX request timed out.");
    expect(message).not.toContain("body");
    expect(requestSignal?.aborted).toBe(true);
    expect(calls).toBe(1);
  });
});
