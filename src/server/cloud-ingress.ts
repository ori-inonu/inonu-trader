import { timingSafeEqual } from "node:crypto";
import type { ApiHandler } from "../desktop/core";
import { secureCloudResponse } from "./cloud-content-policy";

export interface CloudIngressOptions {
  readonly publicOrigin: string;
  readonly internalOrigin: string;
  readonly gatewayToken: string;
  readonly owner: string;
  readonly handle: ApiHandler;
}

const fail = () => new Response('{"ok":false,"code":"forbidden"}', { status: 403, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** Only the authenticated reverse proxy can cross this boundary. The local core's guards stay intact. */
export function createCloudIngress(options: CloudIngressOptions): (request: Request) => Promise<Response> {
  let publicUrl: URL;
  let internalUrl: URL;
  try { publicUrl = new URL(options.publicOrigin); internalUrl = new URL(options.internalOrigin); } catch { throw new Error("cloud_config_invalid"); }
  if (publicUrl.protocol !== "https:" || publicUrl.origin !== options.publicOrigin || publicUrl.username || publicUrl.password || internalUrl.protocol !== "http:" || internalUrl.hostname !== "127.0.0.1" || internalUrl.origin !== options.internalOrigin || !/^[A-Za-z0-9_-]{48,128}$/.test(options.gatewayToken) || !/^[a-zA-Z0-9_.-]{1,64}$/.test(options.owner)) throw new Error("cloud_config_invalid");
  const expected = Buffer.from(options.gatewayToken);
  return async (request) => {
    const received = Buffer.from(request.headers.get("x-inonu-gateway") ?? "");
    if (received.length !== expected.length || !timingSafeEqual(received, expected) || request.headers.get("remote-user") !== options.owner) return fail();
    const source = new URL(request.url);
    if (request.headers.get("host") !== publicUrl.host || source.host !== publicUrl.host) return fail();
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== options.publicOrigin) return fail();
    const site = request.headers.get("sec-fetch-site");
    if (site !== null && site !== "same-origin" && site !== "none") return fail();
    const writes = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (writes && (origin !== options.publicOrigin || request.headers.get("x-inonu-intent") !== "user")) return fail();
    const headers = new Headers(request.headers);
    for (const name of [...headers.keys()]) if (name.startsWith("x-forwarded-") || name.startsWith("remote-") || ["x-inonu-gateway", "cookie", "authorization", "forwarded", "referer"].includes(name)) headers.delete(name);
    headers.set("host", internalUrl.host);
    headers.set("origin", options.internalOrigin);
    headers.set("sec-fetch-site", "same-origin");
    const internal = new Request(`${options.internalOrigin}${source.pathname}${source.search}`, { method: request.method, headers, body: request.body, signal: request.signal, redirect: "manual" });
    const response = await options.handle(internal, "127.0.0.1");
    const outward = new Headers(response.headers);
    if (outward.has("access-control-allow-origin")) outward.set("access-control-allow-origin", options.publicOrigin);
    outward.set("cache-control", "no-store");
    outward.set("x-content-type-options", "nosniff");
    outward.set("referrer-policy", "no-referrer");
    return secureCloudResponse(new Response(response.body, { status: response.status, statusText: response.statusText, headers: outward }));
  };
}
