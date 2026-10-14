/**
 * The launches of a chain (RAS-2, the Memepump family of the gateway): `GET /onchain/memepump-list`. Tokens at one stage of their life (new on the launch curve, about to migrate, already
 * migrated), each with its market of the last hour, how far along the curve it is and who holds it. The model of the table is PURE: it turns the rows the gateway gave into the cells a person
 * reads and into the facts worth a second look, and it says nothing about what to do. Whether a launch is worth anything is the Inonu's call, asked by a click; a "mark of care" here is a
 * measurement written in words ("o dev tem 12% da oferta"), with the limit that makes it a mark named in this file, not a verdict.
 */
import { ageText } from "../desk/chart/inonu-layer";

export type MemeStage = "NEW" | "MIGRATING" | "MIGRATED";

export const MEME_STAGES: readonly { readonly id: MemeStage; readonly label: string }[] = [
  { id: "NEW", label: "Novos" },
  { id: "MIGRATING", label: "Quase migrando" },
  { id: "MIGRATED", label: "Ja migrados" },
];

/** A launch as the gateway gives it: every field the provider may leave out is null. */
export interface Launch {
  readonly chainIndex: string;
  readonly protocolId: string | null;
  readonly address: string;
  readonly symbol: string;
  readonly name: string | null;
  readonly createdMs: number | null;
  readonly marketCapUsd: number | null;
  readonly volume1hUsd: number | null;
  readonly txCount1h: number | null;
  readonly buyTx1h: number | null;
  readonly sellTx1h: number | null;
  readonly bondingPct: number | null;
  readonly top10: number | null;
  readonly dev: number | null;
  readonly insiders: number | null;
  readonly bundlers: number | null;
  readonly snipers: number | null;
  readonly freshWallets: number | null;
  readonly phishing: number | null;
  readonly holders: number | null;
  readonly hasX: boolean | null;
  readonly hasTelegram: boolean | null;
  readonly hasWebsite: boolean | null;
  readonly dexScreenerPaid: boolean | null;
  readonly communityTakeover: boolean | null;
  readonly liveOnPumpFun: boolean | null;
  readonly aped: number | null;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numOrNull = (v: unknown): boolean => v === null || (typeof v === "number" && Number.isFinite(v));
const boolOrNull = (v: unknown): boolean => v === null || typeof v === "boolean";
const strOrNull = (v: unknown): boolean => v === null || typeof v === "string";

const NUMBERS = ["createdMs", "marketCapUsd", "volume1hUsd", "txCount1h", "buyTx1h", "sellTx1h", "bondingPct", "top10", "dev", "insiders", "bundlers", "snipers", "freshWallets", "phishing", "holders", "aped"] as const;
const FLAGS = ["hasX", "hasTelegram", "hasWebsite", "dexScreenerPaid", "communityTakeover", "liveOnPumpFun"] as const;

/** The check of one row of the gateway answer: whatever is not exactly the shape of the route is nothing, never a number on the screen. */
export function launchGuard(r: Record<string, unknown>): Launch | null {
  if (typeof r.chainIndex !== "string" || !/^\d{1,12}$/.test(r.chainIndex) || typeof r.address !== "string" || r.address === "" || typeof r.symbol !== "string" || r.symbol === "") return null;
  if (!strOrNull(r.protocolId) || !strOrNull(r.name)) return null;
  for (const key of NUMBERS) if (!numOrNull(r[key])) return null;
  for (const key of FLAGS) if (!boolOrNull(r[key])) return null;
  return r as unknown as Launch;
}

/** What is worth a second look, with the limit that makes it a mark: a measurement and a number, not a verdict. */
export const CARE_LIMITS = { dev: 10, top10: 50, insiders: 20, bundlers: 20, snipers: 30, freshWallets: 30, phishing: 0, holders: 30 } as const;

const PCT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const pct = (n: number): string => `${PCT.format(n)}%`;
const MONEY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const SMALL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** An amount of dollars: whole above a thousand, two decimals below; `-` when unknown. */
export function launchUsd(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "-";
  if (v >= 1_000_000) return `US$ ${SMALL.format(v / 1_000_000)} mi`;
  if (v >= 1000) return `US$ ${MONEY.format(v)}`;
  return `US$ ${SMALL.format(v)}`;
}

/** The marks of care of one launch, in words, in the order a person weighs them: who holds it, then how it was bought, then whether anything stands behind it. */
export function careMarks(l: Launch): string[] {
  const marks: string[] = [];
  if (l.phishing !== null && l.phishing > CARE_LIMITS.phishing) marks.push(`${pct(l.phishing)} das carteiras sao suspeitas de phishing`);
  if (l.dev !== null && l.dev >= CARE_LIMITS.dev) marks.push(`o dev tem ${pct(l.dev)} da oferta`);
  if (l.top10 !== null && l.top10 >= CARE_LIMITS.top10) marks.push(`as 10 maiores carteiras tem ${pct(l.top10)}`);
  if (l.insiders !== null && l.insiders >= CARE_LIMITS.insiders) marks.push(`insiders com ${pct(l.insiders)}`);
  if (l.bundlers !== null && l.bundlers >= CARE_LIMITS.bundlers) marks.push(`bundlers com ${pct(l.bundlers)}`);
  if (l.snipers !== null && l.snipers >= CARE_LIMITS.snipers) marks.push(`snipers com ${pct(l.snipers)}`);
  if (l.freshWallets !== null && l.freshWallets >= CARE_LIMITS.freshWallets) marks.push(`carteiras novas com ${pct(l.freshWallets)}`);
  if (l.holders !== null && l.holders < CARE_LIMITS.holders) marks.push(`so ${l.holders} ${l.holders === 1 ? "detentor" : "detentores"}`);
  if (l.hasX === false && l.hasTelegram === false && l.hasWebsite === false) marks.push("sem rede social nem site");
  return marks;
}

export type LaunchSort = "volume" | "compras" | "novos";

export const LAUNCH_SORTS: readonly { readonly id: LaunchSort; readonly label: string }[] = [
  { id: "volume", label: "Mais volume" },
  { id: "compras", label: "Mais compras" },
  { id: "novos", label: "Mais novos" },
];

export interface LaunchRow {
  readonly key: string;
  readonly address: string;
  readonly chainIndex: string;
  readonly symbol: string;
  readonly name: string | null;
  readonly age: string;
  readonly marketCap: string;
  readonly volume: string;
  /** Buys and sells of the last hour, "97 compras, 70 vendas"; `-` when the provider gave neither. */
  readonly trades: string;
  readonly curve: string;
  readonly holders: string;
  readonly marks: readonly string[];
}

const byDesc = (value: (l: Launch) => number | null) => (a: Launch, b: Launch) => (value(b) ?? -1) - (value(a) ?? -1);
const SORTERS: Readonly<Record<LaunchSort, (a: Launch, b: Launch) => number>> = {
  volume: byDesc((l) => l.volume1hUsd),
  compras: byDesc((l) => l.buyTx1h),
  novos: byDesc((l) => l.createdMs),
};

/** The rows of the table: sorted as the person chose (one that has no value for the order goes last, it is not worth zero), at most `max`, and the count there was. */
export function launchRows(launches: readonly Launch[], nowMs: number, sort: LaunchSort, max = 12): { readonly rows: readonly LaunchRow[]; readonly total: number } {
  const sorted = [...launches].sort(SORTERS[sort]);
  const rows = sorted.slice(0, Math.max(0, max)).map((l): LaunchRow => {
    const buys = l.buyTx1h;
    const sells = l.sellTx1h;
    return {
      key: `${l.chainIndex}:${l.address}`,
      address: l.address,
      chainIndex: l.chainIndex,
      symbol: l.symbol,
      name: l.name,
      age: l.createdMs === null ? "-" : ageText(Math.max(0, nowMs - l.createdMs)),
      marketCap: launchUsd(l.marketCapUsd),
      volume: launchUsd(l.volume1hUsd),
      trades: buys === null && sells === null ? "-" : `${buys ?? "-"} compras, ${sells ?? "-"} vendas`,
      curve: l.bondingPct === null ? "-" : pct(l.bondingPct),
      holders: l.holders === null ? "-" : String(l.holders),
      marks: careMarks(l),
    };
  });
  return { rows, total: launches.length };
}
