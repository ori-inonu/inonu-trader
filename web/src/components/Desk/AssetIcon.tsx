"use client";

/**
 * The icon of an asset or a network (ICO-1 to ICO-3): an <img> from the desk's own origin (the local core fetches and caches
 * it, see src/inonu/icons.ts) laid over the letters that were there before. While it loads, or when OKX's host does not have
 * the symbol, the letters stay; when it loads the letters are hidden. A failure is final for the mount, so a missing icon
 * costs one request and no flicker. No animation, and the picture is decoration: the name is always written next to it.
 */
import { useEffect, useRef, useState } from "react";
import { chainIconUrl, iconUrl } from "@/lib/onchain/icons";
import styles from "./AssetIcon.module.css";

export type IconState = "pending" | "ok" | "failed";

export function iconState(current: IconState, event: "load" | "error"): IconState {
  if (current === "failed") return "failed";
  return event === "load" ? "ok" : "failed";
}

/**
 * `chain`: the network's own logo comes first, and the icon of its native currency (`ccy`) is the second try; then the letters. A picture that fails
 * is final for its try, so a missing one costs one request and no flicker.
 */
export function AssetIcon({ ccy, chain = null, fallback, size = 16, lettersClassName }: { readonly ccy: string | null; readonly chain?: string | null; readonly fallback?: string; readonly size?: number; readonly lettersClassName?: string }) {
  const tries = [chain === null ? null : chainIconUrl(chain), ccy === null ? null : iconUrl(ccy)].filter((u): u is string => u !== null);
  const [attempt, setAttempt] = useState(0);
  const src = tries[attempt] ?? null;
  const [state, setState] = useState<IconState>("pending");
  const image = useRef<HTMLImageElement | null>(null);
  const onLoad = () => setState((s) => iconState(s, "load"));
  // the next try, if there is one, starts pending; the last one to fail leaves the letters
  const onFail = () => {
    if (attempt + 1 < tries.length) {
      setAttempt(attempt + 1);
      setState("pending");
    } else setState((s) => iconState(s, "error"));
  };

  // an image that finished loading before React attached its handlers (cached, or hydrated late) would never report it
  useEffect(() => {
    const el = image.current;
    if (el !== null && el.complete) {
      if (el.naturalWidth > 0) onLoad();
      else onFail();
    }
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span className={styles.box} style={{ minWidth: size, height: size }} data-state={src === null ? "failed" : state} aria-hidden="true">
      {fallback !== undefined ? <span className={lettersClassName ? `${styles.letters} ${lettersClassName}` : styles.letters} aria-hidden="true">{fallback}</span> : null}
      {src !== null && state !== "failed" ? (
        <img
          ref={image}
          className={styles.image}
          src={src}
          alt=""
          width={size}
          height={size}
          loading="eager"
          decoding="async"
          onLoad={onLoad}
          onError={onFail}
        />
      ) : null}
    </span>
  );
}
