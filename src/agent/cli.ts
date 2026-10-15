/**
 * The signing tool of the agent (AUT-7, AUT-8, AUT-14): the OKX CLI of the Agentic Wallet behind a port. The one place where the agent can move money, and the narrowest: a guard lets through only the
 * documented read and swap commands and never `--force`; the binary is verified against a SHA256 the person supplied before every run; the child process gets a minimal environment (no model key, no exchange
 * secrets); a swap is quoted first and refused on a honeypot, a tax, a price impact or any warning from the tool, and only then executed. If the tool asks for confirmation the answer is no. What the tool
 * prints is untrusted: only constants of this file come back as reasons. Silence after the swap began is UNCERTAIN, never a failure, and the ledger keeps it in flight so it is never sent twice.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Executor, ExecResult } from "./cycle";
import type { AgentConfig } from "./config";
import { HARD_CAPS, type LimitedFacts, type PolicyMirror } from "./gate";
import { receiptForTxHash, type ReceiptStatus } from "./receipt";
import { PROFILE_IDS, PROFILES, type ProfileId } from "./plans";
import { quoteFactsOf, type QuoteFacts } from "./quote-facts";
import type { EntryQuoteRequest } from "../decision-review/entry-quote";
import { buildSwapArgs, buyCostCapPct, CHAIN_NAME, settlementFor, SLIPPAGE_CAP_PCT } from "./swap-args";
import type { Book, PlannedOrder } from "./types";

export interface CliResult {
  /** Null when the process did not exit by itself (killed on timeout or cancel). */
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export interface CliRunOptions {
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
}

export interface CliRunner {
  run(args: readonly string[], options: CliRunOptions): Promise<CliResult>;
}

/* ---------------------------------------------------------------- the guard */

/** The only commands the agent runs. Everything else the tool can do (send, contract-call, login, strategy, cross-chain, gateway, mcp) is out of reach of this code. */
const ALLOWED_COMMANDS: ReadonlySet<string> = new Set(["wallet status", "wallet balance", "wallet addresses", "wallet history", "wallet login", "swap quote", "swap execute"]);
const ALLOWED_FLAGS: ReadonlySet<string> = new Set(["--from", "--to", "--readable-amount", "--amount", "--chain", "--wallet", "--max-auto-slippage", "--all", "--phase", "--tx-hash"]);
/** The flag that only the history may carry: a receipt is looked up by the transaction hash and by nothing else (an order id is not echoed back, and a list cannot be bound to a swap). */
const HISTORY_FLAGS: ReadonlySet<string> = new Set(["--tx-hash"]);
/** `wallet login` is only ever the two phases of the browser login: it starts it and it asks whether it finished. */
const LOGIN_PHASES: ReadonlySet<string> = new Set(["init", "poll"]);
const VALUE = /^[A-Za-z0-9._]{1,128}$/;

/** Throws `comando_recusado` before any process exists. */
export function assertCommand(args: readonly string[]): void {
  if (args.length < 2 || !ALLOWED_COMMANDS.has(`${args[0]} ${args[1]}`)) throw new Error("comando_recusado");
  for (let i = 2; i < args.length; i++) {
    const token = args[i]!;
    if (token.startsWith("--")) {
      if (!ALLOWED_FLAGS.has(token)) throw new Error("comando_recusado");
    } else if (!VALUE.test(token)) throw new Error("comando_recusado");
  }
  if (args[0] === "wallet" && args[1] === "login" && !(args.length === 4 && args[2] === "--phase" && LOGIN_PHASES.has(args[3]!))) throw new Error("comando_recusado");
  // the phase flag belongs to the login and to nothing else
  if (args.includes("--phase") && !(args[0] === "wallet" && args[1] === "login")) throw new Error("comando_recusado");
  // and the flags of a receipt lookup belong to the history
  if (args.some((a) => HISTORY_FLAGS.has(a)) && !(args[0] === "wallet" && args[1] === "history")) throw new Error("comando_recusado");
}

export function createGuardedRunner(inner: CliRunner): CliRunner {
  return {
    // async, so a refusal is always a rejected promise and never a synchronous throw out of a caller's own try block
    async run(args, options) {
      assertCommand(args);
      return inner.run(args, options);
    },
  };
}

