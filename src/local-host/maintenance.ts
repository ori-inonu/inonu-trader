const obj = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

/**
 * Planned migration of a legacy detached supervisor that has no external stop receiver. This helper does NOT stop any process.
 * It only disconnects an already-paused, empty-plan agent through its real API and waits for the scheduler's complete single flight.
 * A caller must ALSO verify its exact owned PIDs/artifact hashes and the persisted disconnected state before ending a quiescent process.
 * It must never be used as a kill fallback for a live trader or an unresolved order.
 */
export async function quiescePausedAgent(fetchImpl: typeof fetch): Promise<{
  quiescent: true; disclosure: string; originalConsults: number; budgetDay: string; walletBinding: string;
}> {
  const origin = "http://127.0.0.1:3000";
  const call = async (path: "/agent/status" | "/agent/disconnect" | "/agent/run", method: "GET" | "POST") => {
    const r = await fetchImpl(origin + path, { method, redirect: "error", headers: { origin, ...(method === "POST" ? { "content-type": "application/json", "x-inonu-intent": "user" } : {}) },
      ...(method === "POST" ? { body: "{}" } : {}), signal: AbortSignal.timeout(path === "/agent/run" ? 180_000 : 5000) });
    if (!r.ok) throw new Error("maintenance_request_refused");
    const text = await r.text(); if (text.length > 1_000_000) throw new Error("maintenance_response_invalid");
    const envelope = obj(JSON.parse(text)); if (envelope?.ok !== true) throw new Error("maintenance_response_invalid");
    return envelope;
  };
  const safe = (s: Record<string, unknown> | null) => {
    const health = obj(s?.health);
    return s !== null && s.lock === true && Array.isArray(s.plans) && s.plans.length === 0 && Array.isArray(s.inFlight) && s.inFlight.length === 0 &&
      obj(health?.ledger)?.ok === true && obj(health?.plans)?.ok === true && obj(health?.config)?.ok === true;
  };
  const start = obj((await call("/agent/status", "GET")).status), startState = obj(start?.state), budget = obj(start?.budget);
  const managed = obj(obj(start?.config)?.managed);
  if (!safe(start) || start?.paused !== true || start.mode !== "limitado" || startState?.connected !== true || typeof startState.disclosure !== "string" ||
    !/^\d{4}-\d{2}-\d{2}\.\d{1,3}$/.test(startState.disclosure) || !Number.isSafeInteger(budget?.consults) || (budget!.consults as number) < 0 || typeof budget?.day !== "string" ||
    managed?.kind !== "agentica" || typeof managed.solana !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(managed.solana) || !(managed.evm === null || typeof managed.evm === "string")) throw new Error("maintenance_not_quiescible");
  const walletBinding = JSON.stringify(managed);
  await call("/agent/disconnect", "POST");
  let confirmedOff = false;
  for (let pass = 0; pass < 2; pass++) {
    const report = obj((await call("/agent/run", "POST")).report);
    // The first request may share an older in-progress cycle; a subsequent disconnected cycle must choose and send nothing.
    if (report?.mode === "desligado" && report.consulted === false && Array.isArray(report.orders) && report.orders.length === 0) { confirmedOff = true; break; }
  }
  if (!confirmedOff) throw new Error("maintenance_drain_unproven");
  const end = obj((await call("/agent/status", "GET")).status), endState = obj(end?.state), endBudget = obj(end?.budget);
  if (!safe(end) || end?.mode !== "desligado" || endState?.connected !== false || JSON.stringify(obj(end?.config)?.managed) !== walletBinding ||
    endBudget?.day !== budget.day || endBudget?.consults !== budget.consults) throw new Error("maintenance_drain_unproven");
  return { quiescent: true, disclosure: startState.disclosure, originalConsults: budget.consults as number, budgetDay: budget.day, walletBinding };
}
