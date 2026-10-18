/**
 * Switching the network of the connected wallet, and adding it when the wallet does not know it (T9.2, WAL-2). Only the click of a person
 * calls this, only for the networks the app lists (the registry of the EVM balances, the one list of public RPCs that was reviewed), one
 * request at a time per wallet. It uses three methods and no others: the two that change the network, and the read that confirms it. It
 * cannot sign and it cannot send, and a switch is claimed only when the wallet then says it is on the network asked for.
 *
 * The provider is the one the extension injects; this module never finds it, never connects it and never keeps it.
 */
import { EVM_CHAINS, type EvmChainSpec } from "../evm-multichain";
import type { Eip1193Provider } from "../okx-wallet";
import { WalletTimeoutError, classifyWalletError, walletError, type WalletErrorInfo } from "./errors";

export const ALLOWED_METHODS: ReadonlySet<string> = new Set(["wallet_switchEthereumChain", "wallet_addEthereumChain", "eth_chainId"]);

export interface SwitchableChain {
  readonly chainIdHex: string;
  readonly chainIndex: string;
  readonly name: string;
  readonly nativeSymbol: string;
}

/** The networks a person can pick in the Carteira tab, in the order of the registry (Monad and X Layer first). */
export const SWITCHABLE_CHAINS: readonly SwitchableChain[] = EVM_CHAINS.map((c) => ({ chainIdHex: c.chainIdHex, chainIndex: c.chainIndex, name: c.name, nativeSymbol: c.nativeSymbol }));

export interface AddChainParams {
  readonly chainId: string;
  readonly chainName: string;
  readonly nativeCurrency: { readonly name: string; readonly symbol: string; readonly decimals: 18 };
  readonly rpcUrls: readonly string[];
}

/** The parameters of the add-network request: the registry own, nothing else. */
export function addChainParams(spec: EvmChainSpec): AddChainParams {
  return { chainId: spec.chainIdHex, chainName: spec.name, nativeCurrency: { name: spec.nativeSymbol, symbol: spec.nativeSymbol, decimals: 18 }, rpcUrls: [spec.rpcUrl] };
}

export type SwitchResult = { readonly ok: true; readonly added: boolean } | { readonly ok: false; readonly error: WalletErrorInfo };

export interface SwitchOptions {
  /** How long to wait for each answer of the wallet; the person may have to confirm in a popup. Default one minute. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const HEX_QUANTITY = /^0x[0-9a-fA-F]{1,64}$/;
/** The wallets that have a request waiting for their person: a second request would be refused by the wallet itself. */
const waiting = new WeakSet<object>();

function ask(provider: Pick<Eip1193Provider, "request">, method: string, params: readonly unknown[] | undefined, timeoutMs: number): Promise<unknown> {
  if (!ALLOWED_METHODS.has(method)) return Promise.reject(new Error("method_not_allowed"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new WalletTimeoutError()), timeoutMs);
    try {
      // a wallet that answers with a plain value instead of a promise is read as that answer; one that throws at once is a failure, with its timer cleared
      Promise.resolve(provider.request(params === undefined ? { method } : { method, params })).then(
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

/** True only when the wallet says, as a hex quantity, that it is on the network asked for. */
function isOn(answer: unknown, spec: EvmChainSpec): boolean {
  if (typeof answer !== "string" || !HEX_QUANTITY.test(answer)) return false;
  return BigInt(answer) === BigInt(spec.chainIdHex);
}

export async function switchChain(provider: Pick<Eip1193Provider, "request">, chainIdHex: string, options: SwitchOptions = {}): Promise<SwitchResult> {
  // there is no wallet to ask: that is a result the screen can say, not an exception
  if (typeof provider !== "object" || provider === null || typeof provider.request !== "function") return { ok: false, error: walletError("desconectado") };
  const spec = EVM_CHAINS.find((c) => c.chainIdHex === chainIdHex.toLowerCase());
  if (spec === undefined) return { ok: false, error: { kind: "rede_desconhecida", code: null, text: "Esta rede nao esta na lista do app" } };
  if (waiting.has(provider)) return { ok: false, error: walletError("pedido_pendente", -32002) };
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  waiting.add(provider);
  try {
    let added = false;
    try {
      await ask(provider, "wallet_switchEthereumChain", [{ chainId: spec.chainIdHex }], timeoutMs);
    } catch (error) {
      const info = classifyWalletError(error);
      if (info.code !== 4902) return { ok: false, error: info };
      // the wallet does not know the network: add it with the registry parameters, once, with the person confirming in the wallet
      try {
        await ask(provider, "wallet_addEthereumChain", [addChainParams(spec)], timeoutMs);
      } catch (addError) {
        const added = classifyWalletError(addError);
        // 4902 to the add itself means the wallet refuses to add the network, not that it does not know it
        return { ok: false, error: added.code === 4902 ? { kind: "rede_desconhecida", code: 4902, text: "A carteira nao aceitou adicionar esta rede. Adicione-a na propria carteira e tente de novo" } : added };
      }
      added = true;
      // some wallets switch by themselves after adding; the others are asked once, and no more than once
      if (isOn(await ask(provider, "eth_chainId", undefined, timeoutMs), spec)) return { ok: true, added };
      try {
        await ask(provider, "wallet_switchEthereumChain", [{ chainId: spec.chainIdHex }], timeoutMs);
      } catch (switchError) {
        return { ok: false, error: classifyWalletError(switchError) };
      }
    }
    if (!isOn(await ask(provider, "eth_chainId", undefined, timeoutMs), spec)) return { ok: false, error: walletError("rede_nao_confirmada") };
    return { ok: true, added };
  } catch (error) {
    return { ok: false, error: classifyWalletError(error) };
  } finally {
    waiting.delete(provider);
  }
}
