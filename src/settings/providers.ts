/**
 * The non secret defaults of the app (CFG-5): the addresses it talks to, what for, at what cost and who speaks to them, in one
 * versioned manifest (`providers.json`) that the person only reviews. The manifest holds no secret, is validated strictly when
 * it loads (a manifest that is not exactly the documented shape stops the app at the first read instead of quietly using
 * something else), and tests tie every address in it to the code that uses it, so it cannot drift.
 */
import manifest from "./providers.json";

export interface Provider {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  /** What the app uses it for. */
  readonly uso: string;
  readonly custo: string;
  readonly quemFala: string;
}

export interface Manifest {
  readonly providers: readonly Provider[];
  /** Public RPC addresses by chain index, for adding a network to the person's own wallet (WAL-2). */
  readonly rpcs: Readonly<Record<string, readonly string[]>>;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200;

function safeAddress(value: unknown, protocols: readonly string[]): string {
  if (typeof value !== "string") throw new Error("providers: an address is not a text");
  const url = new URL(value);
  if (!protocols.includes(url.protocol)) throw new Error("providers: an address is not https or wss");
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") throw new Error("providers: an address carries a credential, a query or a fragment");
  return value;
}

const FIELDS = ["id", "label", "url", "uso", "custo", "quemFala"];

export function parseProviders(raw: unknown): Manifest {
  if (!isRec(raw) || raw.version !== 1 || Object.keys(raw).some((k) => !["version", "providers", "rpcs"].includes(k))) throw new Error("providers: not the documented manifest");
  if (!Array.isArray(raw.providers) || raw.providers.length === 0) throw new Error("providers: no providers");
  const seen = new Set<string>();
  const providers = raw.providers.map((item): Provider => {
    if (!isRec(item) || Object.keys(item).length !== FIELDS.length || !FIELDS.every((k) => k in item)) throw new Error("providers: a provider is not the documented shape");
    if (typeof item.id !== "string" || !/^[a-z0-9-]{2,30}$/.test(item.id) || seen.has(item.id)) throw new Error("providers: bad or repeated id");
    seen.add(item.id);
    if (!text(item.label) || !text(item.uso) || !text(item.custo) || !text(item.quemFala)) throw new Error("providers: a text is missing");
    return { id: item.id, label: item.label, url: safeAddress(item.url, ["https:", "wss:"]), uso: item.uso, custo: item.custo, quemFala: item.quemFala };
  });
  const rpcs: Record<string, string[]> = {};
  if (raw.rpcs !== undefined) {
    if (!isRec(raw.rpcs)) throw new Error("providers: rpcs is not an object");
    for (const [chain, list] of Object.entries(raw.rpcs)) {
      if (!/^\d{1,10}$/.test(chain) || !Array.isArray(list) || list.length === 0) throw new Error("providers: a chain index or its list is bad");
      rpcs[chain] = list.map((rpc) => safeAddress(rpc, ["https:"]));
    }
  }
  return { providers, rpcs };
}

const loaded = parseProviders(manifest);
export const PROVIDERS: readonly Provider[] = loaded.providers;
export const RPCS: Readonly<Record<string, readonly string[]>> = loaded.rpcs;

/** The address of a provider of the manifest. */
export function providerUrl(id: string): string {
  const found = PROVIDERS.find((p) => p.id === id);
  if (found === undefined) throw new Error(`providers: unknown provider ${id}`);
  return found.url;
}
