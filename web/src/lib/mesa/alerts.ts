import { fmtNumber, priceDecimalsForMagnitude } from "@/lib/desk/ui/format";

/**
 * Price alerts of the desk topbar, the bell of a charting platform. They are a notification the user sets for a level
 * and nothing more: they never create, sign or send an order, they run only while the tab is open, and an unknown
 * price is never taken as zero (it evaluates nothing and blocks creation). Pure functions, no clock and no storage of
 * their own, so every rule is a test.
 */

export type AlertDirection = "above" | "below";

export interface PriceAlert {
  readonly id: string;
  readonly instId: string;
  readonly level: number;
  readonly direction: AlertDirection;
  readonly createdAtMs: number;
  /** When it fired, exchange time. null while it waits. */
  readonly firedAtMs: number | null;
  /** The last price that made it fire. null while it waits. */
  readonly firedPrice: number | null;
  /** False from the moment it fires until the user opens the panel. A waiting alert is always seen. */
  readonly seen: boolean;
}

export const ALERTS_KEY = "inonu:alerts";
export const MAX_ALERTS = 20;

/** A level farther than this from the last price (in percent) is flagged in the preview, as a typo guard. */
const FAR_PCT = 50;
const MAX_LEVEL = 1e12;
const MIN_LEVEL = 1e-12;

/**
 * Reads a price typed in pt-BR. The comma is the decimal mark and dots group thousands ("82.600,5"). Without a comma a
 * single dot is a decimal mark ("82600.5", and "82.600" is 82,6, which the preview shows), while two or more dots can
 * only be grouping ("1.234.567"). Anything else, exponents included, is refused.
 */
export function parseLevel(text: string): number | null {
  const raw = text.trim();
  let normalized: string | null = null;
  if (raw.includes(",")) {
    const [left, right, ...rest] = raw.split(",");
    if (rest.length === 0 && right !== undefined && /^\d+$/.test(right) && (/^\d+$/.test(left) || /^\d{1,3}(\.\d{3})+$/.test(left))) normalized = `${left.replace(/\./g, "")}.${right}`;
  } else if (/^\d{1,3}(\.\d{3}){2,}$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  } else if (/^\d+(\.\d+)?$/.test(raw)) {
    normalized = raw;
  }
  if (normalized === null) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= MIN_LEVEL && value < MAX_LEVEL ? value : null;
}

const known = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

export type AlertProblem = "preco-indisponivel" | "nivel-invalido" | "nivel-igual" | "duplicado" | "limite";

const PROBLEMS: Record<AlertProblem, string> = {
  "preco-indisponivel": "O preco deste ativo esta indisponivel agora, entao nao ha como saber se o nivel fica acima ou abaixo.",
  "nivel-invalido": "Digite um preco, por exemplo 82.600,5 (virgula para decimais).",
  "nivel-igual": "O nivel e igual ao preco atual. Digite um valor acima ou abaixo.",
  duplicado: "Ja existe um alerta esperando neste nivel.",
  limite: `O limite e de ${MAX_ALERTS} alertas. Remova algum para criar outro.`,
};

export function alertProblemText(problem: AlertProblem): string {
  return PROBLEMS[problem];
}

export type CreateResult = { readonly ok: true; readonly alert: PriceAlert } | { readonly ok: false; readonly problem: AlertProblem };

export function createAlert(input: { instId: string; text: string; last: number | null | undefined; nowMs: number; existing: readonly PriceAlert[] }): CreateResult {
  const { instId, text, last, nowMs, existing } = input;
  if (!known(last)) return { ok: false, problem: "preco-indisponivel" };
  const level = parseLevel(text);
  if (level === null) return { ok: false, problem: "nivel-invalido" };
  if (level === last) return { ok: false, problem: "nivel-igual" };
  const direction: AlertDirection = level > last ? "above" : "below";
  if (existing.some((a) => a.firedAtMs === null && a.instId === instId && a.level === level && a.direction === direction)) return { ok: false, problem: "duplicado" };
  if (existing.length >= MAX_ALERTS) return { ok: false, problem: "limite" };
  const taken = new Set(existing.map((a) => a.id));
  let n = 0;
  while (taken.has(`${nowMs.toString(36)}${n}`)) n += 1;
  return { ok: true, alert: { id: `${nowMs.toString(36)}${n}`, instId, level, direction, createdAtMs: nowMs, firedAtMs: null, firedPrice: null, seen: true } };
}

export interface LevelPreview {
  readonly kind: "empty" | "invalido" | "sem-preco" | "igual" | "ok";
  readonly level: number | null;
  readonly direction: AlertDirection | null;
  /** The level against the last price, in percent. null unless kind is ok. */
  readonly distancePct: number | null;
  readonly far: boolean;
}

/** What the field will do with the text, before anything is created. */
export function levelPreview(text: string, last: number | null | undefined): LevelPreview {
  const none = { level: null, direction: null, distancePct: null, far: false } as const;
  // Without a price nothing else matters: the field is closed and the reason is the price.
  if (!known(last)) return { kind: "sem-preco", ...none };
  if (text.trim() === "") return { kind: "empty", ...none };
  const level = parseLevel(text);
  if (level === null) return { kind: "invalido", ...none };
  if (level === last) return { kind: "igual", ...none, level };
  const distancePct = (level / last - 1) * 100;
  return { kind: "ok", level, direction: level > last ? "above" : "below", distancePct, far: Math.abs(distancePct) > FAR_PCT };
}

export interface Evaluation {
  readonly alerts: readonly PriceAlert[];
  readonly fired: readonly PriceAlert[];
}

