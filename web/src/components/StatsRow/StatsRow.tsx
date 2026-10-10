"use client";

import { useEffect, useState } from "react";
import type { BlockEvent, Meta } from "@/lib/types";
import { fmtInt, uptime } from "@/lib/format";
import styles from "./StatsRow.module.css";

const UNAVAILABLE = "Indisponível";

export default function StatsRow({
  latest,
  avgLatencyMs,
  meta,
}: {
  latest: BlockEvent | null;
  avgLatencyMs: number;
  meta: Meta | null;
}) {
  const startedAt = meta?.startedAt ?? null;
  const [up, setUp] = useState<string | null>(null);

  useEffect(() => {
    if (startedAt == null) {
      setUp(null);
      return;
    }
    const tick = () => setUp(uptime(startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const decision = latest?.decision ?? null;
  const last = decision && !decision.late && Number.isFinite(decision.latencyMs)
    ? `${Math.round(decision.latencyMs)} ms`
    : UNAVAILABLE;
  const avg = Number.isFinite(avgLatencyMs) && avgLatencyMs > 0
    ? `${Math.round(avgLatencyMs)} ms`
    : UNAVAILABLE;
  const totals = latest?.totals ?? null;

  const values = [
    { label: "Latência recente", value: last },
    { label: "Latência média", value: avg },
    { label: "Decisões informadas", value: totals ? fmtInt(totals.decisions) : UNAVAILABLE },
    { label: "Execuções informadas", value: totals ? fmtInt(totals.fills) : UNAVAILABLE },
    { label: "Tempo observado", value: up ?? UNAVAILABLE },
  ];

  return (
    <section className={styles.stats} aria-label="Métricas do feed">
      {values.map(({ label, value }) => (
        <div className={styles.metric} key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}
