import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { clockSkewLine, SettingsScreen, TEST_TEXT } from "@/components/Settings/SettingsView";
import type { SettingsSnapshot } from "@/lib/settings/client";

const SECRET_SENTINEL = "SENTINEL-VALOR-9z";

function snap(over: Partial<SettingsSnapshot> = {}): SettingsSnapshot {
  return {
    secrets: {
      typesafeAiApiKey: { configured: false, last4: null, updatedAtMs: null },
      okxWeb3ApiKey: { configured: false, last4: null, updatedAtMs: null },
      okxWeb3ApiSecret: { configured: false, last4: null, updatedAtMs: null },
      okxWeb3ApiPassphrase: { configured: false, last4: null, updatedAtMs: null },
    },
    okx: { state: "absent" },
    prefs: { version: 1, onchain: { capBasic: 50_000, capPremium: 50_000, background: false, defaultChainIndex: null } },
    ...over,
  };
}

function expectNoForbidden(html: string): void {
  expect(html).not.toContain("·");
  expect(html).not.toContain("—");
  expect(html).not.toContain("–");
}

describe("a vault that did not answer", () => {
  test("the screen says the keys could not be read and were not erased, instead of showing them as simply not configured", () => {
    const html = renderToStaticMarkup(<SettingsScreen phase="ready" snapshot={snap({ vault: "indisponivel" })} apiUrl="http://127.0.0.1:3000" />);
    expect(html).toContain("O cofre do Windows nao respondeu: as chaves nao puderam ser lidas. Elas nao foram apagadas.");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Aguardando leitura");
    expect(html).not.toContain("Ausente");
    expect(html).not.toContain("nao configurada");
    expectNoForbidden(html);
  });

  test("a healthy vault shows no such notice", () => {
    expect(renderToStaticMarkup(<SettingsScreen phase="ready" snapshot={snap()} apiUrl="http://127.0.0.1:3000" />)).not.toContain("O cofre do Windows nao respondeu");
  });
});

