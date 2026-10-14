// WIN-8, AC-WIN-5: the Doctor screen draws the eight items with their status as TEXT (never colour alone), the action
// to take, and an honest message when the data is not there. Plain ASCII, nothing animated.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DoctorScreen } from "@/components/Doctor/DoctorView";
import type { DoctorReport } from "./client";

const report: DoctorReport = {
  checkedAtMs: 1_791_742_100_000,
  items: [
    { id: "navegador", label: "Navegador", status: "ok", message: "Microsoft Edge encontrado (perfil Default).", action: null },
    { id: "extensao", label: "Extensao OKX Wallet", status: "atencao", message: "A OKX Wallet nao esta ativa no perfil Default.", action: "Instale ou ative a extensao OKX Wallet." },
    { id: "credenciais", label: "Credenciais", status: "falha", message: "Credencial da OKX ausente.", action: "Abra Configuracoes e informe chave, segredo e senha." },
    { id: "sonda", label: "Sonda OnchainOS", status: "nao_verificado", message: "Sem credencial completa, a sonda gratuita nao rodou.", action: null },
  ],
};

const draw = (state: Parameters<typeof DoctorScreen>[0]["state"], busy = false) => renderToStaticMarkup(<DoctorScreen state={state} busy={busy} onRetry={() => {}} />);

describe("a ready report", () => {
  const html = draw({ phase: "ready", report });

  test("every item shows its label, its status in words and its message", () => {
    for (const text of ["Navegador", "Extensao OKX Wallet", "Credenciais", "Sonda OnchainOS", "Ok", "Atencao", "Falha", "Nao verificado", "Credencial da OKX ausente."]) expect(html).toContain(text);
  });

  test("the action appears only where there is one, labelled", () => {
    expect(html).toContain("Abra Configuracoes e informe chave, segredo e senha.");
    expect(html.match(/O que fazer/g)).toHaveLength(2);
  });

  test("a summary counts the statuses and the page links back to the desk", () => {
    expect(html).toContain("1 ok");
    expect(html).toContain("1 atencao");
    expect(html).toContain("1 falha");
    expect(html).toContain('href="/"');
  });

  test("the status is carried by data attributes for styling and by text for reading", () => {
    expect(html).toContain('data-status="falha"');
    expect(html).toContain('data-status="nao_verificado"');
  });
});

describe("the other states", () => {
  test("loading says so and offers no result", () => {
    const html = draw({ phase: "loading" }, true);
    expect(html).toContain("Verificando");
    expect(html).not.toContain("O que fazer");
  });

  test("each error is explained in plain words, and the retry button is there", () => {
    expect(draw({ phase: "error", error: "not_in_app" })).toContain("so existe no aplicativo instalado");
    expect(draw({ phase: "error", error: "unreachable" })).toContain("nao respondeu");
    expect(draw({ phase: "error", error: "schema" })).toContain("inesperado");
    expect(draw({ phase: "error", error: "unreachable" })).toContain("Verificar de novo");
  });

  test("the retry button is disabled while a check runs", () => {
    expect(draw({ phase: "ready", report }, true)).toMatch(/<button[^>]*disabled[^>]*>/);
  });
});

describe("typography and motion rules", () => {
  test("plain ASCII text: no accents, no middle dot, em dash or en dash", () => {
    for (const html of [draw({ phase: "ready", report }), draw({ phase: "loading" }), draw({ phase: "error", error: "not_in_app" })]) {
      const text = html.replace(/<[^>]*>/g, " ");
      expect(/^[\x20-\x7e\s]*$/.test(text)).toBe(true);
    }
  });

  test("nothing blinks or pulses: no animation names in the stylesheet", async () => {
    const css = await Bun.file(new URL("../../components/Doctor/DoctorView.module.css", import.meta.url)).text();
    expect(css).not.toMatch(/@keyframes|animation\s*:|animation-name|blink/i);
  });
});
