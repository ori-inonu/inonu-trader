import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from "node:crypto";

/**
 * Minimal Solana transaction signer without external dependencies.
 *
 * The OKX swap endpoint returns `tx.data` for chainIndex 501 as a base58
 * serialized transaction (legacy or v0), confirmed in the OKX DEX SDK
 * (src/okx/api/swap/solana/solana-swap.ts: `base58.decode(txData)` then
 * `VersionedTransaction.deserialize`, with `recentBlockhash` refreshed before
 * signing). This module reproduces that flow: decode, refresh the blockhash in
 * place, sign the message with the fee payer key (signature slot 0) and
 * serialize for `sendTransaction` with base64 encoding.
 */
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function base58Decode(text: string): Uint8Array {
  if (text.length === 0) return new Uint8Array();
  let value = BigInt(0);
  for (const char of text) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid base58 character");
    value = value * BigInt(58) + BigInt(index);
  }
  const bytes: number[] = [];
  while (value > BigInt(0)) { bytes.push(Number(value % BigInt(256))); value /= BigInt(256); }
  for (const char of text) { if (char === "1") bytes.push(0); else break; }
  return Uint8Array.from(bytes.reverse());
}

export function base58Encode(bytes: Uint8Array): string {
  let value = BigInt(0);
  for (const byte of bytes) value = value * BigInt(256) + BigInt(byte);
  let text = "";
  while (value > BigInt(0)) { text = ALPHABET[Number(value % BigInt(58))] + text; value /= BigInt(58); }
  for (const byte of bytes) { if (byte === 0) text = "1" + text; else break; }
  return text;
}

function readCompactU16(bytes: Uint8Array, offset: number): { value: number; size: number } {
  let value = 0, size = 0;
  for (;;) {
    const byte = bytes[offset + size];
    if (byte === undefined) throw new Error("Truncated transaction");
    value |= (byte & 0x7f) << (7 * size);
    size++;
    if ((byte & 0x80) === 0) break;
    if (size > 3) throw new Error("Invalid compact length");
  }
  return { value, size };
}

export interface ParsedSolanaTransaction {
  signatureCount: number;
  signatures: Uint8Array[];
  message: Uint8Array;
  versioned: boolean;
  /** Offset of the 32-byte recent blockhash inside `message`. */
  blockhashOffset: number;
  feePayer: Uint8Array;
}

export function parseSolanaTransaction(serialized: Uint8Array): ParsedSolanaTransaction {
  const count = readCompactU16(serialized, 0);
  let offset = count.size;
  const signatures: Uint8Array[] = [];
  for (let index = 0; index < count.value; index++) {
    signatures.push(serialized.slice(offset, offset + 64));
    offset += 64;
  }
  const message = serialized.slice(offset);
  if (message.length < 4) throw new Error("Truncated message");
  const versioned = (message[0]! & 0x80) !== 0;
  let cursor = versioned ? 1 : 0;
  cursor += 3; // header: required signatures, readonly signed, readonly unsigned
  const keys = readCompactU16(message, cursor);
  cursor += keys.size;
  const feePayer = message.slice(cursor, cursor + 32);
  cursor += 32 * keys.value;
  if (message.length < cursor + 32) throw new Error("Truncated message");
  const requiredSignatures = message[versioned ? 1 : 0]!;
  if (requiredSignatures < 1 || count.value < requiredSignatures) throw new Error("Signature slots do not match the header");
  return { signatureCount: count.value, signatures, message, versioned, blockhashOffset: cursor, feePayer };
}

export function withRecentBlockhash(parsed: ParsedSolanaTransaction, blockhashBase58: string): ParsedSolanaTransaction {
  const blockhash = base58Decode(blockhashBase58);
  if (blockhash.length !== 32) throw new Error("Invalid blockhash");
  const message = new Uint8Array(parsed.message);
  message.set(blockhash, parsed.blockhashOffset);
  return { ...parsed, message };
}

export function serializeSolanaTransaction(parsed: ParsedSolanaTransaction): Uint8Array {
  if (parsed.signatureCount > 127) throw new Error("Too many signatures");
  const out = new Uint8Array(1 + 64 * parsed.signatureCount + parsed.message.length);
  out[0] = parsed.signatureCount;
  parsed.signatures.forEach((signature, index) => out.set(signature, 1 + 64 * index));
  out.set(parsed.message, 1 + 64 * parsed.signatureCount);
  return out;
}

