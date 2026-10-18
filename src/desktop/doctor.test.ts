// T1.8 / WIN-8, AC-WIN-5: the Doctor shows eight items, each with a message and an action, and the clock skew is measured.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DetectedBrowser } from "./browser";
import { startCore, type Core } from "./core";
import { DOCTOR_IDS, runDoctor, type DoctorDeps, type DoctorReport } from "./doctor";

const BROWSER: DetectedBrowser = { kind: "edge", exe: "C:\\edge\\msedge.exe", userData: "C:\\ud", profile: "Default", walletEnabled: true };

function deps(overrides: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    port: 47321,
    defaultPort: 47321,
    pickBrowser: () => BROWSER,
    measureClock: async () => ({ offsetMs: 120, roundTripMs: 210, measuredAtMs: 1 }),
    credentials: () => ({ okx: "complete", model: true }),
    probeOnchain: async () => ({ ok: true, count: 54 }),
    findPython: () => "C:\\Python\\python.exe",
    now: () => 1_000,
    ...overrides,
  };
}

const byId = (report: DoctorReport, id: string) => report.items.find((item) => item.id === id)!;

describe("the eight items", () => {
  test("a healthy machine reports all eight, in a fixed order, each with a message", async () => {
    const report = await runDoctor(deps());
    expect(report.items.map((i) => i.id)).toEqual([...DOCTOR_IDS]);
    expect(report.items).toHaveLength(8);
    expect(report.items.every((i) => i.message.length > 0 && i.label.length > 0)).toBe(true);
    expect(report.items.every((i) => i.status === "ok")).toBe(true);
    expect(report.items.every((i) => i.action === null)).toBe(true);
    expect(report.summary).toEqual({ ok: 8, atencao: 0, falha: 0, nao_verificado: 0 });
    expect(report.checkedAtMs).toBe(1_000);
  });

  test("no Edge or Chrome is a failure with an action, and the extension is then not verified", async () => {
    const report = await runDoctor(deps({ pickBrowser: () => null }));
    expect(byId(report, "navegador")).toMatchObject({ status: "falha" });
    expect(byId(report, "navegador").action).toMatch(/Edge|Chrome/);
    expect(byId(report, "extensao").status).toBe("nao_verificado");
  });

  test("a browser without the OKX Wallet enabled is a warning with the profile named", async () => {
    const report = await runDoctor(deps({ pickBrowser: () => ({ ...BROWSER, walletEnabled: false }) }));
    expect(byId(report, "navegador").status).toBe("ok");
    const extension = byId(report, "extensao");
    expect(extension.status).toBe("atencao");
    expect(extension.message).toContain("Default");
    expect(extension.action).toMatch(/OKX Wallet/);
  });

  test("the port item says which port is bound and warns on an alternative one", async () => {
    expect(byId(await runDoctor(deps()), "porta").message).toContain("47321");
    const alt = byId(await runDoctor(deps({ port: 50123 })), "porta");
    expect(alt.status).toBe("atencao");
    expect(alt.message).toContain("50123");
    expect(alt.message).toContain("47321");
  });

  test("python is optional: found or not it never fails", async () => {
    const found = byId(await runDoctor(deps()), "python");
    expect(found.status).toBe("ok");
    const missing = byId(await runDoctor(deps({ findPython: () => null })), "python");
    expect(missing.status).toBe("ok");
    expect(missing.message).toMatch(/nao precisa|opcional/i);
  });
});

describe("the clock is measured, not presumed", () => {
  test("77 s behind: a warning that says so in seconds and which way, with the Windows action", async () => {
    const report = await runDoctor(deps({ measureClock: async () => ({ offsetMs: 76_671, roundTripMs: 309, measuredAtMs: 1 }) }));
    const clock = byId(report, "relogio");
    expect(clock.status).toBe("atencao");
    expect(clock.message).toContain("77 s");
    expect(clock.message).toContain("atrasada");
    expect(clock.action).toMatch(/hora/i);
    expect(byId(report, "rede").status).toBe("ok");
  });

  test("ahead is said as ahead, and within 10 s is fine", async () => {
    const ahead = byId(await runDoctor(deps({ measureClock: async () => ({ offsetMs: -45_000, roundTripMs: 100, measuredAtMs: 1 }) })), "relogio");
    expect(ahead.status).toBe("atencao");
    expect(ahead.message).toContain("adiantada");
    expect(byId(await runDoctor(deps({ measureClock: async () => ({ offsetMs: 9_000, roundTripMs: 100, measuredAtMs: 1 }) })), "relogio").status).toBe("ok");
  });

  test("when the exchange cannot be reached the skew is unknown and the network item fails", async () => {
    const report = await runDoctor(deps({ measureClock: async () => null }));
    expect(byId(report, "relogio").status).toBe("atencao");
    expect(byId(report, "rede").status).toBe("falha");
    expect(byId(report, "rede").action).toMatch(/conexao|proxy|firewall/i);
  });
});

describe("a vault that does not answer", () => {
  test("the credentials item fails and says the keys could not be read, not that they are absent, and the probe does not run", async () => {
    let probed = 0;
    const report = await runDoctor(deps({ credentials: () => ({ okx: "absent", model: false, vault: "indisponivel" as const }), probeOnchain: async () => { probed += 1; return { ok: true, count: 1 }; } }));
    const item = report.items.find((i) => i.id === "credenciais")!;
    expect(item.status).toBe("falha");
    expect(item.message).toContain("cofre do Windows");
    expect(item.message).not.toContain("ausente");
    expect(item.action).not.toBeNull();
    expect(probed).toBe(0);
  });
});

