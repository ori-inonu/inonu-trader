/**
 * The list of networks with their logos (inonu-desktop-v1 CHN-1, ICO-2, T3.5). origin: shape_of_real_probe_2026-10-12 with synthetic values: the keys are the
 * ones the provider answered (`name`, `logoUrl`, `shortName`, `chainIndex`); the names and URLs here are made up.
 */
import { describe, expect, test } from "bun:test";
import { endpointFor } from "../catalog";
import { allowedLogoUrl, CHAIN_LIST_ENDPOINTS, LOGO_HOSTS } from "./chain-list";

const ep = CHAIN_LIST_ENDPOINTS[0]!;
const row = (over: Record<string, unknown> = {}) => ({ name: "Ethereum", logoUrl: "https://static.coinall.ltd/cdn/wallet/logo/eth.png", shortName: "eth", chainIndex: "1", ...over });
const rows = (n: ReturnType<typeof ep.normalize>) => {
  if (!n.ok) throw new Error("refused");
  return n.data as Array<{ chainIndex: string; name: string; symbol: string | null; logoUrl: string | null }>;
};

describe("the route", () => {
  test("it is in the catalog, free, valid for a day, and takes no parameter", () => {
    expect(endpointFor("/onchain/networks")).toBe(ep);
    expect(ep.tier).toBe("free");
    const v = ep.validate({});
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.request).toEqual({ method: "GET", path: "/api/v6/dex/balance/supported/chain" });
      expect(v.ttlMs).toBe(24 * 3_600_000);
    }
    expect(ep.validate({ chainIndex: "1" }).ok).toBe(false);
  });
});

describe("the networks", () => {
  test("every row keeps its index, name, short name and an allowed logo", () => {
    expect(rows(ep.normalize([row(), row({ name: "Solana", shortName: "sol", chainIndex: "501", logoUrl: "https://static.okx.com/cdn/x/sol.png" })]))).toEqual([
      { chainIndex: "1", name: "Ethereum", symbol: "eth", logoUrl: "https://static.coinall.ltd/cdn/wallet/logo/eth.png" },
      { chainIndex: "501", name: "Solana", symbol: "sol", logoUrl: "https://static.okx.com/cdn/x/sol.png" },
    ]);
  });

  test("the other spellings of the provider's lists are read too", () => {
    expect(rows(ep.normalize([{ chainIndex: "196", chainName: "X Layer", chainSymbol: "OKB", chainLogo: "https://static.okx.com/a.png" }]))).toEqual([
      { chainIndex: "196", name: "X Layer", symbol: "OKB", logoUrl: "https://static.okx.com/a.png" },
    ]);
  });

  test("a row without a numeric index or a name is dropped, a repeated index is kept once, the others stay", () => {
    const out = rows(ep.normalize([row(), row({ chainIndex: "x" }), row({ chainIndex: "2", name: "" }), row({ name: "Again" }), "text", null, row({ chainIndex: "56", name: "BNB Chain" })]));
    expect(out.map((r) => r.chainIndex)).toEqual(["1", "56"]);
    expect(out[0]!.name).toBe("Ethereum");
  });

  test("a logo on any host that is not the provider's own, or not https, or with credentials or a port, is dropped to null, the row stays", () => {
    const bad = [
      "http://static.okx.com/a.png", "https://evil.example/a.png", "https://static.okx.com.evil.example/a.png", "https://user:pw@static.okx.com/a.png", "https://static.okx.com:8443/a.png",
      "//static.okx.com/a.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "not a url", "", 5, null, "https://static.okx.com/" + "a".repeat(400),
    ];
    for (const logoUrl of bad) expect(rows(ep.normalize([row({ logoUrl })]))[0]!.logoUrl).toBeNull();
    expect(rows(ep.normalize([row({ logoUrl: "https://static.okx.com/a.png" })]))[0]!.logoUrl).toBe("https://static.okx.com/a.png");
  });

  test("the allowed hosts are exactly the three the provider uses", () => {
    expect([...LOGO_HOSTS].sort()).toEqual(["static.coinall.ltd", "static.oklink.com", "static.okx.com"]);
    expect(allowedLogoUrl("https://static.oklink.com/a/b.webp")).toBe("https://static.oklink.com/a/b.webp");
  });

  test("text of the provider is cleaned: control and direction characters out, dashes normalized, truncated", () => {
    const out = rows(ep.normalize([row({ name: "A\u202eB\u2014C\u00b7D\n" + "x".repeat(60) })]));
    expect(out[0]!.name.startsWith("AB-C Dxx")).toBe(true);
    expect(out[0]!.name.length).toBeLessThanOrEqual(40);
  });

  test("no networks is an empty list, a payload that is not a list is a contract error", () => {
    expect(rows(ep.normalize([]))).toEqual([]);
    expect(rows(ep.normalize(null))).toEqual([]);
    expect(ep.normalize({ nope: 1 }).ok).toBe(false);
    expect(ep.normalize("x").ok).toBe(false);
  });
});
