/**
 * The three states of the unknown in the Brief (fase-2 SPEC F2-DIG-3): `vazio_valido` (the provider answered and has
 * nothing), `nao_consultado:<motivo>` (the call did not leave or could not be made) and `erro:<codigo>` (it left and
 * failed). Each becomes a `null` with its reason in `nulos`. Pure.
 */
export type GatewayLike =
  | { readonly ok: true; readonly data: unknown; readonly meta?: { readonly ageMs: number; readonly stale: boolean } }
  | { readonly ok: false; readonly error: string };

export type NuloState =
  | { readonly state: "dado"; readonly stale: boolean; readonly ageMs: number | null }
  | { readonly state: "vazio_valido"; readonly nulo: "vazio_valido" }
  | { readonly state: "nao_consultado"; readonly nulo: string }
  | { readonly state: "erro"; readonly nulo: string };

const NOT_CONSULTED: Readonly<Record<string, string>> = {
  no_credentials: "sem_credencial",
  incomplete_credentials: "sem_credencial",
  budget_exhausted: "orcamento",
  pace_limited: "orcamento",
  provider_payment_required: "cota_esgotada",
  unsupported_chain: "rede_nao_suportada",
};

const ERRORS = new Set(["rate_limited", "provider_error", "schema", "clock_skew", "provider_unauthorized", "bad_request"]);

/** Nothing in it: null, an empty list, an object with no keys, or an object whose every value is null or an empty list. */
function isEmpty(data: unknown): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data !== "object") return false;
  return Object.values(data as Record<string, unknown>).every((v) => v === null || v === undefined || (Array.isArray(v) && v.length === 0));
}

export function classifyResult(result: GatewayLike): NuloState {
  if (result.ok) {
    if (isEmpty(result.data)) return { state: "vazio_valido", nulo: "vazio_valido" };
    return { state: "dado", stale: result.meta?.stale ?? false, ageMs: result.meta?.ageMs ?? null };
  }
  const reason = NOT_CONSULTED[result.error];
  if (reason !== undefined) return { state: "nao_consultado", nulo: `nao_consultado:${reason}` };
  // the code is copied only when it is one of the closed set: no provider or caller text reaches the Brief
  return { state: "erro", nulo: ERRORS.has(result.error) ? `erro:${result.error}` : "erro:desconhecido" };
}
