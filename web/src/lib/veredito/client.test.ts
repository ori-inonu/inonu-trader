import { describe, expect, test } from "bun:test";
import { createVereditoClient } from "./client";

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
const placarBody = { ok: true, placar: { estado: "nao_medido", minimo: 30, texto: "Placar: 0 de 30 respostas medidas. Sem numero ate la.", decisoes: { medidas: 0, total: 0 } }, gravador: {}, advisory: true, execution: "never" };

function client(answer: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Response | Promise<Response>) {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const c = createVereditoClient("http://core", async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET", headers: init?.headers ?? {}, ...(init?.body === undefined ? {} : { body: init.body }) });
    return answer(url, init);
  });
  return { c, calls };
}

describe("the Placar", () => {
  test("is read from the core and parsed strictly", async () => {
    const { c, calls } = client(() => json(placarBody));
    expect(await c.placar()).toEqual({ estado: "nao_medido", texto: "Placar: 0 de 30 respostas medidas. Sem numero ate la.", medidas: 0, minimo: 30 });
    expect(calls[0]).toMatchObject({ url: "http://core/inonu/placar", method: "GET" });
  });
  test("an old core, an error and a strange body are all nothing, never a throw", async () => {
    expect(await client(() => json({ ok: false }, 404)).c.placar()).toBeNull();
    expect(await client(() => json({ nope: 1 })).c.placar()).toBeNull();
    expect(await client(() => new Response("<html>", { status: 200 })).c.placar()).toBeNull();
    expect(await client(() => Promise.reject(new Error("offline"))).c.placar()).toBeNull();
  });
});

describe("the profile", () => {
  test("is read, and a profile from a core that sends something else is nothing", async () => {
    expect(await client(() => json({ ok: true, perfil: { capitalUsd: 1000, riskPct: 0.5 } })).c.perfil()).toEqual({ capitalUsd: 1000, riskPct: 0.5 });
    expect(await client(() => json({ ok: true, perfil: { capitalUsd: 1000 } })).c.perfil()).toBeNull();
    expect(await client(() => json({ ok: false }, 500)).c.perfil()).toBeNull();
  });

  test("a write carries the intent header and exactly the two numbers", async () => {
    const { c, calls } = client(() => json({ ok: true, perfil: { capitalUsd: 1000, riskPct: 0.5 } }));
    expect(await c.salvarPerfil({ capitalUsd: 1000, riskPct: 0.5 })).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ url: "http://core/inonu/perfil", method: "PUT", headers: { "x-inonu-intent": "user", "content-type": "application/json" } });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ capitalUsd: 1000, riskPct: 0.5 });
  });

  test("a refusal is a named reason, an old core and a lost connection too", async () => {
    expect(await client(() => json({ ok: false, code: "perfil_invalido" }, 400)).c.salvarPerfil({ capitalUsd: 1, riskPct: 99 })).toEqual({ ok: false, reason: "perfil_invalido" });
    expect(await client(() => json({ ok: false }, 404)).c.salvarPerfil({ capitalUsd: 1, riskPct: 1 })).toEqual({ ok: false, reason: "servidor_sem_rota" });
    expect(await client(() => json({ ok: false }, 500)).c.salvarPerfil({ capitalUsd: 1, riskPct: 1 })).toEqual({ ok: false, reason: "servidor_com_erro" });
    expect(await client(() => Promise.reject(new Error("offline"))).c.salvarPerfil({ capitalUsd: 1, riskPct: 1 })).toEqual({ ok: false, reason: "sem_conexao" });
  });

  test("a code that is too long is cut, and never echoes a message", async () => {
    const r = await client(() => json({ ok: false, code: "x".repeat(200) }, 400)).c.salvarPerfil({ capitalUsd: 1, riskPct: 1 });
    expect(r.ok === false && r.reason.length).toBe(40);
  });
});
