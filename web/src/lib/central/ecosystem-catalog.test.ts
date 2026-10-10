import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CATALOG,
  CATALOG_FAMILIES,
  CATALOG_STATUSES,
  STATUS_LABEL,
  TIER_NEEDED_LABEL,
  TIER_NEEDED_VALUES,
  catalogCounts,
  filterCatalog,
  type CatalogItem,
} from "./ecosystem-catalog";

// Source: docs/research/R1-onchain-os-capacidades.md (table b), R2-carteira-permissoes-delegacao.md (sections b to d)
// and docs/ARQUITETURA-CENTRAL-DE-OPERACOES.md section 7. No item may ever be executing or enabled.

const researchDocs = ["R1-onchain-os-capacidades.md", "R2-carteira-permissoes-delegacao.md", "R3-estrategias-e-alavancagem.md"]
  .map((name) => readFileSync(resolve(import.meta.dir, "../../../../docs/research", name), "utf8"))
  .join("\n");

const byId = (id: string): CatalogItem => {
  const item = CATALOG.find((entry) => entry.id === id);
  if (!item) throw new Error(`catalog item not found: ${id}`);
  return item;
};

describe("statuses", () => {
  test("the allowed set is exactly implemented, read only, blocked and unconfirmed", () => {
    expect([...CATALOG_STATUSES]).toEqual(["implemented", "read_only", "blocked", "unconfirmed"]);
  });

  test("no item has a status outside the allowed set", () => {
    for (const item of CATALOG) expect(CATALOG_STATUSES as readonly string[]).toContain(item.status);
  });

  test("no item is, or can be, executing or enabled", () => {
    for (const item of CATALOG) {
      expect(["executing", "enabled", "active", "running", "live"]).not.toContain(item.status as string);
    }
    const labels = Object.values(STATUS_LABEL).join("|").toLowerCase();
    for (const forbidden of ["executando", "habilitado", "ativo", "em execucao", "em execução"]) expect(labels).not.toContain(forbidden);
  });

  test("labels are in pt-BR", () => {
    expect(STATUS_LABEL).toEqual({
      implemented: "Implementado",
      read_only: "Somente leitura",
      blocked: "Bloqueado",
      unconfirmed: "Não confirmado",
    });
  });
});

