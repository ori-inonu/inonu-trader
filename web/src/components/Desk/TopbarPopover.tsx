"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./TopbarPopover.module.css";

export interface TopbarPopoverProps {
  /** Spoken name of the panel. */
  label: string;
  /** The visible face of the trigger button; its text is the button's accessible name. */
  face: ReactNode;
  children: ReactNode;
  /** Which edge of the trigger the panel lines up with. */
  align?: "start" | "end";
  /** A tone for the trigger border, same vocabulary as the feed chips. */
  tone?: "live" | "late" | "down" | "off";
  /** pill: dot and words (sources, wallet). icon: a square icon button (preferences), whose face carries a hidden name. */
  variant?: "pill" | "icon";
}

/**
 * A disclosure that opens a panel under a topbar button. The panel stays in the document while closed (hidden), so
 * the content is always there for assistive technology and for the static render. Escape and a click outside close
 * it, and Escape gives the focus back to the button. No animation: nothing moves, nothing pulses.
 */
export default function TopbarPopover({ label, face, children, align = "end", tone = "off", variant = "pill" }: TopbarPopoverProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={styles.root}>
      <button ref={buttonRef} type="button" className={styles.trigger} data-tone={tone} data-variant={variant} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        {face}
        {variant === "pill" ? (
        <svg className={styles.chevron} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        ) : null}
      </button>
      <div id={panelId} className={styles.panel} data-align={align} role="group" aria-label={label} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
