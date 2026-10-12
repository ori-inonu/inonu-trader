import type { PublicMarketSnapshot } from './public-market';

export type IntegratedPublicSnapshot = Omit<PublicMarketSnapshot, 'capability'> & { capability: Omit<PublicMarketSnapshot['capability'], 'integrated'> & { integrated: true } };

/** Refresh halfway through remaining validity, with bounded source acquisition. */
export function publicRefreshDelay(snapshot: Pick<PublicMarketSnapshot, 'status' | 'expiresAtMs'> | null, nowMs: number): number {
 if (!snapshot || snapshot.status !== 'ready' || !Number.isFinite(nowMs) || !Number.isFinite(snapshot.expiresAtMs)) return 60_000;
 return Math.max(15_000, Math.min(60_000, Math.floor((snapshot.expiresAtMs - nowMs) / 2)));
}

/** Independent public worker. It never requests wallet identity or shares the authenticated queue. */
export function createPublicRuntime(deps: { read: () => Promise<PublicMarketSnapshot>; now?: () => number; monotonic?: () => number }) {
 const now = deps.now ?? Date.now;
 const monotonic = deps.monotonic ?? (() => performance.now());
 const intervalMs = 60_000;
 let running = false; let epoch = 0;
 let timer: ReturnType<typeof setTimeout> | null = null;
 let pending: Promise<void> | null = null;
 let snapshot: IntegratedPublicSnapshot | null = null;
 let lastError: string | null = null;
 let anchorWall = 0, anchorMono = 0, clockInvalid = false;
 const worker = {
  health() { return { running, intervalMs, lastCollectionAtMs: snapshot?.observedAtMs ?? null, lastError, source: 'okx-public-v5' }; },
  latest(): IntegratedPublicSnapshot | null {
   if (!snapshot) return null;
   const view = structuredClone(snapshot);
   const elapsed = monotonic() - anchorMono;
   clockInvalid ||= !Number.isFinite(elapsed) || elapsed < 0 || Math.abs(now() - anchorWall - elapsed) > 250;
   if ((clockInvalid || view.expiresAtMs <= now() || elapsed >= view.expiresAtMs - anchorWall) && view.status !== 'error') {
    view.status = 'blocked'; view.capability.status = 'blocked';
    view.expiresAtMs = Math.min(view.expiresAtMs, now());
    const reason = clockInvalid ? 'Relógio local alterado; aguardar nova referência pública de tempo.' : 'Coleta pública expirada; aguardar atualização do worker.';
    view.capability.reason ??= reason;
    if (!view.dependencies.includes(reason)) view.dependencies.push(reason);
   }
   return view;
  },
  tick(): Promise<void> {
   if (pending) return pending;
   const currentEpoch = epoch;
   pending = (async () => {
    try {
     const result = await deps.read();
     if (currentEpoch !== epoch) return;
     snapshot = { ...result, capability: { ...result.capability, integrated: true } };
     anchorWall = now(); anchorMono = monotonic(); clockInvalid = false;
     lastError = result.status === 'error' ? 'Leitura pública indisponível; consulte as dependências.' : null;
    } catch {
     if (currentEpoch !== epoch) return;
     lastError = 'Leitura pública indisponível; a próxima coleta tentará novamente.';
     const observedAtMs = now();
     snapshot = { source: 'okx-public-v5', mode: 'unverified', status: 'error', observedAtMs, expiresAtMs: observedAtMs, instrument: null, funding: null, mark: null, requests: [], dependencies: [lastError], capability: { id: 'funding.public-btc', family: 'funding', source: 'okx-public-v5', documented: true, implemented: true, exercisedReal: false, integrated: true, financiallyQualified: false, status: 'error', reason: lastError, nextRequirement: lastError } };
    }
   })().finally(() => { pending = null; });
   return pending;
  },
  async start() {
   if (running) return;
   running = true;
   const loop = async () => { if (!running) return; await worker.tick(); if (running) timer = setTimeout(loop, publicRefreshDelay(worker.latest(), now())); };
   await loop();
  },
  async stop() { running = false; epoch++; if (timer) clearTimeout(timer); if (pending) await pending; snapshot = null; },
 };
 return worker;
}
export type PublicRuntime = ReturnType<typeof createPublicRuntime>;
