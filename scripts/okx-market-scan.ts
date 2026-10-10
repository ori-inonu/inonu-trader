import { scanOpportunities } from '../src/okx-market/okx-scan';
import { DEFAULT_RESEARCH_POLICY } from '../src/okx-market/okx-opportunities';
import { createSyntheticOkxClient, SYNTHETIC_SCAN_TIME_MS, SYNTHETIC_PROTOCOL_ID } from '../src/okx-market/okx-fixture';
import { createOkxReadOnlyClient } from '../src/okx-market/okx-api';
import type { MemeStage } from '../src/okx-market/okx-api';

class UsageError extends Error {}
function options(args: string[]) {
  if (!args.length) return { mode: 'synthetic' as const };
  if (args.length === 1 && args[0] === '--help') return { mode: 'help' as const };
  const values = new Map<string, string>(); let live = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!;
    if (flag === '--live' && !live) { live = true; continue; }
    if (!['--chain', '--stage', '--protocol', '--limit'].includes(flag) || values.has(flag)) throw new UsageError('Flags desconhecidas ou repetidas. Use --help.');
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new UsageError('Falta valor em uma flag. Use --help.');
    values.set(flag, value);
  }
  const chainIndex = values.get('--chain'), stage = values.get('--stage'), protocolId = values.get('--protocol'), limitText = values.get('--limit');
  if (!live || !chainIndex || !stage || !protocolId || !limitText || !/^[1-9]\d*$/.test(chainIndex) || !['NEW', 'MIGRATING', 'MIGRATED'].includes(stage) || !/^[a-zA-Z0-9_.-]{1,80}$/.test(protocolId) || !/^[1-9]\d*$/.test(limitText) || Number(limitText) > 30) throw new UsageError('Modo live exige --chain, --stage, --protocol e --limit de 1 a 30 explícitos e válidos.');
  return { mode: 'live' as const, chainIndex, stage: stage as MemeStage, protocolId, limit: Number(limitText) };
}

async function main() {
  const selected = options(process.argv.slice(2));
  if (selected.mode === 'help') {
    console.log('Inonu Trader — scanner OKX somente leitura\nSem flags: fixture sintética offline.\nLive: --live --chain <chainIndex> --stage <NEW|MIGRATING|MIGRATED> --protocol <ID descoberto> --limit <1..30>\nEnv local: OKX_WEB3_API_KEY, OKX_WEB3_API_SECRET, OKX_WEB3_API_PASSPHRASE.\nUse bun --no-env-file run scripts/okx-market-scan.ts. Execução financeira permanece não qualificada.');
    return;
  }
  const input = selected.mode === 'synthetic' ? {
    client: createSyntheticOkxClient(), chainIndex: '56', stage: 'NEW' as const, protocolId: SYNTHETIC_PROTOCOL_ID, limit: 3,
    now: () => SYNTHETIC_SCAN_TIME_MS, source: 'synthetic' as const,
  } : (() => {
    const apiKey = process.env.OKX_WEB3_API_KEY, secret = process.env.OKX_WEB3_API_SECRET, passphrase = process.env.OKX_WEB3_API_PASSPHRASE;
    if (![apiKey, secret, passphrase].every(x => typeof x === 'string' && x.trim().length > 0 && !/[\r\n]/.test(x))) throw new UsageError('Modo live exige credenciais OKX Web3 completas no ambiente local.');
    return { client: createOkxReadOnlyClient({ credentials: { apiKey: apiKey!, secret: secret!, passphrase: passphrase! } }), ...selected, now: Date.now, source: 'okx_authenticated' as const };
  })();
  const result = await scanOpportunities({ ...input, policy: DEFAULT_RESEARCH_POLICY });
  console.log(JSON.stringify(result, null, 2));
}
if (import.meta.main) main().catch(error => { console.error(error instanceof UsageError ? error.message : 'Falha no scanner: verifique acesso, cobertura e resposta da API. Nenhuma operação financeira foi enviada.'); process.exitCode = 1; });
