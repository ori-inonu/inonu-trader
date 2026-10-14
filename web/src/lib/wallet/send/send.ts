/**
 * THE ONLY FILE of the app that asks the person's wallet to sign and send a transaction (WAL-10, EXE-5, EXE-6, EXE-7). The scan of the repository names it as the single exception, and a second file with these
 * calls fails that scan. Three things keep it small and safe:
 *
 * 1. It sends nothing it was not CLEARED for: the permission (`Cleared`) is made only by the gate, for one step of one order, after every check, and a value that is not one is refused.
 * 2. It asks the wallet who it is and where it is right before each request (the account and the network can change between the review and the click), and sends only to that account on that network.
 * 3. It sends exactly two kinds of transaction: the approval of the token the order gives, for exactly the amount of the order and to the router the provider named (the gate decoded it), and the swap the provider
 *    built for it (the gate compared it with the order). It never sends a transfer, never signs a message, never touches a key (there is none here: the extension holds them), and never broadcasts: the server
 *    has no part in it.
 *
 * One request at a time per wallet (a second click while the wallet window is open is refused), a timeout for the person to answer, and every attempt written to the local log with the hash the wallet gave.
 * The wallet message is never shown or kept: only our text for the kind of failure.
 */
import type { SendProvider } from "./provider";
import { classifyWalletError, walletError, type WalletErrorInfo, type WalletErrorKind } from "../errors";
import { newEntryId, type TradeLog, type TradeResult } from "./log";
import { allowanceCall, NATIVE_TOKEN } from "./order";
import { isCleared, limitBlocks, QUOTE_MAX_AGE_MS, type Cleared } from "./gate";
import type { TradeSettings } from "./settings";

export type { SendProvider } from "./provider";

const HASH = /^0x[0-9a-fA-F]{64}$/;
const HEX_QUANTITY = /^0x[0-9a-fA-F]{1,64}$/;
/** The wallet shows a window and waits for the person: five minutes is more than anyone needs and less than forever. */
const SEND_TIMEOUT_MS = 5 * 60_000;
const READ_TIMEOUT_MS = 15_000;
/** The estimate the provider gives for the gas is a limit it computed for one block; a quarter more costs nothing (what is not used is not paid) and keeps a small move of the pool from reverting the order. */
const GAS_MARGIN_NUM = BigInt(5);
const GAS_MARGIN_DEN = BigInt(4);

/** The wallets that have a request of ours waiting for their person: a second would be refused by the wallet itself, and a double click must not make two orders. */
const waiting = new WeakSet<object>();

/** A permission is for ONE send: one that was already used is refused, so a stored or replayed copy cannot make a second order. */
const used = new WeakSet<object>();
/** And it is for NOW: the gate looked at the quote and the wallet at the moment of the click, and a permission older than this is not what was looked at. */
export const CLEARED_MAX_AGE_MS = 60_000;

function ask(provider: SendProvider, method: string, params: readonly unknown[], timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error("wallet_timeout"), { code: -1 })), timeoutMs);
    try {
      Promise.resolve(provider.request({ method, params })).then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

/**
 * The kinds of failure that PROVE no request is open in the wallet: it was not authorized, it does not know the method, it refused the data, it already had a request of another page waiting, it does not know the
 * network. "Disconnected" is NOT here: a wallet whose service died after the person signed reads the same, and the order may be on its way.
 */
const NOT_SENT: ReadonlySet<WalletErrorKind> = new Set<WalletErrorKind>(["nao_autorizado", "metodo_nao_suportado", "invalido", "pedido_pendente", "rede_desconhecida"]);

/** Runs one short step under a lock that every tab of the browser shares, when the browser has locks; without them the step simply runs (a lock that cannot be had must not make the order impossible, and the step is the same). */
async function underLock<T>(step: () => T): Promise<T> {
  let ran = false;
  let result: T | undefined;
  try {
    const locks = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { locks?: { request<R>(name: string, callback: () => R | Promise<R>): Promise<R> } }).locks;
    if (locks !== undefined) {
      return await locks.request("inonu-trade-send", () => {
        ran = true;
        result = step();
        return result;
      });
    }
  } catch (error) {
    // the step itself failed: that is its failure, not a missing lock
    if (ran) throw error;
  }
  return ran ? (result as T) : step();
}

const toHex = (n: bigint): string => `0x${n.toString(16)}`;

/** The gas limit to ask for: the provider's estimate with a quarter more, or none when the provider gave none (then the wallet estimates). */
function gasHex(gas: string | null): string | undefined {
  if (gas === null || !/^\d{1,30}$/.test(gas)) return undefined;
  const base = BigInt(gas);
  return base === BigInt(0) ? undefined : toHex((base * GAS_MARGIN_NUM + GAS_MARGIN_DEN - BigInt(1)) / GAS_MARGIN_DEN);
}

