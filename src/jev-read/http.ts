/**
 * GET /jev-read serves the board written by the Jev read producer, through the explicit projection in public-view.ts.
 * Read only, bounded, exact dashboard-origin allowlist and an optional bearer token, the same contract as /system-one.
 * CORS is a browser control, not network authentication.
 */

import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { publicBoardView } from "./public-view";

const MAX_BYTES = 2_000_000;
export const DEFAULT_DASHBOARD_ORIGINS = ["http://localhost:3001", "http://127.0.0.1:3001"];

export function isJevReadPath(pathname: string): boolean {
  return pathname === "/jev-read";
}

/** Builds the response headers for a request, or null when its origin is not on the allowlist. */
export function readHeaders(origin: string | null, allowed: ReadonlySet<string>): Record<string, string> | null {
  if (origin === null || !allowed.has(origin)) return null;
  return {
    "content-type": "application/json",
    "cache-control": "no-store",
    vary: "Origin",
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "authorization",
  };
}

export function parseOrigins(origins: readonly string[]): ReadonlySet<string> {
  return new Set(origins.map((origin) => origin.trim()).filter(Boolean));
}

export function createJevReadHandler(statePath: string, origins: readonly string[] = DEFAULT_DASHBOARD_ORIGINS, readToken: string | null = null): (req: Request) => Response {
  const allowed = parseOrigins(origins);
  const token = readToken?.trim() || null;
  return (req) => {
    const headers = readHeaders(req.headers.get("origin"), allowed);
    if (headers === null) return new Response(JSON.stringify({ error: "origin not allowed" }), { status: 403, headers: { "content-type": "application/json", "cache-control": "no-store", vary: "Origin" } });
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
    if (token && req.headers.get("authorization") !== `Bearer ${token}`) return json({ error: "unauthorized" }, 401);
    let fd: number | undefined;
    try {
      fd = openSync(statePath, "r");
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > MAX_BYTES) return json({ error: "jev-read state too large" }, 500);
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      let size = 0;
      let read = 0;
      while (size < buffer.length && (read = readSync(fd, buffer, size, buffer.length - size, size)) > 0) size += read;
      if (size > MAX_BYTES) return json({ error: "jev-read state too large" }, 500);
      const view = publicBoardView(JSON.parse(buffer.subarray(0, size).toString("utf8")));
      return view === null ? json({ error: "jev-read state invalid" }, 500) : json(view);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return json({ error: "jev-read state not found", hint: "run: bun run jev-read --jev" }, 404);
      return json({ error: "jev-read state unreadable" }, 500);
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  };
}