/**
 * Where the signing tool is for THIS process. The path written at the install is absolute, and a packaged app sees the profile folder through its container while a supervisor outside it does not: the same file may
 * not resolve. The configured path wins when the file is there; if not, the same plain file name in the agent's own folder (`<own>/cli/<name>`) is used when it exists; otherwise the configured path stays and the check
 * of the hash refuses it as before. Only the file name is carried over (never a path), and the hash the person supplied remains what decides whether the file may run. Pure apart from `exists`.
 */
export function resolveCliPath(configured: string | null, ownDir: string, exists: (path: string) => boolean = existsSync): string | null {
  if (configured === null || exists(configured)) return configured;
  const name = configured.split(/[\\/]/).pop() ?? "";
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === "..") return configured;
  const own = join(ownDir, "cli", name);
  return exists(own) ? own : configured;
}

export interface BinaryCheck {
  readonly path: string | null;
  readonly expectedSha256: string | null;
  readonly sha256File: (path: string) => Promise<string | null>;
}

/** True only when the binary exists and has exactly the hash the person supplied. */
export async function binaryMatches(check: BinaryCheck): Promise<boolean> {
  if (check.path === null || check.expectedSha256 === null) return false;
  const actual = await check.sha256File(check.path).catch(() => null);
  return actual !== null && actual.toLowerCase() === check.expectedSha256.toLowerCase();
}

export function createVerifiedRunner(inner: CliRunner, check: BinaryCheck): CliRunner {
  return {
    async run(args, options) {
      if (!(await binaryMatches(check))) throw new Error("binario_divergente");
      return inner.run(args, options);
    },
  };
}

