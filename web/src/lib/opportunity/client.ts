/**
 * The read of the opportunity engine on the desk's own origin: `GET /inonu/opportunities`. Free (public exchange reads in the core, no model, no OnchainOS quota), so the page may ask it
 * when someone looks at the board; the core decides whether that starts a scan. A failure has a reason in a few constant words, never the text of the server.
 */
import { type EngineState, parseEngineState } from "./engine";

export type EngineOutcome = { readonly ok: true; readonly state: EngineState } | { readonly ok: false; readonly reason: "sem_conexao" | "servidor_sem_rota" | "origem_negada" | "resposta_invalida" };

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export function createEngineClient(base: string = process.env.NEXT_PUBLIC_API_URL ?? "", fetchImpl: FetchLike = (url, init) => fetch(url, init)) {
  return {
    async read(signal?: AbortSignal): Promise<EngineOutcome> {
      let res: Response;
      try {
        res = await fetchImpl(`${base}/inonu/opportunities`, signal ? { signal } : {});
      } catch {
        return { ok: false, reason: "sem_conexao" };
      }
      if (res.status === 404) return { ok: false, reason: "servidor_sem_rota" };
      if (res.status === 403) return { ok: false, reason: "origem_negada" };
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // a page that is not JSON is not the contract
      }
      const state = parseEngineState(body);
      return state === null ? { ok: false, reason: "resposta_invalida" } : { ok: true, state };
    },
  };
}

export type EngineClient = ReturnType<typeof createEngineClient>;