describe("structure", () => {
  test("ids are unique kebab case words", () => {
    const ids = CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  test("every item has a name, a family, a tier, a summary and a reference", () => {
    const families = CATALOG_FAMILIES.map((family) => family.id) as string[];
    for (const item of CATALOG) {
      expect(item.name.trim().length).toBeGreaterThan(3);
      expect(families).toContain(item.family);
      expect(TIER_NEEDED_VALUES as readonly string[]).toContain(item.tier);
      expect(item.summary.trim().length).toBeGreaterThan(10);
      expect(item.refs.trim().length).toBeGreaterThan(1);
    }
  });

  test("every family has at least one item", () => {
    for (const family of CATALOG_FAMILIES) expect(CATALOG.some((item) => item.family === family.id)).toBe(true);
  });

  test("tier labels exist for every tier value", () => {
    for (const tier of TIER_NEEDED_VALUES) expect(TIER_NEEDED_LABEL[tier].length).toBeGreaterThan(2);
  });

  test("covers the capability families of table (b) of R1 and the permission options of R2", () => {
    const required = [
      // R1 table (b)
      "dex-quote", "dex-swap-calldata", "trade-plans-limits", "cross-chain-bridge", "market-price-candles", "market-token-data",
      "market-realtime-channels", "market-plans-quota", "portfolio-balances", "portfolio-history-pnl", "gateway-gas",
      "gateway-simulate-broadcast", "defi-discovery", "defi-enter-exit-claim", "signals-leaderboard", "meme-pump", "social-sentiment",
      "alpha-radar", "security-scans", "agentic-wallet", "skills-cli", "mcp-servers", "payments-x402", "plugins-exchange-kit",
      "sdk-libraries", "chain-matrix", "api-auth-portal",
      // R2 permission options: Agentic Wallet, Trader Mode, Safe plus Roles or Allowance, ERC-4337 session, EIP-7702, ERC-7715,
      // dedicated agent wallet and human-signed T1
      "trader-mode", "safe-roles-allowance", "erc4337-session", "eip7702-delegated-eoa", "erc7715-erc7710", "dedicated-agent-wallet",
      "human-signed-t1",
    ];
    for (const id of required) expect(CATALOG.map((item) => item.id)).toContain(id);
  });
});

describe("honesty rules", () => {
  test("every item has a public source or an explicit reason why it has none", () => {
    for (const item of CATALOG) {
      if (item.sources.length > 0) {
        expect(item.noSourceReason ?? "").toBe("");
      } else {
        expect(item.noSourceReason ?? "").toMatch(/^sem fonte pública: .{15,}/);
      }
    }
    expect(CATALOG.some((item) => item.sources.length === 0)).toBe(true);
  });

  test("source URLs are https, unique per item and literally present in R1, R2 or R3", () => {
    for (const item of CATALOG) {
      expect(new Set(item.sources).size).toBe(item.sources.length);
      for (const url of item.sources) {
        expect(url).toMatch(/^https:\/\/[^\s"'<>]+$/);
        expect(researchDocs.includes(url)).toBe(true);
      }
    }
  });

  test("every item that is not implemented states what blocks it", () => {
    for (const item of CATALOG) {
      if (item.status === "implemented") continue;
      expect(item.blocker.trim().length).toBeGreaterThanOrEqual(30);
    }
  });

  test("implemented items need no permission beyond observing", () => {
    for (const item of CATALOG) if (item.status === "implemented") expect(item.tier).toBe("T0");
  });

  test("whatever needs a signature or a delegated executor is never implemented or read only", () => {
    for (const item of CATALOG) {
      if (["T1", "T2-A", "T2-B", "T2-C"].includes(item.tier)) {
        expect(["blocked", "unconfirmed"]).toContain(item.status);
      }
    }
  });

  test("T2 options are all blocked by the build gate", () => {
    for (const id of ["dedicated-agent-wallet", "safe-roles-allowance", "agentic-wallet"]) expect(byId(id).status).toBe("blocked");
    expect(byId("dedicated-agent-wallet").tier).toBe("T2-A");
    expect(byId("safe-roles-allowance").tier).toBe("T2-B");
    expect(byId("agentic-wallet").tier).toBe("T2-C");
    expect(byId("dedicated-agent-wallet").blocker).toContain("Market.init()");
  });

  test("human-signed T1 is viable but not enabled in this build, so it is listed as blocked", () => {
    const item = byId("human-signed-t1");
    expect(item.status).toBe("blocked");
    expect(item.tier).toBe("T1");
    expect(item.blocker).toContain("não habilitado");
  });

  test("the unit of the quote output is the known blocker of the DEX quote", () => {
    expect(byId("dex-quote").blocker).toContain("toTokenAmount");
    expect(byId("dex-quote").status).toBe("read_only");
  });

  test("the alpha radar has no public source and says so", () => {
    expect(byId("alpha-radar").sources).toEqual([]);
    expect(byId("alpha-radar").status).toBe("unconfirmed");
  });

  test("some items are implemented and they are all read only observers", () => {
    const implemented = CATALOG.filter((item) => item.status === "implemented").map((item) => item.id);
    expect(implemented).toContain("wallet-provider-evm");
    expect(implemented.length).toBeGreaterThanOrEqual(3);
  });
});

describe("filtering", () => {
  test("no filter returns everything in the original order", () => {
    expect(filterCatalog(CATALOG, { status: "all", family: "all" }).map((item) => item.id)).toEqual(CATALOG.map((item) => item.id));
  });

  test("filters by status", () => {
    for (const status of CATALOG_STATUSES) {
      const result = filterCatalog(CATALOG, { status, family: "all" });
      expect(result.length).toBeGreaterThan(0);
      for (const item of result) expect(item.status).toBe(status);
      expect(result.length).toBe(CATALOG.filter((item) => item.status === status).length);
    }
  });

  test("filters by family", () => {
    for (const family of CATALOG_FAMILIES) {
      const result = filterCatalog(CATALOG, { status: "all", family: family.id });
      expect(result.length).toBeGreaterThan(0);
      for (const item of result) expect(item.family).toBe(family.id);
    }
  });

  test("filters by status and family together and can return nothing", () => {
    const both = filterCatalog(CATALOG, { status: "blocked", family: "permissions" });
    expect(both.length).toBeGreaterThan(3);
    for (const item of both) {
      expect(item.status).toBe("blocked");
      expect(item.family).toBe("permissions");
    }
    expect(filterCatalog(CATALOG, { status: "implemented", family: "payments" })).toEqual([]);
  });

  test("counts add up to the catalog size", () => {
    const counts = catalogCounts(CATALOG);
    expect(counts.total).toBe(CATALOG.length);
    expect(counts.implemented + counts.read_only + counts.blocked + counts.unconfirmed).toBe(CATALOG.length);
  });

  test("the filter does not mutate the catalog", () => {
    const before = CATALOG.map((item) => item.id).join(",");
    filterCatalog(CATALOG, { status: "blocked", family: "all" });
    expect(CATALOG.map((item) => item.id).join(",")).toBe(before);
  });
});
