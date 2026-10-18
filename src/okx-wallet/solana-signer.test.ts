import { expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import {
  base58Decode, base58Encode, createSolanaSigner, parseSolanaTransaction, serializeSolanaTransaction, signSolanaTransaction,
  solanaKeypairFromSecret, verifySolanaSignature, withRecentBlockhash,
} from "./solana-signer";

function freshSecret(): { secretBase58: string; publicKey: Uint8Array } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const seed = (privateKey.export({ format: "der", type: "pkcs8" }) as Buffer).subarray(-32);
  const pub = (publicKey.export({ format: "der", type: "spki" }) as Buffer).subarray(-32);
  return { secretBase58: base58Encode(Uint8Array.from(Array.from(Buffer.concat([seed, pub])))), publicKey: Uint8Array.from(Array.from(pub)) };
}

/** Builds an unsigned v0 transaction with one required signature whose fee payer is `feePayer`. */
function unsignedV0(feePayer: Uint8Array, blockhash: Uint8Array): Uint8Array {
  const header = Uint8Array.from([1, 0, 1]);
  const keys = Uint8Array.from([2, ...feePayer, ...new Uint8Array(32).fill(7)]);
  const instructions = Uint8Array.from([1, 1, 0, 2, 9, 9]);
  const lookups = Uint8Array.from([0]);
  const message = Uint8Array.from([0x80, ...header, ...keys, ...blockhash, ...instructions, ...lookups]);
  return Uint8Array.from([1, ...new Uint8Array(64), ...message]);
}

test("base58 round trips including leading zeros", () => {
  const bytes = Uint8Array.from([0, 0, 255, 1, 2, 3]);
  expect(base58Decode(base58Encode(bytes))).toEqual(bytes);
  expect(base58Encode(base58Decode("11111111111111111111111111111111"))).toBe("11111111111111111111111111111111");
  expect(() => base58Decode("0OIl")).toThrow("Invalid base58 character");
});

test("keypair derives the address and rejects a mismatched public key", () => {
  const { secretBase58, publicKey } = freshSecret();
  const keypair = solanaKeypairFromSecret(secretBase58);
  expect(keypair.address).toBe(base58Encode(publicKey));
  const tampered = Uint8Array.from(base58Decode(secretBase58));
  tampered[63] = tampered[63]! ^ 1;
  expect(() => solanaKeypairFromSecret(base58Encode(tampered))).toThrow("does not match");
});

test("parses, refreshes the blockhash, signs slot 0 and serializes a v0 transaction", () => {
  const { secretBase58, publicKey } = freshSecret();
  const keypair = solanaKeypairFromSecret(secretBase58);
  const original = unsignedV0(publicKey, new Uint8Array(32).fill(1));
  const parsed = parseSolanaTransaction(original);
  expect(parsed.versioned).toBe(true);
  expect(parsed.signatureCount).toBe(1);
  expect(Buffer.from(parsed.feePayer)).toEqual(Buffer.from(publicKey));
  const fresh = base58Encode(new Uint8Array(32).fill(9));
  const refreshed = withRecentBlockhash(parsed, fresh);
  expect(refreshed.message.slice(refreshed.blockhashOffset, refreshed.blockhashOffset + 32)).toEqual(new Uint8Array(32).fill(9));
  const signed = signSolanaTransaction(refreshed, keypair);
  expect(verifySolanaSignature(signed.message, signed.signatures[0]!, publicKey)).toBe(true);
  const serialized = serializeSolanaTransaction(signed);
  expect(serialized.length).toBe(original.length);
  expect(parseSolanaTransaction(serialized).signatures[0]).toEqual(signed.signatures[0]!);
  const other = freshSecret();
  expect(() => signSolanaTransaction(refreshed, solanaKeypairFromSecret(other.secretBase58))).toThrow("fee payer");
});

test("signer sends base64 through the RPC and confirms by signature status", async () => {
  const { secretBase58, publicKey } = freshSecret();
  const calls: { method: string; params: unknown[] }[] = [];
  const rpc = async (method: string, params: unknown[]) => {
    calls.push({ method, params });
    if (method === "getLatestBlockhash") return { value: { blockhash: base58Encode(new Uint8Array(32).fill(3)) } };
    if (method === "sendTransaction") return "5igSig";
    return { value: [{ confirmationStatus: "confirmed", err: null }] };
  };
  const signer = createSolanaSigner(secretBase58, rpc, async () => {});
  const signature = await signer.signAndSend(base58Encode(unsignedV0(publicKey, new Uint8Array(32))));
  expect(signature).toBe("5igSig");
  const send = calls.find((call) => call.method === "sendTransaction")!;
  expect((send.params[1] as { encoding: string }).encoding).toBe("base64");
  const sent = parseSolanaTransaction(Uint8Array.from(Buffer.from(send.params[0] as string, "base64")));
  expect(verifySolanaSignature(sent.message, sent.signatures[0]!, publicKey)).toBe(true);
  expect(await signer.confirm(signature, 1_000)).toBe(true);
});
