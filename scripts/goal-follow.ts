/**
 * Follows the agent between two looks of whoever runs it, READ ONLY (companion of goal-watch.ts): it polls the agent's own journals and returns at the first thing worth reporting, or after the time limit. It writes
 * nothing, calls no model and no network, places no order and changes no setting. What it reports: an order that left the `preparada` stage, a look in which the Jev asked for a purchase, a move of the managed
 * value of at least `movePct` percent since the last report, and the agent going silent (no look for `silentMin` minutes).
 * Usage: bun scripts/goal-follow.ts [maxMinutes=9] [movePct=1] [silentMin=6] [dataDir]
 */
const maxMinutes = Number(process.argv[2] ?? 9);
const movePct = Number(process.argv[3] ?? 1);
const silentMin = Number(process.argv[4] ?? 6);
const dir = (process.argv[5] ?? `${process.env.LOCALAPPDATA ?? ""}/InonuTrader/data/agent`).replaceAll("\\", "/").replace(/\/?$/, "/");
const read = async (file: string): Promise<any[]> => {
  const f = Bun.file(dir + file);
  if (!(await f.exists())) return [];
  return (await f.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
};
const at = (ms: number): string => new Date(ms).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(11, 19);

const snapshot = async () => {
  const [ledger, equity] = await Promise.all([read("ledger.jsonl"), read("equity.jsonl")]);
  const orders = new Map<string, any>();
  for (const o of ledger.filter((r) => r.kind === "order")) orders.set(`${o.orderKey}|${o.stage}`, o);
  const cycles = ledger.filter((r) => r.kind === "cycle");
  const eq = equity.filter((r) => r.usd != null).at(-1);
  return { orders, cycles, eq };
};

const base = await snapshot();
const seenOrders = new Set(base.orders.keys());
let seenCycleAt = base.cycles.at(-1)?.atMs ?? 0;
let reported = base.eq?.usd ?? 0;
const started = Date.now();
console.log(`seguindo desde ${at(started)}: patrimonio ${reported.toFixed(2)}, ultimo olhar ${seenCycleAt ? at(seenCycleAt) : "nenhum"}, limite ${maxMinutes} min`);

while (Date.now() - started < maxMinutes * 60_000) {
  await Bun.sleep(15_000);
  const s = await snapshot();
  const events: string[] = [];
  for (const [k, o] of s.orders) {
    if (seenOrders.has(k)) continue;
    seenOrders.add(k);
    if (o.stage === "preparada") continue;
    events.push(`ordem ${at(o.atMs)} ${o.side} ${o.symbol} US$ ${o.usd} ${o.stage}${o.reason ? ` (${o.reason})` : ""}`);
  }
  for (const c of s.cycles.filter((x) => x.atMs > seenCycleAt)) {
    const asked = Object.entries(c.stances as Record<string, string>).filter(([id, v]) => id.startsWith("buy:") && v !== "skip");
    if (asked.length > 0) events.push(`olhar ${at(c.atMs)}: o Jev pediu compra (${asked.map(([id, v]) => `${id.slice(-6)}:${v}`).join(", ")})`);
  }
  seenCycleAt = Math.max(seenCycleAt, s.cycles.at(-1)?.atMs ?? 0);
  if (s.eq && reported > 0 && Math.abs(s.eq.usd / reported - 1) * 100 >= movePct) {
    events.push(`patrimonio ${reported.toFixed(2)} -> ${s.eq.usd.toFixed(2)} (${(((s.eq.usd / reported) - 1) * 100).toFixed(1)}%)`);
    reported = s.eq.usd;
  }
  if (Date.now() - seenCycleAt > silentMin * 60_000) events.push(`sem olhar do agente ha mais de ${silentMin} min (ultimo ${at(seenCycleAt)})`);
  if (events.length > 0) {
    for (const e of events) console.log(e);
    console.log(`estado: patrimonio ${(s.eq?.usd ?? reported).toFixed(2)} em ${at(Date.now())}`);
    process.exit(0);
  }
}
console.log(`nada a reportar em ${maxMinutes} min (${at(Date.now())}): sem ordem nova, sem compra pedida, patrimonio dentro de ${movePct}%`);
