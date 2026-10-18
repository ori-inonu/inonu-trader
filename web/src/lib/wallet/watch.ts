/**
 * A public address followed in read-only (WAL-4): the way to see what a wallet holds, and to ask the Inonu what to do about it, without connecting the wallet. The extension that
 * connects it is not present in every browser (the one inside an editor has none), and a public address is all the gateway needs to read balances. Nothing here signs, sends or
 * asks a wallet for anything; the address stays on this machine, and the person can stop following it at any time.
 *
 * The risk of a box that takes a text is that someone pastes the wrong secret into it, so the box refuses, by its SHAPE and before anything is stored or sent, whatever looks like a
 * private key or a recovery phrase, and says why.
 */
import { isSolanaAddress, SOLANA_CHAIN_INDEX } from "./holdings";

export const WATCH_KEY = "inonu.watch.address.v1";

export type WatchFamily = "evm" | "solana";
export type WatchParse = { readonly ok: true; readonly address: string; readonly family: WatchFamily } | { readonly ok: false; readonly reason: string };

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
// a private key as hex (with or without 0x), or any long run of letters and digits (a base58 secret key has 87 or 88): not an address, never accepted
const LOOKS_LIKE_KEY = /^(0x)?[0-9a-fA-F]{64}$|^[A-Za-z0-9]{50,120}$/;

export const WATCH_NETWORK_OF = { evm: null, solana: SOLANA_CHAIN_INDEX } as const;

export function parseWatchInput(input: string): WatchParse {
  const text = input.trim();
  if (text === "") return { ok: false, reason: "Cole um endereco publico." };
  if (text.length > 200) return { ok: false, reason: "Isto e longo demais para ser um endereco." };
  // a recovery phrase is words: twelve or more separated by spaces, and in any case more than one word is not an address
  if (/\s/.test(text)) return { ok: false, reason: "Isso parece uma frase de recuperacao. Nunca cole frases nem chaves aqui: so o endereco publico." };
  if (LOOKS_LIKE_KEY.test(text) && !EVM_ADDRESS.test(text) && !isSolanaAddress(text)) {
    return { ok: false, reason: "Isso parece uma chave privada. Nunca cole chaves aqui: so o endereco publico." };
  }
  if (EVM_ADDRESS.test(text)) return { ok: true, address: text.toLowerCase(), family: "evm" };
  if (isSolanaAddress(text)) return { ok: true, address: text, family: "solana" };
  return { ok: false, reason: "Nao e um endereco valido: um endereco EVM comeca com 0x e tem 42 caracteres, e um endereco Solana tem de 32 a 44 caracteres." };
}

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** The address that was being followed, read again through the same rules (a stored value that is not an address is nothing). */
export function loadWatch(storage: Store | null): { readonly address: string; readonly family: WatchFamily } | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(WATCH_KEY);
    if (raw === null) return null;
    const parsed = parseWatchInput(raw);
    return parsed.ok ? { address: parsed.address, family: parsed.family } : null;
  } catch {
    return null;
  }
}

export function saveWatch(storage: Store | null, address: string | null): void {
  if (storage === null) return;
  try {
    if (address === null) storage.removeItem?.(WATCH_KEY);
    else storage.setItem(WATCH_KEY, address);
  } catch {
    // blocked or full: it is followed until the page closes
  }
}
