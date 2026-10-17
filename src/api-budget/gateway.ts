import { createOnchainCache } from "../onchain-read/cache.ts";
import { backoffMs } from "../onchainos/http.ts";
import { DEFAULT_RESERVE, createPacer, markBlocked, markCooldown, takeSlot, type DenyReason } from "./limiter.ts";
import { updateLedger } from "./ledger.ts";
import { poolId, type BudgetEntry, type BudgetRegistry, type Priority } from "./registry.ts";

export interface BudgetRequest {
  readonly module: string;
  readonly endpoint: string;
  readonly key: string;
  readonly chain?: string;
  readonly priority?: Priority;
  /** Chave de cache. Chamadas com a mesma chave em voo são unificadas (coalescing). */
  readonly cacheKey?: string;
  /** Validade do cache em ms. Sem ela, só há coalescing. */
  readonly ttlMs?: number;
}

export type BudgetDecision = { ok: true } | { ok: false; reason: DenyReason };

export class BudgetDenied extends Error {
  readonly reason: DenyReason;

  constructor(reason: DenyReason) {
    super(`chamada negada pelo orçamento de API: ${reason}`);
    this.name = "BudgetDenied";
    this.reason = reason;
  }
}

export interface ApiBudgetOptions {
  readonly registry: BudgetRegistry;
  readonly ledgerPath: string;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  /** Gerador do jitter do backoff de 429. Padrão Math.random. */
  readonly random?: () => number;
  readonly reservePct?: number;
}

export interface ApiBudget {
  acquire(request: BudgetRequest, now?: number): Promise<BudgetDecision>;
  /** Executa `fn` se o orçamento liberar; lança BudgetDenied caso contrário. Usa cache e coalescing quando há cacheKey. */
  run<T>(request: BudgetRequest, fn: () => Promise<T>, ok?: (result: T) => boolean): Promise<T>;
  /** Registra 402 (bloqueio até o reset mensal) ou 429 (cooldown com backoff com jitter e Retry-After). Devolve o instante (epoch ms) até o qual a entrada fica negada. */
  reject(request: BudgetRequest, status: 402 | 429, attempt?: number, retryAfterMs?: number): Promise<number>;
  /** Escala atual do ritmo da entrada, em [0.25, 1]: cai no 429 e recupera com sucessos. 1 é o ritmo declarado. */
  scale(request: BudgetRequest): number;
  /** Invalida o cache de uma chave. O cache do onchain-read não tem remoção, então usa-se uma geração por chave. */
  invalidate(cacheKey: string): void;
}

export function createApiBudget(options: ApiBudgetOptions): ApiBudget {
  const cache = createOnchainCache(options.now);
  const generation = new Map<string, number>();
  const pacer = createPacer(options.now, options.sleep);
  const random = options.random ?? Math.random;
  const reservePct = options.reservePct ?? DEFAULT_RESERVE;

  const resolve = (request: BudgetRequest): BudgetEntry => {
    const entry = options.registry.find(request);
    if (entry === undefined) throw new Error(`api-budget: entrada não cadastrada para ${request.module} ${request.endpoint}`);
    return entry;
  };

  const acquire = (request: BudgetRequest, now: number): Promise<BudgetDecision> => {
    const entry = resolve(request);
    const priority = request.priority ?? entry.prioridade ?? "normal";
    return updateLedger(options.ledgerPath, (state): BudgetDecision => {
      const reason = takeSlot(state, entry, priority, now, reservePct);
      return reason === null ? { ok: true } : { ok: false, reason };
    });
  };

  const execute = async <T>(request: BudgetRequest, fn: () => Promise<T>, ok?: (result: T) => boolean): Promise<T> => {
    const decision = await acquire(request, options.now());
    if (!decision.ok) throw new BudgetDenied(decision.reason);
    const entry = resolve(request);
    await pacer.wait(entry);
    const result = await fn();
    // Só sucesso de verdade recupera o ritmo; um cliente que devolve a falha como valor (429, 5xx) informa isso em `ok`.
    if (ok === undefined || ok(result)) pacer.reward(entry);
    else pacer.reset(entry);
    return result;
  };

  return {
    acquire: (request, now = options.now()) => acquire(request, now),

    run<T>(request: BudgetRequest, fn: () => Promise<T>, ok?: (result: T) => boolean): Promise<T> {
      if (request.cacheKey === undefined) return execute(request, fn, ok);
      const key = `${generation.get(request.cacheKey) ?? 0}|${request.cacheKey}`;
      const hit = cache.get(key, request.ttlMs ?? 0);
      if (hit?.fresh) return Promise.resolve(hit.entry.data as T);
      return cache.coalesce(key, async () => {
        const data = await execute(request, fn, ok);
        // Falha devolvida como valor não entra no cache: a próxima chamada tenta de novo.
        if (ok === undefined || ok(data)) cache.set(key, data);
        return data;
      }) as Promise<T>;
    },

    async reject(request, status, attempt = 0, retryAfterMs) {
      const entry = resolve(request);
      const now = options.now();
      const id = poolId(entry);
      return updateLedger(options.ledgerPath, (state) => {
        if (status === 402) {
          markBlocked(state, entry, now);
          return state.blocked[id] ?? now;
        }
        markCooldown(state, entry, now + backoffMs(attempt, retryAfterMs, random));
        pacer.penalize(entry);
        return state.cooldown[id] ?? now;
      });
    },

    scale: (request) => pacer.scale(resolve(request)),

    invalidate(cacheKey) {
      generation.set(cacheKey, (generation.get(cacheKey) ?? 0) + 1);
    },
  };
}
