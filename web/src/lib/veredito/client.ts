/**
 * The desk's client of the two small routes the Veredito reads (INT-0.10, INT-1.7): the Placar and the risk profile. Same rules as
 * the client of "Pedir ao Inonu": the intent header on a write, a closed reading of the answer, and every transport failure turned
 * into a named outcome (null) so the screen can say nothing instead of throwing. Neither route ever calls the model.
 */
import { parseMedicao, parsePerfil, parsePlacar, type Medicao, type Placar } from "./parse";
import type { Perfil } from "./types";

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<Response>;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function createVereditoClient(base: string = process.env.NEXT_PUBLIC_API_URL ?? "", fetchImpl: FetchLike = (url, init) => fetch(url, init)) {
  return {
    /** The Placar of the answers; null when the core has no such route or did not answer. */
    async placar(signal?: AbortSignal): Promise<Placar | null> {
      try {
        const res = await fetchImpl(`${base}/inonu/placar`, { method: "GET", ...(signal ? { signal } : {}) });
        return res.ok ? parsePlacar(await res.json().catch(() => null)) : null;
      } catch {
        return null;
      }
    },

    /** The Placar and the health of the recorder together, for the panel that shows what is being measured. */
    async medicao(signal?: AbortSignal): Promise<Medicao | null> {
      try {
        const res = await fetchImpl(`${base}/inonu/placar`, { method: "GET", ...(signal ? { signal } : {}) });
        return res.ok ? parseMedicao(await res.json().catch(() => null)) : null;
      } catch {
        return null;
      }
    },

    async perfil(): Promise<Perfil | null> {
      try {
        const res = await fetchImpl(`${base}/inonu/perfil`, { method: "GET" });
        if (!res.ok) return null;
        const body: unknown = await res.json().catch(() => null);
        return isRec(body) && body.ok === true ? parsePerfil(body.perfil) : null;
      } catch {
        return null;
      }
    },

    /** Saves what the person chose to risk, or clears it with two nulls. */
    async salvarPerfil(perfil: Perfil): Promise<{ ok: true } | { ok: false; reason: string }> {
      try {
        const res = await fetchImpl(`${base}/inonu/perfil`, { method: "PUT", headers: { "content-type": "application/json", "x-inonu-intent": "user" }, body: JSON.stringify({ capitalUsd: perfil.capitalUsd, riskPct: perfil.riskPct }) });
        const body: unknown = await res.json().catch(() => null);
        if (res.ok && isRec(body) && body.ok === true) return { ok: true };
        return { ok: false, reason: isRec(body) && typeof body.code === "string" ? body.code.slice(0, 40) : res.status === 404 ? "servidor_sem_rota" : "servidor_com_erro" };
      } catch {
        return { ok: false, reason: "sem_conexao" };
      }
    },
  };
}

export type VereditoClient = ReturnType<typeof createVereditoClient>;