export interface SolanaKeypair {
  publicKey: Uint8Array;
  address: string;
  sign(message: Uint8Array): Uint8Array;
}

/** Accepts a base58 64-byte secret (seed + public key) or a 32-byte seed. */
export function solanaKeypairFromSecret(secretBase58: string): SolanaKeypair {
  const secret = base58Decode(secretBase58);
  if (secret.length !== 64 && secret.length !== 32) throw new Error("Invalid Solana secret key length");
  const seed = secret.slice(0, 32);
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(seed)]), format: "der", type: "pkcs8" });
  const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" }) as Buffer;
  const publicKey = Uint8Array.from(Array.from(spki.subarray(spki.length - 32)));
  if (secret.length === 64 && Buffer.compare(Buffer.from(secret.slice(32)), Buffer.from(publicKey)) !== 0) throw new Error("Secret key does not match its public key");
  return {
    publicKey,
    address: base58Encode(publicKey),
    sign: (message) => Uint8Array.from(Array.from(edSign(null, Buffer.from(message), privateKey))),
  };
}

export function verifySolanaSignature(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
  const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(publicKey)]), format: "der", type: "spki" });
  return edVerify(null, Buffer.from(message), key, Buffer.from(signature));
}

/** Signs slot 0 (fee payer) after checking the message names this key as fee payer. */
export function signSolanaTransaction(parsed: ParsedSolanaTransaction, keypair: SolanaKeypair): ParsedSolanaTransaction {
  if (Buffer.compare(Buffer.from(parsed.feePayer), Buffer.from(keypair.publicKey)) !== 0) throw new Error("Transaction fee payer is not the operator key");
  const signatures: Uint8Array[] = parsed.signatures.map((signature) => Uint8Array.from(Array.from(signature)));
  signatures[0] = keypair.sign(parsed.message);
  return { ...parsed, signatures };
}

export type SolanaRpc = (method: string, params: unknown[]) => Promise<unknown>;

export function solanaJsonRpc(url: string, fetcher: typeof fetch = fetch, timeoutMs = 10_000): SolanaRpc {
  let id = 0;
  return async (method, params) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }), signal: controller.signal });
      if (!response.ok) throw new Error("Solana RPC http error");
      const envelope = await response.json() as { result?: unknown; error?: { message?: string } };
      if (envelope.error) throw new Error(`Solana RPC error: ${envelope.error.message ?? "unknown"}`);
      return envelope.result;
    } finally {
      clearTimeout(timer);
    }
  };
}

export interface SolanaSigner {
  readonly address: string;
  /** Decodes OKX `tx.data`, refreshes the blockhash, signs and sends; returns the signature. */
  signAndSend(txDataBase58: string): Promise<string>;
  /** Resolves true when the signature is confirmed, false when it expired or failed. */
  confirm(signature: string, timeoutMs: number): Promise<boolean>;
}

export function createSolanaSigner(secretBase58: string, rpc: SolanaRpc, sleep: (ms: number) => Promise<void> = (ms) => Bun.sleep(ms)): SolanaSigner {
  const keypair = solanaKeypairFromSecret(secretBase58);
  return {
    address: keypair.address,
    async signAndSend(txDataBase58) {
      const parsed = parseSolanaTransaction(base58Decode(txDataBase58));
      const latest = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]) as { value?: { blockhash?: string } };
      const blockhash = latest?.value?.blockhash;
      if (typeof blockhash !== "string") throw new Error("Solana RPC returned no blockhash");
      const signed = signSolanaTransaction(withRecentBlockhash(parsed, blockhash), keypair);
      const encoded = Buffer.from(serializeSolanaTransaction(signed)).toString("base64");
      const signature = await rpc("sendTransaction", [encoded, { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 3 }]);
      if (typeof signature !== "string") throw new Error("Solana RPC returned no signature");
      return signature;
    },
    async confirm(signature, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const statuses = await rpc("getSignatureStatuses", [[signature], { searchTransactionHistory: true }]) as { value?: ({ confirmationStatus?: string; err?: unknown } | null)[] };
        const status = statuses?.value?.[0];
        if (status?.err) return false;
        if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return true;
        await sleep(1_500);
      }
      return false;
    },
  };
}
