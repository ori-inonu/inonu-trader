import { describe, expect, test } from "bun:test";
import { FORBIDDEN_TEXT, type FeedChip } from "./mesa-model";
import { ageLabel, captureFileName, feedAges, shortcutFor, SHORTCUTS, skewBadge, summarizeFeeds, toneWord, walletBadge, walletHint } from "./topbar-model";

const chip = (id: string, tone: FeedChip["tone"], detail: string | null = null): FeedChip => ({ id, label: id, tone, detail });

describe("summarizeFeeds", () => {
  test("counts every state and takes the worst one as the tone", () => {
    const summary = summarizeFeeds([chip("a", "live"), chip("b", "live"), chip("c", "late", "atrasada"), chip("d", "down", "fora"), chip("e", "off")]);
    expect(summary.counts).toEqual({ live: 2, late: 1, down: 1, off: 1 });
    expect(summary.total).toBe(5);
    expect(summary.tone).toBe("down");
    expect(summary.text).toBe("2 ao vivo, 1 atrasada, 1 fora do ar, 1 inativa");
  });

  test("late wins over live, and inactive sources alone never turn the bar amber or red", () => {
    expect(summarizeFeeds([chip("a", "live"), chip("b", "late")]).tone).toBe("late");
    const quiet = summarizeFeeds([chip("a", "live"), chip("b", "live"), chip("w", "off", "nao conectada")]);
    expect(quiet.tone).toBe("live");
    expect(quiet.text).toBe("2 ao vivo, 1 inativa");
  });

  test("plural words agree with the count", () => {
    expect(summarizeFeeds([chip("a", "late"), chip("b", "late"), chip("c", "off"), chip("d", "off")]).text).toBe("2 atrasadas, 2 inativas");
    expect(summarizeFeeds([chip("a", "live")]).text).toBe("1 ao vivo");
  });

  test("with nothing to report it says so and stays inactive", () => {
    const empty = summarizeFeeds([]);
    expect(empty.tone).toBe("off");
    expect(empty.total).toBe(0);
    expect(empty.text).toBe("sem fontes");
  });

  test("the short form says how many of the sources are live, and nothing when there are none", () => {
    expect(summarizeFeeds([chip("a", "live"), chip("b", "live"), chip("c", "late"), chip("d", "down"), chip("e", "off")]).short).toBe("2 de 5 ao vivo");
    expect(summarizeFeeds([chip("a", "live"), chip("b", "live")]).short).toBe("2 de 2 ao vivo");
    expect(summarizeFeeds([chip("a", "late")]).short).toBe("0 de 1 ao vivo");
    expect(summarizeFeeds([]).short).toBe("sem fontes");
  });

  test("the words carry no forbidden character", () => {
    expect(summarizeFeeds([chip("a", "live"), chip("b", "down")]).text).not.toMatch(FORBIDDEN_TEXT);
    expect(summarizeFeeds([chip("a", "live"), chip("b", "down")]).short).not.toMatch(FORBIDDEN_TEXT);
    for (const tone of ["live", "late", "down", "off"] as const) expect(toneWord(tone)).not.toMatch(FORBIDDEN_TEXT);
  });

  test("toneWord speaks each state", () => {
    expect(["live", "late", "down", "off"].map((tone) => toneWord(tone as FeedChip["tone"]))).toEqual(["ao vivo", "atrasado", "fora do ar", "inativo"]);
  });
});

describe("walletBadge", () => {
  const wallet = (tone: FeedChip["tone"], detail: string | null) => chip("okx-wallet", tone, detail);

  test("not installed, not connected and connected say what is true", () => {
    expect(walletBadge(wallet("off", "extensao nao encontrada"), null)).toMatchObject({ tone: "off", label: "Carteira OKX", detail: "extensao nao encontrada", address: null });
    expect(walletBadge(wallet("off", "nao conectada"), null)).toMatchObject({ tone: "off", detail: "nao conectada", address: null });
    const connected = walletBadge(wallet("live", "conectada"), "0x1234567890abcdef1234567890abcdef12345678");
    expect(connected.tone).toBe("live");
    expect(connected.address).toBe("0x1234…5678");
    expect(connected.label).toBe("Carteira 0x1234…5678");
  });

  test("an address is shown only while connected, a missing chip is inactive, and nothing leaks the full address", () => {
    const stale = walletBadge(wallet("late", "rede nao suportada"), "0x1234567890abcdef1234567890abcdef12345678");
    expect(stale.address).toBeNull();
    expect(walletBadge(undefined, null)).toMatchObject({ tone: "off", detail: "sem dados", label: "Carteira OKX" });
    expect(JSON.stringify(walletBadge(wallet("live", "conectada"), "0x1234567890abcdef1234567890abcdef12345678"))).not.toContain("1234567890abcdef1234567890abcdef");
  });
});

describe("skewBadge and walletHint", () => {
  test("the clock selo is short and flags only a real skew", () => {
    expect(skewBadge(null)).toEqual({ text: "relogio nao comparado", warn: false });
    expect(skewBadge(1_200)).toEqual({ text: "relogio sincronizado", warn: false });
    expect(skewBadge(69_500)).toEqual({ text: "relogio 70 s atrasado", warn: true });
    expect(skewBadge(-30_000)).toEqual({ text: "relogio 30 s adiantado", warn: true });
  });

  test("every wallet state has an explanation that says the bar never connects or signs", () => {
    for (const detail of ["extensao nao encontrada", "nao conectada", "conectada", "rede nao suportada", "consultando", "consulta falhou", "algo novo"]) {
      const hint = walletHint(detail);
      expect(hint.length).toBeGreaterThan(20);
      expect(hint).not.toMatch(FORBIDDEN_TEXT);
    }
    expect(walletHint("nao conectada")).toContain("nao conecta nem assina");
    expect(walletHint("conectada")).toContain("nao assina nem envia");
  });
});

