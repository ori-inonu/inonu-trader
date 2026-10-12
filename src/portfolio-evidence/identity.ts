/**
 * Asset identity = network + contract. The symbol is presentation and never part of the key.
 * Reuses the chain registry and address syntax of src/okx-wallet/chains.ts without editing it.
 */

import { chainByIndex, isAddressForChain, type ChainKind } from "../okx-wallet/chains.ts";
import type { AssetDisplay, AssetIdentity } from "./types.ts";

export type IdentityFailure = "unknown_network" | "invalid_contract_for_network" | "invalid_contract_type";

export type IdentityResult = { readonly ok: true; readonly identity: AssetIdentity } | { readonly ok: false; readonly code: IdentityFailure };

/** Control characters, zero width characters and line or paragraph separators. Written as escapes on purpose. */
const UNSAFE_TEXT = new RegExp("[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]+", "g");

const MOVE_TYPE = /^0x[0-9a-fA-F]{1,64}::[A-Za-z_][A-Za-z0-9_]{0,63}::[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** EVM style and Sui addresses are case-insensitive hex; Solana, Tron, TON and Bitcoin are case sensitive. */
function canonicalAddress(kind: ChainKind, address: string): string {
  return kind === "evm" || kind === "sui" ? address.toLowerCase() : address;
}

/** The syntax check of the registry, plus Sui coin types (`0x..::module::TYPE`), which the registry does not model. */
function validContract(chainIndex: string, kind: ChainKind, contract: string): boolean {
  if (isAddressForChain(chainIndex, contract)) return true;
  return kind === "sui" && MOVE_TYPE.test(contract);
}

function canonicalContract(kind: ChainKind, contract: string): string {
  if (kind === "sui" && MOVE_TYPE.test(contract)) {
    const [head, ...rest] = contract.split("::");
    return [head!.toLowerCase(), ...rest].join("::");
  }
  return canonicalAddress(kind, contract);
}

/** An empty contract is the native coin of the network. Anything else must be a valid contract for THAT network. */
export function buildIdentity(chainIndex: unknown, tokenContractAddress: unknown): IdentityResult {
  if (typeof chainIndex !== "string") return { ok: false, code: "unknown_network" };
  const chain = chainByIndex(chainIndex);
  if (chain === undefined) return { ok: false, code: "unknown_network" };
  if (typeof tokenContractAddress !== "string") return { ok: false, code: "invalid_contract_type" };
  if (tokenContractAddress === "") {
    return { ok: true, identity: { chainIndex, family: chain.kind, asset: { kind: "native_marker" }, key: `${chainIndex}:native` } };
  }
  if (!validContract(chainIndex, chain.kind, tokenContractAddress)) return { ok: false, code: "invalid_contract_for_network" };
  const address = canonicalContract(chain.kind, tokenContractAddress);
  return { ok: true, identity: { chainIndex, family: chain.kind, asset: { kind: "contract", address }, key: `${chainIndex}:contract:${address}` } };
}

/** Third party text for display: control characters removed, collapsed, at most 32 characters, null when nothing is left. */
export function sanitizeDisplay(symbol: unknown): AssetDisplay {
  if (typeof symbol !== "string") return { symbol: null };
  const cleaned = symbol.replace(UNSAFE_TEXT, " ").replace(/\s+/g, " ").trim().slice(0, 32);
  return { symbol: cleaned === "" ? null : cleaned };
}

/** Canonical form of the account address, for hashing and comparison. Null when it is not a valid address for the network. */
export function canonicalAccount(chainIndex: string, address: unknown): string | null {
  const chain = chainByIndex(chainIndex);
  if (chain === undefined || !isAddressForChain(chainIndex, address)) return null;
  return canonicalAddress(chain.kind, address);
}