export type SendOutcome =
  | { readonly ok: true; readonly txHash: string }
  | { readonly ok: false; readonly error: WalletErrorInfo; readonly result: "recusada" | "falhou" };

export interface SendHooks {
  readonly log: TradeLog;
  readonly nowMs: () => number;
  /** The settings as they are NOW, read again from where they are kept: the person may have stopped the order in another tab since the click. */
  readonly settings: () => TradeSettings;
  /** What the swaps of the last 24 hours add up to NOW, read again from the log. */
  readonly spent24h: () => number;
}

const failed = (text: string): SendOutcome => ({ ok: false, result: "falhou", error: { kind: "desconhecido", code: null, text } });

/** Which account and network the wallet says it is on, read now; null when it does not answer in the shape of an account and a network. */
async function whereIsTheWallet(provider: SendProvider): Promise<{ readonly account: string; readonly chainIdHex: string } | null> {
  try {
    const accounts = await ask(provider, "eth_accounts", [], READ_TIMEOUT_MS);
    const chain = await ask(provider, "eth_chainId", [], READ_TIMEOUT_MS);
    if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(accounts[0])) return null;
    if (typeof chain !== "string" || !HEX_QUANTITY.test(chain)) return null;
    return { account: accounts[0].toLowerCase(), chainIdHex: toHex(BigInt(chain)) };
  } catch {
    return null;
  }
}

/** Sends the step the gate cleared: the approval or the swap. The wallet window opens here, after the click that called this. */
export async function sendCleared(provider: SendProvider, cleared: Cleared, hooks: SendHooks): Promise<SendOutcome> {
  if (!isCleared(cleared)) return failed("Esta ordem nao passou pela conferencia e nao foi enviada");
  if (used.has(cleared)) return failed("Esta conferencia ja foi usada. Revise a ordem de novo");
  if (hooks.nowMs() - cleared.issuedAtMs > CLEARED_MAX_AGE_MS || hooks.nowMs() - cleared.issuedAtMs < 0) return failed("A conferencia ficou velha. Revise a ordem de novo");
  if (typeof provider !== "object" || provider === null || typeof provider.request !== "function") return { ok: false, result: "falhou", error: walletError("desconectado") };
  if (waiting.has(provider)) return { ok: false, result: "falhou", error: walletError("pedido_pendente") };

  const { order, swap, approval, step } = cleared;
  waiting.add(provider);
  used.add(cleared);
  try {
    // the wallet is the authority on who signs and where: what the page remembers may be old
    const here = await whereIsTheWallet(provider);
    if (here === null) return { ok: false, result: "falhou", error: walletError("desconectado") };
    if (here.account !== order.account.toLowerCase()) return failed("A conta da carteira mudou. A ordem nao foi enviada");
    if (BigInt(here.chainIdHex) !== BigInt(order.chainIdHex)) return failed("A carteira esta em outra rede. A ordem nao foi enviada");

    let tx: Record<string, string>;
    if (step === "approve") {
      if (approval === null || order.from.address.toLowerCase() === NATIVE_TOKEN) return failed("Esta ordem nao precisa de aprovacao");
      // the approval goes to the token that is given, and nowhere else
      tx = { from: here.account, to: order.from.address.toLowerCase(), data: approval.data, value: "0x0" };
      const gas = gasHex(approval.gasLimit);
      if (gas !== undefined) tx.gas = gas;
    } else {
      if (swap.tx.to === null) return failed("A transacao da troca nao tem destino");
      tx = { from: here.account, to: swap.tx.to.toLowerCase(), data: swap.tx.data, value: toHex(BigInt(swap.tx.value)) };
      const gas = gasHex(swap.tx.gas);
      if (gas !== undefined) tx.gas = gas;
    }

    // the quote is as old as the provider's answer, and the reads of the wallet above took time (and so did the click): its age is looked at again here, last, right before the wallet is asked
    if (hooks.nowMs() - cleared.fetchedAtMs > QUOTE_MAX_AGE_MS || hooks.nowMs() - cleared.fetchedAtMs < 0) return failed("A cotacao ficou velha enquanto a carteira respondia. Revise a ordem de novo");

    // the caps, the opt-in and the stop, asked AGAIN with values read again (a stop clicked in another tab, or an order that went out in another one, since the click), and the attempt written BEFORE the wallet is
    // asked, so it counts against the daily cap from this moment: a window that is answered late, or an answer that is lost, can never be an order the cap did not see. The check and the write are ONE step under a
    // lock shared by the tabs of the browser, so two tabs that click together cannot both pass under the cap. When the attempt cannot be kept (a storage that is full or blocked) nothing is sent
    const id = newEntryId();
    const refusal = await underLock(() => {
      const stillBlocked = limitBlocks(hooks.settings(), cleared.usd, hooks.spent24h());
      if (stillBlocked.length > 0) return stillBlocked[0]!.text;
      const kept = hooks.log.add({
        id, atMs: hooks.nowMs(), chainIndex: order.chainIndex, side: order.side, step, symbol: order.side === "buy" ? order.to.symbol : order.from.symbol, usd: step === "swap" ? cleared.usd : null, txHash: null, result: "pendente", briefHash: order.briefHash,
      });
      return kept ? null : "Nao foi possivel gravar o registro local da ordem. Nada foi enviado";
    });
    if (refusal !== null) return failed(refusal);

    let hash: unknown;
    try {
      hash = await ask(provider, "eth_sendTransaction", [tx], SEND_TIMEOUT_MS);
    } catch (error) {
      const info = classifyWalletError(error);
      // only a refusal the wallet SAID is a refusal
      if (info.kind === "recusado") {
        await underLock(() => hooks.log.settle(id, { result: "recusada" }));
        return { ok: false, result: "recusada", error: info };
      }
      // only these prove that no request is open in the wallet; anything else (a timeout, an internal error, a failure with no code, a code nobody knows) may still be answered later in its window, so the attempt stays
      // counted as open, and the person can close it by hand after looking in the wallet
      if (NOT_SENT.has(info.kind)) {
        await underLock(() => hooks.log.settle(id, { result: "falhou" }));
        return { ok: false, result: "falhou", error: info };
      }
      return { ok: false, result: "falhou", error: { ...info, text: `${info.text}. Se a janela da carteira ainda estiver aberta, confira nela: a ordem segue contada no seu teto do dia ate voce responder` } };
    }
    if (typeof hash !== "string" || !HASH.test(hash)) return failed("A carteira nao devolveu o codigo da transacao. Confira na carteira antes de tentar de novo: a ordem segue contada no seu teto do dia");
    await underLock(() => hooks.log.settle(id, { txHash: hash.toLowerCase(), result: "enviada" }));
    return { ok: true, txHash: hash.toLowerCase() };
  } finally {
    waiting.delete(provider);
  }
}

