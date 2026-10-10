import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CATALOG } from "./ecosystem-catalog";
import { KURU_ALLOWLIST, NOT_VIABLE_TODAY, TIERS, TIER_STATE_LABEL, tierById } from "./permission-tiers";

// Source: docs/ARQUITETURA-CENTRAL-DE-OPERACOES.md section 4 (decision D5) and R2 section (e).
const architecture = readFileSync(resolve(import.meta.dir, "../../../../docs/ARQUITETURA-CENTRAL-DE-OPERACOES.md"), "utf8");

describe("permission tiers", () => {
  test("lists T0, T1, T2-A, T2-B and T2-C in order", () => {
    expect(TIERS.map((tier) => tier.id)).toEqual(["T0", "T1", "T2-A", "T2-B", "T2-C"]);
  });

  test("T0 is the only active tier; T1 is viable but not enabled; every T2 is blocked by the build gate", () => {
    expect(tierById("T0").state).toBe("active");
    expect(tierById("T1").state).toBe("viable_not_enabled");
    for (const id of ["T2-A", "T2-B", "T2-C"] as const) expect(tierById(id).state).toBe("blocked");
    expect(TIERS.filter((tier) => tier.state === "active")).toHaveLength(1);
  });

  test("no tier can be reported as enabled or executing", () => {
    const allowed = ["active", "viable_not_enabled", "blocked"];
    for (const tier of TIERS) {
      expect(allowed).toContain(tier.state);
      expect(JSON.stringify(tier).toLowerCase()).not.toContain('"state":"enabled"');
    }
    expect(Object.keys(TIER_STATE_LABEL).sort()).toEqual([...allowed].sort());
    expect(TIER_STATE_LABEL.viable_not_enabled).toBe("Viável, mas não habilitado neste build");
    expect(TIER_STATE_LABEL.blocked).toBe("Bloqueado pelo gate do build");
    expect(TIER_STATE_LABEL.active).toBe("Ativo");
  });

  test("every tier says what it allows, its real limit and its condition", () => {
    for (const tier of TIERS) {
      for (const text of [tier.name, tier.summary, tier.allows, tier.realLimit, tier.condition, tier.source]) {
        expect(text.trim().length).toBeGreaterThan(8);
      }
    }
  });

  test("every tier that is not active lists the blockers from the architecture document", () => {
    for (const tier of TIERS) {
      if (tier.state === "active") {
        expect(tier.blockers).toEqual([]);
      } else {
        expect(tier.blockers.length).toBeGreaterThanOrEqual(1);
        for (const blocker of tier.blockers) expect(blocker.trim().length).toBeGreaterThan(20);
      }
    }
    expect(tierById("T1").blockers.join(" ")).toContain("300 ms");
    expect(tierById("T2-A").blockers.join(" ")).toContain("Market.init()");
    expect(tierById("T2-B").blockers.join(" ")).toContain("X Layer");
    expect(tierById("T2-B").blockers.join(" ")).toContain("Roles");
    expect(tierById("T2-C").blockers.join(" ")).toContain("seletor");
  });

  test("T0 says the panel package must not hold signing or sending calls", () => {
    expect(tierById("T0").condition).toContain("assinatura ou envio");
    expect(tierById("T0").realLimit).toBe("Não opera.");
  });

  test("the key facts are literally the ones written in the architecture document", () => {
    expect(architecture).toContain("Não opera.");
    expect(architecture).toContain("Bloqueada por código (`Market.init()`)");
    expect(architecture).toContain("não sustenta \"ordem a cada bloco\"");
    expect(architecture).toContain("A X Layer não tem Allowance Module nem Roles oficial.");
  });
});

describe("not viable today", () => {
  test("lists ERC-4337 sessions, EIP-7702, ERC-7715 and ERC-7710, and Trader Mode on the main account", () => {
    const text = NOT_VIABLE_TODAY.map((entry) => `${entry.name} ${entry.reason}`).join("\n");
    expect(NOT_VIABLE_TODAY).toHaveLength(4);
    expect(text).toContain("ERC-4337");
    expect(text).toContain("EIP-7702");
    expect(text).toContain("ERC-7715");
    expect(text).toContain("ERC-7710");
    expect(text).toContain("Trader Mode");
  });
});

describe("Kuru allowlist foreseen for a future T2", () => {
  test("is the market with batchUpdate and batchCancelOrders, withdraw and deposit denied", () => {
    expect(KURU_ALLOWLIST.market).toBe("0x065C9d28E428A0db40191a54d33d5b7c71a9C394");
    expect(KURU_ALLOWLIST.allowed).toEqual([
      { name: "batchUpdate", selector: "0x5339c59f" },
      { name: "batchCancelOrders", selector: "0x23afbff3" },
    ]);
    expect(KURU_ALLOWLIST.denied.length).toBeGreaterThanOrEqual(2);
    for (const value of [KURU_ALLOWLIST.market, "0x5339c59f", "0x23afbff3"]) expect(architecture).toContain(value);
  });

  test("is described as not implemented", () => {
    expect(KURU_ALLOWLIST.note).toContain("não implementada");
  });
});

describe("consistency with the ecosystem catalog", () => {
  test("every catalog item that needs a T2 tier is blocked", () => {
    for (const item of CATALOG) {
      if (item.tier.startsWith("T2")) expect(item.status).toBe("blocked");
    }
  });
});
