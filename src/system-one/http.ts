/**
 * GET /system-one serves the latest System One cycle written by scripts/system-one.ts.
 * Read only, same CORS as the block feed; the file carries no address and no credentials.
 */

import { existsSync, readFileSync } from "node:fs";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

export function isSystemOnePath(pathname: string): boolean {
  return pathname === "/system-one";
}

export function createSystemOneHandler(statePath: string): (req: Request) => Response {
  return (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
    if (!existsSync(statePath)) return json({ error: "system-one state not found", hint: "run: bun run system-one" }, 404);
    try {
      const raw = readFileSync(statePath, "utf8");
      if (raw.length > 2_000_000) return json({ error: "system-one state too large" }, 500);
      return json(JSON.parse(raw));
    } catch {
      return json({ error: "system-one state unreadable" }, 500);
    }
  };
}
