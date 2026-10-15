import { createHmac } from "node:crypto";

/**
 * OKX OnchainOS signature (gateway doc §2): Base64(HMAC-SHA256(secret, timestamp + method + requestPath +
 * body)). `requestPath` carries the query string exactly as it will be sent; a POST signs the raw body.
 */
export function signRequest(secret: string, timestampIso: string, method: "GET" | "POST", requestPath: string, body: string): string {
  return createHmac("sha256", secret).update(timestampIso + method + requestPath + body, "utf8").digest("base64");
}
