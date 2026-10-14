// WIN-8: the screen reads the Doctor report through a strict parser and tells apart "not the installed app" from "down".
import { describe, expect, test } from "bun:test";
import { fetchDoctor, parseDoctor } from "./client";

const item = (over: Record<string, unknown> = {}) => ({ id: "porta", label: "Porta local", status: "ok", message: "Escutando em 127.0.0.1:47321.", action: null, ...over });
const body = (over: Record<string, unknown> = {}) => ({ ok: true, checkedAtMs: 1_000, items: [item()], summary: { ok: 1 }, ...over });
const reply = (status: number, json: unknown) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => json });

describe("parseDoctor", () => {
  test("accepts the documented shape and keeps only the fields the screen draws", () => {
    expect(parseDoctor(body())).toEqual({ checkedAtMs: 1_000, items: [{ id: "porta", label: "Porta local", status: "ok", message: "Escutando em 127.0.0.1:47321.", action: null }] });
  });

  test("rejects anything else instead of drawing half a card", () => {
    for (const bad of [null, "x", {}, body({ ok: false }), body({ items: [] }), body({ items: "no" }), body({ checkedAtMs: "1" }), body({ items: [item({ status: "great" })] }), body({ items: [item({ action: 3 })] }), body({ items: [null] })]) {
      expect(parseDoctor(bad)).toBeNull();
    }
  });
});

describe("fetchDoctor", () => {
  test("reads the report from the core's own path", async () => {
    let asked = "";
    const result = await fetchDoctor("", async (url) => { asked = url; return { ok: true, status: 200, json: async () => body() }; });
    expect(asked).toBe("/__inonu/doctor");
    expect(result.ok).toBe(true);
  });

  test("404 means this is not the installed app (a dev server has no Doctor), not that the app is down", async () => {
    expect(await fetchDoctor("", reply(404, { ok: false }))).toEqual({ ok: false, error: "not_in_app" });
  });

  test("a network failure, a server error and an unreadable answer are told apart", async () => {
    expect(await fetchDoctor("", async () => { throw new Error("offline"); })).toEqual({ ok: false, error: "unreachable" });
    expect(await fetchDoctor("", reply(500, {}))).toEqual({ ok: false, error: "unreachable" });
    expect(await fetchDoctor("", reply(200, { ok: true, items: [] }))).toEqual({ ok: false, error: "schema" });
  });
});
