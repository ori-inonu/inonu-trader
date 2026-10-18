import { validateWalletTransactionProposal, type WalletTransactionPreflightResult, type WalletTransactionProposal } from "./wallet-transaction-preflight";

export interface WalletProposalReviewSnapshot {
  status: "empty" | "edited" | "checking" | "blocked" | "ready_for_review";
  text: string;
  reason: string | null;
  executionQualified: false;
  proposal: WalletTransactionProposal | null;
  observedAtMs: number | null;
}

export interface WalletProposalReviewDependencies {
  preflightTransaction(input: unknown): Promise<WalletTransactionPreflightResult>;
  getSessionToken(): number;
  now(): number;
}

export function createWalletProposalReview(dependencies: WalletProposalReviewDependencies) {
  let text = "";
  let generation = 0;
  let disposed = false;
  const listeners = new Set<() => void>();
  let active: { sessionToken: number; proposal: WalletTransactionProposal; lastClock: number } | null = null;
  let snapshot: WalletProposalReviewSnapshot = { status: "empty", text, reason: null, executionQualified: false, proposal: null, observedAtMs: null };
  const publish = (next: WalletProposalReviewSnapshot, notify = true) => {
    if (disposed) return;
    snapshot = Object.freeze(next);
    if (notify) for (const listener of listeners) listener();
  };
  const block = (reason: string, notify = true) => {
    generation++; active = null;
    publish({ ...snapshot, status: "blocked", reason, proposal: null, observedAtMs: null }, notify);
  };
  const clock = (): number | null => {
    try { const value = dependencies.now(); return Number.isSafeInteger(value) && value >= 0 ? value : null; } catch { return null; }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { if (!disposed) listeners.add(listener); return () => { listeners.delete(listener); }; },
    clear() { this.edit(""); },
    dispose() {
      if (disposed) return;
      generation++; active = null; listeners.clear();
      snapshot = Object.freeze({ ...snapshot, status: "blocked", reason: "session_unavailable", proposal: null, observedAtMs: null });
      disposed = true;
    },
    validateCurrent(notify = true) {
      if (disposed || !active) return snapshot;
      let reason: string | null = null;
      const now = clock();
      if (dependencies.getSessionToken() !== active.sessionToken) reason = "session_changed";
      else if (now === null) reason = "invalid_clock";
      else if (now < active.lastClock) reason = "clock_regressed";
      else if (now >= active.proposal.expiresAtMs) reason = "expired";
      else if (now < active.proposal.createdAtMs) reason = "not_yet_valid";
      else active.lastClock = now;
      if (reason) block(reason, notify);
      return snapshot;
    },
    edit(value: string) { if (disposed) return; generation++; active = null; text = value; publish({ ...snapshot, text, status: text ? "edited" : "empty", reason: null, proposal: null, observedAtMs: null }); },
    async check() {
      if (disposed) return;
      this.validateCurrent();
      if (snapshot.status === "checking") return;
      const operation = ++generation;
      const sessionToken = dependencies.getSessionToken();
      if (text.length > 262144) { block("input_too_large"); return; }
      if (!text.trim()) { block("input_empty"); return; }
      let input: unknown;
      try { input = JSON.parse(text); } catch { block("invalid_json"); return; }
      const now = clock();
      if (now === null) { block("invalid_clock"); return; }
      const validated = validateWalletTransactionProposal(input, now);
      if (validated.status === "blocked") { block(validated.reason); return; }
      active = { sessionToken, proposal: validated.proposal, lastClock: validated.observedAtMs };
      publish({ ...snapshot, status: "checking", reason: null, proposal: null, observedAtMs: null });
      try {
        const result = await dependencies.preflightTransaction(input);
        if (disposed || generation !== operation) return;
        this.validateCurrent();
        if (generation !== operation) return;
        if (result.status === "blocked") { block(result.reason); return; }
        const currentTime = clock();
        if (currentTime === null || !Number.isSafeInteger(result.observedAtMs) || result.observedAtMs < 0) { block("invalid_clock"); return; }
        if (currentTime < active!.lastClock || currentTime < result.observedAtMs) { block("clock_regressed"); return; }
        const current = validateWalletTransactionProposal(result.proposal, currentTime);
        if (current.status === "blocked") { block(current.reason); return; }
        active = { sessionToken, proposal: current.proposal, lastClock: currentTime };
        publish({ ...snapshot, status: "ready_for_review", reason: null, proposal: current.proposal, observedAtMs: result.observedAtMs });
      } catch {
        if (!disposed && generation === operation) { this.validateCurrent(); if (generation === operation) block("provider_error"); }
      }
    },
  };
}

export type WalletProposalReview = ReturnType<typeof createWalletProposalReview>;

export function walletProposalReviewMessage(reason: string | null): string {
  switch (reason) {
    case "input_empty": return "Informe uma proposta em JSON para conferir.";
    case "input_too_large": return "A proposta excede o limite de 262144 caracteres UTF-16.";
    case "invalid_json": return "O texto não contém JSON válido.";
    case "invalid_proposal": return "Formato da proposta inválido. Confira campos, valores atômicos e rede.";
    case "session_unavailable": return "Conecte a carteira OKX para conferir a proposta.";
    case "session_changed": return "A sessão da carteira mudou. Confira novamente de forma explícita.";
    case "identity_mismatch": return "Conta ou rede da carteira não corresponde à proposta.";
    case "expired": return "A validade da proposta terminou. Informe uma proposta atual.";
    case "not_yet_valid": return "A proposta ainda não está dentro do prazo de validade.";
    case "clock_regressed": return "O relógio recuou. A conferência foi invalidada.";
    case "invalid_clock": return "Não foi possível validar o relógio desta sessão.";
    case "provider_timeout": return "A carteira não respondeu dentro do prazo. Confira novamente.";
    case "provider_error": case "invalid_provider_response": return "Não foi possível conferir a resposta da carteira.";
    default: return "A proposta não pôde ser conferida. Revise os dados e a conexão.";
  }
}
