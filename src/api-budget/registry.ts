/**
 * Registro de orçamento das APIs externas: um limite por (módulo, endpoint, chave[, cadeia]). `key` é o NOME da
 * variável de ambiente que guarda a credencial, nunca o valor. Tetos por minuto, hora e dia são derivados dos
 * limites declarados; a franquia mensal é separada e não entra nesses tetos.
 */

export type Priority = "execution" | "security" | "normal" | "background";

export interface BudgetEntry {
  readonly module: string;
  readonly endpoint: string;
  /** Nome da variável de ambiente (ex.: OKX_API_KEY). Nunca o valor. */
  readonly key: string;
  readonly chain?: string;
  /**
   * Entradas com o mesmo `pool` (e a mesma chave) dividem contadores, cooldown 429 e bloqueio 402, como o provedor
   * conta: a franquia Basic é de 100 mil chamadas somadas entre todos os endpoints Basic, não de cada um.
   * Sem `pool`, a entrada conta sozinha.
   */
  readonly pool?: string;
  /** Requisições por segundo; controla o ritmo (pacing), não a contagem. Entre 0.1 e 10. */
  readonly rps?: number;
  readonly rpm?: number;
  readonly rph?: number;
  readonly rpd?: number;
  /** Franquia mensal do provedor em unidades de custo (reinicia no dia 1 UTC). */
  readonly franquiaMensal?: number;
  /** Após este instante (epoch ms) a entrada não libera mais chamadas. */
  readonly expiresAt?: number;
  /** Unidades consumidas por chamada. Padrão 1. */
  readonly custo?: number;
  /** Prioridade padrão quando a requisição não informa a sua. Padrão "normal". */
  readonly prioridade?: Priority;
  /** Os limites foram confirmados na documentação do provedor. */
  readonly validated: boolean;
  /** Onde os limites foram lidos (URL ou arquivo). */
  readonly fonte: string;
}

export interface BudgetRegistry {
  readonly entries: readonly BudgetEntry[];
  find(target: Pick<BudgetEntry, "module" | "endpoint" | "key" | "chain">): BudgetEntry | undefined;
}

export interface Ceilings {
  readonly minute: number | null;
  readonly hour: number | null;
  readonly day: number | null;
}

const KEY_NAME = /^[A-Z][A-Z0-9_]*$/;

export function entryId(target: Pick<BudgetEntry, "module" | "endpoint" | "key" | "chain">): string {
  return [target.module, target.endpoint, target.key, target.chain ?? ""].join("|");
}

/** Identidade dos contadores: o pool, quando existe, senão a própria entrada. A chave entra no id: pools de chaves diferentes nunca se misturam. */
export function poolId(entry: Pick<BudgetEntry, "module" | "endpoint" | "key" | "chain" | "pool">): string {
  return entry.pool === undefined ? entryId(entry) : ["pool", entry.module, entry.key, entry.pool].join("|");
}

const minOf = (...values: Array<number | undefined>): number | null => {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length === 0 ? null : Math.floor(Math.min(...present));
};

/** Teto teórico por minuto, hora e dia. Cada janela também é limitada pela anterior (ex.: hora <= 60 x minuto). */
export function ceilings(entry: BudgetEntry): Ceilings {
  const minute = minOf(entry.rpm, entry.rps === undefined ? undefined : entry.rps * 60);
  const hour = minOf(entry.rph, minute === null ? undefined : minute * 60);
  const day = minOf(entry.rpd, hour === null ? undefined : hour * 24);
  return { minute, hour, day };
}

/** Quanto da franquia mensal ainda existe, dado o consumo do mês corrente. Null quando não há franquia. */
export function monthlyRemaining(entry: BudgetEntry, usedThisMonth: number): number | null {
  return entry.franquiaMensal === undefined ? null : Math.max(0, entry.franquiaMensal - usedThisMonth);
}

function validate(entry: BudgetEntry): void {
  const id = entryId(entry);
  const fail = (what: string): never => {
    throw new Error(`api-budget: entrada ${id}: ${what}`);
  };
  if (entry.module.length === 0 || entry.endpoint.length === 0) fail("módulo e endpoint são obrigatórios");
  if (!KEY_NAME.test(entry.key)) fail("chave deve ser o nome da variável de ambiente (maiúsculas, dígitos e _)");
  if (entry.rps !== undefined && (!Number.isFinite(entry.rps) || entry.rps < 0.1 || entry.rps > 10)) fail("rps deve estar entre 0.1 e 10");
  for (const [name, value] of [
    ["rpm", entry.rpm],
    ["rph", entry.rph],
    ["rpd", entry.rpd],
    ["franquiaMensal", entry.franquiaMensal],
    ["custo", entry.custo],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) fail(`${name} deve ser inteiro maior que zero`);
  }
  if (entry.expiresAt !== undefined && !Number.isFinite(entry.expiresAt)) fail("expiresAt inválido");
  if (typeof entry.validated !== "boolean") fail("validated deve ser booleano");
  if (entry.fonte.trim().length === 0) fail("fonte é obrigatória");
}

const LIMIT_FIELDS = ["rps", "rpm", "rph", "rpd", "franquiaMensal", "custo", "expiresAt"] as const;

export function createBudgetRegistry(entries: readonly BudgetEntry[]): BudgetRegistry {
  const byId = new Map<string, BudgetEntry>();
  const pools = new Map<string, BudgetEntry>();
  for (const entry of entries) {
    validate(entry);
    const id = entryId(entry);
    if (byId.has(id)) throw new Error(`api-budget: entrada duplicada ${id}`);
    byId.set(id, entry);
    if (entry.pool === undefined) continue;
    // Um pool é um único medidor: limites diferentes contariam o mesmo uso contra tetos diferentes.
    const first = pools.get(poolId(entry));
    if (first === undefined) pools.set(poolId(entry), entry);
    else if (LIMIT_FIELDS.some((field) => first[field] !== entry[field])) throw new Error(`api-budget: entrada ${id}: limites diferentes dos do pool ${entry.pool}`);
  }
  return {
    entries: Object.freeze([...entries]),
    find: (target) => byId.get(entryId(target)),
  };
}
