/**
 * Canonical JSON and content hashing. The hash covers exactly the canonical text of a value, so the same evidence yields
 * the same hash in any run. Plain data only: undefined, NaN, Infinity, bigint, functions and symbols are refused.
 */

import { createHash } from "node:crypto";

export class CanonicalError extends Error {
  constructor() {
    super("valor não canonizável");
    this.name = "CanonicalError";
  }
}

export function canonicalJson(value: unknown): string {
  return stringify(value, 0);
}

function stringify(value: unknown, depth: number): string {
  if (depth > 40) throw new CanonicalError();
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new CanonicalError();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => stringify(item, depth + 1)).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => {
        if (record[key] === undefined) throw new CanonicalError();
        return `${JSON.stringify(key)}:${stringify(record[key], depth + 1)}`;
      })
      .join(",")}}`;
  }
  throw new CanonicalError();
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * A provider value reduced to something that is always safe to hash: strings, booleans and finite numbers stay as they are;
 * anything else (an object, an array, NaN, Infinity from a raw 1e999) becomes null. Use it for provider fields that only feed
 * an identifier, so hostile input can never make a builder throw after the answer was paid for.
 */
export function safeScalar(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

export function hashOf(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