describe("credentials and the free probe", () => {
  test("absent and incomplete credentials fail with an action; the probe does not run", async () => {
    for (const okx of ["absent", "incomplete"] as const) {
      let probed = 0;
      const report = await runDoctor(deps({ credentials: () => ({ okx, model: false }), probeOnchain: async () => { probed += 1; return { ok: true, count: 1 }; } }));
      expect(byId(report, "credenciais").status).toBe("falha");
      expect(byId(report, "credenciais").action).toMatch(/Configuracoes/);
      expect(byId(report, "sonda").status).toBe("nao_verificado");
      expect(probed).toBe(0);
    }
  });

  test("complete OKX credentials without the model key is a warning that names Pedir ao Inonu", async () => {
    const credentials = byId(await runDoctor(deps({ credentials: () => ({ okx: "complete", model: false }) })), "credenciais");
    expect(credentials.status).toBe("atencao");
    expect(credentials.message).toMatch(/modelo/i);
    expect(credentials.action).toMatch(/Pedir ao Inonu/);
  });

  test("a probe error is shown by its code; quota and pace problems are warnings, the rest failures", async () => {
    const results: Record<string, string> = {};
    for (const error of ["provider_payment_required", "rate_limited", "pace_limited", "budget_exhausted", "provider_unauthorized", "clock_skew", "provider_error"]) {
      const item = byId(await runDoctor(deps({ probeOnchain: async () => ({ ok: false, error }) })), "sonda");
      expect(item.message).toContain(error);
      results[error] = item.status;
    }
    expect(results).toEqual({ provider_payment_required: "atencao", rate_limited: "atencao", pace_limited: "atencao", budget_exhausted: "atencao", provider_unauthorized: "falha", clock_skew: "falha", provider_error: "falha" });
  });

  test("a successful probe says how many networks answered", async () => {
    const item = byId(await runDoctor(deps({ probeOnchain: async () => ({ ok: true, count: 54 }) })), "sonda");
    expect(item.status).toBe("ok");
    expect(item.message).toContain("54");
  });
});

describe("robustness", () => {
  test("a check that throws becomes a failure of that item only; the report is still complete", async () => {
    const report = await runDoctor(deps({ credentials: () => { throw new Error("SENTINEL-leak-4f9a"); }, findPython: () => { throw new Error("boom"); } }));
    expect(report.items).toHaveLength(8);
    expect(byId(report, "credenciais").status).toBe("falha");
    expect(byId(report, "python").status).toBe("falha");
    expect(byId(report, "navegador").status).toBe("ok");
    expect(JSON.stringify(report)).not.toContain("SENTINEL-leak-4f9a");
  });

  test("a probe that never answers times out instead of hanging the screen", async () => {
    const report = await runDoctor(deps({ probeOnchain: () => new Promise(() => {}), timeoutMs: 40 }));
    expect(byId(report, "sonda").status).toBe("falha");
    expect(byId(report, "sonda").message).toMatch(/sem resposta/i);
  });

  test("the rendered text is plain ASCII: no accents, no middle dot, em dash or en dash", async () => {
    const reports = [
      await runDoctor(deps()),
      await runDoctor(deps({ pickBrowser: () => null, measureClock: async () => null, credentials: () => ({ okx: "absent", model: false }), findPython: () => null })),
      await runDoctor(deps({ measureClock: async () => ({ offsetMs: 90_000, roundTripMs: 1, measuredAtMs: 1 }), port: 1234, credentials: () => ({ okx: "complete", model: false }), probeOnchain: async () => ({ ok: false, error: "rate_limited" }) })),
    ];
    for (const report of reports) {
      for (const item of report.items) {
        for (const text of [item.label, item.message, item.action ?? ""]) expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
      }
    }
  });
});

describe("the /__inonu/doctor route of the core", () => {
  let root = "";
  let core: Core | null = null;
  afterEach(() => {
    core?.stop();
    core = null;
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  function start(withDoctor: boolean) {
    root = mkdtempSync(join(tmpdir(), "inonu-doctor-"));
    mkdirSync(join(root, "web"), { recursive: true });
    writeFileSync(join(root, "web", "index.html"), "<html><body>desk</body></html>");
    core = startCore({ port: 0, webDir: join(root, "web"), version: "t", idleMs: 0, handlers: {}, ...(withDoctor ? { doctor: () => runDoctor(deps()) } : {}) });
    return core;
  }

  test("answers the page's same-origin GET with the report", async () => {
    const c = start(true);
    const res = await fetch(`${c.origin}/__inonu/doctor`, { headers: { "sec-fetch-site": "same-origin" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { ok: boolean; items: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.items).toHaveLength(8);
  });

  test("a cross-site page cannot read it, and only GET is accepted", async () => {
    const c = start(true);
    expect((await fetch(`${c.origin}/__inonu/doctor`, { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await fetch(`${c.origin}/__inonu/doctor`, { headers: { "sec-fetch-site": "same-site" } })).status).toBe(403);
    expect((await fetch(`${c.origin}/__inonu/doctor`, { method: "POST", headers: { "sec-fetch-site": "same-origin" } })).status).toBe(405);
  });

  test("without a doctor configured it is a plain 404, not the desk page", async () => {
    const c = start(false);
    const res = await fetch(`${c.origin}/__inonu/doctor`, { headers: { "sec-fetch-site": "same-origin" } });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("json");
  });
});
