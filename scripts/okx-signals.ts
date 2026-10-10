import { collectSignals, SignalsError, validateSignalQuery } from '../src/okx-signals/report';
import { createSignalsClient } from '../src/okx-signals/client';
import { createSyntheticSignalsClient, SYNTHETIC_SIGNALS_QUERY, SYNTHETIC_SIGNALS_TIME_MS } from '../src/okx-signals/fixture';

function options(args: string[]) {
  if (!args.length) return { mode: 'synthetic' as const };
  if (args.length === 1 && args[0] === '--help') return { mode: 'help' as const };
  let live = false;
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!;
    if (flag === '--live' && !live) { live = true; continue; }
    if (!['--chain', '--wallet-types', '--limit'].includes(flag) || values.has(flag)) throw new SignalsError('invalid_input');
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new SignalsError('invalid_input');
    values.set(flag, value);
  }
  const chainIndex = values.get('--chain'), walletTypes = values.get('--wallet-types'), limit = values.get('--limit');
  if (!live || !chainIndex || !walletTypes || !limit || !/^[1-9][0-9]{0,2}$/.test(limit)) throw new SignalsError('invalid_input');
  return { mode: 'live' as const, query: validateSignalQuery({ chainIndex, walletTypes: walletTypes.split(','), limit: Number(limit) }) };
}
async function main() {
  const selected = options(process.argv.slice(2));
  if (selected.mode === 'help') {
    console.log('GEV — observações históricas de sinais OKX\nSem flags: JSON sintético offline.\nLive: --live --chain <chainIndex> --wallet-types <1,2,3> --limit <1..100>\n1=Smart Money, 2=Influencer, 3=Whale. Consulta cobertura e uma página; não executa operações.\nCredenciais no processo: OKX_WEB3_API_KEY, OKX_WEB3_API_SECRET, OKX_WEB3_API_PASSPHRASE.\nUse bun --no-env-file run okx:signals. Acesso e custos reais permanecem desconhecidos.');
    return;
  }
  const input = selected.mode === 'synthetic' ? {
    client: createSyntheticSignalsClient(), query: SYNTHETIC_SIGNALS_QUERY, now: () => SYNTHETIC_SIGNALS_TIME_MS, source: 'synthetic' as const,
  } : {
    client: createSignalsClient({ credentials: {
      apiKey: process.env.OKX_WEB3_API_KEY ?? '', secret: process.env.OKX_WEB3_API_SECRET ?? '', passphrase: process.env.OKX_WEB3_API_PASSPHRASE ?? '',
    } }), query: selected.query, now: Date.now, source: 'okx_authenticated' as const,
  };
  const report = await collectSignals(input);
  console.log(JSON.stringify(report, null, 2));
}
if (import.meta.main) main().catch(error => { console.error(error instanceof SignalsError ? error.message : 'OKX Signals: request_failed'); process.exitCode = 1; });