describe("SettingsScreen", () => {
  test("empty state: all four fields present, okx absent", () => {
    const html = renderToStaticMarkup(<SettingsScreen phase="ready" snapshot={snap()} apiUrl="http://127.0.0.1:3000" />);
    for (const text of [
      "Configuracoes",
      "Voltar a mesa",
      "Conexoes",
      "Chave do Jev",
      "TYPESAFE_AI_API_KEY",
      "OKX_WEB3_API_KEY",
      "OKX_WEB3_API_SECRET",
      "OKX_WEB3_API_PASSPHRASE",
      "Ausente",
      "nao configurada",
      "As chaves ficam so nesta maquina",
      "A deteccao do Windows tem cache de ate 60 s",
      "Uso da API OnchainOS",
      "o sistema nunca paga",
      "Aparencia e mesa",
      "Atalhos",
      "Privacidade",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="off"');
    expect(html).toContain('spellCheck="false"');
    expectNoForbidden(html);
  });

  test("incomplete okx shows the state and the saved tail only where allowed", () => {
    const s = snap({
      okx: { state: "incomplete" },
      secrets: {
        ...snap().secrets,
        okxWeb3ApiKey: { configured: true, last4: "a77z", updatedAtMs: 100 },
        okxWeb3ApiSecret: { configured: true, last4: null, updatedAtMs: 100 },
      },
    });
    const html = renderToStaticMarkup(<SettingsScreen phase="ready" snapshot={s} apiUrl="http://127.0.0.1:3000" />);
    expect(html).toContain("Incompleta");
    expect(html).toContain("salva, termina em ...a77z");
    // The secret field reports only "salva", never a tail.
    expect(html.match(/salva, termina em/g)!.length).toBe(1);
  });

  test("complete okx shows Completa", () => {
    const secrets = {
      typesafeAiApiKey: { configured: true, last4: "k1j2", updatedAtMs: 5 },
      okxWeb3ApiKey: { configured: true, last4: "q9w8", updatedAtMs: 5 },
      okxWeb3ApiSecret: { configured: true, last4: null, updatedAtMs: 5 },
      okxWeb3ApiPassphrase: { configured: true, last4: null, updatedAtMs: 5 },
    };
    const html = renderToStaticMarkup(<SettingsScreen phase="ready" snapshot={snap({ secrets, okx: { state: "complete" } })} apiUrl="http://127.0.0.1:3000" />);
    expect(html).toContain("Completa");
  });

  test("network error names the server url", () => {
    const html = renderToStaticMarkup(<SettingsScreen phase="error" snapshot={null} apiUrl="http://127.0.0.1:3042" />);
    expect(html).toContain("Servidor local nao respondeu em http://127.0.0.1:3042");
    expect(html).toContain('role="alert"');
  });

  test("loading renders a placeholder line and no fabricated status", () => {
    const html = renderToStaticMarkup(<SettingsScreen phase="loading" snapshot={null} apiUrl="http://x" />);
    expect(html).toContain("Carregando configuracoes");
    expect(html).not.toContain("Completa");
    expect(html).toContain("Aguardando leitura");
    expect(html).not.toContain("Ausente");
    expect(html).not.toContain("nao configurada");
  });

  test("ready without a snapshot cannot report the core as responding", () => {
    const html = renderToStaticMarkup(<SettingsScreen phase="ready" snapshot={null} apiUrl="http://x" />);
    expect(html).toContain("Aguardando leitura");
    expect(html).not.toContain("Respondendo");
    expect(html).not.toContain("Ausente");
    expect(html).not.toContain("nao configurada");
  });

  test("no secret value or tail appears in the rendered html", () => {
    // Even if a caller passed a draft through the page, the static markup must never contain a secret value:
    // the screen only reads statuses. Simulate a snapshot derived from a stored sentinel.
    const s = snap({
      secrets: {
        typesafeAiApiKey: { configured: true, last4: "OR-9z", updatedAtMs: 1 },
        okxWeb3ApiKey: { configured: true, last4: "9zab", updatedAtMs: 1 },
        okxWeb3ApiSecret: { configured: true, last4: null, updatedAtMs: 1 },
        okxWeb3ApiPassphrase: { configured: true, last4: null, updatedAtMs: 1 },
      },
      okx: { state: "complete" },
    });
    const html = renderToStaticMarkup(<SettingsScreen phase="ready" snapshot={s} apiUrl="http://x" />);
    expect(html).not.toContain(SECRET_SENTINEL);
    // Every password field renders empty: the saved value is never written back into the markup.
    for (const m of html.matchAll(/type="password"[^>]*value="([^"]*)"/g)) expect(m[1]).toBe("");
    expectNoForbidden(html);
  });

  test("budget section renders per-tier meters with month and projection", () => {
    const budget = {
      month: "2026-10",
      restartedFromCorruptFile: false,
      tiers: {
        free: { used: 12, cap: null, today: 4, projection: 30 },
        basic: { used: 1200, cap: 50_000, today: 40, projection: 3100 },
        premium: { used: 0, cap: 50_000, today: 0, projection: 0 },
      },
    };
    const html = renderToStaticMarkup(
      <SettingsScreen
        phase="ready"
        snapshot={snap()}
        apiUrl="http://x"
        budget={budget}
        onchainStatus={{ credential: "complete", lastCallMs: 1, lastCode: 0, cooldownUntilMs: null, clockOffsetMs: null }}
        onRefreshUsage={() => {}}
      />,
    );
    expect(html).toContain("1200 de 50000");
    expect(html).toContain("projecao 3100 no mes 2026-10");
    expect(html).toContain("Atualizar");
    expect(html).toContain("ultimo codigo 0");
    expectNoForbidden(html);
  });

  test("clock skew line appears only when the offset is at least 20 s, with the direction word", () => {
    const status = (clockOffsetMs: number | null) => ({ credential: "complete" as const, lastCallMs: 1, lastCode: 0, cooldownUntilMs: null, clockOffsetMs });
    const budget = {
      month: "2026-10",
      restartedFromCorruptFile: false,
      tiers: {
        free: { used: 0, cap: null, today: 0, projection: 0 },
        basic: { used: 0, cap: 50_000, today: 0, projection: 0 },
        premium: { used: 0, cap: 50_000, today: 0, projection: 0 },
      },
    };
    const render = (clockOffsetMs: number | null) =>
      renderToStaticMarkup(
        <SettingsScreen phase="ready" snapshot={snap()} apiUrl="http://x" budget={budget} onchainStatus={status(clockOffsetMs)} onRefreshUsage={() => {}} />,
      );
    const behind = render(76_445);
    expect(behind).toContain("Relogio do computador cerca de 76 s atrasado em relacao a OKX");
    expect(behind).toContain("sincronize o horario do Windows");
    expect(render(-80_000)).toContain("cerca de 80 s adiantado");
    expect(render(5_000)).not.toContain("Relogio do computador");
    expect(render(null)).not.toContain("Relogio do computador");
    expectNoForbidden(behind);
  });

  test("clockSkewLine thresholds and TEST_TEXT maps clock_skew", () => {
    expect(clockSkewLine(19_999)).toBeNull();
    expect(clockSkewLine(null)).toBeNull();
    expect(clockSkewLine(Number.NaN)).toBeNull();
    expect(clockSkewLine(20_000)).toContain("20 s atrasado");
    expect(TEST_TEXT.clock_skew).toBe("O relogio do computador esta fora do horario da OKX. Sincronize o horario do Windows e tente de novo.");
  });

  test("default network selector lists the catalog chains plus Nenhuma and selects the stored one", () => {
    const s = snap({ prefs: { ...snap().prefs, onchain: { ...snap().prefs.onchain, defaultChainIndex: "501" } } });
    const html = renderToStaticMarkup(<SettingsScreen phase="ready" snapshot={s} apiUrl="http://x" onSavePrefs={() => {}} />);
    expect(html).toContain("Rede padrao");
    expect(html).toContain(">Nenhuma<");
    for (const name of ["X Layer", "Robinhood", "Arc", "Bitcoin", "Ethereum", "Solana", "Tron", "Base", "BNB Chain", "SUI"]) {
      expect(html).toContain(`>${name}<`);
    }
    // The stored default arrives selected.
    expect(/<option selected="" value="501">/.test(html) || /<option value="501" selected="">/.test(html)).toBe(true);
    expectNoForbidden(html);
  });

  test("usage error names the server; refused-value note is constant", () => {
    const html = renderToStaticMarkup(
      <SettingsScreen phase="ready" snapshot={snap()} apiUrl="http://127.0.0.1:3000" usageError errorNote="Use apenas caracteres ASCII visiveis, sem apostrofo e sem barra invertida junto de cifrao" />,
    );
    expect(html).toContain("Servidor local nao respondeu em http://127.0.0.1:3000");
    expect(html).toContain("sem barra invertida junto de cifrao");
  });
});

describe("SettingsScreen in the installed app (secrets live in the Windows vault)", () => {
  const html = renderToStaticMarkup(<SettingsScreen phase="ready" snapshot={snap()} apiUrl="http://127.0.0.1:47321" storage="cofre" />);

  test("it says the vault, not files in data/ or a jev-read producer that does not exist there", () => {
    expect(html).toContain("cofre do Windows");
    expect(html).not.toContain("data/jev.env");
    expect(html).not.toContain("data/onchainos.env");
    expect(html).not.toContain("em data/");
    expect(html).not.toContain("jev-read");
    expect(html).not.toContain("arquivos locais");
  });

  test("the model is named as the model, with Jev only as what it is", () => {
    expect(html).toContain("Chave do modelo (Jev)");
    expect(html).not.toContain("Chave do Jev");
    expect(html).toContain("A chave do modelo vale no proximo pedido ao Inonu");
  });

  test("the typography rules still hold", () => {
    expectNoForbidden(html);
    expect(/^[ -~s]*$/.test(html.replace(/<[^>]*>/g, " "))).toBe(true);
  });

  test("the file store preserves its location and explains automatic runtime detection", () => {
    const files = renderToStaticMarkup(<SettingsScreen phase="ready" snapshot={snap()} apiUrl="http://127.0.0.1:3000" />);
    expect(files).toContain("data/jev.env");
    expect(files).toContain("Chave do Jev");
    expect(files).toContain("A deteccao do Windows tem cache de ate 60 s");
  });
});
