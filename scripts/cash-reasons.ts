/**
 * Why the cash was not allocated at each look (ADENDO-H, section 3: "the idle cash must be diagnosable": who is responsible, the model, missing data, balance or authority, the quote, the provider or the execution).
 * READ ONLY: it reads the agent's own journals from a folder, writes nothing, calls no model and no network, and prints one JSON object. It classifies each consultation of the window kept in `briefs.jsonl` (the last 120,
 * about four and a half hours) by what the records SAY, and it does not attribute a cause the records do not show: a skip of the Jev is a skip, and why it skipped is not in the journals.
 * Usage: bun scripts/cash-reasons.ts [dataDir]
 */
const dir = (process.argv[2] ?? `${process.env.LOCALAPPDATA ?? ""}/InonuTrader/data/agent`).replaceAll("\\", "/").replace(/\/?$/, "/");
const read = async (file: string): Promise<any[]> => {
  const f = Bun.file(dir + file);
  if (!(await f.exists())) return [];
  return (await f.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
};

const [briefs, ledger] = await Promise.all([read("briefs.jsonl"), read("ledger.jsonl")]);
const ordersByCycle = new Map<string, any[]>();
const lastByKey = new Map<string, any>();
for (const o of ledger.filter((r) => r.kind === "order")) lastByKey.set(o.orderKey, o);
for (const o of lastByKey.values()) ordersByCycle.set(o.cycleId, [...(ordersByCycle.get(o.cycleId) ?? []), o]);

const preferenceOf = (b: any, id: string): number => {
  const probs = b.verdicts?.[id] as Record<string, number> | undefined;
  return probs ? Math.max(0, ...Object.entries(probs).filter(([k]) => k.startsWith("buy")).map(([, v]) => v)) : 0;
};

const counts = new Map<string, number>();
const add = (k: string): void => void counts.set(k, (counts.get(k) ?? 0) + 1);
for (const b of briefs) {
  const buys = (b.candidates ?? []).filter((c: any) => c.kind === "buy");
  const open = buys.filter((c: any) => c.stances.length > 1);
  const asked = open.filter((c: any) => b.requested?.[c.id] !== undefined && b.requested[c.id] !== "skip");
  const notes: string[] = b.notes ?? [];
  if (b.valid === false) add(`resposta invalida do modelo (${b.invalidReason ?? "sem motivo"})`);
  else if (notes.includes("compras_pausadas")) add("compras pausadas pelo disjuntor do agente");
  else if (buys.length === 0) add("nenhuma compra oferecida (sem candidatos)");
  else if (open.length === 0) add("todas as compras fechadas pelo codigo (so skip na lista)");
  else if (asked.length === 0) {
    const top = Math.max(...open.map((c: any) => preferenceOf(b, c.id)));
    add(`o Jev pediu skip em todas as ${open.length >= 5 ? "5 ou mais" : open.length} compras abertas (maior preferencia ${top >= 0.2 ? "0,20 ou mais" : top >= 0.1 ? "0,10 a 0,20" : "abaixo de 0,10"})`);
  } else {
    const orders = (ordersByCycle.get(b.cycleId) ?? []).filter((o) => o.side === "buy" && o.stage !== "preparada");
    if (orders.length === 0) add("o Jev pediu compra e nao virou ordem (validacao ou tamanho)");
    else for (const o of orders) add(o.stage === "executada" ? "compra executada" : o.stage === "falhou" ? `o Jev pediu compra e o executor recusou (${o.reason ?? "sem motivo"})` : `o Jev pediu compra, ordem em ${o.stage}`);
  }
}
const total = briefs.length;
const rows = [...counts].sort((a, b) => b[1] - a[1]).map(([reason, n]) => ({ reason, looks: n, sharePct: Math.round((n / total) * 100) }));
console.log(
  JSON.stringify(
    {
      dataDir: dir,
      note: "classification by what the records say; a skip of the Jev is a skip and WHY it skipped is not recorded; the window is the last 120 consultations of briefs.jsonl, not the whole day",
      consultationsRead: total,
      windowFromAtMs: briefs[0]?.atMs ?? null,
      windowToAtMs: briefs.at(-1)?.atMs ?? null,
      reasons: rows,
    },
    null,
    2,
  ),
);
