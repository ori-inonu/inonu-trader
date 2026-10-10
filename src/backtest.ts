export type JournalDataSource = "real-market-paper" | "synthetic" | "live";

export interface ReplayResult {
  sessionId: string;
  dataSource: JournalDataSource;
  model: string;
  durationMs: number;
  decisionCount: number;
  quoteCount: number;
  receiptCount: number;
  fillCount: number;
  fillCountsByProvenance: { paper: number; synthetic: number; live: number };
  initialEquityUsd: number;
  finalEquityUsd: number;
  netPnlUsd: number;
  returnPct: number;
  maxDrawdownUsd: number;
  maxDrawdownPct: number;
  turnoverUsd: number;
  endingCashUsd: number;
  endingMon: number;
  costs: { gasUsd: number; jevUsd: number; makerFeeUsd: number; totalUsd: number };
  assumptions: string[];
  caveats: string[];
}

type JsonRecord = Record<string, unknown>;
type QuoteStatus = "sim" | "sent" | "placed" | "reverted" | "lost";

interface Session {
  sessionId: string;
  dataSource: JournalDataSource;
  model: string;
  ts: number;
  bankrollUsd: number;
  initialMon: number;
  initialMid: number;
  makerFeeBps: number;
}

const EPSILON = 1e-9;
const CAVEATS = [
  "Replay only: this result describes the supplied journal and does not forecast future returns.",
  "No leverage, annualization, or daily/weekly profit inference is applied.",
  "Paper fills do not model queue priority, competing latency, adverse selection, transfer fees, or taxes.",
];

function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as JsonRecord;
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string`);
  return value;
}

function numberField(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} must be a finite number >= ${minimum}`);
  }
  return value;
}