export async function sha256File(path: string): Promise<string | null> {
  try {
    return createHash("sha256").update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest("hex");
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- the process */

const PASS = [
  // Windows
  "SystemRoot", "SYSTEMDRIVE", "WINDIR", "TEMP", "TMP", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA", "COMPUTERNAME", "USERNAME",
  // Linux and macOS: where a program's files and the certificates of the system are
  "HOME", "PATH", "LANG", "LC_ALL", "TMPDIR", "SSL_CERT_FILE", "SSL_CERT_DIR",
] as const;

/** The environment of the child: what a program needs to run on Windows, and the two settings of the tool. Not one variable of the app's own environment beyond that list. */
export function childEnv(source: Readonly<Record<string, string | undefined>>, home: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of PASS) {
    const value = source[name];
    if (value !== undefined) env[name] = value;
  }
  env.ONCHAINOS_HOME = home;
  env.ONCHAINOS_NO_BROWSER = "1";
  return env;
}

const MAX_OUTPUT = 1_000_000;

export function createProcessRunner(options: { readonly binary: string; readonly home: string; readonly env?: Readonly<Record<string, string | undefined>> }): CliRunner {
  return {
    async run(args, { timeoutMs, signal }) {
      // a stop that came before the process existed is honoured: nothing is started
      if (signal.aborted) return { exitCode: null, stdout: "", stderr: "", timedOut: true };
      mkdirSync(options.home, { recursive: true });
      return await new Promise<CliResult>((resolve) => {
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let settled = false;
        const child = spawn(options.binary, [...args], { env: childEnv(options.env ?? process.env, options.home), cwd: options.home, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        const finish = (exitCode: number | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          resolve({ exitCode: timedOut ? null : exitCode, stdout, stderr, timedOut });
        };
        const kill = () => {
          try {
            child.kill();
          } catch {
            // already gone
          }
        };
        const timer = setTimeout(() => {
          timedOut = true;
          kill();
        }, timeoutMs);
        const onAbort = () => kill();
        signal.addEventListener("abort", onAbort, { once: true });
        child.stdout.on("data", (chunk: Buffer) => {
          if (stdout.length < MAX_OUTPUT) stdout += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk: Buffer) => {
          if (stderr.length < MAX_OUTPUT) stderr += chunk.toString("utf8");
        });
        child.on("error", () => finish(null));
        child.on("close", (code) => finish(code));
      });
    },
  };
}

/* ---------------------------------------------------------------- what the tool prints */

const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/**
 * The `data` of a swap answer as one record. `swap quote` answers `{"ok":true,"data":[{...}]}`: an ARRAY of exactly one record (observed on the real tool, 2026-10-14); a record is read as it is, and an array of anything else
 * (none, several, a non-record) is not one answer and is null.
 */
const oneRecord = (v: unknown): Record<string, unknown> | null => (Array.isArray(v) ? (v.length === 1 ? rec(v[0]) : null) : rec(v));

export interface Envelope {
  readonly ok: boolean;
  readonly data: unknown;
  /** The tool's own message of a refusal (`{"ok":false,"error":"..."}`), cut short. Never shown: only matched against what is known. */
  readonly error?: string;
  readonly confirming?: boolean;
}

/** `{ok:true,data}` or `{ok:false,data}`; text around the JSON (a warning line) is tolerated. Null when there is no envelope. */
export function parseEnvelope(stdout: string): Envelope | null {
  const text = stdout.trim();
  if (text === "") return null;
  const candidates = [text, ...text.split("\n").reverse().map((l) => l.trim()).filter((l) => l.startsWith("{"))];
  for (const candidate of candidates) {
    try {
      const o = rec(JSON.parse(candidate));
      if (o !== null && typeof o.ok === "boolean") return { ok: o.ok, data: o.data, ...(typeof o.error === "string" ? { error: o.error.slice(0, 300) } : {}), ...(o.confirming === true ? { confirming: true } : {}) };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const asNumber = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
};
/** A number that may be signed (the impact of a quote can be written "-0.4" or -0.4): both forms read the same. */
const signedNumber = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
};
const flagOn = (v: unknown): boolean => v === true || v === 1 || v === "1" || (typeof v === "string" && v.trim().toLowerCase() === "true");
/** Only an explicit "no" counts as a no. */
const flagOff = (v: unknown): boolean => v === false || v === 0 || v === "0" || (typeof v === "string" && v.trim().toLowerCase() === "false");

/** The owner's policy as `wallet status` reports it (field names from OKX's CLI reference). A limit counts only when its flag is on. Null without a login or without a policy. */
export function parsePolicy(status: unknown): PolicyMirror | null {
  const s = rec(status);
  const policy = rec(s?.policy);
  if (s === null || s.loggedIn !== true || policy === null) return null;
  const limit = (flag: string, value: string): number | null => (flagOn(policy[flag]) ? asNumber(policy[value]) : null);
  const dailyTransferUsd = limit("dailyTransferTxFlag", "dailyTransferTxLimit");
  return {
    perTxUsd: limit("singleTxFlag", "singleTxLimit"),
    dailyTradeUsd: limit("dailyTradeTxFlag", "dailyTradeTxLimit"),
    dailyTransferUsd,
    transferGuarded: dailyTransferUsd !== null && dailyTransferUsd <= HARD_CAPS.policyDailyUsd,
  };
}

export interface AccountStatus {
  /** The tool says a session is open; null when it could not be asked. */
  readonly loggedIn: boolean | null;
  /** The owner's policy in the portal as mirrored; null when none is set or it is incomplete. */
  readonly policy: PolicyMirror | null;
  /** The account has a policy at all. */
  readonly policyDefined: boolean;
}

/** One look at `wallet status`: signed in or not, and whether the owner has set a policy. Null when the tool did not answer. */
export async function readAccountStatus(runner: CliRunner, signal: AbortSignal): Promise<AccountStatus | null> {
  try {
    const result = await runner.run(["wallet", "status"], { timeoutMs: 20_000, signal });
    if (result.timedOut) return null;
    const envelope = parseEnvelope(result.stdout);
    if (envelope === null || !envelope.ok) return null;
    const s = rec(envelope.data);
    if (s === null) return null;
    return { loggedIn: s.loggedIn === true, policy: parsePolicy(s), policyDefined: rec(s.policy) !== null };
  } catch {
    return null;
  }
}

/** Every string in a value, at any depth: the shape of `wallet addresses` is not documented, and the match is by value. */
export function allStrings(value: unknown): string[] {
  return strings(value);
}

function strings(value: unknown, into: string[] = [], depth = 0): string[] {
  if (depth > 8) return into;
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, into, depth + 1);
  else if (value !== null && typeof value === "object") for (const v of Object.values(value)) strings(v, into, depth + 1);
  return into;
}

/** What the tool said, as plain text the page can show: cut, printable characters only, no markup. Null when there is nothing usable. */
export function plainDetail(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const plain = text.replace(/[^A-Za-z0-9 .,:;()_'\/=+%-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160).trim();
  return plain.length === 0 ? null : plain;
}

/** A transaction reference in the answer of the tool: a hash (EVM, 0x and 64 hex digits) or a Solana signature (Base58, 64 to 90 characters), in the keys it uses. Anything else (text from outside, an order id) is never kept. */
const REF_KEYS = ["swapTxHash", "txHash", "txid", "signature"] as const;
const EVM_HASH = /^0x[0-9a-fA-F]{64}$/;
const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
export function txReferenceOf(data: unknown): string | null {
  const o = oneRecord(data);
  if (o === null) return null;
  for (const key of REF_KEYS) {
    const v = o[key];
    if (typeof v === "string" && (EVM_HASH.test(v) || SOLANA_SIGNATURE.test(v))) return v;
  }
  return null;
}

/* ---------------------------------------------------------------- the receipts */

/**
 * Looks an order up in the tool's own history by the transaction hash it was sent under (`wallet history --chain <network> --tx-hash <hash>`). The answer is a receipt only when the entry is that transaction, on
 * that network, from the agent's own address (receipt.ts); an order that never got a hash has no lookup at all (a list cannot be bound to a swap). Any failure of the tool, or an answer that cannot be read, is no receipt.
 */
export function createReceiptLookup(deps: {
  readonly runner: CliRunner;
  /** The agent's own address on a network, public; null when it is not known. */
  readonly walletOf: (chainIndex: string) => string | null;
  readonly timeoutMs?: number;
}): (order: OrderRecordLike, signal: AbortSignal) => Promise<ReceiptStatus | null> {
  const timeoutMs = deps.timeoutMs ?? 20_000;
  return async (order, signal) => {
    if (order.ref === null) return null;
    const chain = CHAIN_NAME[order.chainIndex] ?? order.chainIndex;
    const result = await deps.runner.run(["wallet", "history", "--chain", chain, "--tx-hash", order.ref], { timeoutMs, signal });
    if (result.timedOut) return null;
    const envelope = parseEnvelope(result.stdout);
    if (envelope === null || !envelope.ok) return null;
    return receiptForTxHash(envelope.data, { txHash: order.ref, chainIndex: order.chainIndex, wallet: deps.walletOf(order.chainIndex) });
  };
}

/** The part of an order record a receipt lookup needs. */
export interface OrderRecordLike {
  readonly chainIndex: string;
  readonly ref: string | null;
}

/* ---------------------------------------------------------------- the executor */

/** What the tool says (the real wording, seen from a real run) when the account is not signed in, and when there is not enough balance: in both it refused before it could sign. */
const NOT_SIGNED_IN = /invalid authority|not logged in|wallet login/i;
/** The tool asks the person to set up Gas Station (pay the network fee in a stablecoin because the wallet is short of SOL): a choice of the owner, which the agent never answers by itself. */
const GAS_STATION = /gas station/i;
/**
 * The tool's own contract (v4.6.4): `swap execute` simulates the transaction BEFORE it broadcasts it, and a simulation that fails ends the command with this literal text at the start of its error. The words are anchored
 * to the start on purpose: the same words later in a longer message (a provider error that wraps them, a timeout that mentions them) prove nothing.
 */
const SIMULATION_FAILED = /^transaction simulation failed:/;
/** The keys the tool's envelope may carry for a refusal that is proof of nothing sent: no data, hash, reference or confirmation among them. */
const REFUSAL_KEYS = new Set(["ok", "error", "notifications"]);

/** A refusal proven to have been made before anything was sent: Solana, exit 1, an envelope that is the whole of the output and carries only ok:false, the error and the notifications, and the anchored words. */
function failedBeforeSending(order: PlannedOrder, run: { readonly exitCode: number | null; readonly stdout: string }): string | null {
  if (order.chainIndex !== "501" || run.exitCode !== 1) return null;
  let whole: unknown;
  try {
    whole = JSON.parse(run.stdout.trim());
  } catch {
    return null;
  }
  const o = rec(whole);
  if (o === null || o.ok !== false || typeof o.error !== "string" || !Object.keys(o).every((k) => REFUSAL_KEYS.has(k))) return null;
  return SIMULATION_FAILED.test(o.error) ? o.error : null;
}
/** Narrow on purpose: "INSUFFICIENT_OUTPUT_AMOUNT" is a revert about the swap's output, not about the balance, and proves nothing about what went out. */
const INSUFFICIENT = /^\s*(insufficient (balance|funds)|not enough balance)/i;
/** The least time a session must have left for an order to begin: a session that lapses while the tool waits for a confirmation leaves the order unknown. */
const MIN_SESSION_LEFT_MS = 120_000;

/** The longest a position can be held under the plan of a profile (twice its horizon, plans.ts); the longest of all profiles when the profile is not one of ours. */
const maxHoldMs = (profile: string | null): number =>
  2 * 3_600_000 * (profile !== null && Object.hasOwn(PROFILES, profile) ? PROFILES[profile as ProfileId].horizonH : Math.max(...PROFILE_IDS.map((id) => PROFILES[id].horizonH)));

/** The most price impact each kind of order accepts, in percent (the tool itself blocks above 10). CHOICES of this code, not calibrated. */
export const IMPACT_CAP_PCT = { buy: 3, sell: 5, protecao: 10 } as const;
/** A tax on the token above this makes the swap not worth it. */
export const MAX_TAX_PCT = 5;

export interface CliExecutorDeps {
  readonly runner: CliRunner;
  readonly config: () => AgentConfig;
  /** The latest book of the wallets, for the dollar coin a swap is paid in or settled in. */
  readonly book: () => Book | null;
  readonly timeouts: { readonly quoteMs: number; readonly executeMs: number };
  /** How long the session of the tool still has, looked at again before each order; null when unknown. Not given: not checked here (the gate checks it once per cycle). */
  readonly sessionLeftMs?: () => number | null;
  /** Receives the allowlisted facts of each quote read (quote-facts.ts), under the order key, for the record. Telemetry: a failure here never changes what the executor does. */
  /** The facts of each quote under its order key, and which network and side it was for (the network fee it carries is kept per network). */
  readonly onQuote?: (orderKey: string, facts: QuoteFacts, order: { readonly chainIndex: string; readonly side: "buy" | "sell" }) => void;
  /** The clock the quote is stamped with; this machine's by default. */
  readonly now?: () => number;
}

export interface EntryQuoterDeps {
  readonly runner: CliRunner;
  readonly config: () => AgentConfig;
  /** The latest book of the wallets, for the dollar coin the purchase would be paid in. */
  readonly book: () => Book | null;
  readonly timeoutMs: number;
  readonly now: () => number;
}

export type EntryQuoteRead =
  | { readonly ok: true; readonly request: EntryQuoteRequest; readonly raw: Record<string, unknown> }
  | { readonly ok: false; readonly reason: string };

/**
 * The quote of an ENTRY, read only, for the closing of a purchase (closing.ts): the same `swap quote` the executor asks before it signs, with the same arguments for the same order, and nothing else. It never runs `swap execute`,
 * never carries the wallet and never signs; the executor still quotes and validates again when it acts. What it returns is the exact context of the request (cycle, candidate, network, the pair, the exact amount in the smallest
 * unit, the decimals of the coin paid in, the clock before and after the call) and the record the tool answered, for the contract of `decision-review/entry-quote.ts` to bind. A refusal is a code, never a guess.
 */
export function createEntryQuoter(deps: EntryQuoterDeps) {
  return {
    async read(order: PlannedOrder, ctx: { readonly cycleId: string; readonly requestId: string; readonly signal: AbortSignal }): Promise<EntryQuoteRead> {
      if (order.side !== "buy") return { ok: false, reason: "nao_e_compra" };
      if (order.wallet !== "agente") return { ok: false, reason: "carteira_nao_gerida" };
      const config = deps.config();
      if (config.managed.kind !== "agentica") return { ok: false, reason: "carteira_nao_agentica" };
      const wallet = order.chainIndex === "501" ? config.managed.solana : config.managed.evm;
      if (wallet === null) return { ok: false, reason: "sem_endereco" };
      const book = deps.book();
      const settle = book === null ? null : settlementFor(book, order.chainIndex);
      if (settle === null) return { ok: false, reason: "sem_moeda_de_liquidacao" };
      if (settle.decimals === null) return { ok: false, reason: "sem_quantidade_exata" };
      let args: string[];
      try {
        args = buildSwapArgs("quote", order, settle, wallet);
      } catch {
        return { ok: false, reason: "ordem_invalida" };
      }
      const at = args.indexOf("--amount");
      const amount = at >= 0 ? args[at + 1] : undefined;
      if (amount === undefined) return { ok: false, reason: "sem_quantidade_exata" };
      const startedAtMs = deps.now();
      let result: CliResult;
      try {
        result = await deps.runner.run(args, { timeoutMs: deps.timeoutMs, signal: ctx.signal });
      } catch (error) {
        return { ok: false, reason: reasonOf(error) ?? "quote_recusada" };
      }
      const receivedAtMs = deps.now();
      if (result.timedOut) return { ok: false, reason: "quote_demorou" };
      const quoted = parseEnvelope(result.stdout);
      if (result.exitCode === 2 || quoted?.confirming === true) return { ok: false, reason: GAS_STATION.test(quoted?.error ?? result.stdout) ? "gas_station_pendente" : "confirmando" };
      if (quoted === null) return { ok: false, reason: "quote_ilegivel" };
      if (!quoted.ok) return { ok: false, reason: NOT_SIGNED_IN.test(quoted.error ?? "") ? "sessao_invalida" : "quote_recusada" };
      const raw = oneRecord(quoted.data);
      if (raw === null) return { ok: false, reason: "quote_ilegivel" };
      return {
        ok: true,
        raw,
        request: {
          cycleId: ctx.cycleId, candidateId: order.candidateId, requestId: ctx.requestId, chainIndex: order.chainIndex, fromAddress: settle.address, toAddress: order.address,
          fromAmountMinor: amount, fromDecimals: settle.decimals, toDecimals: null, startedAtMs, receivedAtMs,
        },
      };
    },
  };
}

const THROWN_KNOWN = new Set(["comando_recusado", "binario_divergente"]);
const reasonOf = (error: unknown): string | null => (error instanceof Error && THROWN_KNOWN.has(error.message) ? error.message : null);

export function createCliExecutor(deps: CliExecutorDeps): Executor {
  return {
    async execute(order: PlannedOrder, { signal, shouldStop, orderKey }): Promise<ExecResult> {
      const fail = (reason: string): ExecResult => ({ status: "falhou", reason });
      if (order.wallet !== "agente") return fail("carteira_nao_gerida");
      const config = deps.config();
      if (config.managed.kind !== "agentica") return fail("carteira_nao_agentica");
      const wallet = order.chainIndex === "501" ? config.managed.solana : config.managed.evm;
      if (wallet === null) return fail("sem_endereco");
      const book = deps.book();
      const settle = book === null ? null : settlementFor(book, order.chainIndex);
      if (settle === null) return fail("sem_moeda_de_liquidacao");
      if (deps.sessionLeftMs !== undefined) {
        const left = deps.sessionLeftMs();
        // an exit needs the minutes the order itself takes; a PURCHASE opens a plan that can last up to twice its horizon, and the exit of its stop needs a session to sign in: it is not made if the session would lapse first
        const needed = order.side === "buy" ? Math.max(MIN_SESSION_LEFT_MS, maxHoldMs(order.profile)) : MIN_SESSION_LEFT_MS;
        if (left === null || !Number.isFinite(left) || left < needed) return fail("sessao_expirando");
      }
      let quoteArgs: string[];
      let executeArgs: string[];
      try {
        quoteArgs = buildSwapArgs("quote", order, settle, wallet);
        executeArgs = buildSwapArgs("execute", order, settle, wallet);
      } catch {
        return fail("ordem_invalida");
      }

      // 1. quote: nothing is signed until the tool and the code both like what it says
      let quote;
      try {
        quote = await deps.runner.run(quoteArgs, { timeoutMs: deps.timeouts.quoteMs, signal });
      } catch (error) {
        return fail(reasonOf(error) ?? "quote_recusada");
      }
      if (quote.timedOut) return fail("quote_demorou");
      const quoted = parseEnvelope(quote.stdout);
      if (quote.exitCode === 2 || quoted?.confirming === true) return fail(GAS_STATION.test(quoted?.error ?? quote.stdout) ? "gas_station_pendente" : "confirmando");
      if (quoted === null) return fail("quote_ilegivel");
      if (!quoted.ok) return fail(NOT_SIGNED_IN.test(quoted.error ?? "") ? "sessao_invalida" : "quote_recusada");
      const q = oneRecord(quoted.data);
      if (q === null) return fail("quote_ilegivel");
      try {
        deps.onQuote?.(orderKey, quoteFactsOf(q, (deps.now ?? Date.now)()), { chainIndex: order.chainIndex, side: order.side });
      } catch {
        // telemetry only
      }
      const from = rec(q.fromToken);
      const to = rec(q.toToken);
      if (from === null || to === null) return fail("quote_ilegivel");
      if (flagOn(from.isHoneyPot) || flagOn(to.isHoneyPot)) return fail("honeypot");
      if (q.action === "block") return fail("quote_bloqueada");
      if (q.action === "warn") return fail("quote_aviso");
      if (q.action !== "ok") return fail("quote_ilegivel");
      // the token being traded must be said NOT to be a honeypot: a field that is missing or says something else is not an all clear
      const traded = order.side === "buy" ? to : from;
      if (!flagOff(traded.isHoneyPot)) return fail("honeypot_desconhecido");
      // a tax that is present and cannot be read is as bad as a high one; an absent one on the traded token is unknown
      // the provider writes a tax as a FRACTION from 0 to 1 (0.01 is one percent, Quote v6): it is compared with the cap in percent, and a value outside 0 to 1 is not a rate
      const taxes = [from.taxRate, to.taxRate].map((t) => {
        if (t === undefined || t === null || t === "") return null;
        const fraction = asNumber(t);
        return fraction === null || fraction > 1 ? Number.NaN : Number((fraction * 100).toPrecision(12));
      });
      if (taxes.some((t) => t !== null && !(t <= MAX_TAX_PCT))) return fail("imposto_alto");
      const impact = signedNumber(q.priceImpactPercent);
      if (impact === null) return fail("impacto_desconhecido");
      const impactCap = order.source === "protecao" ? IMPACT_CAP_PCT.protecao : order.side === "buy" ? buyCostCapPct(order.profile, IMPACT_CAP_PCT.buy) : IMPACT_CAP_PCT.sell;
      if (Math.abs(impact) > impactCap) return fail("impacto_alto");

      // nothing has been signed yet: a stop or a cancel that came during the quote is honoured here
      if (signal.aborted || shouldStop?.() === true) return fail("parado");

      // 2. execute: from here on, silence means we do not know
      let run;
      try {
        run = await deps.runner.run(executeArgs, { timeoutMs: deps.timeouts.executeMs, signal });
      } catch (error) {
        const known = reasonOf(error);
        return known !== null ? fail(known) : { status: "incerta", reason: "sem_resposta" };
      }
      if (run.timedOut) {
        // what the tool printed before it was cut may already carry the transaction reference: it is kept (it is what lets the order be looked up instead of guessed), and nothing is declared
        const early = txReferenceOf(parseEnvelope(run.stdout)?.data);
        return early === null ? { status: "incerta", reason: "tempo_esgotado" } : { status: "incerta", reason: "tempo_esgotado", ref: early };
      }
      const done = parseEnvelope(run.stdout);
      if (run.exitCode === 2 || done?.confirming === true) return fail(GAS_STATION.test(done?.error ?? run.stdout) ? "gas_station_pendente" : "confirmando");
      if (done === null) return { status: "incerta", reason: "sem_resposta" };
      if (!done.ok) {
        // only a refusal the tool itself marks as made BEFORE anything was signed is a clean failure; any other "no" may come after the broadcast (a timeout on confirming, say) and is not proof
        const data = oneRecord(done.data);
        if (data?.reason === "insufficient_balance" || INSUFFICIENT.test(done.error ?? "")) return fail("saldo_insuficiente");
        if (data?.decision === "blocked") return fail("cli_bloqueou");
        // a simulation that failed is proof that nothing was broadcast (the tool simulates first): the order failed, it is not in flight, and the token is free
        const simulated = failedBeforeSending(order, run);
        if (simulated !== null) {
          const said = plainDetail(simulated);
          return { status: "falhou", reason: "simulacao_falhou", ...(said === null ? {} : { detail: said }) };
        }
        // a session refusal is NOT proof here: the quote just passed, so the session was valid, and one that lapses while the tool waits for the confirmation of a broadcast order says the same words.
        // Whatever reference to the transaction the answer carried is kept: it is what lets the order be looked up later instead of guessed.
        const kept = txReferenceOf(done.data);
        const said = plainDetail(done.error);
        return { status: "incerta", reason: "recusa_sem_prova", ...(kept === null ? {} : { ref: kept }), ...(said === null ? {} : { detail: said }) };
      }
      // an "ok" without a transaction reference that looks like one (a hash, or a signature) is not proof that anything went out
      const hash = txReferenceOf(done.data);
      if (hash === null) return { status: "incerta", reason: "sem_recibo" };
      // what the order cost, when the quote gave both parts: the network fee in dollars and the price impact on the size. One part alone is not the cost.
      const fee = asNumber(q.tradeFee);
      const costUsd = fee !== null ? fee + (order.usd * Math.abs(impact)) / 100 : undefined;
      // `swap execute` prints ok and the hash once the transaction is BROADCAST (the tool's source, v4.6.4): it does not wait for the swap's receipt. So this is a transmitted order, not an executed one; it stays in flight
      // with its hash and only a receipt of the tool's history (SUCCESS) makes it executed, ERROR and CANCELLED make it failed.
      return costUsd !== undefined && Number.isFinite(costUsd) ? { status: "transmitida", ref: hash, costUsd } : { status: "transmitida", ref: hash };
    },
  };
}

/* ---------------------------------------------------------------- the facts of the money mode */

export interface LimitedFactsDeps {
  readonly runner: CliRunner;
  readonly config: () => AgentConfig;
  /** ONCHAINOS_HOME of the agent. */
  readonly home: string;
  readonly readText: (path: string) => string | null;
  /** Whether the binary has the hash the person supplied. Null when there is nothing to compare. */
  readonly binaryOk: () => Promise<boolean | null>;
  readonly now: () => number;
  readonly cycleBudgetMs: number;
  /** This machine's clock minus the exchange's, in ms, as measured: the CLI signs with the real clock, which the app's corrected clock does not fix. */
  readonly localSkewMs: () => number | null;
}

const STATUS_TIMEOUT_MS = 20_000;

/** The policy of the owner, the session, the identity of the account and the binary, read from the tool the person installed. A binary that does not verify is never run. */
export function createLimitedFactsReader(deps: LimitedFactsDeps): () => Promise<LimitedFacts | null> {
  return async () => {
    const config = deps.config();
    const nowMs = deps.now();
    const base = { nowMs, cycleBudgetMs: deps.cycleBudgetMs, localSkewMs: deps.localSkewMs() };
    const binaryOk = await deps.binaryOk();
    if (binaryOk !== true) return { ...base, policy: null, sessionExpiresAtMs: null, addressMatches: null, binaryOk };
    if (config.managed.kind !== "agentica") return { ...base, policy: null, sessionExpiresAtMs: null, addressMatches: false, binaryOk };

    const signal = AbortSignal.timeout(STATUS_TIMEOUT_MS);
    const read = async (args: readonly string[]): Promise<unknown> => {
      try {
        const result = await deps.runner.run(args, { timeoutMs: STATUS_TIMEOUT_MS, signal });
        if (result.timedOut) return undefined;
        const envelope = parseEnvelope(result.stdout);
        return envelope?.ok === true ? envelope.data : undefined;
      } catch {
        return undefined;
      }
    };
    const status = await read(["wallet", "status"]);
    const addresses = await read(["wallet", "addresses"]);

    let addressMatches: boolean | null = null;
    if (addresses !== undefined) {
      // an EVM address is the same address in any case (checksum or not); a Solana address is Base58, where a different case is a DIFFERENT wallet, so it is compared exactly
      const owned = strings(addresses);
      const ownedEvm = new Set(owned.map((s) => s.toLowerCase()));
      const ownedSolana = new Set(owned);
      const wanted: boolean[] = [];
      if (config.managed.evm !== null) wanted.push(ownedEvm.has(config.managed.evm.toLowerCase()));
      if (config.managed.solana !== null) wanted.push(ownedSolana.has(config.managed.solana));
      addressMatches = wanted.length > 0 && wanted.every(Boolean);
    }

    let sessionExpiresAtMs: number | null = null;
    const text = deps.readText(join(deps.home, "session.json"));
    if (text !== null) {
      try {
        const raw = asNumber(rec(JSON.parse(text))?.sessionKeyExpireAt);
        if (raw !== null && raw > 0) sessionExpiresAtMs = raw < 1e12 ? raw * 1000 : raw;
      } catch {
        // an unreadable file is an unknown expiry
      }
    }
    return { ...base, policy: status === undefined ? null : parsePolicy(status), sessionExpiresAtMs, addressMatches, binaryOk };
  };
}

export const readTextFile = (path: string): string | null => {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
};

export { SLIPPAGE_CAP_PCT };
