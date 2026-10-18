import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { TERMS, annotate, explain, type Segment } from "./terms";

const join2 = (segments: readonly Segment[]): string => segments.map((s) => (typeof s === "string" ? s : s.term)).join("");

describe("the glossary entries (UX-2)", () => {
  test("every entry has an id, aliases and a short plain sentence, and no id or alias repeats", () => {
    const ids = new Set<string>();
    const aliases = new Set<string>();
    for (const t of TERMS) {
      expect(ids.has(t.id), t.id).toBe(false);
      ids.add(t.id);
      expect(t.aliases.length).toBeGreaterThan(0);
      for (const a of t.aliases) {
        expect(aliases.has(a.toLowerCase()), a).toBe(false);
        aliases.add(a.toLowerCase());
      }
      expect(t.explicacao.length).toBeGreaterThan(20);
      expect(t.explicacao.length).toBeLessThanOrEqual(160);
      expect(t.explicacao.endsWith(".")).toBe(true);
    }
  });

  test("plain ASCII, no dash, no middle dot, and nothing that predicts or recommends", () => {
    for (const t of TERMS) {
      expect(t.explicacao, t.id).toMatch(/^[\x20-\x7e]*$/);
      expect(t.explicacao).not.toMatch(/[\u2013\u2014\u00b7]/);
      expect(t.explicacao.toLowerCase(), t.id).not.toMatch(/\b(compre|venda agora|vai subir|vai cair|lucro|garant)/);
    }
  });

  test("a sentence of the glossary does not lean on another unexplained technical word", () => {
    const jargon = ["order block", "fair value", "bos", "choch", "imbalance", "footprint", "open interest", "hedge", "alavancagem"];
    for (const t of TERMS) for (const j of jargon) expect(t.explicacao.toLowerCase().includes(j), `${t.id} uses ${j}`).toBe(false);
  });

  test("explain finds an entry by id", () => {
    expect(explain("atr")).toBe("O tamanho tipico do movimento do preco em uma vela.");
    expect(explain("nope")).toBeNull();
  });
});

describe("annotate", () => {
  test("finds the words, keeps the text, ignores the case and the longest alias wins", () => {
    const text = "Ha uma zona de demanda logo abaixo do preco (forca da zona 62). O ADX e a Retirada de Liquidez contam.";
    const segs = annotate(text);
    expect(join2(segs)).toBe(text);
    expect(segs.filter((s): s is Exclude<Segment, string> => typeof s !== "string").map((s) => [s.term, s.id])).toEqual([
      ["zona de demanda", "zona_demanda"], ["forca da zona", "forca_da_zona"], ["ADX", "adx"], ["Retirada de Liquidez", "liquidez"],
    ]);
  });
  test("only whole words: a word inside another is not a term", () => {
    expect(annotate("O atrito do portico e da hoje")).toEqual(["O atrito do portico e da hoje"]);
    expect(annotate("adxx e radx")).toEqual(["adxx e radx"]);
  });
  test("a text with no term comes back as one plain piece, and an empty one as nothing", () => {
    expect(annotate("Nenhuma palavra tecnica aqui.")).toEqual(["Nenhuma palavra tecnica aqui."]);
    expect(annotate("")).toEqual([]);
  });
  test("a term at the start and at the end", () => {
    expect(annotate("ATR e RSI")).toHaveLength(3);
    expect(join2(annotate("spread"))).toBe("spread");
  });
  test("every sentence the Veredito can say is annotated without losing a character", () => {
    const sentences = [
      "A tendencia de 1 hora e de 4 horas e de alta.", "O preco varreu as minimas recentes e voltou (retirada de liquidez).", "Vendas agressivas foram absorvidas: o preco nao caiu apesar delas.",
      "Quem esta comprado paga caro para manter a posicao (funding alto).", "O RSI de 15 minutos esta em 77: o preco subiu depressa demais.", "A volatilidade esta entre as mais altas das ultimas 24 horas: movimentos bruscos sao mais comuns.",
    ];
    for (const s of sentences) expect(join2(annotate(s)), s).toBe(s);
    expect(annotate(sentences[1]!).some((x) => typeof x !== "string" && x.id === "liquidez")).toBe(true);
    expect(annotate(sentences[2]!).some((x) => typeof x !== "string" && x.id === "absorcao")).toBe(true);
  });
});

describe("coverage: a technical word the desk already shows has an entry", () => {
  // Words of the desk that a person who never traded would not know. The list is kept by hand: a word that is added to a screen of
  // the Veredito and is in this list must have an explanation, or this fails. It cannot find a word nobody put on the list.
  const NEEDS_AN_ENTRY = ["zona de demanda", "zona de oferta", "invalidacao", "absorcao", "liquidez", "funding", "spread", "adx", "atr", "rsi", "delta", "cvd", "poc", "estrutura", "perpetuo", "ganho sobre risco", "forca da zona"];
  const covered = new Set(TERMS.flatMap((t) => t.aliases.map((a) => a.toLowerCase())));
  test("every word on the list is covered", () => {
    for (const w of NEEDS_AN_ENTRY) expect(covered.has(w), w).toBe(true);
  });

  const SRC = resolve(import.meta.dir, "..", "..");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
    });
  test("the labels of the Veredito screens that use a listed word are covered (the scan reads the source of components/Veredito)", () => {
    const text = files(join(SRC, "components", "Veredito")).map((f) => readFileSync(f, "utf8")).join("\n").toLowerCase();
    for (const w of NEEDS_AN_ENTRY) if (text.includes(`"${w}`) || text.includes(` ${w} `)) expect(covered.has(w), w).toBe(true);
  });
});
