// The answer of "Pedir ao Inonu: as melhores oportunidades" as the page reads it and the cards a person reads. The wire fixture below is the exact JSON that the core's own
// validateEcosystem produced (src/opportunity/ecosystem.ts) for two candidates, so the page and the core cannot drift apart. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { FAMILIES, decisionCards, markText, parseEcoAnswer, pickCards, type EcoAnswer } from "./picks";

const FORBIDDEN = new RegExp(`[${String.fromCharCode(0xb7, 0x2014, 0x2013)}]`);
const WIRE = {"observedAtMs":1800000000000,"saldo":{"totalUsd":10000,"cashUsd":5000},"picks":[{"rank":1,"candidateId":"token:8453:0xbbbb000000000000000000000000000000000002","chainIndex":"8453","address":"0xbbbb000000000000000000000000000000000002","symbol":"BBB","size":"buy_full","fraction":1,"usd":200,"capUsd":200,"binding":"risco","scaled":false,"driver":"carteiras","families":["carteiras","fluxo","liquidez","distribuicao","tracao","seguranca"],"marks":[],"facts":{"candidateId":"token:8453:0xbbbb000000000000000000000000000000000002","chainIndex":"8453","address":"0xbbbb000000000000000000000000000000000002","symbol":"BBB","nota":70,"priceUsd":0.5,"changePct":8,"volumeUsd":3000000,"liquidityUsd":900000,"marketCapUsd":20000000,"holders":4000,"buyShare":0.62,"txs":800,"top10Pct":20,"devPct":2,"bundlePct":3,"riskLevel":1,"riskFlags":[],"wallets":4,"walletsUsd":60000,"soldPct":20}},{"rank":2,"candidateId":"token:8453:0xaaaa000000000000000000000000000000000001","chainIndex":"8453","address":"0xaaaa000000000000000000000000000000000001","symbol":"AAA","size":"buy_third","fraction":0.3333333333333333,"usd":33,"capUsd":100,"binding":"risco","scaled":false,"driver":null,"families":["carteiras","fluxo","liquidez","tracao"],"marks":["concentracao","sinal_de_risco"],"facts":{"candidateId":"token:8453:0xaaaa000000000000000000000000000000000001","chainIndex":"8453","address":"0xaaaa000000000000000000000000000000000001","symbol":"AAA","nota":70,"priceUsd":0.5,"changePct":8,"volumeUsd":3000000,"liquidityUsd":900000,"marketCapUsd":20000000,"holders":4000,"buyShare":0.62,"txs":800,"top10Pct":55,"devPct":2,"bundlePct":3,"riskLevel":1,"riskFlags":["lowLiq"],"wallets":4,"walletsUsd":60000,"soldPct":20}}],"considered":2,"excluded":{"honeypot":1}};
const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(WIRE));

