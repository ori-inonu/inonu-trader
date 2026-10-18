/**
 * Agrupamento de leituras em uma só chamada. Pedidos da mesma chave na janela dividem a resposta; pedidos de chaves
 * diferentes viram uma única chamada de até `maxSize` chaves. Com `maxSize` 1 (padrão) não há agrupamento: cada pedido
 * sai na hora. O limite de lote do provedor tem de ser conhecido antes de subir `maxSize`: para o endpoint de preço da
 * OKX a documentação mostra o corpo como lista mas não declara vários tokens nem o máximo, então segue desligado.
 */
export interface BatcherOptions<K extends string, V> {
  /** Uma chamada ao provedor para um lote de chaves. Chaves ausentes na resposta viram `undefined`. */
  readonly fetchBatch: (keys: K[]) => Promise<ReadonlyMap<K, V>>;
  /** Teto de chaves por chamada, conforme o provedor documenta. Padrão 1: sem agrupamento. */
  readonly maxSize?: number;
  /** Espera máxima para juntar chaves antes de enviar o lote. Padrão 25 ms. */
  readonly windowMs?: number;
  /** Agenda `fn` em `ms` e devolve o cancelamento. Injetável nos testes. */
  readonly schedule?: (fn: () => void, ms: number) => () => void;
}

export interface Batcher<K extends string, V> {
  get(key: K): Promise<V | undefined>;
  /** Envia já o que está pendente, sem esperar a janela. */
  flush(): Promise<void>;
}

interface Pending<V> {
  readonly resolve: (value: V | undefined) => void;
  readonly reject: (error: unknown) => void;
}

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
};

export function createBatcher<K extends string, V>(options: BatcherOptions<K, V>): Batcher<K, V> {
  const maxSize = Math.max(1, Math.floor(options.maxSize ?? 1));
  const windowMs = options.windowMs ?? 25;
  const schedule = options.schedule ?? defaultSchedule;
  let waiting = new Map<K, Pending<V>[]>();
  let cancel: (() => void) | null = null;

  const send = async (batch: Map<K, Pending<V>[]>): Promise<void> => {
    try {
      const result = await options.fetchBatch([...batch.keys()]);
      for (const [key, pending] of batch) for (const p of pending) p.resolve(result.get(key));
    } catch (error) {
      for (const pending of batch.values()) for (const p of pending) p.reject(error);
    }
  };

  const take = (): Map<K, Pending<V>[]> => {
    cancel?.();
    cancel = null;
    const batch = waiting;
    waiting = new Map();
    return batch;
  };

  return {
    get(key) {
      return new Promise<V | undefined>((resolve, reject) => {
        const pending = waiting.get(key) ?? [];
        pending.push({ resolve, reject });
        waiting.set(key, pending);
        if (waiting.size >= maxSize) {
          void send(take());
        } else if (cancel === null) {
          cancel = schedule(() => {
            cancel = null;
            void send(take());
          }, windowMs);
        }
      });
    },

    flush: () => (waiting.size === 0 ? Promise.resolve() : send(take())),
  };
}
