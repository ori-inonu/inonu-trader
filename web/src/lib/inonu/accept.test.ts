// ASK-14, AC-ASK-7, T7.11: what "Aceitar" does depends on the family of the candidate the model chose, and in no family does it send an
// order (there is no order path on the desk and the exchange has no order API in this scope). A token on-chain is meant to fill the order
// ticket (WAL-7), which Aceitar only FILLS: the draft carries the network, the token and the side, never an amount, and nothing is sent.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { AskAnswer } from "./client";
import { acceptEffect, acceptNote, acceptOutcome, journalEntryFor, ticketDraftFor } from "./accept";

const decisao = (candidateId: string | null, over: Partial<NonNullable<AskAnswer["decisao"]>> = {}): NonNullable<AskAnswer["decisao"]> => ({
  action: candidateId === null ? "hold" : "buy",
  candidateId,
  pesos: null,
  razao: "modelo escolheu o candidato pela confluencia das zonas",
  modelo: "jev-latest",
  ...over,
});

describe("the ticket that Aceitar fills (T9.7, WAL-7)", () => {
  const ADDRESS = "0x4ed4e862860bed51a9570b96d89af5e1b0efefed";
  const input = (candidateId: string | null, over: Partial<Parameters<typeof ticketDraftFor>[0]> = {}) => ({ decisao: decisao(candidateId), briefHash: "h", symbol: "DEGEN", accepted: true, atMs: 7, ...over });

  test("accepting an answer about a token leaves a draft with the network, the token and the side the model chose, and no amount", () => {
    expect(ticketDraftFor(input(`token:8453:${ADDRESS}`))).toEqual({ chainIndex: "8453", tokenAddress: ADDRESS, tokenSymbol: "DEGEN", acao: "buy", origem: "inonu", briefHash: "h", atMs: 7 });
    expect(ticketDraftFor(input(`token:8453:${ADDRESS}`, { decisao: decisao(`token:8453:${ADDRESS}`, { action: "sell" }) }))?.acao).toBe("sell");
  });

  test("Ignorar fills nothing, and neither does any family but a token: the ticket is for the wallet, not for the exchange", () => {
    expect(ticketDraftFor(input(`token:8453:${ADDRESS}`, { accepted: false }))).toBeNull();
    for (const id of [null, "manter", "zona:a1b2c3d4e5f6", "spot:BTC-USDT", "perp:BTC-USDT-SWAP"]) expect(ticketDraftFor(input(id))).toBeNull();
  });

  test("a token of another kind of network (a Sui type) still fills it, so what the card says is what happened", () => {
    expect(ticketDraftFor(input("token:784:0x2::sui::SUI"))).toMatchObject({ chainIndex: "784", tokenAddress: "0x2::sui::SUI" });
    expect(acceptEffect("token:784:0x2::sui::SUI").ticket).toBe("preenchido");
  });

  test("a token candidate that has no address fills nothing, and the effect says so instead of promising a ticket", () => {
    expect(ticketDraftFor(input("token:8453:"))).toBeNull();
    expect(acceptEffect("token:8453:")).toEqual({ familia: "token", efeito: "diario", ticket: null, enviaOrdem: false });
  });
});

describe("what one click on Aceitar or Ignorar does, as one function (T9.7)", () => {
  const ADDRESS = "0x4ed4e862860bed51a9570b96d89af5e1b0efefed";
  const click = (candidateId: string | null, over: Partial<Parameters<typeof acceptOutcome>[0]> = {}) =>
    acceptOutcome({ instId: "k", decisao: decisao(candidateId), briefHash: "h", symbol: "DEGEN", accepted: true, atMs: 9, ...over });

  test("accepting an answer about a token writes the journal line, fills the ticket and says both", () => {
    const out = click(`token:8453:${ADDRESS}`);
    expect(out.entry).toMatchObject({ kind: "token", accepted: true, candidateId: `token:8453:${ADDRESS}` });
    expect(out.draft).toMatchObject({ chainIndex: "8453", tokenAddress: ADDRESS, acao: "buy" });
    expect(out.note).toBe("aceita");
    expect(acceptNote("token", out.note)).toContain("o ticket da aba Carteira foi preenchido");
  });

  test("Ignorar writes the line and fills nothing, whatever the family", () => {
    const out = click(`token:8453:${ADDRESS}`, { accepted: false });
    expect(out.entry.accepted).toBe(false);
    expect(out.draft).toBeNull();
    expect(out.note).toBe("ignorada");
  });

  test("a token the ticket cannot take is accepted without a ticket, and the card says the ticket was not filled", () => {
    const out = click("token:8453:");
    expect(out.draft).toBeNull();
    expect(out.note).toBe("aceita_sem_ticket");
    const text = acceptNote("token", out.note);
    expect(text).toContain("O ticket nao foi preenchido");
    expect(text).not.toContain("foi preenchido. Nenhuma");
    expect(text).toContain("Nenhuma ordem foi enviada");
  });

  test("holding, a zone, a spot pair and a perpetual are accepted into the journal only, and nothing else happens", () => {
    for (const id of [null, "manter", "zona:a1b2c3d4e5f6", "spot:BTC-USDT", "perp:BTC-USDT-SWAP"]) {
      const out = click(id);
      expect(out.draft).toBeNull();
      expect(out.note).toBe("aceita");
      expect(out.entry.accepted).toBe(true);
    }
  });

  test("the discovery has no symbol for the token: the draft says so with null", () => {
    expect(click(`token:8453:${ADDRESS}`, { symbol: null }).draft?.tokenSymbol).toBeNull();
  });
});

