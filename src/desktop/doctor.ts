/**
 * The Doctor (T1.8, WIN-8, AC-WIN-5): eight checks, each with a message and, when something is wrong, the action that
 * fixes it. It answers "why does the desk show no data" without the user reading a log.
 *
 *   navegador, extensao, relogio, porta, credenciais, sonda, rede, python
 *
 * Rules: the clock skew is MEASURED against the exchange (never presumed); credentials appear only as a state (the
 * values never reach this module); one failing check never hides the others (each is isolated and bounded in time);
 * every text is plain ASCII because the interface forbids accents here, the middle dot, the em dash and the en dash.
 * All the side effects are injected, so the whole report is tested without a browser, a network or a vault.
 */
import type { DetectedBrowser } from "./browser";

export const DOCTOR_IDS = ["navegador", "extensao", "relogio", "porta", "credenciais", "sonda", "rede", "python"] as const;
export type DoctorId = (typeof DOCTOR_IDS)[number];
export type DoctorStatus = "ok" | "atencao" | "falha" | "nao_verificado";

export interface DoctorItem {
  readonly id: DoctorId;
  readonly label: string;
  readonly status: DoctorStatus;
  readonly message: string;
  /** What to do, or null when nothing is needed. */
  readonly action: string | null;
}

export interface DoctorReport {
  readonly checkedAtMs: number;
  readonly items: DoctorItem[];
  readonly summary: Record<DoctorStatus, number>;
}

export interface ClockMeasure {
  /** Exchange clock minus local clock in ms: positive means the Windows clock is behind. */
  readonly offsetMs: number;
  readonly roundTripMs: number;
}

export interface DoctorDeps {
  /** The port the core is bound to, and the one the app normally uses. */
  readonly port: number;
  readonly defaultPort: number;
  readonly pickBrowser: () => DetectedBrowser | null;
  /** Measures the skew against the exchange's free time endpoint; null when it could not be reached. */
  readonly measureClock: () => Promise<ClockMeasure | null>;
  /** States only: whether the three OKX fields are all there, and whether the model key is. */
  readonly credentials: () => { readonly okx: "absent" | "incomplete" | "complete"; readonly model: boolean; readonly vault?: "indisponivel" };
  /** One free OnchainOS read (the list of networks). */
  readonly probeOnchain: () => Promise<{ readonly ok: true; readonly count: number } | { readonly ok: false; readonly error: string }>;
  readonly findPython: () => string | null;
  readonly now?: () => number;
  /** Bound for each check that waits on the network. Default 8 s. */
  readonly timeoutMs?: number;
}

const CLOCK_WARN_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 8_000;

/** Error codes of the probe that mean "come back later", as opposed to "something is wrong". */
const SOFT_PROBE_ERRORS: ReadonlySet<string> = new Set(["provider_payment_required", "rate_limited", "pace_limited", "budget_exhausted"]);

function item(id: DoctorId, label: string, status: DoctorStatus, message: string, action: string | null = null): DoctorItem {
  return { id, label, status, message, action };
}

/** Bounds a wait; the timer is cleared as soon as the work settles so a finished check leaves nothing behind. */
function bounded<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function seconds(ms: number): string {
  return `${Math.round(Math.abs(ms) / 1000)} s`;
}

