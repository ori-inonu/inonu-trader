// DAT-2, AC-DAT-1, T10.3: every view of the dock tells where its data comes from and how old it is, and a stale reading is never worded
// as live. The on-chain views carry that line in their own head (OnchainHead), the Fluxo tab in its "Leitura" row, the wallet and
// the Inonu tab in their own headings; this module is for the views that had none: the zones and the raw OKX market.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { DOCK_SUBVIEWS } from "./dock-subviews";
import { SELF_LABELLED_VIEWS, viewSource, type ViewSourceInput } from "./view-source";

const NOW = 1_800_000_000_000;
const base: ViewSourceInput = { view: "fita", onchain: false, feedAgeMs: 800, engine: null, nowMs: NOW, stale: false };
const engine = (over: Partial<NonNullable<ViewSourceInput["engine"]>> = {}) => ({ asOfMs: NOW - 3_000, fonte: "okx_ws_trades" as const, ...over });

describe("the raw OKX market views (fita, livro, liquidez)", () => {
  test("they name the origin and the age of the last message of the real time feed", () => {
    for (const view of ["fita", "livro", "liquidez"] as const) {
      expect(viewSource({ ...base, view })).toBe("OKX tempo real, agora");
      expect(viewSource({ ...base, view, feedAgeMs: 12_000 })).toBe("OKX tempo real, ha 12 s");
      expect(viewSource({ ...base, view, feedAgeMs: 4 * 60_000 })).toBe("OKX tempo real, ha 4 min");
    }
  });

  test("a feed that never spoke is told so, never as live", () => {
    expect(viewSource({ ...base, feedAgeMs: null })).toBe("OKX tempo real, sem mensagem ainda");
    expect(viewSource({ ...base, feedAgeMs: undefined })).toBe("OKX tempo real, sem mensagem ainda");
  });

  test("a stale feed says dado velho and its age, and never reads as live", () => {
    const text = viewSource({ ...base, stale: true, feedAgeMs: 45_000 })!;
    expect(text).toBe("OKX tempo real, dado velho, ha 45 s");
    expect(text.toLowerCase()).not.toContain("ao vivo");
  });

  test("with an on-chain token in focus the shared views switch surface and carry their own head, so this line is absent", () => {
    for (const view of ["fita", "liquidez"] as const) expect(viewSource({ ...base, view, onchain: true })).toBeNull();
  });

  test("the book keeps following the last OKX instrument, so it keeps its line even with an on-chain focus", () => {
    expect(viewSource({ ...base, view: "livro", onchain: true })).toBe("OKX tempo real, agora");
  });
});

describe("the zones", () => {
  test("they name the engine source and the age of the reading", () => {
    expect(viewSource({ ...base, view: "zonas", engine: engine() })).toBe("OKX trades ao vivo, agora");
    expect(viewSource({ ...base, view: "zonas", engine: engine({ asOfMs: NOW - 25_000 }) })).toBe("OKX trades ao vivo, ha 25 s");
    expect(viewSource({ ...base, view: "zonas", engine: engine({ fonte: "okx_public_v5" }) })).toBe("OKX por consulta, sem ao vivo, agora");
  });

  test("a reading that went stale is not worded as live", () => {
    const text = viewSource({ ...base, view: "zonas", stale: true, engine: engine({ asOfMs: NOW - 3 * 60_000 }) })!;
    expect(text).toBe("OKX trades, dado velho, ha 3 min");
    expect(text.toLowerCase()).not.toContain("ao vivo");
  });

  test("with no reading there is no line: the empty state already says why", () => {
    expect(viewSource({ ...base, view: "zonas", engine: null })).toBeNull();
  });
});

describe("every view of the dock is accounted for", () => {
  test("each view of Radar and Mercado bruto either has a line here or is declared as carrying its own label", () => {
    const withLine = new Set(["zonas", "fita", "livro", "liquidez"]);
    const all = [...DOCK_SUBVIEWS.radar, ...DOCK_SUBVIEWS.mercado].map((v) => v.id);
    for (const id of all) expect(withLine.has(id) || SELF_LABELLED_VIEWS.includes(id)).toBe(true);
    // nothing is declared self labelled that also has a line, and nothing declared that does not exist
    for (const id of SELF_LABELLED_VIEWS) {
      expect(withLine.has(id)).toBe(false);
      expect(all.includes(id) || ["diario", "fluxo", "carteira"].includes(id)).toBe(true);
    }
  });

  test("the whole text uses no middle dot, dash, accent or order word", () => {
    const text = [
      viewSource({ ...base }),
      viewSource({ ...base, feedAgeMs: null }),
      viewSource({ ...base, stale: true }),
      viewSource({ ...base, view: "zonas", engine: engine() }),
      viewSource({ ...base, view: "zonas", engine: engine({ fonte: "okx_public_v5" }) }),
    ].join(" ");
    expect(text).not.toMatch(/[·—–]/);
    expect(text).toBe(text.normalize("NFD").replace(/[̀-ͯ]/g, ""));
    for (const word of ["comprar", "vender", "venda", "buy", "sell", "signal", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(text)).toBe(false);
  });
});