describe("the answer of the core", () => {
  test("keeps sparse model priorities and unranked buys without inventing a card", () => {
    const decisions = WIRE.picks.map((p, i) => ({ candidateId: p.candidateId, chainIndex: p.chainIndex, address: p.address, symbol: p.symbol, stance: p.size, rank: i === 0 ? 3 : null, driver: p.driver, families: p.families, marks: p.marks, facts: p.facts }));
    const answer = parseEcoAnswer({ ...WIRE, picks: [WIRE.picks[0]], decisions });
    expect(answer).not.toBeNull();
    expect(answer!.decisions![1]!.rank).toBeNull();
    expect(decisionCards(answer!)).toMatchObject([{ action: "buy", symbol: "BBB", rank: 3 }]);
  });

  test("compares facts by their fields and rejects divergent evidence on a buy", () => {
    const decisions = WIRE.picks.map((p) => ({ candidateId: p.candidateId, chainIndex: p.chainIndex, address: p.address, symbol: p.symbol, stance: p.size, rank: p.rank, driver: p.driver, families: p.families, marks: p.marks, facts: Object.fromEntries(Object.entries(p.facts).reverse()) }));
    expect(parseEcoAnswer({ ...WIRE, decisions })).not.toBeNull();
    expect(parseEcoAnswer({ ...WIRE, decisions: [{ ...decisions[0], families: ["carteiras"] }, decisions[1]] })).toBeNull();
    expect(parseEcoAnswer({ ...WIRE, decisions: [{ ...decisions[0], facts: { ...decisions[0]!.facts, priceUsd: 99 } }, decisions[1]] })).toBeNull();
  });

  test("preserves watch decisions and their model ranking without a balance", () => {
    const decisions = WIRE.picks.map((p, i) => ({ candidateId: p.candidateId, chainIndex: p.chainIndex, address: p.address, symbol: p.symbol, stance: "watch", rank: 2 - i, driver: p.driver, families: p.families, marks: p.marks, facts: p.facts }));
    expect(parseEcoAnswer({ ...WIRE, saldo: null, picks: [], decisions })).toMatchObject({ picks: [], decisions });
  });

  test("rejects invalid preserved decisions instead of presenting them", () => {
    const base = WIRE.picks.map((p) => ({ candidateId: p.candidateId, chainIndex: p.chainIndex, address: p.address, symbol: p.symbol, stance: "watch", rank: p.rank, driver: p.driver, families: p.families, marks: p.marks, facts: p.facts }));
    for (const change of [{ stance: "skip" }, { stance: "buy_everything" }, { rank: 4 }, { rank: 2 }, { driver: "numerologia" }, { candidateId: "token:1:other" }]) {
      const decisions = [{ ...base[0], ...change }, base[1]];
      expect(parseEcoAnswer({ ...WIRE, saldo: null, picks: [], decisions })).toBeNull();
    }
  });

  test("is read as it is, in the order of the ranking", () => {
    const answer = parseEcoAnswer(WIRE) as EcoAnswer;
    expect(answer.picks.map((p) => p.symbol)).toEqual(["BBB", "AAA"]);
    expect(answer.picks.map((p) => p.rank)).toEqual([1, 2]);
    expect(answer.saldo).toEqual({ totalUsd: 10000, cashUsd: 5000 });
    expect(answer.excluded).toEqual({ honeypot: 1 });
    expect(answer.considered).toBe(2);
  });

  test("nothing worth it is an answer with no picks, and an unread balance is null", () => {
    const empty = { ...clone(), picks: [], saldo: null };
    expect(parseEcoAnswer(empty)).toMatchObject({ picks: [], saldo: null });
  });

  test("anything out of shape is no answer, and a wrong amount is never shown: one bad pick drops the whole answer", () => {
    const bad = (edit: (o: Record<string, any>) => void) => {
      const o = clone() as Record<string, any>;
      edit(o);
      return parseEcoAnswer(o);
    };
    expect(parseEcoAnswer(null)).toBeNull();
    expect(bad((o) => (o.picks[0].usd = o.picks[0].capUsd + 1))).toBeNull();
    expect(bad((o) => (o.picks[0].usd = -1))).toBeNull();
    expect(bad((o) => (o.picks[0].size = "buy_everything"))).toBeNull();
    expect(bad((o) => (o.picks[0].fraction = 2))).toBeNull();
    expect(bad((o) => (o.picks[0].binding = "magia"))).toBeNull();
    expect(bad((o) => (o.picks[0].driver = "numerologia"))).toBeNull();
    expect(bad((o) => (o.picks[0].families = ["horoscopo"]))).toBeNull();
    expect(bad((o) => (o.picks[0].marks = ["feio"]))).toBeNull();
    expect(bad((o) => (o.picks[0].facts.symbol = "<script>"))).toBeNull();
    expect(bad((o) => (o.picks[0].facts.address = "x"))).toBeNull();
    expect(bad((o) => (o.picks[0].facts.holders = "muitos"))).toBeNull();
    expect(bad((o) => (o.picks[0].candidateId = "token:1:0xother"))).toBeNull();
    expect(bad((o) => (o.picks[1].rank = 3))).toBeNull();
    expect(bad((o) => (o.picks = [o.picks[0], o.picks[1], o.picks[0], o.picks[1]]))).toBeNull();
    expect(bad((o) => (o.saldo = { totalUsd: -1, cashUsd: 0 }))).toBeNull();
    expect(bad((o) => (o.excluded = { honeypot: "um" }))).toBeNull();
  });
});

