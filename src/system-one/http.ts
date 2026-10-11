/**
 * GET /system-one serves the latest System One cycle written by scripts/system-one.ts.
 * Read only, bounded explicit public projection and exact dashboard-origin allowlist.
 * CORS is a browser control, not network authentication.
 */

import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { publicSystemOneView } from "./public-view";


export function isSystemOnePath(pathname: string): boolean {
  return pathname === "/system-one";
}

export function createSystemOneHandler(statePath: string, origins = ["http://localhost:3001", "http://127.0.0.1:3001"], readToken: string | null = null): (req: Request) => Response {
  const allowed = new Set(origins.map(origin => origin.trim()).filter(Boolean));
  const token = readToken?.trim() || null;
  return (req) => {
    const origin = req.headers.get("origin");
    const permitted = origin !== null && allowed.has(origin);
    const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store", vary: "Origin" };
    if (permitted) Object.assign(headers, { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "authorization" });
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (!permitted) return json({ error: "origin not allowed" }, 403);
    if (req.method === "OPTIONS") return new Response(null, { headers });
    if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
    if (token && req.headers.get("authorization") !== `Bearer ${token}`) return json({ error: "unauthorized" }, 401);
    let fd: number | undefined;
    try {
      fd = openSync(statePath, "r");
      const stat = fstatSync(fd);
      const maxBytes = 2_000_000;
      if (!stat.isFile() || stat.size > maxBytes) return json({ error: "system-one state too large" }, 500);
      const buffer = Buffer.alloc(maxBytes + 1);
      let size = 0, read = 0;
      while (size < buffer.length && (read = readSync(fd, buffer, size, buffer.length - size, size)) > 0) size += read;
      if (size > maxBytes) return json({ error: "system-one state too large" }, 500);
      const view = publicSystemOneView(JSON.parse(buffer.subarray(0, size).toString("utf8")));
      if (!view) return json({ error: "system-one state invalid" }, 500);
      return json(view);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return json({ error: "system-one state not found", hint: "run: bun run system-one" }, 404);
      return json({ error: "system-one state unreadable" }, 500);
    } finally { if (fd !== undefined) closeSync(fd); }
  };
}
