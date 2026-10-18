import { endpoint } from '../onchainos/endpoints';
import type { RealConfig } from './config';
import type { Capability, SanitizedCoreSample } from './types';

type PublicCapability = Omit<Capability, 'chainIndex' | 'endpoint'>;

/** Readiness is available before identity consent. Documentation and keys never prove access. */
export function capabilityCatalog(config: RealConfig, core: SanitizedCoreSample | null, publicCapability: PublicCapability | null): Capability[] {
 const rows: Capability[] = [];
 for (const chainIndex of ['196', '143']) {
  const dependency = config.credentials ? 'Conectar carteira, autorizar consultas e comprovar acesso por família/rede.' : 'Credenciais Web3 ausentes; acesso e suporte por rede não comprovados.';
  const definitions = [
   { family: 'market', path: endpoint('market.price.price').path, integrated: true, implemented: true, reason: dependency },
   { family: 'balance', path: '/api/v6/dex/balance/all-token-balances-by-address', integrated: true, implemented: true, reason: dependency },
   { family: 'dex', path: '/api/v6/dex/aggregator/quote', integrated: true, implemented: true, reason: dependency },
   { family: 'simulation', path: '/api/v6/dex/pre-transaction/simulate', integrated: false, implemented: false, reason: 'Whitelist, método e contrato de simulação ainda não qualificados.' },
   { family: 'defi', path: endpoint('defi.product.search').path, integrated: false, implemented: true, reason: 'Leitura existente; integração, suporte e risco de lending não qualificados.' },
   { family: 'defi', path: endpoint('defi.product.supported-chains').path, integrated: true, implemented: true, reason: 'Consulta opcional desligada; falta qualificação real por endpoint/rede e configuração explícita.' },
   { family: 'defi', path: endpoint('defi.product.detail').path, integrated: true, implemented: true, reason: 'Consulta opcional desligada; falta investmentId e qualificação real por endpoint/rede.' },
   { family: 'signals', path: endpoint('market.signal.list').path, integrated: false, implemented: true, reason: 'Leitura existente; suporte por rede e entitlement premium desconhecidos.' },
   { family: 'signals', path: endpoint('market.leaderboard.list').path, integrated: true, implemented: true, reason: 'Consulta opcional desligada; suporte e entitlement do leaderboard desconhecidos.' },
  ] as const;
  for (const item of definitions) {
   const observed = item.integrated ? core?.capabilities.find(row => row.chainIndex === chainIndex && row.family === item.family && row.endpoint === item.path) : null;
   rows.push(observed ? structuredClone(observed) : { id: `${item.family}:${chainIndex}:${item.path}`, family: item.family, chainIndex, endpoint: item.path, source: 'onchainos-rest-v6', documented: true, implemented: item.implemented, integrated: item.integrated, exercisedReal: false, financiallyQualified: false, status: item.implemented ? 'blocked' : 'not-implemented', reason: item.reason, nextRequirement: item.reason });
  }
 }
 rows.push(publicCapability ? { ...structuredClone(publicCapability), chainIndex: 'exchange', endpoint: endpoint('public.funding-rate').path } : { id: 'funding.public-btc', family: 'funding', chainIndex: 'exchange', endpoint: endpoint('public.funding-rate').path, source: 'okx-public-v5', documented: true, implemented: true, exercisedReal: false, integrated: true, financiallyQualified: false, status: 'blocked', reason: 'Aguardando coleta pública do worker independente.', nextRequirement: 'Resposta pública real com relógio e validade comprovados.' });
 return rows;
}