describe("the cards", () => {
  const cards = pickCards(parseEcoAnswer(WIRE) as EcoAnswer);

  test("the size the Inonu chose, the dollars the core computed, and why the ceiling is what it is", () => {
    const [first, second] = cards;
    expect(first).toMatchObject({ rank: 1, symbol: "BBB", chain: "Base", sizeLabel: "Cheio", sizeNote: "o teto inteiro", amount: "US$ 200", share: "2,0% da carteira", hasAmount: true });
    expect(first!.capNote).toBe("O teto vem do risco: quanto da carteira voce aceita perder numa operacao (teto de US$ 200)");
    expect(second).toMatchObject({ rank: 2, symbol: "AAA", sizeLabel: "Pequeno", amount: "US$ 33", share: "0,3% da carteira" });
    // a ceiling halved by a mark of care is said to come from the risk too
    expect(second!.capNote).toContain("teto de US$ 100");
  });

  test("the family that weighed most is marked, with the measurement behind each family, in words that can be checked", () => {
    const first = cards[0]!;
    expect(first.driver).toEqual({ id: "carteiras", label: "Carteiras rastreadas" });
    expect(first.families.filter((f) => f.main).map((f) => f.id)).toEqual(["carteiras"]);
    expect(first.families.find((f) => f.id === "carteiras")!.text).toBe("4 carteiras rastreadas compraram US$ 60,0 mil, 20% ja vendido");
    expect(first.families.find((f) => f.id === "fluxo")!.text).toBe("compras sao 62% dos 800 negocios");
    expect(first.families.find((f) => f.id === "liquidez")!.text).toBe("pool de US$ 900 mil");
    expect(first.families.find((f) => f.id === "tracao")!.text).toBe("+8,00% em 24 h com US$ 3,0 mi negociados");
    expect(first.supportLine).toBe("6 de 6 familias de evidencia a favor, nenhuma marca de cuidado");
    expect(cards[1]!.driver).toBeNull();
  });

  test("the marks of care are measurements with their number", () => {
    expect(cards[1]!.marks).toEqual(["as 10 maiores carteiras tem 55% da oferta", "a OKX marca um alerta de risco: lowLiq"]);
    expect(cards[1]!.supportLine).toBe("4 de 6 familias de evidencia a favor, 2 marcas de cuidado");
  });

  test("without a balance there is no amount and the card says why; with no cash for the size it says that", () => {
    const blind = pickCards({ ...(parseEcoAnswer(WIRE) as EcoAnswer), saldo: null });
    expect(blind[0]!.amount).toBe("Saldo nao lido: sem valor");
    expect(blind[0]!.share).toBeNull();
    const answer = parseEcoAnswer(WIRE) as EcoAnswer;
    const noCash = pickCards({ ...answer, picks: answer.picks.map((p) => ({ ...p, usd: 0 })) });
    expect(noCash[0]!.amount).toBe("Sem caixa para este tamanho agora");
    expect(noCash[0]!.hasAmount).toBe(false);
    const noCap = pickCards({ ...answer, picks: answer.picks.map((p) => ({ ...p, usd: 0, capUsd: 0, binding: "sem_saldo" as const })) });
    expect(noCap[0]!.amount).toBe("Sem valor: nao ha teto");
    expect(noCap[0]!.capNote).toBe("Nao ha caixa em moeda estavel nesta rede");
  });

  test("an unknown network is named by its number, never guessed", () => {
    const answer = parseEcoAnswer(WIRE) as EcoAnswer;
    const odd = pickCards({ ...answer, picks: answer.picks.map((p) => ({ ...p, chainIndex: "999999", facts: { ...p.facts, chainIndex: "999999" } })) });
    expect(odd[0]!.chain).toBe("Rede 999999");
  });

  test("every word on a card: no middle dot, no dash, no broken number, no word of an order that is not the Inonu's own choice", () => {
    const text = JSON.stringify(cards);
    expect(text).not.toMatch(FORBIDDEN);
    for (const word of ["NaN", "undefined", "Infinity"]) expect(text).not.toContain(word);
    expect(text.toLowerCase()).not.toMatch(/(comprar|compre|vender|venda|sinal de compra|aconselh|deve|garant)w*/);
    expect(text).toMatch(/^[ -~]+$/);
    expect(FAMILIES).toHaveLength(6);
    expect(markText("risco_alto", cards[0]!.families.length > 0 ? (parseEcoAnswer(WIRE) as EcoAnswer).picks[0]!.facts : (null as never))).toContain("nivel de risco");
  });
});
