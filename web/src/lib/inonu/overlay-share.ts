/**
 * One poll of the flow engine per instrument, shared by everything that reads it (T5.7, T6.4, DOC-4): the chart layer, the Zonas view
 * of the Radar tab and the Fluxo tab. The first reader starts the poll, the last one stops it, a late reader gets the reading in
 * force at once, and a reading never reaches the readers of another instrument. The feed itself is injected, so the sharing rules are
 * tested without timers or a network. Reading the engine is free (it never touches the model).
 */
import type { OverlayFeedState } from "./overlay-feed";

export interface SharedFeed {
  start(): void;
  stop(): void;
  poke(): void;
}

export interface OverlayShareDeps {
  readonly make: (args: { readonly instId: string; readonly onChange: (state: OverlayFeedState) => void }) => SharedFeed;
}

interface Entry {
  feed: SharedFeed;
  state: OverlayFeedState | null;
  readonly listeners: Set<() => void>;
}

export function createOverlayShare(deps: OverlayShareDeps) {
  const entries = new Map<string, Entry>();

  return {
    /** The reading in force for the instrument; null when nobody is reading it. The same object until it changes. */
    get(instId: string): OverlayFeedState | null {
      return entries.get(instId)?.state ?? null;
    },

    /** Starts reading when the first reader arrives; the returned function leaves, and the last one out stops the poll. */
    subscribe(instId: string, listener: () => void): () => void {
      let entry = entries.get(instId);
      if (entry === undefined) {
        const created: Entry = { feed: undefined as unknown as SharedFeed, state: null, listeners: new Set([listener]) };
        created.feed = deps.make({
          instId,
          onChange: (state) => {
            if (entries.get(instId) !== created) return; // the last reader left: a late reading is dropped
            created.state = state;
            for (const each of [...created.listeners]) each();
          },
        });
        entries.set(instId, created);
        entry = created;
        created.feed.start();
      } else {
        entry.listeners.add(listener);
      }

      const mine = entry;
      let left = false;
      return () => {
        if (left) return;
        left = true;
        mine.listeners.delete(listener);
        if (mine.listeners.size === 0 && entries.get(instId) === mine) {
          entries.delete(instId);
          mine.feed.stop();
        }
      };
    },

    /** Reads now instead of waiting for the timer; nothing happens for an instrument nobody reads. */
    poke(instId: string): void {
      entries.get(instId)?.feed.poke();
    },

    /** The page became visible again: every polled instrument reads once now, however many readers it has. */
    pokeAll(): void {
      for (const entry of entries.values()) entry.feed.poke();
    },
  };
}

export type OverlayShare = ReturnType<typeof createOverlayShare>;
