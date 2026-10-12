import { expect, test } from 'bun:test';
import { capabilityCatalog } from './capabilities';
import { loadRealConfig } from './config';

test('readiness lists independent families before wallet consent without manufacturing exercise', () => {
 const rows = capabilityCatalog(loadRealConfig({}), null, null);
 for (const network of ['196', '143']) {
  expect(new Set(rows.filter(row => row.chainIndex === network).map(row => row.family))).toEqual(new Set(['market', 'balance', 'dex', 'simulation', 'defi', 'signals']));
 }
 expect(rows.every(row => !row.exercisedReal && !row.financiallyQualified)).toBe(true);
 expect(rows.find(row => row.family === 'funding')).toMatchObject({ chainIndex: 'exchange', source: 'okx-public-v5', integrated: true, status: 'blocked' });
 expect(rows.filter(row => row.family === 'signals').some(row => row.endpoint?.endsWith('leaderboard/list'))).toBe(true);
 expect(rows.filter(row => row.family === 'defi').every(row => row.implemented)).toBe(true);
 expect(rows.filter(row => row.family === 'defi' && row.endpoint?.endsWith('supported-chains')).every(row => row.integrated && !row.exercisedReal)).toBe(true);
 expect(rows.filter(row => row.family === 'defi' && row.endpoint?.endsWith('search')).every(row => !row.integrated)).toBe(true);
 expect(rows.filter(row => row.family === 'simulation').every(row => !row.implemented)).toBe(true);
});

test('configured keys do not prove access; a real public receipt preserves blocked freshness', () => {
 const config = loadRealConfig({ OKX_WEB3_API_KEY: 'key', OKX_WEB3_API_SECRET: 'secret', OKX_WEB3_API_PASSPHRASE: 'pass' });
 const rows = capabilityCatalog(config, null, { id: 'funding.public-btc', family: 'funding', source: 'okx-public-v5', documented: true, implemented: true, exercisedReal: true, integrated: true, financiallyQualified: false, status: 'blocked', reason: 'clock-future', nextRequirement: 'clock-proof' });
 expect(rows.filter(row => row.source === 'onchainos-rest-v6').every(row => row.status !== 'ready' && !row.exercisedReal)).toBe(true);
 expect(rows.find(row => row.family === 'funding')).toMatchObject({ exercisedReal: true, status: 'blocked', reason: 'clock-future', financiallyQualified: false });
 expect(JSON.stringify(rows)).not.toContain('secret');
});
