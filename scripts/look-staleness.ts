/**
 * How much of what the Jev sees actually changes from one look to the next, and how often its answer changes (the evidence that decides whether a faster CLOCK, or fresher INPUTS and event triggers, is the lever).
 * READ ONLY: it reads `briefs.jsonl` (the last 120 consultations) from a folder, writes nothing, calls no model and no network, and prints one JSON object. It describes the version in force; it proves no gain.
 * Usage: bun --no-env-file run scripts/look-staleness.ts [dataDir]
 */
export interface Look {
  readonly atMs: number;
  readonly briefHash: string | null;
  /** Offered buy candidates: id -> the compact facts the Jev saw. */
  readonly buys: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** What the Jev asked per candidate id. */
  readonly requested: Readonly<Record<string, string>>;
  /** What stood after the gates of the code (the final stance), per candidate id; absent when the journal has none. */
  readonly final?: Readonly<Record<string, string>>;
  /** Which limit bound the size of each offered buy (`caixa`, `minimo`, ...), per candidate id. */
  readonly binding?: Readonly<Record<string, string>>;
}

export const medianOf = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

export const jaccard = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : inter / union;
};

/** Per field of the candidate facts: the share of (look, next look, candidate) triples in which the field changed. Fields that never change between looks are stale inputs. */
export const fieldChangeShare = (looks: readonly Look[]): Record<string, number> => {
  const changed = new Map<string, number>();
  let pairs = 0;
  for (let i = 1; i < looks.length; i++) {
    const [prev, cur] = [looks[i - 1]!, looks[i]!];
    for (const [id, facts] of Object.entries(cur.buys)) {
      const before = prev.buys[id];
      if (before === undefined) continue;
      pairs++;
      for (const key of new Set([...Object.keys(facts), ...Object.keys(before)])) {
        if (JSON.stringify(facts[key]) !== JSON.stringify(before[key])) changed.set(key, (changed.get(key) ?? 0) + 1);
      }
    }
  }
  return Object.fromEntries([...changed.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, pairs === 0 ? 0 : Math.round((n / pairs) * 1000) / 1000]));
};

/** Of the candidates present in two consecutive looks, the share for which the Jev asked a different stance. */
export const stanceChangeShare = (looks: readonly Look[]): { readonly pairs: number; readonly changed: number; readonly share: number | null } => {
  let pairs = 0;
  let changed = 0;
  for (let i = 1; i < looks.length; i++) {
    const [prev, cur] = [looks[i - 1]!, looks[i]!];
    for (const id of Object.keys(cur.buys)) {
      const a = prev.requested[id];
      const b = cur.requested[id];
      if (a === undefined || b === undefined) continue;
      pairs++;
      if (a !== b) changed++;
    }
  }
  return { pairs, changed, share: pairs === 0 ? null : Math.round((changed / pairs) * 1000) / 1000 };
};

/**
 * Who said skip: of the buys offered in all looks, the share where the Jev asked skip itself, the share where it asked to buy and a gate of the code turned that into skip, and the share where a buy stood. Also which limit
 * bound the size of the offered buys (for example the order floor). Descriptive; the attribution is as good as the journal fields `requested` and the final stance.
 */
export const skipAttribution = (looks: readonly Look[]) => {
  let offered = 0;
  let modelSkip = 0;
  let gatedToSkip = 0;
  let buyStood = 0;
  let unknown = 0;
  const binding = new Map<string, number>();
  for (const l of looks) {
    for (const id of Object.keys(l.buys)) {
      offered++;
      const asked = l.requested[id];
      const final = l.final?.[id];
      const bound = l.binding?.[id];
      if (bound !== undefined) binding.set(bound, (binding.get(bound) ?? 0) + 1);
      if (asked === undefined || final === undefined) unknown++;
      else if (asked === "skip") modelSkip++;
      else if (final === "skip") gatedToSkip++;
      else buyStood++;
    }
  }
  const share = (n: number): number | null => (offered === 0 ? null : Math.round((n / offered) * 1000) / 1000);
  return { offered, modelSkip: { n: modelSkip, share: share(modelSkip) }, askedToBuyButGatedToSkip: { n: gatedToSkip, share: share(gatedToSkip) }, buyStood: { n: buyStood, share: share(buyStood) }, unknown: { n: unknown, share: share(unknown) }, sizeBoundBy: Object.fromEntries([...binding.entries()].sort((a, b) => b[1] - a[1])) };
};

export const summarize = (looks: readonly Look[]) => {
  const gaps = looks.slice(1).map((l, i) => (l.atMs - looks[i]!.atMs) / 60000);
  const sets = looks.map((l) => new Set(Object.keys(l.buys)));
  const sim = sets.slice(1).map((s, i) => jaccard(sets[i]!, s));
  const sameHash = looks.slice(1).filter((l, i) => l.briefHash !== null && l.briefHash === looks[i]!.briefHash).length;
  return {
    looks: looks.length,
    medianGapMin: medianOf(gaps) === null ? null : Math.round(medianOf(gaps)! * 100) / 100,
    medianCandidateSetSimilarity: medianOf(sim) === null ? null : Math.round(medianOf(sim)! * 1000) / 1000,
    identicalBriefHashShare: looks.length < 2 ? null : Math.round((sameHash / (looks.length - 1)) * 1000) / 1000,
    stanceChange: stanceChangeShare(looks),
    skipAttribution: skipAttribution(looks),
    fieldChangeShare: fieldChangeShare(looks),
  };
};

if (import.meta.main) {
  const dir = (process.argv[2] ?? `${process.env.LOCALAPPDATA ?? ""}/InonuTrader/data/agent`).replaceAll("\\", "/").replace(/\/?$/, "/");
  const file = Bun.file(`${dir}briefs.jsonl`);
  const rows: any[] = (await file.exists()) ? (await file.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const looks: Look[] = rows
    .filter((b) => typeof b.atMs === "number")
    .sort((a, b) => a.atMs - b.atMs)
    .map((b) => ({
      atMs: b.atMs,
      briefHash: typeof b.briefHash === "string" ? b.briefHash : null,
      buys: Object.fromEntries((b.candidates ?? []).filter((c: any) => c.kind === "buy").map((c: any) => [c.id, (b.brief?.compras?.[c.id] ?? {}) as Record<string, unknown>])),
      requested: (b.requested ?? {}) as Record<string, string>,
      final: Object.fromEntries((b.candidates ?? []).filter((c: any) => c.kind === "buy" && typeof b.stances?.[c.id] === "string").map((c: any) => [c.id, b.stances[c.id] as string])),
      binding: Object.fromEntries((b.candidates ?? []).filter((c: any) => c.kind === "buy" && typeof c.cap?.binding === "string").map((c: any) => [c.id, c.cap.binding as string])),
    }));
  console.log(
    JSON.stringify(
      {
        note: "descriptive only; the version in force (release24); consecutive looks are dependent; it proves no gain. Field names are the compact keys of the Brief (see model.ts legend).",
        window: { fromMs: looks[0]?.atMs ?? null, toMs: looks.at(-1)?.atMs ?? null },
        ...summarize(looks),
      },
      null,
      2,
    ),
  );
}
