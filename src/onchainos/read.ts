/**
 * Shared plumbing of the family clients: a read is `{ value, meta }`, where `meta` is the provenance of the call
 * (docs/OKX-ONCHAINOS-DADOS-SPEC.md section 6) and `value` is what the strict parser extracted.
 *
 * Parsers are pure and do not know which endpoint they are reading. When one throws, the error is re-created with the
 * endpoint path (never the query) so the message names where the bad row came from.
 */

import { OnchainosError } from "./errors.ts";
import { endpoint as endpointSpec, type EndpointId } from "./endpoints.ts";
import type { GetPort, HttpResult, PostPort, QueryInput, ReadMeta } from "./http.ts";

export interface Read<T> {
  readonly value: T;
  readonly meta: ReadMeta;
}

function parseLocated<T>(path: string, result: HttpResult, parse: (data: unknown) => T): Read<T> {
  try {
    return { value: parse(result.data), meta: result.meta };
  } catch (error) {
    if (error instanceof OnchainosError) throw error.withEndpoint(path);
    throw error;
  }
}

export async function readGet<T>(port: GetPort, id: EndpointId, query: QueryInput | undefined, parse: (data: unknown) => T): Promise<Read<T>> {
  const spec = endpointSpec(id);
  if (spec.method !== "GET") throw new OnchainosError("invalid_request", "o método registrado para este endpoint não é GET", { endpoint: spec.path });
  return parseLocated(spec.path, await port.get(spec, query), parse);
}

export async function readPost<T>(port: PostPort, id: EndpointId, body: unknown, parse: (data: unknown) => T): Promise<Read<T>> {
  const spec = endpointSpec(id);
  if (spec.method !== "POST") throw new OnchainosError("invalid_request", "o método registrado para este endpoint não é POST", { endpoint: spec.path });
  return parseLocated(spec.path, await port.post(spec, body), parse);
}

/** Merges the provenance of several reads of the same logical read (pages of one walk). */
export function mergeMeta(metas: readonly ReadMeta[]): ReadMeta {
  const first = metas[0];
  const last = metas[metas.length - 1];
  if (first === undefined || last === undefined) throw new OnchainosError("invalid_request", "nenhuma leitura para combinar");
  return { ...last, attempts: metas.reduce((sum, meta) => sum + meta.attempts, 0), requestedAtMs: first.requestedAtMs };
}
