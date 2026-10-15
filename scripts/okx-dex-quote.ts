import { quoteRoundTrip } from '../src/okx-market/round-trip';
import { createSyntheticRoundTripReport } from '../src/okx-market/synthetic-round-trip';
import { createOkxDexReadOnlyClient } from '../src/okx-market/okx-dex';
import { tokenAddressesEqual } from '../src/okx-market/token-identity';
import type { RoundTripInput } from '../src/okx-market/round-trip';
import { okxNow, syncOkxClock } from '../src/okx-clock';

class UsageError extends Error {}
const scopeFlags = ['--chain', '--token-a', '--token-b', '--decimals-a', '--decimals-b',
  '--metadata-source-a', '--metadata-source-b', '--amount-atomic'] as const;

function liveInput(args: string[]): RoundTripInput {
  const values = new Map<string, string>();
  let live = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (flag === '--live' && !live) { live = true; continue; }
    if (!(scopeFlags as readonly string[]).includes(flag) || values.has(flag)) throw new UsageError('Escopo DEX inválido ou repetido. Use --help.');
    const value = args[++index];
    if (value === undefined || value.startsWith('--')) throw new UsageError('Escopo DEX incompleto. Use --help.');
    values.set(flag, value);
  }
  if (!live || scopeFlags.some(flag => !values.has(flag))) throw new UsageError('A consulta autenticada exige --live e o escopo DEX completo. Use --help.');
  const get = (flag: typeof scopeFlags[number]) => values.get(flag)!;
  const chainIndex = get('--chain');
  const addressA = get('--token-a');
  const addressB = get('--token-b');
  const addressValid = (value: string) => value.length > 0 && !/[\s,\u0000-\u001f\u007f]/u.test(value);
  const decimals = (flag: '--decimals-a' | '--decimals-b') => {
    const value = get(flag);
    if (!/^(0|[1-9]\d{0,2})$/.test(value) || Number(value) > 255) throw new UsageError('Decimais DEX inválidos.');
    return Number(value);
  };
  const metadata = (flag: '--metadata-source-a' | '--metadata-source-b') => {
    const value = get(flag);
    if (!value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) throw new UsageError('A origem dos metadados deve ser explícita.');
    return value;
  };
  const amountAtomic = get('--amount-atomic');
  if (!/^[1-9]\d*$/.test(chainIndex) || !addressValid(addressA) || !addressValid(addressB) || tokenAddressesEqual(chainIndex, addressA, addressB)
    || !/^[1-9]\d{0,77}$/.test(amountAtomic)) throw new UsageError('Rede, tokens ou quantidade atômica inválidos.');
  const tokenA = { address: addressA, decimals: decimals('--decimals-a'), metadataSource: metadata('--metadata-source-a') };
  const tokenB = { address: addressB, decimals: decimals('--decimals-b'), metadataSource: metadata('--metadata-source-b') };
  const credentials = { apiKey: process.env.OKX_WEB3_API_KEY, secret: process.env.OKX_WEB3_API_SECRET, passphrase: process.env.OKX_WEB3_API_PASSPHRASE };
  const credentialValid = (value: string | undefined): value is string => typeof value === 'string' && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(value);
  if (!credentialValid(credentials.apiKey) || !credentialValid(credentials.secret) || !credentialValid(credentials.passphrase)) {
    throw new UsageError('Configure as credenciais OKX Web3 completas no ambiente do processo.');
  }
  return { source: 'okx_authenticated', chainIndex, tokenA, tokenB, amountAtomic,
    policy: { maxElapsedMs: 5000, maxImpactMagnitudePercent: 1 },
    client: createOkxDexReadOnlyClient({ credentials: { apiKey: credentials.apiKey, secret: credentials.secret, passphrase: credentials.passphrase }, now: okxNow }) };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Consulta DEX somente leitura. Sem argumentos: exemplo sintético, sem acesso à rede.\n' +
      'Consulta autenticada: --live --chain REDE --token-a CONTRATO --token-b CONTRATO --decimals-a N --decimals-b N ' +
      '--metadata-source-a ORIGEM --metadata-source-b ORIGEM --amount-atomic INTEIRO\n' +
      'Credenciais do processo: OKX_WEB3_API_KEY, OKX_WEB3_API_SECRET, OKX_WEB3_API_PASSPHRASE.\n' +
      'Autenticado: até dois GETs, cobertura e uma quote bruta; unidade da saída não qualificada, sem quote dependente.\n' +
      'Sem retry. Cotações não comprovam execução nem lucro líquido.');
    return;
  }
  const live = args.length > 0 ? liveInput(args) : null; // validates the scope and the credentials before any network
  if (live) await syncOkxClock(); // OKX refuses a signature more than 30 s off its clock
  const report = live ? await quoteRoundTrip(live) : createSyntheticRoundTripReport();
  console.log(JSON.stringify(report, null, 2));
}
if (import.meta.main) main().catch(error => { console.error(error instanceof UsageError ? error.message : 'Falha na consulta DEX.'); process.exitCode = 1; });
