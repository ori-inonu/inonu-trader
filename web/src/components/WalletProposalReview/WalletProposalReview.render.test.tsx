import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WalletProposalReviewView } from "./WalletProposalReview";
import type { WalletProposalReviewSnapshot } from "../../lib/wallet-proposal-review";

const EMPTY: WalletProposalReviewSnapshot = { status: "empty", text: "", reason: null, executionQualified: false, proposal: null, observedAtMs: null };
const noAction = () => {};
test("manual review starts empty, labelled, explained and disabled without a session", () => {
  const html = renderToStaticMarkup(<WalletProposalReviewView snapshot={EMPTY} canCheck={false} onEdit={noAction} onCheck={noAction} onClear={noAction} />);
  expect(html).toContain("Proposta em JSON");
  expect(html).toContain('aria-describedby="proposal-review-description proposal-review-connection"');
  expect(html).toContain("Conferir na carteira");
  expect(html).toContain("Limpar");
  expect(html).toContain('disabled=""');
  expect(html).toContain("Execução não habilitada");
  expect(html).toContain("Origem não verificada. Esta consulta confere formato, conta, rede e prazo; não comprova segurança, custo ou retorno.");
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain('></textarea>');
});

test("captured proposal shows exact atomic integers and escaped unverified labels", () => {
  const snapshot: WalletProposalReviewSnapshot = { ...EMPTY, status: "ready_for_review", observedAtMs: 1800000000000, proposal: {
    version: 1, planId: '<img src=x onerror="window.attack=1">', quoteHash: "<script>attack()</script>", chainId: "0xc4",
    from: "0x2222222222222222222222222222222222222222", to: "0x3333333333333333333333333333333333333333", data: "0xabcd",
    valueAtomic: "9007199254740993", gasLimitAtomic: "21000", maxFeePerGasAtomic: "2", maxPriorityFeePerGasAtomic: "1", createdAtMs: 1799999999900, expiresAtMs: 1800000005000,
  } };
  const html = renderToStaticMarkup(<WalletProposalReviewView snapshot={snapshot} canCheck={true} onEdit={noAction} onCheck={noAction} onClear={noAction} />);
  expect(html).toContain("9007199254740993");
  expect(html).toContain("42000");
  expect(html).toContain("Plano (não verificado)");
  expect(html).toContain("Identificador da cotação (não autenticado)");
  expect(html).toContain("&lt;img");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<a ");
  expect(html).toContain("0xabcd");
  expect(html).toContain("Calldata completa (2 bytes; 6 caracteres)");
  expect(html).toContain("1800000000000");
  expect(html).toContain("1800000005000");
  expect(html).not.toContain('open=""');
});

for (const [reason, message] of [
  ["input_empty", "Informe uma proposta em JSON para conferir."],
  ["input_too_large", "A proposta excede o limite de 262144 caracteres UTF-16."],
  ["invalid_json", "O texto não contém JSON válido."],
  ["invalid_proposal", "Formato da proposta inválido. Confira campos, valores atômicos e rede."],
  ["session_unavailable", "Conecte a carteira OKX para conferir a proposta."],
  ["session_changed", "A sessão da carteira mudou. Confira novamente de forma explícita."],
  ["identity_mismatch", "Conta ou rede da carteira não corresponde à proposta."],
  ["expired", "A validade da proposta terminou. Informe uma proposta atual."],
  ["not_yet_valid", "A proposta ainda não está dentro do prazo de validade."],
  ["clock_regressed", "O relógio recuou. A conferência foi invalidada."],
  ["invalid_clock", "Não foi possível validar o relógio desta sessão."],
  ["provider_timeout", "A carteira não respondeu dentro do prazo. Confira novamente."],
  ["provider_error", "Não foi possível conferir a resposta da carteira."],
  ["invalid_provider_response", "Não foi possível conferir a resposta da carteira."],
  ["<script>PRIVATE ERROR</script>", "A proposta não pôde ser conferida. Revise os dados e a conexão."],
] as const) {
  test(`blocked reason ${reason} has sanitized Portuguese feedback`, () => {
    const html=renderToStaticMarkup(<WalletProposalReviewView snapshot={{...EMPTY,status:"blocked",reason}} canCheck={true} onEdit={noAction} onCheck={noAction} onClear={noAction} />);
    expect(html).toContain(message);expect(html).toContain('data-execution-qualified="false"');expect(html).not.toContain("PRIVATE ERROR");expect(html).not.toContain("<dl>");
  });
}

test("pending state disables conference and shows a live message", () => {
  const html=renderToStaticMarkup(<WalletProposalReviewView snapshot={{...EMPTY,status:"checking",text:"{}"}} canCheck={true} onEdit={noAction} onCheck={noAction} onClear={noAction} />);
  expect(html).toContain("Consultando conta, rede e prazo…");expect(html).toContain('disabled=""');expect(html).toContain('aria-live="polite"');expect(html).toContain("Limpar");expect(html).not.toContain("<dl>");
});
