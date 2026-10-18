/**
 * "The ledger changed" (T4.5): a request ends in the panel that made it, and the list of latest requests in the Inonu tab reads the ledger
 * again at that moment instead of waiting for its next poll. It carries no data, only the fact. Pure, with a shared instance for the page.
 */
export function createLedgerSignal() {
  const listeners = new Set<() => void>();
  return {
    notify(): void {
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch {
          // a listener that fails must not keep the others from hearing
        }
      }
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type LedgerSignal = ReturnType<typeof createLedgerSignal>;

let shared: LedgerSignal | null = null;

/** The one signal of the page: the panels that ask notify it, the tail of the Inonu tab listens. */
export function sharedLedgerSignal(): LedgerSignal {
  shared ??= createLedgerSignal();
  return shared;
}
