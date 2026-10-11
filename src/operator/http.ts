import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { computeInsights, parseCycleLines, type OperatorInsights } from "./insights";
import type { OperatorCycle } from "./types";

/**
 * Read-only HTTP handler for the operator state (R5 C2, M2, F7): origin
 * restricted to the dashboard, optional bearer token, absolute file paths and a
 * journal cache keyed by size and mtime so the trader's event loop never
 * re-parses an unchanged file. Nothing here reads keys or executes anything.
 */
export interface OperatorHttpOptions {
  origins: string[];
  token: string | null;
  statePath: string;
  journalPath: string;
  maxJournalBytes?: number;
  now?: () => number;
}

export type OperatorHandler = (req: Request, pathname: string) => Response;

const OPERATOR_PATHS = new Set(["/operator", "/operator/history", "/operator/insights"]);

export function isOperatorPath(pathname: string): boolean {
  return OPERATOR_PATHS.has(pathname);
}

export function createOperatorHandler(options: OperatorHttpOptions): OperatorHandler {
  const origins = options.origins.map((value) => value.trim()).filter(Boolean);
  if (origins.length === 0) throw new Error("Operator origins must not be empty");
  if (!isAbsolute(options.statePath) || !isAbsolute(options.journalPath)) throw new Error("Operator paths must be absolute");
  const maxJournalBytes = options.maxJournalBytes ?? 8 * 1024 * 1024;
  const token = options.token?.trim() || null;
  let cache: { size: number; mtimeMs: number; cycles: OperatorCycle[]; insights: OperatorInsights } | null = null;

  const json = (body: unknown, status: number, headers: Record<string, string>) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json", "cache-control": "no-store" } });

  const headersFor = (req: Request): Record<string, string> | null => {
    const origin = req.headers.get("origin");
    if (origin && !origins.includes(origin)) return null;
    return { "access-control-allow-origin": origin ?? origins[0]!, "access-control-allow-headers": "authorization,content-type", vary: "origin" };
  };

  const loadJournal = (): { cycles: OperatorCycle[]; insights: OperatorInsights } | { error: string; status: number } => {
    if (!existsSync(options.journalPath)) return { error: "operator journal not found", status: 404 };
    const stat = statSync(options.journalPath);
    if (stat.size > maxJournalBytes) return { error: "operator journal too large; rotate it", status: 413 };
    if (cache && cache.size === stat.size && cache.mtimeMs === stat.mtimeMs) return cache;
    try {
      const cycles = parseCycleLines(readFileSync(options.journalPath, "utf8"));
      cache = { size: stat.size, mtimeMs: stat.mtimeMs, cycles, insights: computeInsights(cycles) };
      return cache;
    } catch {
      return { error: "operator journal unreadable", status: 500 };
    }
  };

  return (req, pathname) => {
    if (!isOperatorPath(pathname)) return json({ error: "not found" }, 404, {});
    const headers = headersFor(req);
    if (!headers) return json({ error: "origin not allowed" }, 403, {});
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "GET") return json({ error: "method not allowed" }, 405, headers);
    if (token && req.headers.get("authorization") !== `Bearer ${token}`) return json({ error: "unauthorized" }, 401, headers);
    if (pathname === "/operator") {
      if (!existsSync(options.statePath)) return json({ error: "operator state not found" }, 404, headers);
      try { return json(JSON.parse(readFileSync(options.statePath, "utf8")), 200, headers); } catch { return json({ error: "operator state unreadable" }, 500, headers); }
    }
    const journal = loadJournal();
    if ("error" in journal) return json({ error: journal.error }, journal.status, headers);
    if (pathname === "/operator/insights") return json(journal.insights, 200, headers);
    const limitRaw = Number(new URL(req.url).searchParams.get("limit") ?? "50");
    const limit = Number.isSafeInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 50;
    return json(journal.cycles.slice(-limit), 200, headers);
  };
}
