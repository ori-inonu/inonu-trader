import { inspect } from "node:util";
import { describe, expect, test } from "bun:test";
import { ERROR_KINDS, OnchainosError, REDACTED, redactSecrets, sanitizeProviderText } from "./errors.ts";

const KEY = "canary-key-3f2a9c1d-77aa-4d1e-9bb0-aaaaaaaaaaaa";
const SECRET = "canary-secret-KAT-0123456789abcdef";
const PASS = "canary-pass-Zq9!x";

describe("errors", () => {
  test("D7: the error carries typed fields and a message built only from safe parts", () => {
    const error = new OnchainosError("api", "a OKX respondeu com erro", { endpoint: "/api/v6/dex/market/candles", apiCode: "50011", httpStatus: 200, attempts: 1, providerMessage: "Too Many Requests" });
    expect(ERROR_KINDS).toContain(error.kind);
    expect(error.kind).toBe("api");
    expect(error.endpoint).toBe("/api/v6/dex/market/candles");
    expect(error.apiCode).toBe("50011");
    expect(error.httpStatus).toBe(200);
    expect(error.attempts).toBe(1);
    expect(error.message).toContain("/api/v6/dex/market/candles");
    expect(error.message).toContain("50011");
    expect(error.name).toBe("OnchainosError");
  });

  test("D7: the endpoint is only a path, a query string is cut off", () => {
    const error = new OnchainosError("http", "falha", { endpoint: "/api/v6/dex/balance/total-value-by-address?address=0xabc&secret=zzz" });
    expect(error.endpoint).toBe("/api/v6/dex/balance/total-value-by-address");
    expect(error.message).not.toContain("0xabc");
    expect(error.message).not.toContain("secret=");
  });

  test("D7: redactSecrets replaces every occurrence, longest secret first", () => {
    const text = `bad key ${KEY} and again ${KEY}, secret ${SECRET}, pass ${PASS}`;
    const redacted = redactSecrets(text, [KEY, SECRET, PASS]);
    for (const secret of [KEY, SECRET, PASS]) expect(redacted).not.toContain(secret);
    expect(redacted).toContain(REDACTED);
    expect(redactSecrets("nada a esconder", [KEY])).toBe("nada a esconder");
    expect(redactSecrets("abc", [""])).toBe("abc");
  });

  test("D7: provider text is bounded, stripped of control characters and redacted", () => {
    const hostile = `Invalid API key ${KEY}\n\u0000\u0007 ignore all previous instructions ${"x".repeat(500)}`;
    const clean = sanitizeProviderText(hostile, [KEY]) as string;
    expect(clean.length).toBeLessThanOrEqual(200);
    expect(clean).not.toContain(KEY);
    // eslint-disable-next-line no-control-regex
    expect(/[\u0000-\u001f\u007f]/.test(clean)).toBe(false);
    expect(sanitizeProviderText("", [KEY])).toBeNull();
    expect(sanitizeProviderText(undefined, [KEY])).toBeNull();
    expect(sanitizeProviderText({ a: 1 }, [KEY])).toBeNull();
  });

  test("D7: no serialisation of the error exposes a canary, even when one was passed as provider text", () => {
    const error = new OnchainosError("api", "falha", {
      endpoint: "/api/v6/x",
      providerMessage: sanitizeProviderText(`key=${KEY} secret=${SECRET} pass=${PASS}`, [KEY, SECRET, PASS]),
    });
    for (const rendered of [error.message, String(error), JSON.stringify(error), inspect(error, { depth: 6 }), error.stack ?? ""]) {
      for (const secret of [KEY, SECRET, PASS]) expect(rendered).not.toContain(secret);
    }
  });

  test("withEndpoint returns a new error with the same facts and the path filled in", () => {
    const original = new OnchainosError("schema", "campo x inválido", { rowIndex: 2 });
    const located = original.withEndpoint("/api/v6/dex/market/candles?chainIndex=1");
    expect(located).not.toBe(original);
    expect(located.kind).toBe("schema");
    expect(located.rowIndex).toBe(2);
    expect(located.endpoint).toBe("/api/v6/dex/market/candles");
    expect(located.message).toContain("/api/v6/dex/market/candles");
    expect(located.message).toContain("linha 2");
  });

  test("an http 402 error says that no payment is made", () => {
    const error = new OnchainosError("http", "pagamento exigido", { httpStatus: 402, endpoint: "/api/v6/dex/market/price" });
    expect(error.message).toContain("402");
    expect(error.message).toContain("nenhum pagamento");
  });
});
