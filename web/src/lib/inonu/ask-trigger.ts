/**
 * The way an alert asks (ASK-13): the button on an alert leaves a request for a subject, and the Inonu panel of that subject, which owns
 * the guards and the call, asks once when it sees it. Nothing here calls the model or the network; it holds only subject keys.
 *
 * A request left before the panel exists is kept for a few seconds so the panel that is about to open can take it, and then it is
 * forgotten: an old click must never turn into a paid call minutes later, when some other panel with that key happens to mount.
 * Pure, with a shared instance for the page.
 */

/** How long a request waits for its panel. */
export const ASK_REQUEST_TTL_MS = 15_000;

export function createAskTrigger(options: { readonly now?: () => number; readonly ttlMs?: number } = {}) {
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? ASK_REQUEST_TTL_MS;
  const waiting = new Map<string, number>();
  const listeners = new Set<() => void>();
  const forget = (): void => {
    const t = now();
    for (const [key, at] of waiting) if (t - at > ttl) waiting.delete(key);
  };
  return {
    /** Leave a request for the subject; two before it is taken are one (the latest moment counts). */
    request(key: string): void {
      forget();
      waiting.set(key, now());
      for (const listener of [...listeners]) listener();
    },
    /** True once per request, for the subject it was left for, while it is still inside its window. */
    take(key: string): boolean {
      forget();
      return waiting.delete(key);
    },
    pending(): ReadonlySet<string> {
      forget();
      return new Set(waiting.keys());
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type AskTrigger = ReturnType<typeof createAskTrigger>;

/** What the Inonu panel does when it sees the trigger: if a request is waiting for ITS subject, ask once. */
export function takeAndAsk(trigger: AskTrigger, key: string, ask: () => void): boolean {
  if (!trigger.take(key)) return false;
  ask();
  return true;
}

let shared: AskTrigger | null = null;

/** The one trigger of the page: the alerts leave requests here, the Inonu panel takes them. */
export function sharedAskTrigger(): AskTrigger {
  shared ??= createAskTrigger();
  return shared;
}