function integerField(value: unknown, label: string): number {
  const parsed = numberField(value, label);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} must be a safe integer`);
  return parsed;
}

function required(recordValue: JsonRecord, key: string, label: string): unknown {
  if (!(key in recordValue)) throw new Error(`${label}.${key} is required`);
  return recordValue[key];
}

function parseInput(input: string | readonly unknown[]): unknown[] {
  let entries: unknown[];
  if (typeof input === "string") {
    const lines = input.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length === 0) throw new Error("journal is empty");
    entries = lines.map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        throw new Error(`journal line ${index + 1} is malformed JSON`);
      }
    });
  } else {
    entries = [...input];
  }
  if (entries.length === 0) throw new Error("journal is empty");
  return entries;
}

function parseSession(value: unknown): Session {
  const row = record(value, "session");
  if (row.kind !== "session") throw new Error("the first journal event must be a session header");
  const source = required(row, "dataSource", "session");
  if (source !== "real-market-paper" && source !== "synthetic" && source !== "live") {
    throw new Error("session.dataSource must be real-market-paper, synthetic, or live");
  }
  const makerFeeBps = numberField(required(row, "makerFeeBps", "session"), "session.makerFeeBps");
  if (makerFeeBps > 10_000) throw new Error("session.makerFeeBps must be <= 10000");
  const bankrollUsd = numberField(required(row, "bankrollUsd", "session"), "session.bankrollUsd");
  if (bankrollUsd <= 0) throw new Error("session.bankrollUsd must be greater than zero");
  const initialMon = numberField(required(row, "initialMon", "session"), "session.initialMon");
  const initialMid = numberField(required(row, "initialMid", "session"), "session.initialMid");
  if (initialMid <= 0) throw new Error("session.initialMid must be greater than zero");
  if (initialMon * initialMid > bankrollUsd + EPSILON) {
    throw new Error("session initial MON value exceeds the funded bankroll");
  }
  return {
    sessionId: stringField(required(row, "sessionId", "session"), "session.sessionId"),
    dataSource: source,
    model: stringField(required(row, "model", "session"), "session.model"),
    ts: integerField(required(row, "ts", "session"), "session.ts"),
    bankrollUsd,
    initialMon,
    initialMid,
    makerFeeBps,
  };
}

function debit(cash: number, amount: number, label: string): number {
  if (amount > cash + EPSILON) throw new Error(`${label} exceeds available cash; journal is economically impossible`);
  return Math.max(0, cash - amount);
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000;
}

function quoteIdentity(quote: JsonRecord, block: number): string {
  if (quote.txHash !== undefined && quote.txHash !== null) return `tx:${String(quote.txHash).toLowerCase()}`;
  if (quote.orderId !== undefined && quote.orderId !== null) return `order:${String(quote.orderId)}`;
  return `block:${block}:${String(quote.side)}:${String(quote.price)}:${String(quote.size)}`;
}

function orderIdentity(value: unknown, label: string): string {
  if (typeof value === "string" && value.trim() !== "") return `string:${value}`;
  if (typeof value === "number" && Number.isFinite(value)) return `number:${value}`;
  throw new Error(`${label} must be a non-empty string or finite number`);
}

export function replayJournal(input: string | readonly unknown[]): ReplayResult {
  const events = parseInput(input);
  const session = parseSession(events[0]);
  if (events.length === 1) throw new Error("journal contains no market or accounting events after the session header");
  const initialCash = session.bankrollUsd - session.initialMon * session.initialMid;

  let cashUsd = initialCash;
  let mon = session.initialMon;
  let mid = session.initialMid;
  let lastTs = session.ts;
  let decisionCount = 0;
  let quoteCount = 0;
  let fillCount = 0;
  let turnoverUsd = 0;
  let gasUsd = 0;
  let jevUsd = 0;
  let makerFeeUsd = 0;
  let peakEquityUsd = session.bankrollUsd;
  let maxDrawdownUsd = 0;
  let maxDrawdownPct = 0;
  const fillCountsByProvenance = { paper: 0, synthetic: 0, live: 0 };
  const seenBlockEvents = new Set<number>();
  const seenFillIds = new Set<string>();
  const seenQuoteIds = new Set<string>();
  const seenSimulationCosts = new Set<string>();
  const eligibleOrders = new Map<string, {
    block: number;
    side: "buy" | "sell";
    price: number;
    size: number;
    filledSize: number;
  }>();
  const receiptGasByTx = new Map<string, number>();
  let receiptCount = 0;

  const equity = (): number => cashUsd + mon * mid;
  const updateDrawdown = (): void => {
    const current = equity();
    if (!Number.isFinite(current)) throw new Error("journal produces non-finite marked equity");
    peakEquityUsd = Math.max(peakEquityUsd, current);
    const drawdown = peakEquityUsd - current;
    maxDrawdownUsd = Math.max(maxDrawdownUsd, drawdown);
    if (peakEquityUsd > 0) maxDrawdownPct = Math.max(maxDrawdownPct, (drawdown / peakEquityUsd) * 100);
  };

  const chargeGas = (gasMon: number, eventMid: number, label: string): void => {
    const amountUsd = gasMon * eventMid;
    cashUsd = debit(cashUsd, amountUsd, label);
    gasUsd += amountUsd;
    if (!Number.isFinite(gasUsd)) throw new Error(`${label} produces non-finite accounting totals`);
  };

  const registerEligibleOrder = (
    quote: JsonRecord,
    block: number,
    side: "buy" | "sell",
    price: number,
    size: number,
    label: string,
  ): void => {
    if (quote.orderId === undefined || quote.orderId === null) return;
    const identity = orderIdentity(quote.orderId, `${label}.orderId`);
    if (eligibleOrders.has(identity)) throw new Error(`${label} repeats duplicate eligible quote/order id ${String(quote.orderId)}`);
    eligibleOrders.set(identity, { block, side, price, size, filledSize: 0 });
  };

  const consumeQuote = (value: unknown, block: number, eventMid: number, label: string): void => {
    const quote = record(value, label);
    const status = required(quote, "status", label);
    if (status !== "sim" && status !== "sent" && status !== "placed" && status !== "reverted" && status !== "lost") {
      throw new Error(`${label}.status is unsupported`);
    }
    if (status === "lost") throw new Error(`${label} lost quote has an unknown receipt; replay cannot confirm its cost or P&L`);
    if ((status === "sim") !== (session.dataSource !== "live")) {
      throw new Error(`${label}.status ${status} conflicts with session.dataSource`);
    }
    const side = required(quote, "side", label);
    if (side !== "buy" && side !== "sell") throw new Error(`${label}.side must be buy or sell`);
    const size = numberField(required(quote, "size", label), `${label}.size`);
    if (size <= 0) throw new Error(`${label}.size must be greater than zero`);
    const price = numberField(required(quote, "price", label), `${label}.price`);
    if (price <= 0) throw new Error(`${label}.price must be greater than zero`);
    if (quote.orderId !== undefined && quote.orderId !== null) {
      if ((typeof quote.orderId !== "string" && typeof quote.orderId !== "number") ||
          (typeof quote.orderId === "string" && quote.orderId.trim() === "") ||
          (typeof quote.orderId === "number" && !Number.isFinite(quote.orderId))) {
        throw new Error(`${label}.orderId must be a non-empty string or finite number`);
      }
    }
    if (quote.gasMon !== undefined && quote.gasMon !== null) {
      numberField(quote.gasMon, `${label}.gasMon`);
    }
    const identity = quoteIdentity(quote, block);
    if (!seenQuoteIds.has(identity)) {
      seenQuoteIds.add(identity);
      quoteCount += 1;
    }
    if (status === "sim") {
      const gasMonValue = numberField(required(quote, "gasMon", label), `${label}.gasMon`);
      const simKey = `sim:${identity}`;
      if (!seenSimulationCosts.has(simKey)) {
        seenSimulationCosts.add(simKey);
        chargeGas(gasMonValue, eventMid, `${label}.gasMon cost`);
      }
      registerEligibleOrder(quote, block, side, price, size, label);
      return;
    }
    if (status === "sent") return;

    const txHash = stringField(required(quote, "txHash", label), `${label}.txHash`);
    const gasMonValue = numberField(required(quote, "gasMon", label), `${label}.gasMon`);
    const txKey = txHash.toLowerCase();
    const priorGas = receiptGasByTx.get(txKey);
    if (priorGas !== undefined) {
      if (Math.abs(priorGas - gasMonValue) > EPSILON) {
        throw new Error(`${label} repeats transaction ${txHash} with conflicting gas amounts`);
      }
      return;
    }
    receiptGasByTx.set(txKey, gasMonValue);
    receiptCount += 1;
    chargeGas(gasMonValue, eventMid, `${label}.gasMon receipt cost`);
    if (status === "placed") registerEligibleOrder(quote, block, side, price, size, label);
  };

  for (let index = 1; index < events.length; index += 1) {
    const row = record(events[index], `event ${index + 1}`);
    if (row.kind === "session") throw new Error("journal must contain exactly one session header at the beginning");
    const kind = stringField(required(row, "kind", `event ${index + 1}`), `event ${index + 1}.kind`);
    const label = `event ${index + 1} (${kind})`;
    const ts = integerField(required(row, "ts", label), `${label}.ts`);
    if (ts < lastTs) throw new Error(`${label}.ts moves backwards; journal must preserve arrival order`);
    lastTs = ts;
    const block = integerField(required(row, "block", label), `${label}.block`);
    mid = numberField(required(row, "mid", label), `${label}.mid`);
    if (mid <= 0) throw new Error(`${label}.mid must be greater than zero`);

    if (kind === "block") {
      if (seenBlockEvents.has(block)) throw new Error(`duplicate block event ${block}`);
      seenBlockEvents.add(block);
      if (row.fill !== undefined && row.fill !== null) {
        throw new Error(`${label} contains an aggregated block.fill; provide individual kind=fill events`);
      }
      if (row.decision !== undefined && row.decision !== null) decisionCount += 1;
      if (row.quote !== undefined && row.quote !== null) consumeQuote(row.quote, block, mid, `${label}.quote`);
    } else if (kind === "quote") {
      consumeQuote(required(row, "quote", label), block, mid, `${label}.quote`);
    } else if (kind === "fill") {
      const id = stringField(required(row, "id", label), `${label}.id`);
      if (seenFillIds.has(id)) throw new Error(`duplicate fill id ${id}`);
      seenFillIds.add(id);
      const fill = record(required(row, "fill", label), `${label}.fill`);
      const side = required(fill, "side", `${label}.fill`);
      if (side !== "buy" && side !== "sell") throw new Error(`${label}.fill.side must be buy or sell`);
      const size = numberField(required(fill, "size", `${label}.fill`), `${label}.fill.size`);
      if (size <= 0) throw new Error(`${label}.fill.size must be greater than zero`);
      const price = numberField(required(fill, "price", `${label}.fill`), `${label}.fill.price`);
      if (price <= 0) throw new Error(`${label}.fill.price must be greater than zero`);
      const simulated = required(fill, "simulated", `${label}.fill`);
      if (typeof simulated !== "boolean") throw new Error(`${label}.fill.simulated must be boolean`);
      if ((session.dataSource === "live" && simulated) || (session.dataSource !== "live" && !simulated)) {
        throw new Error(`${label}.fill.simulated conflicts with session.dataSource`);
      }
      const orderId = orderIdentity(required(fill, "orderId", `${label}.fill`), `${label}.fill.orderId`);
      const order = eligibleOrders.get(orderId);
      if (order === undefined) throw new Error(`${label}.fill has no prior eligible quote/order`);
      if (block < order.block) throw new Error(`${label}.fill block precedes its quote/order placement`);
      if (side !== order.side) throw new Error(`${label}.fill side does not match quote/order`);
      if (Math.abs(price - order.price) > EPSILON) throw new Error(`${label}.fill price does not match quote/order`);
      if (order.filledSize + size > order.size + EPSILON) {
        throw new Error(`${label}.fill size exceeds remaining quote/order size`);
      }
      const notional = size * price;
      const fee = notional * (session.makerFeeBps / 10_000);
      if (!Number.isFinite(notional) || !Number.isFinite(fee)) throw new Error(`${label}.fill notional is not finite`);
      if (side === "buy") {
        cashUsd = debit(cashUsd, notional + fee, `${label} buy`);
        mon += size;
        if (!Number.isFinite(mon)) throw new Error(`${label}.fill produces non-finite MON inventory`);
      } else {
        if (size > mon + EPSILON) throw new Error(`${label} sells more MON than the funded inventory`);
        mon = Math.max(0, mon - size);
        cashUsd += notional - fee;
        if (!Number.isFinite(cashUsd)) throw new Error(`${label}.fill produces non-finite cash`);
      }
      makerFeeUsd += fee;
      turnoverUsd += notional;
      if (!Number.isFinite(makerFeeUsd) || !Number.isFinite(turnoverUsd)) {
        throw new Error(`${label}.fill produces non-finite accounting totals`);
      }
      fillCount += 1;
      order.filledSize += size;
      if (session.dataSource === "live") fillCountsByProvenance.live += 1;
      else if (session.dataSource === "synthetic") fillCountsByProvenance.synthetic += 1;
      else fillCountsByProvenance.paper += 1;
    } else if (kind === "cost") {
      const cost = numberField(required(row, "jevUsd", label), `${label}.jevUsd`);
      cashUsd = debit(cashUsd, cost, `${label}.jevUsd`);
      jevUsd += cost;
      if (!Number.isFinite(jevUsd)) throw new Error(`${label}.jevUsd produces non-finite accounting totals`);
    } else if (kind === "cancel") {
      const txHash = stringField(required(row, "txHash", label), `${label}.txHash`);
      const gasMonValue = numberField(required(row, "gasMon", label), `${label}.gasMon`);
      const txKey = txHash.toLowerCase();
      const priorGas = receiptGasByTx.get(txKey);
      if (priorGas !== undefined) {
        if (Math.abs(priorGas - gasMonValue) > EPSILON) {
          throw new Error(`${label} repeats transaction ${txHash} with conflicting gas amounts`);
        }
      } else {
        receiptGasByTx.set(txKey, gasMonValue);
        receiptCount += 1;
        chargeGas(gasMonValue, mid, `${label}.gasMon cancellation receipt cost`);
      }
    } else {
      throw new Error(`${label}.kind is unsupported`);
    }
    updateDrawdown();
  }

  const finalEquityUsd = equity();
  const netPnlUsd = finalEquityUsd - session.bankrollUsd;
  const totalCostUsd = gasUsd + jevUsd + makerFeeUsd;
  if (![finalEquityUsd, netPnlUsd, totalCostUsd, turnoverUsd].every(Number.isFinite)) {
    throw new Error("journal produces non-finite final accounting values");
  }
  return {
    sessionId: session.sessionId,
    dataSource: session.dataSource,
    model: session.model,
    durationMs: lastTs - session.ts,
    decisionCount,
    quoteCount,
    receiptCount,
    fillCount,
    fillCountsByProvenance,
    initialEquityUsd: session.bankrollUsd,
    finalEquityUsd: roundUsd(finalEquityUsd),
    netPnlUsd: roundUsd(netPnlUsd),
    returnPct: roundUsd((netPnlUsd / session.bankrollUsd) * 100),
    maxDrawdownUsd: roundUsd(maxDrawdownUsd),
    maxDrawdownPct: roundUsd(maxDrawdownPct),
    turnoverUsd: roundUsd(turnoverUsd),
    endingCashUsd: roundUsd(cashUsd),
    endingMon: mon,
    costs: {
      gasUsd: roundUsd(gasUsd),
      jevUsd: roundUsd(jevUsd),
      makerFeeUsd: roundUsd(makerFeeUsd),
      totalUsd: roundUsd(totalCostUsd),
    },
    assumptions: [
      "Initial equity is the funded bankroll: uncommitted USD cash plus seeded MON marked at initialMid.",
      "MON buy/sell fills use recorded prices; configured makerFeeBps is charged on every fill.",
      "Simulated quote gasMon is an estimate converted to USD at the quote mid; it is not an observed chain receipt.",
      "Confirmed quote and cancellation receipt gas is charged once per transaction hash; sent quotes have no realized gas charge.",
      "Gas and Jev expenses are paid from journal cash after conversion to USD; this replay does not maintain a separate native-gas wallet.",
      "Recorded Jev USD costs are deducted from cash at their journaled values; mock sessions should record zero.",
      "Aggregate block totals are ignored; individual quote, fill, and cost records are authoritative.",
      "Equity is cash plus MON marked at each event's recorded mid; drawdown is measured from the running equity peak.",
    ],
    caveats: CAVEATS,
  };
}
