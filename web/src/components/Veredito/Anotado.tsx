import { annotate } from "@/lib/glossario/terms";
import styles from "./Veredito.module.css";

/**
 * A sentence of the desk with its technical words explained (UX-2). The words come from the glossary; the explanation is the
 * tooltip of the word, and the sentence itself is unchanged, so a screen reader and a copy of the text get exactly what the core
 * wrote. Nothing is animated.
 */
export function Anotado({ texto }: { readonly texto: string }) {
  return (
    <>
      {annotate(texto).map((s, i) =>
        typeof s === "string" ? (
          s
        ) : (
          <abbr key={i} className={styles.term} title={s.explicacao} data-term={s.id}>
            {s.term}
          </abbr>
        ),
      )}
    </>
  );
}
