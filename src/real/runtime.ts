import { createHash, randomUUID } from 'node:crypto';
import { publicRealConfig, type RealConfig } from './config';
import type { RealJournal } from './journal';
import type { CoreReadInput, CoreSample, SanitizedCoreSample } from './types';
import type { RealCycle, RealDecision, WalletConsent } from './runtime-types';
import { networkCoreFresh } from './transport-proof';

const hold = (reasons: string[], status: RealDecision['status'] = 'blocked'): RealDecision => ({ choice: 'hold', status, model: null, latencyMs: null, inputTokens: null, costUsd: null, called: false, reasons });

export function createRealRuntime(deps: {
 config: RealConfig; journal: RealJournal; now?: () => number; monotonic?: () => number;
 read: (input: CoreReadInput, signal: AbortSignal) => Promise<CoreSample>;
 sanitize: (input: CoreSample) => SanitizedCoreSample;
 decide?: (sample: SanitizedCoreSample, signal: AbortSignal) => Promise<RealDecision>;
 quota?: () => unknown;
}) {
 const { config, journal } = deps;
 const now = deps.now ?? Date.now;
 const monotonic = deps.monotonic ?? (() => performance.now());
 const clocks = new Map<string, { wall: number; mono: number; lifetime: number; invalid: boolean }>();
 let wallet: (WalletConsent & { address: string }) | null = null;
 let epoch = 0;
 let running = false;
 let timer: ReturnType<typeof setTimeout> | null = null;
 let pending: Promise<RealCycle> | null = null;
 let controller: AbortController | null = null;
 let last: RealCycle | null = null;
 let fatal: string | null = null;
 // Reservations remain spent after an interrupted provider call; never retry paid calls automatically.
 let reservedCalls = journal.history.filter(item => item.reservationOnly).length;
 const consentView = (): WalletConsent | { active: false; identityKey: null; chainIndex: null; revision: null } => wallet ? { active: true, queryScope: 'web3-rpc-read-v2', identityKey: wallet.identityKey, chainIndex: wallet.chainIndex, revision: wallet.revision } : { active: false, identityKey: null, chainIndex: null, revision: null };
 const matching = (cycle: RealCycle) => !cycle.core || (wallet && cycle.core.identityKey === wallet.identityKey && cycle.core.revision === wallet.revision);
 const fresh = (sample: SanitizedCoreSample) => {
  const clock = clocks.get(sample.correlationId); if (!clock) return false;
  const elapsed = monotonic() - clock.mono;
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= clock.lifetime || Math.abs(now() - clock.wall - elapsed) > 250 || !networkCoreFresh(sample, now())) clock.invalid = true;
  return !clock.invalid;
 };
 const visible = (cycle: RealCycle | null): RealCycle | null => {
  if (!cycle) return null;
  if (!matching(cycle)) return { ...cycle, core: null, decision: hold(['Identidade ou consentimento não corresponde ao ciclo']) };
  // The journal is historical evidence. Invalid observations must not be published
  // as current ready envelopes, inventory, valuation or RPC proof.
  if (cycle.core && !fresh(cycle.core)) return { ...structuredClone(cycle), core: null, decision: { ...cycle.decision, choice: 'hold', status: 'blocked', reasons: [...new Set([...cycle.decision.reasons, 'Dados essenciais incompletos ou expirados'])] } };
  return structuredClone(cycle);
 };
 const runtime = {
  health() {
   const view = { ...publicRealConfig(config), quota: deps.quota?.() ?? null };
   const worker = { running, intervalMs: config.intervalMs, lastCycleAtMs: last?.finishedAtMs ?? null, fatal, recoveredTailBytes: journal.recoveredTailBytes };
   const observed = last?.core?.capabilities.some(c => c.source === 'onchainos-rest-v6' && c.exercisedReal) ?? false;
   return { ...view, services: { ...view.services, onchainos: { ...view.services.onchainos, access: observed ? 'ready' as const : view.services.onchainos.access }, worker }, worker, walletConsent: consentView(), jevCalls: { reserved: reservedCalls, limit: config.jevMaxCalls }, dependencies: [...view.dependencies, ...(!wallet ? ['Autorize a consulta Web3 da carteira conectada'] : []), ...(!config.pair ? ['Configure o par e a quantidade em unidades mínimas para consultar DEX'] : []), ...(fatal ? [fatal] : [])] };
  },
  latest() { return { cycle: visible(last), history: journal.history.filter(item => !item.reservationOnly).slice(-30).reverse().map(visible) }; },
  consent(input: unknown) {
   if (typeof input !== 'object' || input === null) throw new Error('Invalid wallet consent');
   const c = input as Record<string, unknown>;
   if (c.consent !== true || c.queryScope !== 'web3-rpc-read-v2' || typeof c.address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(c.address) || typeof c.chainIndex !== 'string' || !['196', '143'].includes(c.chainIndex) || typeof c.revision !== 'number' || !Number.isSafeInteger(c.revision) || c.revision < 0) throw new Error('Invalid wallet consent');
   epoch++; controller?.abort(); last = null;
   wallet = { active: true, queryScope: 'web3-rpc-read-v2', address: c.address.toLowerCase(), chainIndex: c.chainIndex as '196' | '143', revision: c.revision, identityKey: createHash('sha256').update(`${c.chainIndex}:${c.address.toLowerCase()}`).digest('hex') };
   return consentView();
  },
  revoke() { epoch++; controller?.abort(); wallet = null; last = null; return consentView(); },
  tick(): Promise<RealCycle> {
   if (pending) return pending;
   if (fatal) return Promise.reject(new Error(fatal));
   const cycleEpoch = epoch;
   const current = wallet;
   const startedAtMs = now();
   const id = randomUUID();
   controller = new AbortController();
   const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]);
   pending = (async () => {
    let core: SanitizedCoreSample | null = null;
    let decision = hold(!current ? ['Consentimento Web3 ausente'] : config.web3Missing.map(key => `Credencial ausente: ${key}`));
    if (current && config.credentials) {
     try {
      const read = await deps.read({ correlationId: id, chainIndex: current.chainIndex, address: current.address, revision: current.revision, ...(config.pair ? { pair: config.pair } : {}) }, signal);
      if (cycleEpoch !== epoch || signal.aborted) decision = hold(['Consentimento revogado ou identidade alterada durante a consulta']);
      else {
       core = deps.sanitize(read);
       clocks.set(core.correlationId, { wall: now(), mono: monotonic(), lifetime: Math.max(0, Math.min(...['balance', 'prices', 'candles', 'quote'].map(key => core!.envelopes[key]?.expiresAtMs ?? 0)) - now()), invalid: false });
       if (clocks.size > 100) clocks.delete(clocks.keys().next().value!);
       if (core.correlationId !== id || core.identityKey !== current.identityKey || core.chainIndex !== current.chainIndex || core.revision !== current.revision) { core = null; decision = hold(['Correlação ou identidade inválida na resposta'], 'error'); }
       else {
        const reasons = [...core.holdReasons];
        if (!fresh(core)) reasons.push('Dados essenciais incompletos ou expirados');
        if (!config.jevCredentialPresent) reasons.push('Credencial Jev do aplicativo ausente');
        if (!config.jevAuthorized) reasons.push('Consumo Jev do aplicativo não autorizado na configuração');
        if (reservedCalls >= config.jevMaxCalls) reasons.push('Limite de chamadas Jev atingido');
        decision = hold(reasons);
        // A fully observed cycle may request a real, sanitized hold decision. No unqualified trade is eligible.
        if (fresh(core) && config.jevCredentialPresent && config.jevAuthorized && reservedCalls < config.jevMaxCalls && deps.decide) {
         reservedCalls++;
         // Durable reservation prevents crash/restart from resetting the consumption limit.
         const reservation: RealCycle = { reservationOnly: true, id: `${id}:reservation`, sequence: journal.history.length + 1, startedAtMs, finishedAtMs: now(), mode: 'paper', core: null, decision: hold(['Reserva de consumo Jev; resultado pendente']), realizedPnlUsd: null, executionEnabled: false };
         try { journal.append(reservation); } catch { fatal = 'Falha de persistência da reserva Jev'; running = false; throw new Error(fatal); }
         try {
          const inferred = await deps.decide(core, AbortSignal.any([signal, AbortSignal.timeout(10_000)]));
          if (inferred.choice !== 'hold' || !['ready', 'blocked'].includes(inferred.status) || !inferred.model || !Number.isFinite(inferred.latencyMs) || inferred.latencyMs! < 0 || (inferred.inputTokens !== null && (!Number.isSafeInteger(inferred.inputTokens) || inferred.inputTokens < 0)) || (inferred.costUsd !== null && (!Number.isFinite(inferred.costUsd) || inferred.costUsd < 0))) throw new Error('Invalid application decision');
          decision = { ...inferred, called: true, reasons: [...reasons, ...inferred.reasons] };
          if (signal.aborted || !fresh(core)) decision = { ...decision, status: 'blocked', reasons: [...decision.reasons, 'Dados essenciais incompletos ou expirados'] };
         } catch { decision = { ...hold(['Falha ou timeout na inferência Jev do aplicativo'], 'error'), called: true }; }
        }
       }
      }
     } catch { if (fatal) throw new Error(fatal); decision = hold(['Consulta Web3 indisponível ou cancelada'], 'error'); }
    }
    if (cycleEpoch !== epoch) { core = null; decision = hold(['Consentimento revogado ou identidade alterada durante a consulta']); }
    const cycle: RealCycle = { id, sequence: journal.history.length + 1, startedAtMs, finishedAtMs: now(), mode: 'paper', core, decision, realizedPnlUsd: null, executionEnabled: false };
    try { journal.append(cycle); } catch { fatal = 'Falha de persistência: worker interrompido'; running = false; throw new Error(fatal); }
    last = cycle;
    return visible(cycle)!;
   })().finally(() => { pending = null; controller = null; });
   return pending;
  },
  async start() {
   if (running) return;
   running = true;
   const loop = async () => { if (!running) return; try { await runtime.tick(); } catch { running = false; } if (running) timer = setTimeout(loop, config.intervalMs); };
   await loop();
  },
  async stop() { running = false; epoch++; if (timer) clearTimeout(timer); controller?.abort(); if (pending) await pending.catch(() => {}); wallet = null; last = null; },
 };
 return runtime;
}

export type RealRuntime = ReturnType<typeof createRealRuntime>;
