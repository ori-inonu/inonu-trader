// T9.1, WAL-1: what a person is told when the wallet extension refuses or fails. The wallet gives a numeric code (EIP-1193 and the codes
// the extensions add: 4902 for an unknown network, -32002 for a request already waiting). The text is ours, in plain words with what to do;
// the message the wallet wrote is never shown, because it can carry anything. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { WalletTimeoutError, classifyWalletError } from "./errors";

describe("the codes the wallet gives", () => {
  const table: ReadonlyArray<readonly [number, string]> = [
    [4001, "recusado"],
    [4100, "nao_autorizado"],
    [4200, "metodo_nao_suportado"],
    [-32601, "metodo_nao_suportado"],
    [4900, "desconectado"],
    [4901, "rede_desconectada"],
    [4902, "rede_desconhecida"],
    [-32002, "pedido_pendente"],
    [-32602, "invalido"],
    [-32603, "interno"],
  ];

  test("each documented code is one kind, and the code travels with it", () => {
    for (const [code, kind] of table) {
      const info = classifyWalletError({ code, message: "anything" });
      expect(info.kind).toBe(kind as never);
      expect(info.code).toBe(code);
    }
  });

  test("a refusal by the person is not an error to fix: the text says it was refused and what to do next", () => {
    expect(classifyWalletError({ code: 4001 }).text).toBe("Voce recusou o pedido na carteira. Nada foi alterado");
    expect(classifyWalletError({ code: 4100 }).text).toContain("Autorize");
    expect(classifyWalletError({ code: 4900 }).text).toContain("Conecte");
    expect(classifyWalletError({ code: -32002 }).text).toContain("ja esta esperando");
    expect(classifyWalletError({ code: 4902 }).text).toContain("nao conhece esta rede");
  });
});

describe("what is not a code", () => {
  test("a timeout of ours is its own kind", () => {
    expect(classifyWalletError(new WalletTimeoutError())).toEqual({ kind: "tempo_esgotado", code: null, text: "A carteira nao respondeu a tempo. Abra a carteira e tente de novo" });
  });

  test("anything else is unknown, with a generic text, whatever it is made of", () => {
    for (const value of [null, undefined, "boom", 42, {}, [], { code: "4001" }, { code: 4001.5 }, { code: NaN }, { code: 1 }, new Error("x")]) {
      const info = classifyWalletError(value);
      expect(info.kind).toBe("desconhecido");
      expect(info.text).toBe("A carteira recusou ou falhou. Tente de novo");
    }
    // an unknown numeric code keeps the number for the log, and nothing else
    expect(classifyWalletError({ code: 1 }).code).toBe(1);
    expect(classifyWalletError("boom").code).toBeNull();
  });

  test("the message the wallet wrote is never in the text, and a getter that throws does not break the classification", () => {
    const SENTINEL = "SENTINEL-0xabc123-secret";
    for (const code of [4001, 4100, 4900, 4902, -32002, -32603, 1234]) {
      const info = classifyWalletError({ code, message: SENTINEL, data: SENTINEL });
      expect(JSON.stringify(info)).not.toContain(SENTINEL);
    }
    const hostile = {
      get code(): number {
        throw new Error("no");
      },
    };
    expect(classifyWalletError(hostile).kind).toBe("desconhecido");
  });

  test("plain ASCII, no middle dot, em dash or en dash, in every text", () => {
    const infos = [4001, 4100, 4200, 4900, 4901, 4902, -32002, -32602, -32603, -32601, 99].map((code) => classifyWalletError({ code }));
    infos.push(classifyWalletError(new WalletTimeoutError()), classifyWalletError(null));
    for (const info of infos) {
      expect(/^[\x20-\x7e]+$/.test(info.text)).toBe(true);
      expect(info.text).not.toMatch(/[·—–]/);
    }
  });
});
