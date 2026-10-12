import type { SanitizedCoreSample } from './types';

export interface RealDecision {
  choice: string;
  status: 'ready' | 'blocked' | 'error';
  model: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  costUsd: number | null;
  called: boolean;
  reasons: string[];
}

export interface RealCycle {
  reservationOnly?: true;
  id: string;
  sequence: number;
  startedAtMs: number;
  finishedAtMs: number;
  mode: 'paper';
  core: SanitizedCoreSample | null;
  decision: RealDecision;
  realizedPnlUsd: null;
  executionEnabled: false;
}

export interface WalletConsent {
  active: true;
  queryScope: 'web3-rpc-read-v2';
  identityKey: string;
  chainIndex: '196' | '143';
  revision: number;
}
