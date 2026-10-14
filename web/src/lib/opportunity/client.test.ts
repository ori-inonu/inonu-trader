// The read of the engine on the page's own origin: the contract, and a constant reason for each way it can fail. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { createEngineClient } from "./client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("the read", () => {
  test("asks the engine route of its own origin and gives back the state", async () => {
    const urls: string[] = [];
    const client = createEngineClient("http://core", async (url) => (urls.push(url), json({ ok: true, execution: "never", state: "idle" })));
    expect(await client.read()).toEqual({ ok: true, state: { state: "idle" } });
    expect(urls).toEqual(["http://core/inonu/opportunities"]);
  });

  test("each failure is one constant reason, never the text of the server", async () => {
    expect(await createEngineClient("", async () => { throw new Error("ECONNREFUSED 127.0.0.1:3000"); }).read()).toEqual({ ok: false, reason: "sem_conexao" });
    expect(await createEngineClient("", async () => json({}, 404)).read()).toEqual({ ok: false, reason: "servidor_sem_rota" });
    expect(await createEngineClient("", async () => json({ ok: false, code: "forbidden" }, 403)).read()).toEqual({ ok: false, reason: "origem_negada" });
    expect(await createEngineClient("", async () => json({ ok: true, execution: "now", state: "idle" })).read()).toEqual({ ok: false, reason: "resposta_invalida" });
    expect(await createEngineClient("", async () => new Response("<html>oops</html>")).read()).toEqual({ ok: false, reason: "resposta_invalida" });
  });
});