/** Fires every waiting alert whose level the price has reached. The same array comes back when nothing fires. */
export function evaluateAlerts(alerts: readonly PriceAlert[], prices: Readonly<Record<string, number | null | undefined>>, nowMs: number): Evaluation {
  const fired: PriceAlert[] = [];
  const next = alerts.map((alert) => {
    if (alert.firedAtMs !== null) return alert;
    const price = prices[alert.instId];
    if (!known(price)) return alert;
    const reached = alert.direction === "above" ? price >= alert.level : price <= alert.level;
    if (!reached) return alert;
    const hit: PriceAlert = { ...alert, firedAtMs: nowMs, firedPrice: price, seen: false };
    fired.push(hit);
    return hit;
  });
  return fired.length === 0 ? { alerts, fired } : { alerts: next, fired };
}

export function unseenCount(alerts: readonly PriceAlert[]): number {
  return alerts.filter((a) => a.firedAtMs !== null && !a.seen).length;
}

export function markSeen(alerts: readonly PriceAlert[]): readonly PriceAlert[] {
  return unseenCount(alerts) === 0 ? alerts : alerts.map((a) => (a.seen ? a : { ...a, seen: true }));
}

export function removeAlert(alerts: readonly PriceAlert[], id: string): readonly PriceAlert[] {
  return alerts.some((a) => a.id === id) ? alerts.filter((a) => a.id !== id) : alerts;
}

export function clearFired(alerts: readonly PriceAlert[]): readonly PriceAlert[] {
  return alerts.some((a) => a.firedAtMs !== null) ? alerts.filter((a) => a.firedAtMs === null) : alerts;
}

/** A level in pt-BR with at least two decimals and five significant digits for small prices. */
export function fmtLevel(value: number): string {
  return fmtNumber(value, Math.max(2, priceDecimalsForMagnitude(value)));
}

const two = (n: number) => String(n).padStart(2, "0");

function utcTime(ms: number): string {
  const d = new Date(ms);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} UTC`;
}

/** The alert as a sentence: waiting, or fired with the price and the exchange time. */
export function describeAlert(alert: PriceAlert): string {
  const base = `${alert.instId} ${alert.direction === "above" ? "acima" : "abaixo"} de ${fmtLevel(alert.level)}`;
  if (alert.firedAtMs === null || alert.firedPrice === null) return base;
  return `${base}, disparou em ${fmtLevel(alert.firedPrice)} as ${utcTime(alert.firedAtMs)}`;
}

/** The second line of an alert row: what it is doing now. A price that is not known is said, never shown as a number. */
export function alertState(alert: PriceAlert, price: number | null | undefined): string {
  if (alert.firedAtMs !== null && alert.firedPrice !== null) return `Disparou em ${fmtLevel(alert.firedPrice)} as ${utcTime(alert.firedAtMs)}`;
  return known(price) ? `Esperando, preco atual ${fmtLevel(price)}` : "Esperando, sem preco agora";
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Keeps only well-formed alerts, unique ids, at most MAX_ALERTS. A corrupt value is an empty list, never an error. */
export function normalizeAlerts(raw: unknown): PriceAlert[] {
  if (!Array.isArray(raw)) return [];
  const out: PriceAlert[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const { id, instId, level, direction, createdAtMs, firedAtMs, firedPrice, seen } = item;
    if (typeof id !== "string" || id === "" || id.length > 40 || ids.has(id)) continue;
    if (typeof instId !== "string" || !/^[A-Z0-9-]{3,32}$/.test(instId)) continue;
    if (typeof level !== "number" || !Number.isFinite(level) || level < MIN_LEVEL || level >= MAX_LEVEL) continue;
    if (direction !== "above" && direction !== "below") continue;
    if (typeof createdAtMs !== "number" || !Number.isFinite(createdAtMs)) continue;
    const waitingState = firedAtMs === null && firedPrice === null;
    const firedState = typeof firedAtMs === "number" && Number.isFinite(firedAtMs) && typeof firedPrice === "number" && Number.isFinite(firedPrice) && firedPrice > 0;
    if (!waitingState && !firedState) continue;
    ids.add(id);
    out.push({ id, instId, level, direction, createdAtMs, firedAtMs: waitingState ? null : (firedAtMs as number), firedPrice: waitingState ? null : (firedPrice as number), seen: waitingState ? true : seen === true });
    if (out.length >= MAX_ALERTS) break;
  }
  return out;
}

type ReadableStorage = { getItem(key: string): string | null } | null | undefined;
type WritableStorage = { setItem(key: string, value: string): void } | null | undefined;

export function readStoredAlerts(storage: ReadableStorage = typeof localStorage === "undefined" ? null : localStorage): PriceAlert[] {
  try {
    const text = storage?.getItem(ALERTS_KEY);
    return text ? normalizeAlerts(JSON.parse(text)) : [];
  } catch {
    return [];
  }
}

export function writeStoredAlerts(alerts: readonly PriceAlert[], storage: WritableStorage = typeof localStorage === "undefined" ? null : localStorage): void {
  try {
    storage?.setItem(ALERTS_KEY, JSON.stringify(alerts));
  } catch {
    /* a blocked storage only loses the memory of the alerts */
  }
}

/** Last price per instrument from the watchlist rows, the focused instrument's own ticker winning. Unknown stays null. */
export function priceMap(rows: readonly { readonly instId: string; readonly ticker: { readonly last: number } | null }[], focus: string, focusLast: number | null | undefined): Record<string, number | null> {
  const prices: Record<string, number | null> = {};
  for (const row of rows) prices[row.instId] = known(row.ticker?.last) ? row.ticker!.last : null;
  prices[focus] = known(focusLast) ? focusLast : (prices[focus] ?? null);
  return prices;
}
