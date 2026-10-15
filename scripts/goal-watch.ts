/**
 * Read-only watch of the owner's goal of the day (2026-10-15): the capital of the agent wallet against a target, the hourly growth the target would need from now to midnight, and what the agent did in the last hour.
 * It reads the agent's own journals from a folder, writes nothing, calls no model and no network, places no order and changes no setting. It says where the goal stands; it does not pursue it.
 * Usage: bun scripts/goal-watch.ts [targetUsd] [dataDir]
 */
const target = Number(process.argv[2] ?? 1180);
const dir = (process.argv[3] ?? `${process.env.LOCALAPPDATA ?? ""}/InonuTrader/data/agent`).replaceAll("\\", "/").replace(/\/?$/, "/");
const read = async (file: string): Promise<any[]> => {
  const f = Bun.file(dir + file);
  if (!(await f.exists())) return [];
  return (await f.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
};
const at = (ms: number): string => new Date(ms).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(5, 19);
const money = (v: number): string => `US$ ${v.toFixed(2)}`;

const [equity, ledger] = await Promise.all([read("equity.jsonl"), read("ledger.jsonl")]);
const rows = equity.filter((r) => r.usd != null);
const now = rows.at(-1);
if (now === undefined) {
  console.log("sem leitura de patrimonio nos journals");
  process.exit(0);
}
const nowMs = Date.now();
const midnight = new Date(nowMs);
midnight.setHours(24, 0, 0, 0);
const hoursLeft = Math.max(0, (midnight.getTime() - nowMs) / 3_600_000);
const todayRows = rows.filter((r) => new Date(r.atMs).toDateString() === new Date(nowMs).toDateString());
const startOfDay: number = todayRows[0]?.usd ?? now.usd;
const multiple = target / now.usd;
const perHour = hoursLeft > 0 ? multiple ** (1 / hoursLeft) - 1 : null;

const cash = (now.holdings as any[]).filter((h) => h.id.endsWith("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).reduce((s, h) => s + h.units * h.priceUsd, 0);
const positions = (now.holdings as any[]).filter((h) => !h.id.endsWith("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") && h.units * h.priceUsd >= 1).map((h) => `${h.id.split(":")[1]!.slice(0, 6)}..: ${money(h.units * h.priceUsd)}`);

const cycles = ledger.filter((r) => r.kind === "cycle");
const lastHour = cycles.filter((c) => c.atMs > nowMs - 3_600_000);
const last = new Map<string, any>();
for (const o of ledger.filter((r) => r.kind === "order")) last.set(o.orderKey, o);
const orders = [...last.values()].filter((o) => o.stage !== "preparada" && o.atMs > nowMs - 3_600_000).sort((a, b) => a.atMs - b.atMs);

console.log(`Meta do dia: ${money(target)}   Patrimonio agora: ${money(now.usd)} (leitura ${at(now.atMs)})   Inicio do dia: ${money(startOfDay)} (${(((now.usd / startOfDay) - 1) * 100).toFixed(2)}% hoje)`);
console.log(`Falta multiplicar por ${multiple.toFixed(2)} em ${hoursLeft.toFixed(1)} h${perHour === null ? "" : `: ${(perHour * 100).toFixed(1)}% por hora, composto, todas as horas`}`);
console.log(`Caixa parado: ${money(cash)} (${((cash / now.usd) * 100).toFixed(0)}%)   Posicoes: ${positions.length === 0 ? "nenhuma acima de US$ 1" : positions.join(", ")}`);
console.log(`Ultima hora: ${lastHour.length} olhares do agente, ${orders.length} ordens com desfecho`);
for (const o of orders.slice(-5)) console.log(`  ${at(o.atMs)} ${o.side} ${o.symbol} US$ ${o.usd} ${o.stage}${o.reason ? ` (${o.reason})` : ""}`);
console.log(`Maior alta de 2 h ja registrada no patrimonio: ${(() => {
  let best = 0;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length && rows[j].atMs - rows[i].atMs <= 7_200_000; j++) best = Math.max(best, rows[j].usd / rows[i].usd - 1);
  return `${(best * 100).toFixed(1)}%`;
})()} (inclui tokens herdados e foi devolvida depois)`);
console.log(`Estado do objetivo: ${now.usd >= target ? "ATINGIDO" : "NAO ATINGIDO"}`);