export interface ReceiptOptions {
  readonly log: TradeLog;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
  readonly signal?: AbortSignal;
}

/** Waits for the chain to say how a transaction ended, and writes it in the log. A wallet that cannot answer, or a chain that does not confirm in the time, leaves "sem_recibo": there is a hash, and the person can look it up. */
export async function awaitReceipt(provider: SendProvider, txHash: string, options: ReceiptOptions): Promise<Extract<TradeResult, "confirmada" | "revertida" | "sem_recibo">> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options.timeoutMs ?? 180_000;
  const intervalMs = options.intervalMs ?? 3_000;
  let waited = 0;
  while (waited <= timeoutMs) {
    if (options.signal?.aborted) break;
    try {
      const receipt = await ask(provider, "eth_getTransactionReceipt", [txHash], READ_TIMEOUT_MS);
      if (receipt !== null && typeof receipt === "object") {
        const status = (receipt as { status?: unknown }).status;
        const result = status === "0x1" || status === 1 ? "confirmada" : status === "0x0" || status === 0 ? "revertida" : "sem_recibo";
        // the same lock as the write that put the attempt in the log: a tab that settles one cannot overwrite what another tab just added
        await underLock(() => options.log.resolve(txHash, result));
        return result;
      }
    } catch {
      // the wallet did not answer this time: try again until the time is up
    }
    await sleep(intervalMs);
    waited += intervalMs;
  }
  await underLock(() => options.log.resolve(txHash, "sem_recibo"));
  return "sem_recibo";
}

/** How much of the token the router may already spend for the account, read from the token itself; null when it cannot be read (then the approval is asked for, which is the safe side). */
export async function readAllowance(provider: SendProvider, tokenAddress: string, owner: string, spender: string): Promise<bigint | null> {
  const data = allowanceCall(owner, spender);
  if (data === null || !/^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) return null;
  try {
    const answer = await ask(provider, "eth_call", [{ to: tokenAddress.toLowerCase(), data }, "latest"], READ_TIMEOUT_MS);
    if (typeof answer !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(answer)) return null;
    return BigInt(answer);
  } catch {
    return null;
  }
}
