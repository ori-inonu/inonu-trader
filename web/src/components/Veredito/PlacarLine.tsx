"use client";

import { useEffect, useMemo, useState } from "react";
import { createVereditoClient } from "@/lib/veredito/client";
import type { Placar } from "@/lib/veredito/parse";
import styles from "./Veredito.module.css";

const REFRESH_MS = 60_000;

/** The sentence of the Placar, as the core composed it. Nothing when the core has none (an older core has no such route). */
export function PlacarText({ placar }: { readonly placar: Placar | null }) {
  return placar === null ? null : (
    <p className={styles.placar} data-estado={placar.estado}>
      {placar.texto}
    </p>
  );
}

/** The honest scoreboard of the answers, read from the core once a minute. It never calls the model. */
export default function PlacarLine() {
  const client = useMemo(() => createVereditoClient(), []);
  const [placar, setPlacar] = useState<Placar | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () => void client.placar().then((p) => alive && setPlacar(p));
    read();
    const timer = setInterval(read, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [client]);
  return <PlacarText placar={placar} />;
}
