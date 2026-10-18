// ASK-7, ASK-9, ASK-10: what the desk SAYS about a request to Inonu. Plain ASCII, no dash or middle dot, "Inonu" is the
// assistant and "Jev" appears only as the model behind it.
import { describe, expect, test } from "bun:test";
import type { AskAnswer } from "./client";
import { candidateKind, costLine, decisionHeadline, describeCandidate, motivoText, stateLine } from "./view";

const answer = (over: Partial<AskAnswer> = {}): AskAnswer => ({ ok: true, id: "a", status: "respondido", briefHash: "h", custo: { chamadasOnchainos: 0, tokens: 610, usd: null }, advisory: true, execution: "never", ...over });

describe("describeCandidate", () => {
  test("a short human name for each kind of candidate id", () => {
    expect(describeCandidate("spot:BTC-USDT")).toBe("spot BTC-USDT");
    expect(describeCandidate("perp:ETH-USDT-SWAP")).toBe("perpetuo ETH-USDT-SWAP");
    expect(describeCandidate("zona:a1b2c3d4e5f6")).toBe("a zona a1b2c3");
    expect(describeCandidate("token:1:0xabc0000000000000000000000000000000000001")).toBe("o token 0xabc0...0001 (rede 1)");
    expect(describeCandidate("manter")).toBe("nenhum candidato");
    expect(describeCandidate(null)).toBe("nenhum candidato");
    expect(describeCandidate("outra:coisa")).toBe("outra:coisa");
  });

  test("the kind, for muting a kind of answer", () => {
    expect(candidateKind("spot:BTC-USDT")).toBe("spot");
    expect(candidateKind("perp:X")).toBe("perp");
    expect(candidateKind("zona:abc")).toBe("zona");
    expect(candidateKind("token:1:0x")).toBe("token");
    expect(candidateKind(null)).toBe("manter");
    expect(candidateKind("manter")).toBe("manter");
    expect(candidateKind("???")).toBeNull();
  });
});

describe("decisionHeadline", () => {
  test("says what the model decided, in the model\x27s words (comprar, vender, manter)", () => {
    expect(decisionHeadline({ action: "buy", candidateId: "spot:BTC-USDT", pesos: null, razao: "", modelo: "jev" })).toBe("Inonu decidiu comprar spot BTC-USDT");
    expect(decisionHeadline({ action: "sell", candidateId: "zona:a1b2c3d4e5f6", pesos: null, razao: "", modelo: "jev" })).toBe("Inonu decidiu vender a zona a1b2c3");
    expect(decisionHeadline({ action: "hold", candidateId: null, pesos: null, razao: "", modelo: "jev" })).toBe("Inonu decidiu esperar");
  });
});

describe("stateLine", () => {
  test("the request state replaces the old System One sentence", () => {
    expect(stateLine({ phase: "idle" }, 0)).toBe("Sem pedido");
    expect(stateLine({ phase: "asking" }, 0)).toBe("Perguntando ao Inonu");
    expect(stateLine({ phase: "answered", answer: answer(), atMs: 1_000_000 }, 1_000_000 + 30_000)).toBe("Inonu respondeu ha menos de 1 min");
    expect(stateLine({ phase: "answered", answer: answer(), atMs: 1_000_000 }, 1_000_000 + 5 * 60_000)).toBe("Inonu respondeu ha 5 min");
    expect(stateLine({ phase: "answered", answer: answer(), atMs: 1_000_000 }, 1_000_000 + 3 * 3_600_000)).toBe("Inonu respondeu ha 3 h");
    expect(stateLine({ phase: "failed", answer: answer({ ok: false, status: "sem_chave", motivo: "sem_chave" }) }, 0)).toBe("Configure a chave do modelo em Configuracoes");
  });
});

describe("motivoText", () => {
  test("every reason the pipeline can give has a sentence that says what to do", () => {
    const reasons = ["sem_chave", "teto_por_pedido", "teto_diario", "teto_de_chamadas", "teto_onchainos", "cooldown", "em_andamento", "tempo_esgotado", "modelo_falhou", "coleta_falhou", "pedido_invalido", "modo_nao_disponivel", "alvo_invalido", "instrumento_nao_suportado", "brief_grande_demais", "servidor_sem_rota", "origem_negada", "sem_conexao", "resposta_invalida", "servidor_com_erro", "okx_timeout", "okx_network", "okx_instrument_not_found", "resposta_invalida:candidate_unknown", "cancelado"];
    for (const reason of reasons) {
      const text = motivoText(reason);
      expect(text.length).toBeGreaterThan(8);
      expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
    }
    expect(motivoText("servidor_sem_rota")).toBe("Esta consulta nao esta disponivel no servidor conectado. Verifique a conexao em Diagnostico");
    expect(motivoText("teto_diario")).toContain("Limite");
    expect(motivoText("okx_timeout")).toContain("OKX");
    expect(motivoText(undefined)).toBe("Nao foi possivel pedir agora");
    expect(motivoText("algo_novo")).toBe("Nao foi possivel pedir agora");
  });

  test("the refusals of the on-chain and ranking sources have a sentence that says what happened and that nothing went to the model", () => {
    for (const reason of ["sem_candidatos", "sem_sinais", "sem_dados_onchain", "sem_credencial_onchainos"]) {
      const text = motivoText(reason);
      expect(text).not.toBe("Nao foi possivel pedir agora");
      expect(text).toContain("Nada foi enviado ao modelo");
      expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
      expect(text).not.toMatch(/[·—–]/);
    }
    expect(motivoText("sem_credencial_onchainos")).toContain("Configuracoes");
  });

  test("no text carries a dash, a middle dot, or the old word of the assistant as a model", () => {
    for (const reason of ["sem_chave", "teto_diario", "cooldown", "okx_timeout", "tempo_esgotado"]) expect(motivoText(reason)).not.toMatch(/[·—–]/);
  });
});

describe("costLine", () => {
  test("measured tokens are shown, and what is not measured is said to be not measured", () => {
    expect(costLine({ chamadasOnchainos: 0, tokens: 610, usd: null })).toBe("610 tokens, custo em dolar nao medido");
    expect(costLine({ chamadasOnchainos: 0, tokens: 610, usd: 0.0027 })).toBe("610 tokens, US$ 0,0027");
    expect(costLine({ chamadasOnchainos: null, tokens: null, usd: null })).toBe("tokens e custo nao medidos");
    expect(costLine({ chamadasOnchainos: 0, tokens: 0, usd: 0 })).toBe("resposta reaproveitada, sem custo");
  });
});