describe("the effect of Aceitar by family", () => {
  test("spot and perpetual of the exchange: written in the local journal, no ticket, no order", () => {
    expect(acceptEffect("spot:BTC-USDT")).toEqual({ familia: "spot", efeito: "diario", ticket: null, enviaOrdem: false });
    expect(acceptEffect("perp:BTC-USDT-SWAP")).toEqual({ familia: "perp", efeito: "diario", ticket: null, enviaOrdem: false });
  });

  test("zone and hold: written in the local journal together with the reason", () => {
    expect(acceptEffect("zona:a1b2c3d4e5f6")).toEqual({ familia: "zona", efeito: "diario_com_razao", ticket: null, enviaOrdem: false });
    expect(acceptEffect("manter")).toEqual({ familia: "manter", efeito: "diario_com_razao", ticket: null, enviaOrdem: false });
    expect(acceptEffect(null)).toEqual({ familia: "manter", efeito: "diario_com_razao", ticket: null, enviaOrdem: false });
  });

  test("a token on-chain is the one that goes to the order ticket, which Aceitar fills and never sends", () => {
    expect(acceptEffect("token:501:So11111111111111111111111111111111111111112")).toEqual({ familia: "token", efeito: "diario_e_ticket", ticket: "preenchido", enviaOrdem: false });
  });

  test("an id the desk does not know is treated as hold, never as something that could be sent", () => {
    for (const id of ["", "futuro:XYZ", "ordem:1", "__proto__", "buy:BTC"]) expect(acceptEffect(id)).toMatchObject({ familia: "manter", enviaOrdem: false });
  });

  test("in every family the effect says no order is sent", () => {
    for (const id of ["spot:A-B", "perp:A-B-SWAP", "zona:abcdef012345", "manter", null, "token:1:0xabc", "qualquer"]) expect(acceptEffect(id).enviaOrdem).toBe(false);
  });
});

describe("the line written in the journal", () => {
  test("a spot or a perpetual keeps the documented fields and no reason", () => {
    const e = journalEntryFor({ instId: "BTC-USDT", decisao: decisao("spot:BTC-USDT"), briefHash: "h1", accepted: true, atMs: 5 });
    expect(e).toEqual({ atMs: 5, instId: "BTC-USDT", action: "buy", candidateId: "spot:BTC-USDT", kind: "spot", briefHash: "h1", accepted: true, modelo: "jev-latest", razao: null });
  });

  test("a zone and a hold keep the reason the core wrote, cut to 200 characters", () => {
    const zone = journalEntryFor({ instId: "BTC-USDT", decisao: decisao("zona:a1b2c3d4e5f6"), briefHash: "h", accepted: true, atMs: 1 });
    expect(zone.kind).toBe("zona");
    expect(zone.razao).toBe("modelo escolheu o candidato pela confluencia das zonas");
    const hold = journalEntryFor({ instId: "BTC-USDT", decisao: decisao(null, { razao: "x".repeat(500) }), briefHash: null, accepted: true, atMs: 1 });
    expect(hold.kind).toBe("manter");
    expect(hold.razao).toHaveLength(200);
  });

  test("a token keeps no reason in the journal: the ticket carries it", () => {
    const e = journalEntryFor({ instId: "SEALS-501", decisao: decisao("token:501:abc"), briefHash: "h", accepted: true, atMs: 1 });
    expect(e.kind).toBe("token");
    expect(e.razao).toBeNull();
  });

  test("ignoring writes the same line with accepted false, and a zone still keeps its reason", () => {
    const e = journalEntryFor({ instId: "BTC-USDT", decisao: decisao("zona:a1b2c3d4e5f6"), briefHash: "h", accepted: false, atMs: 9 });
    expect(e.accepted).toBe(false);
    expect(e.razao).not.toBeNull();
  });
});

describe("what the card tells after the click", () => {
  test("accepted: each family says what was written and that nothing was sent", () => {
    expect(acceptNote("spot", "aceita")).toBe("Registrado no diario local. Nenhuma ordem foi enviada.");
    expect(acceptNote("perp", "aceita")).toBe("Registrado no diario local. Nenhuma ordem foi enviada.");
    expect(acceptNote("zona", "aceita")).toBe("Registrado no diario local, com a razao. Nenhuma ordem foi enviada.");
    expect(acceptNote("manter", "aceita")).toBe("Registrado no diario local, com a razao. Nenhuma ordem foi enviada.");
    expect(acceptNote("token", "aceita")).toBe("Registrado no diario local e o ticket da aba Carteira foi preenchido. Nenhuma ordem foi enviada.");
  });

  test("ignored: the same sentence for every family", () => {
    for (const familia of ["spot", "perp", "zona", "manter", "token"] as const) expect(acceptNote(familia, "ignorada")).toBe("Ignorada. Registrado no diario local.");
  });

  test("plain ASCII, no middle dot or dash", () => {
    for (const familia of ["spot", "perp", "zona", "manter", "token"] as const) {
      for (const result of ["aceita", "ignorada"] as const) {
        const text = acceptNote(familia, result);
        expect(text).not.toMatch(/[·—–]/);
        expect(text).toBe(text.normalize("NFD").replace(/[̀-ͯ]/g, ""));
      }
    }
  });
});
