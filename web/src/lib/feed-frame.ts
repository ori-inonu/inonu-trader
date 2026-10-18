import type { ConnectionState } from "./types";

export interface FeedFrameState {
  /** True only while the feed is reconnecting, so the surface dims and freezes its motion. */
  held: boolean;
  /** True on the very first connection, when there is genuinely no prior state to show. */
  empty: boolean;
  /** A static label, or null when there is nothing to say. No dot, no pulse. */
  notice: string | null;
}

/**
 * The reconnecting policy for every feed-bound surface, in one place.
 *
 * While reconnecting the surface keeps its last values and its frame dims: motion would imply new
 * data is arriving, and none is. On the first connection there is no prior state, so the surface
 * reads unavailable rather than showing a stale zero.
 */
export function feedFrameState(connection: ConnectionState): FeedFrameState {
  if (connection === "reconnecting") {
    return { held: true, empty: false, notice: "Reconectando ao feed" };
  }
  if (connection === "connecting") {
    return { held: false, empty: true, notice: null };
  }
  return { held: false, empty: false, notice: null };
}