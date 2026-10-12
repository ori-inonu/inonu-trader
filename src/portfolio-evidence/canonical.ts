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

export function hashOf(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
