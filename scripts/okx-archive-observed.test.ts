import { expect, test } from 'bun:test';
import { runArchiveDiscoveryCli } from './okx-archive-discovery.ts';
import type { FetchLike } from '../src/onchainos/http.ts';

const args = ['--module','4','--inst-type','SPOT','--instruments','BTC-USDT','--aggregation','daily','--begin','1790812800000','--end','1790812800000'];
const qualification = { historicalCoverage:'unknown', rights:'unknown', fileAccess:'unknown', fileSchema:'unknown', executionAvailability:'unknown', strategyQualified:false, financiallyAuthorized:false };
const archiveUrl = 'https://static.okx.com/cdn/okx/match/orderbook/pro/L2/400lv/daily/20261001/BTC-USDT-L2orderbook-400lv-2026-10-01.tar.gz';

test('AC05: CLI prints intact retained L2 metadata through one injected metadata request', async () => {
  const retained = await Bun.file(new URL('../src/onchainos/fixtures/market-data-history-l2-20261001.json', import.meta.url)).text();
  const calls: string[] = [], stdout: string[] = [], stderr: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push(url);
    expect(new URL(url).pathname).toBe('/api/v5/public/market-data-history');
    expect(init).toMatchObject({ method:'GET', headers:{}, redirect:'error', cache:'no-store' });
    return { status:200, text:async()=>retained };
  };
  expect(await runArchiveDiscoveryCli([...args,'--public'], { fetch, now:()=>1800000000000, sleep:async()=>{}, stdout:text=>{stdout.push(text);}, stderr:text=>{stderr.push(text);} })).toBe(0);
  expect(calls).toHaveLength(1);
  expect(calls).not.toContain(archiveUrl);
  expect(stderr).toEqual([]);
  expect(stdout).toHaveLength(1);
  const result=JSON.parse(stdout[0]!);
  expect(result.mode).toBe('public_metadata');
  expect(result.providerTimestampMs).toBe(1791748303027);
  expect(result.files).toHaveLength(1);
  expect(result.files[0]).toMatchObject({ filename:'BTC-USDT-L2orderbook-400lv-2026-10-01.tar.gz', url:archiveUrl, sizeMB:'109.26', dateTimestampMs:1790812800000 });
  expect(result.qualification).toEqual(qualification);
});

test('AC05: the same L2 CLI arguments remain a default dry run with zero fetch calls', async () => {
  let calls=0;
  const stdout: string[]=[], stderr: string[]=[];
  const fetch: FetchLike=async()=>{calls++; throw new Error('unexpected fetch');};
  expect(await runArchiveDiscoveryCli(args, { fetch, now:()=>1800000000000, sleep:async()=>{}, stdout:text=>{stdout.push(text);}, stderr:text=>{stderr.push(text);} })).toBe(0);
  expect(calls).toBe(0);
  expect(stderr).toEqual([]);
  expect(stdout).toHaveLength(1);
  expect(JSON.parse(stdout[0]!)).toMatchObject({ mode:'dry_run', networkEnabled:false, qualification, request:{ query:{ module:'4',instType:'SPOT',instIdList:'BTC-USDT' } } });
});