export async function runDoctor(deps: DoctorDeps): Promise<DoctorReport> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = deps.now ?? Date.now;

  // The measurement feeds two items (the clock and the network), so it runs once.
  const measured = bounded(Promise.resolve().then(deps.measureClock), timeoutMs).then(
    (sample) => ({ sample, failed: false }),
    () => ({ sample: null as ClockMeasure | null, failed: true }),
  );

  const guard = async (id: DoctorId, label: string, check: () => Promise<DoctorItem> | DoctorItem): Promise<DoctorItem> => {
    try {
      return await bounded(Promise.resolve().then(check), timeoutMs);
    } catch (error) {
      // never forward the error text: it may carry a value, and the user needs the action, not a stack
      const timedOut = error instanceof Error && error.message === "timeout";
      return item(id, label, "falha", timedOut ? "Sem resposta no tempo esperado." : "A verificacao nao terminou.", "Rode o diagnostico de novo; se repetir, veja o arquivo logs/launcher.log.");
    }
  };

  const browser = (() => {
    try {
      return { value: deps.pickBrowser(), failed: false };
    } catch {
      return { value: null, failed: true };
    }
  })();

  const items = await Promise.all([
    guard("navegador", "Navegador", () => {
      if (browser.failed) throw new Error("browser lookup");
      if (browser.value === null) return item("navegador", "Navegador", "falha", "Nenhum Microsoft Edge ou Google Chrome encontrado.", "Instale o Microsoft Edge ou o Google Chrome e abra o Inonu de novo.");
      const name = browser.value.kind === "edge" ? "Microsoft Edge" : "Google Chrome";
      return item("navegador", "Navegador", "ok", `${name} encontrado (perfil ${browser.value.profile}).`);
    }),

    guard("extensao", "Extensao OKX Wallet", () => {
      if (browser.failed || browser.value === null) return item("extensao", "Extensao OKX Wallet", "nao_verificado", "Sem navegador, a extensao nao pode ser verificada.");
      const profile = browser.value.profile;
      if (browser.value.walletEnabled) return item("extensao", "Extensao OKX Wallet", "ok", `OKX Wallet ativa no perfil ${profile}.`);
      return item("extensao", "Extensao OKX Wallet", "atencao", `A OKX Wallet nao esta ativa no perfil ${profile}. Os dados aparecem, mas a carteira nao conecta.`, `Instale ou ative a extensao OKX Wallet no perfil ${profile} do navegador.`);
    }),

    guard("relogio", "Relogio do Windows", async () => {
      const { sample } = await measured;
      if (sample === null) return item("relogio", "Relogio do Windows", "atencao", "O desvio nao pode ser medido porque a OKX nao respondeu.", "Verifique a conexao e rode o diagnostico de novo.");
      if (Math.abs(sample.offsetMs) < CLOCK_WARN_MS) return item("relogio", "Relogio do Windows", "ok", `Hora do Windows a ${seconds(sample.offsetMs)} da OKX (medido agora).`);
      const way = sample.offsetMs > 0 ? "atrasada" : "adiantada";
      return item("relogio", "Relogio do Windows", "atencao", `Hora do Windows ${way} ${seconds(sample.offsetMs)} em relacao a OKX (medido agora). O Inonu corrige as assinaturas sozinho, mas a OKX recusa as de outros programas acima de 30 s.`, "Sincronize a hora do Windows em Configuracoes, Hora e idioma, Data e hora (precisa de administrador).");
    }),

    guard("porta", "Porta local", () => {
      if (deps.port === deps.defaultPort) return item("porta", "Porta local", "ok", `Escutando em 127.0.0.1:${deps.port}.`);
      return item("porta", "Porta local", "atencao", `Escutando na porta alternativa ${deps.port}, nao na ${deps.defaultPort}. As preferencias da tela ficam separadas das da porta ${deps.defaultPort}.`, `Feche o que usa a porta ${deps.defaultPort} e abra o Inonu de novo.`);
    }),

    guard("credenciais", "Credenciais", () => {
      const state = deps.credentials();
      if (state.vault === "indisponivel") return item("credenciais", "Credenciais", "falha", "O cofre do Windows nao respondeu: as chaves nao puderam ser lidas. Elas nao foram apagadas.", "Desbloqueie o Windows e reinicie o Inonu; se repetir, veja o arquivo logs/launcher.log.");
      if (state.okx === "absent") return item("credenciais", "Credenciais", "falha", "Credencial da OKX ausente.", "Abra Configuracoes e informe chave, segredo e senha da API OnchainOS.");
      if (state.okx === "incomplete") return item("credenciais", "Credenciais", "falha", "Credencial da OKX incompleta: falta pelo menos um dos tres campos.", "Abra Configuracoes e informe chave, segredo e senha da API OnchainOS.");
      if (!state.model) return item("credenciais", "Credenciais", "atencao", "Credencial da OKX completa. Chave do modelo ausente.", "Informe a chave do modelo em Configuracoes para liberar Pedir ao Inonu.");
      return item("credenciais", "Credenciais", "ok", "Credencial da OKX completa e chave do modelo configurada.");
    }),

    guard("sonda", "Sonda OnchainOS", async () => {
      const credentials = deps.credentials();
      if (credentials.vault === "indisponivel" || credentials.okx !== "complete") return item("sonda", "Sonda OnchainOS", "nao_verificado", "Sem credencial completa, a sonda gratuita nao rodou.");
      const result = await deps.probeOnchain();
      if (result.ok) return item("sonda", "Sonda OnchainOS", "ok", `A leitura gratuita respondeu: ${result.count} redes.`);
      if (SOFT_PROBE_ERRORS.has(result.error)) return item("sonda", "Sonda OnchainOS", "atencao", `A leitura gratuita foi adiada (codigo ${result.error}).`, "Aguarde um pouco ou confira o uso do mes em Configuracoes.");
      if (result.error === "clock_skew") return item("sonda", "Sonda OnchainOS", "falha", `A OKX recusou a assinatura por causa da hora (codigo ${result.error}).`, "Sincronize a hora do Windows e rode o diagnostico de novo.");
      if (result.error === "provider_unauthorized") return item("sonda", "Sonda OnchainOS", "falha", `A OKX recusou a credencial (codigo ${result.error}).`, "Confira chave, segredo e senha em Configuracoes e no portal da OKX.");
      return item("sonda", "Sonda OnchainOS", "falha", `A leitura gratuita falhou (codigo ${result.error}).`, "Rode o diagnostico de novo; se repetir, veja o arquivo logs/launcher.log.");
    }),

    guard("rede", "Conexao com a OKX", async () => {
      const { sample, failed } = await measured;
      if (sample !== null) return item("rede", "Conexao com a OKX", "ok", `A OKX respondeu em ${Math.round(sample.roundTripMs)} ms.`);
      return item("rede", "Conexao com a OKX", "falha", failed ? "Sem resposta no tempo esperado." : "Sem resposta de www.okx.com.", "Verifique a internet, o proxy e o firewall do Windows e rode o diagnostico de novo.");
    }),

    guard("python", "Python (opcional)", () => {
      const found = deps.findPython();
      return item("python", "Python (opcional)", "ok", `${found === null ? "Python nao encontrado." : "Python encontrado."} O Inonu nao precisa dele; so as ferramentas de pesquisa do repositorio usam.`);
    }),
  ]);

  const summary: Record<DoctorStatus, number> = { ok: 0, atencao: 0, falha: 0, nao_verificado: 0 };
  for (const entry of items) summary[entry.status] += 1;
  return { checkedAtMs: now(), items, summary };
}