describe("ageLabel, shortcutFor and captureFileName", () => {
  test("the age of a feed is said in plain words and unknown is not a number", () => {
    expect(ageLabel(undefined)).toBeNull();
    expect(ageLabel(null)).toBe("sem mensagem");
    expect(ageLabel(0)).toBe("agora");
    expect(ageLabel(400)).toBe("agora");
    expect(ageLabel(1_200)).toBe("ha 1 s");
    expect(ageLabel(45_000)).toBe("ha 45 s");
    expect(ageLabel(125_000)).toBe("ha 2 min");
    expect(ageLabel(-5)).toBe("agora");
    expect(ageLabel(Number.NaN)).toBe("sem mensagem");
    for (const ms of [null, 0, 1_200, 125_000]) expect(ageLabel(ms)).not.toMatch(FORBIDDEN_TEXT);
  });

  test("slash opens the search and f the full screen, only when nobody is typing and no modifier is held", () => {
    const body = { tagName: "BODY" };
    expect(shortcutFor({ key: "/", target: body })).toBe("search");
    expect(shortcutFor({ key: "f", target: body })).toBe("fullscreen");
    expect(shortcutFor({ key: "F", target: body })).toBe("fullscreen");
    expect(shortcutFor({ key: "/", target: { tagName: "INPUT" } })).toBeNull();
    expect(shortcutFor({ key: "f", target: { tagName: "TEXTAREA" } })).toBeNull();
    expect(shortcutFor({ key: "f", target: { tagName: "SELECT" } })).toBeNull();
    expect(shortcutFor({ key: "f", target: { tagName: "DIV", isContentEditable: true } })).toBeNull();
    expect(shortcutFor({ key: "f", ctrlKey: true, target: body })).toBeNull();
    expect(shortcutFor({ key: "/", metaKey: true, target: body })).toBeNull();
    expect(shortcutFor({ key: "f", altKey: true, target: body })).toBeNull();
    expect(shortcutFor({ key: "f", defaultPrevented: true, target: body })).toBeNull();
    expect(shortcutFor({ key: "x", target: body })).toBeNull();
    expect(shortcutFor({ key: "/", target: null })).toBe("search");
  });

  test("a opens the alerts, g toggles the chart mode and ? opens the preferences, under the same guards", () => {
    const body = { tagName: "BODY" };
    expect(shortcutFor({ key: "a", target: body })).toBe("alerts");
    expect(shortcutFor({ key: "A", target: body })).toBe("alerts");
    expect(shortcutFor({ key: "g", target: body })).toBe("layout");
    expect(shortcutFor({ key: "G", target: body })).toBe("layout");
    expect(shortcutFor({ key: "?", target: body })).toBe("help");
    for (const key of ["a", "g", "?"]) {
      expect(shortcutFor({ key, target: { tagName: "INPUT" } })).toBeNull();
      expect(shortcutFor({ key, ctrlKey: true, target: body })).toBeNull();
      expect(shortcutFor({ key, metaKey: true, target: body })).toBeNull();
      expect(shortcutFor({ key, altKey: true, target: body })).toBeNull();
      expect(shortcutFor({ key, defaultPrevented: true, target: body })).toBeNull();
      expect(shortcutFor({ key, target: { tagName: "DIV", isContentEditable: true } })).toBeNull();
    }
  });

  test("the capture file name carries the instrument and the UTC time and nothing unsafe", () => {
    const ms = Date.UTC(2026, 9, 12, 16, 45, 23);
    expect(captureFileName("BTC-USDT", ms)).toBe("inonu-BTC-USDT-20261012-164523Z.png");
    expect(captureFileName("BTC-USDT-SWAP", ms)).toBe("inonu-BTC-USDT-SWAP-20261012-164523Z.png");
    expect(captureFileName("../x/<y>:z", ms)).toBe("inonu-x-y-z-20261012-164523Z.png");
    expect(captureFileName("", ms)).toBe("inonu-grafico-20261012-164523Z.png");
  });

  test("the shortcut table lists what the keys really do", () => {
    expect(SHORTCUTS.map((s) => s.keys)).toEqual(["/", "A", "G", "F", "?", "Esc"]);
    expect(SHORTCUTS.map((s) => s.action)).toEqual(["Buscar ativo", "Alertas de preco", "Modo grafico", "Tela cheia", "Preferencias e atalhos", "Fechar o painel aberto"]);
    for (const s of SHORTCUTS) expect(`${s.keys} ${s.action}`).not.toMatch(FORBIDDEN_TEXT);
  });
});

describe("feedAges", () => {
  test("measures each feed against the browser clock and keeps unknown as null", () => {
    const now = 1_791_742_100_000;
    expect(feedAges([{ id: "okx-public-ws", lastMessageAtMs: now - 400 }, { id: "okx-business-ws", lastMessageAtMs: now - 45_000 }, { id: "okx-public-rest", lastMessageAtMs: null }], now)).toEqual({
      "okx-public-ws": 400,
      "okx-business-ws": 45_000,
      "okx-public-rest": null,
    });
  });

  test("before the clock has ticked there are no ages, and a message from the future is not negative", () => {
    expect(feedAges([{ id: "a", lastMessageAtMs: 5 }], 0)).toEqual({});
    expect(feedAges([{ id: "a", lastMessageAtMs: 2_000 }], 1_000)).toEqual({ a: 0 });
  });
});
