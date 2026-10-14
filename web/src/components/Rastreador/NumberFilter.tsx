"use client";

/**
 * One numeric filter of the Rastreador (RAS-4). The box keeps the text as the person types it, so a minus sign or a decimal point on its way is not thrown
 * away by a box that shows the number again; the filter changes only when the text really is a number (`parseTyped`), and when the person leaves the box it
 * shows the number the filter holds. Without anybody typing, it simply shows that number.
 */
import { useState } from "react";
import { invalidReason, isInvalidText, numberText, parseTyped } from "@/lib/rastreador/number-field";
import styles from "./RastreadorView.module.css";

export interface NumberFilterProps {
  readonly label: string;
  readonly ariaLabel: string;
  readonly inputMode: "decimal" | "numeric";
  readonly value: number | null;
  readonly onChange: (value: number | null) => void;
  /** What the filter may hold: a number it does not accept is the same as no number (for example a rank that is not a whole number from 1). */
  readonly accept?: (value: number) => boolean;
}

export default function NumberFilter({ label, ariaLabel, inputMode, value, onChange, accept }: NumberFilterProps) {
  const [typed, setTyped] = useState<string | null>(null);
  const reason = typed === null ? null : invalidReason(typed, accept);
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        type="text"
        inputMode={inputMode}
        aria-label={ariaLabel}
        value={typed ?? numberText(value)}
        aria-invalid={typed !== null && isInvalidText(typed, accept) ? true : undefined}
        onChange={(e) => {
          const text = e.target.value;
          setTyped(text);
          const result = parseTyped(text);
          // text on its way to being a number changes nothing; a number the filter does not accept is no number
          if (result.ok) onChange(result.value !== null && accept !== undefined && !accept(result.value) ? null : result.value);
        }}
        onBlur={() => setTyped(null)}
      />
      {reason !== null ? <small className={styles.fieldHint}>{reason}</small> : null}
    </label>
  );
}
