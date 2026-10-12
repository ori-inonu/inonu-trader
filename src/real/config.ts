import type { OnchainosCredentials } from '../onchainos/http';

export interface RealConfig {
  port: number;
  intervalMs: number;
  journalPath: string;
  origins: string[];
  credentials: OnchainosCredentials | undefined;
  web3Missing: string[];
  jevCredentialPresent: boolean;
  jevAuthorized: boolean;
  jevModel: string;
  jevMaxCalls: number;
  jevUsdPerMillion: number | null;
  pair: { fromToken: string; toToken: string; amount: string; slippagePercent: string } | undefined;
}

/** Independent paper runtime: no private key, CEX key or legacy live ACK is read. */
export function loadRealConfig(env: Record<string, string | undefined> = process.env): RealConfig {
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = env[key] === undefined ? fallback : Number(env[key]);
    if (env[key]?.trim() === '' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
    return value;
  };
  const flag = (key: string) => {
    if (env[key] !== undefined && !['true', 'false'].includes(env[key]!)) throw new Error(`Invalid ${key}`);
    return env[key] === 'true';
  };
  const names = ['OKX_WEB3_API_KEY', 'OKX_WEB3_API_SECRET', 'OKX_WEB3_API_PASSPHRASE'];
  const web3Missing = names.filter(name => !env[name]?.trim());
  const parts = names.map(name => env[name] ?? '');
  if (parts.some(value => value && !/^[\x21-\x7e]{1,512}$/.test(value))) throw new Error('Invalid Web3 credential format');
  const origins = (env.REAL_DASHBOARD_ORIGINS ?? 'http://localhost:3001,http://127.0.0.1:3001').split(',');
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.origin !== origin) throw new Error('Invalid REAL_DASHBOARD_ORIGINS');
  }
  const jevModel = env.REAL_JEV_MODEL ?? 'jev-latest';
  if (!/^jev-[a-zA-Z0-9.-]{1,64}$/.test(jevModel)) throw new Error('Invalid REAL_JEV_MODEL');
  const cost = env.REAL_JEV_USD_PER_MILLION === undefined ? null : Number(env.REAL_JEV_USD_PER_MILLION);
  if (cost !== null && (env.REAL_JEV_USD_PER_MILLION?.trim() === '' || !Number.isFinite(cost) || cost <= 0)) throw new Error('Invalid REAL_JEV_USD_PER_MILLION');
  const pairKeys = ['REAL_FROM_TOKEN', 'REAL_TO_TOKEN', 'REAL_AMOUNT'];
  const journalPath = env.REAL_JOURNAL_PATH ?? 'data/real/cycles.jsonl';
  if (!journalPath.trim() || /[\x00-\x1f]/.test(journalPath)) throw new Error('Invalid REAL_JOURNAL_PATH');
  const hasPair = pairKeys.some(key => env[key] !== undefined);
  let pair: RealConfig['pair'];
  if (hasPair) {
    if (!pairKeys.every(key => env[key]) || !/^0x[0-9a-fA-F]{40}$/.test(env.REAL_FROM_TOKEN!) || !/^0x[0-9a-fA-F]{40}$/.test(env.REAL_TO_TOKEN!) || env.REAL_FROM_TOKEN!.toLowerCase() === env.REAL_TO_TOKEN!.toLowerCase() || !/^[1-9]\d{0,77}$/.test(env.REAL_AMOUNT!)) throw new Error('Invalid real quote pair');
    const slippagePercent = env.REAL_SLIPPAGE_PERCENT ?? '0.5';
    if (!/^\d{1,2}(\.\d{1,4})?$/.test(slippagePercent) || Number(slippagePercent) <= 0 || Number(slippagePercent) > 1) throw new Error('Invalid REAL_SLIPPAGE_PERCENT');
    pair = { fromToken: env.REAL_FROM_TOKEN!, toToken: env.REAL_TO_TOKEN!, amount: env.REAL_AMOUNT!, slippagePercent };
  }
  return {
    port: integer('REAL_PORT', 3000, 1, 65535),
    intervalMs: integer('REAL_INTERVAL_MS', 60_000, 5_000, 3_600_000),
    journalPath,
    origins,
    credentials: web3Missing.length ? undefined : { apiKey: parts[0]!, secretKey: parts[1]!, passphrase: parts[2]! },
    web3Missing,
    jevCredentialPresent: Boolean(env.TYPESAFE_AI_API_KEY?.trim()),
    jevAuthorized: flag('REAL_JEV_CONSUMPTION_AUTHORIZED'),
    jevModel,
    jevMaxCalls: integer('REAL_JEV_MAX_CALLS', 10, 1, 100),
    jevUsdPerMillion: cost,
    pair,
  };
}

export function publicRealConfig(config: RealConfig) {
  return {
    mode: 'paper' as const,
    executionEnabled: false as const,
    services: {
      onchainos: { configured: config.credentials !== undefined, access: (config.credentials ? 'unverified' : 'blocked') as 'unverified' | 'blocked' | 'ready', missing: config.web3Missing },
      jev: { credentialPresent: config.jevCredentialPresent, authorized: config.jevAuthorized, model: config.jevModel, costUsdPerMillion: config.jevUsdPerMillion, maxCalls: config.jevMaxCalls },
    },
    networks: [{ chainIndex: '196', name: 'X Layer' }, { chainIndex: '143', name: 'Monad' }],
    quotePairConfigured: Boolean(config.pair),
    effectiveConfig: {
      intervalMs: config.intervalMs,
      quotePair: config.pair ? { ...config.pair } : null,
      rpcRecipients: [{ chainIndex: '196', origin: 'https://rpc.xlayer.tech' }, { chainIndex: '143', origin: 'https://rpc.monad.xyz' }],
    },
    web3Origin: 'https://web3.okx.com',
    ttlMs: { quote: 15_000, market: 60_000, inventory: 60_000 },
    dependencies: [
      ...config.web3Missing.map(name => `Configure ${name} no ambiente local do aplicativo`),
      ...(!config.jevCredentialPresent ? ['Configure TYPESAFE_AI_API_KEY do aplicativo'] : []),
      ...(!config.jevAuthorized ? ['Consumo Jev do aplicativo ainda não autorizado na configuração'] : []),
    ],
  };
}
