import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { createArchiveDiscoveryClient, normalizeArchiveRequest, parseArchiveResponse } from './archive-discovery.ts';
import { OnchainosError } from './errors.ts';
import type { FetchLike } from './http.ts';

const input = { module:'4', instType:'SPOT', instIdList:'BTC-USDT', dateAggrType:'daily', begin:'1790812800000', end:'1790812800000' };
const filename = 'BTC-USDT-L2orderbook-400lv-2026-10-01.tar.gz';
const archiveUrl = 'https://static.okx.com/cdn/okx/match/orderbook/pro/L2/400lv/daily/20261001/BTC-USDT-L2orderbook-400lv-2026-10-01.tar.gz';
// Every mutation below is an explicitly synthetic adversarial fixture, not a new provider observation.
const observed = await Bun.file(new URL('./fixtures/market-data-history-l2-20261001.json', import.meta.url)).json();
const data = () => structuredClone(observed.data);
const parse = (value: unknown, query: unknown = input) => parseArchiveResponse(value, normalizeArchiveRequest(query));
function rejected(value: unknown, query: unknown = input) {
  expect(() => parse(value, query)).toThrow(OnchainosError);
  try { parse(value, query); } catch (error) { expect((error as OnchainosError).kind).toBe('schema'); }
}

test('AC01: retained public L2 metadata is readable without qualifying or fetching its archive', async () => {
  const bytes = await Bun.file(new URL('./fixtures/market-data-history-l2-20261001.json', import.meta.url)).arrayBuffer();
  expect(bytes.byteLength).toBe(511);
  expect(createHash('sha256').update(new Uint8Array(bytes)).digest('hex')).toBe('a24a9109e655754aebd047d42f403ce4de8afaa34adbdf9423c69d8627c4f85a');
  const text = new TextDecoder().decode(bytes);
  const seen: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    seen.push(url);
    expect(new URL(url).pathname).toBe('/api/v5/public/market-data-history');
    expect(init).toMatchObject({ method:'GET', headers:{}, redirect:'error', cache:'no-store' });
    return { status:200, text:async () => text };
  };
  const result = await createArchiveDiscoveryClient({ fetch, now:()=>1800000000000, sleep:async()=>{}, allowNetwork:true }).discover(input);
  expect(result.files).toEqual([{ instId:'BTC-USDT', instFamily:'', filename, url:archiveUrl, sizeMB:'109.26', dateTimestampMs:1790812800000, dateTimestampText:'1790812800000', dateKey:'2026-10-01', timestampAlias:'dateTs' }]);
  expect(result.groups).toEqual([{ instId:'BTC-USDT', instFamily:'', instType:'SPOT', dateRangeStartMs:1790812800000, dateRangeEndMs:1790812800000, groupSizeMB:'109.26', listedFileCount:1 }]);
  expect(result.providerTimestampMs).toBe(1791748303027);
  expect(result.totalSizeMB).toBe('109.26');
  expect(result.qualification).toEqual({ historicalCoverage:'unknown', rights:'unknown', fileAccess:'unknown', fileSchema:'unknown', executionAvailability:'unknown', strategyQualified:false, financiallyAuthorized:false });
  expect(seen).toHaveLength(1);
  expect(seen).not.toContain(archiveUrl);
});

test('AC02: empty optional ccy is bounded and is never read through accessors', () => {
  const absent=data(); delete absent[0].details[0].ccy;
  expect(parse(absent).files[0]?.filename).toBe(filename);
  for (const ccy of ['USDT', null, 0, undefined, [], {}]) {
    const changed=data(); changed[0].details[0].ccy=ccy; rejected(changed);
  }
  for (const extra of ['extra', Symbol('extra')]) {
    const changed=data(); changed[0].details[0][extra]=''; rejected(changed);
  }
  let invoked=false;
  const changed=data(); Object.defineProperty(changed[0].details[0], 'ccy', { get:()=>{ invoked=true; return ''; } });
  rejected(changed); expect(invoked).toBe(false);
  const hidden=data(); Object.defineProperty(hidden[0].details[0], 'hidden', { value:'' }); rejected(hidden);
  const inherited=data(); Object.setPrototypeOf(inherited[0].details[0], { extra:'' }); rejected(inherited);
});

test('AC03: tar.gz requires module4 SPOT daily and never admits other archive kinds', () => {
  for (const module of ['1','2','5','6','11']) {
    const changed=data(); delete changed[0].details[0].ccy;
    rejected(changed,{...input,module});
  }
  for (const instType of ['SWAP','FUTURES','OPTION']) {
    const changed=data(); Object.assign(changed[0].details[0], {instId:'',instFamily:'BTC-USDT',instType}); delete changed[0].details[0].ccy;
    const {instIdList,...query}=input; rejected(changed,{...query,instType,instFamilyList:instIdList});
  }
  const monthly=data(); monthly[0].dateAggrType='monthly'; delete monthly[0].details[0].ccy;
  rejected(monthly,{...input,dateAggrType:'monthly'});
  for (const filename of ['BTC-USDT-L2orderbook-400lv-2026-10-02.tar.gz','ETH-USDT-L2orderbook-400lv-2026-10-01.tar.gz','BTC-USDT-L2orderbook-50lv-2026-10-01.tar.gz','BTC-USDT-L2orderbook-400lv-2026-10-01.gz','BTC-USDT-L2orderbook-400lv-2026-10-01.tar.gz.zip']) {
    const changed=data(); Object.assign(changed[0].details[0].groupDetails[0], {filename,url:archiveUrl.slice(0,archiveUrl.lastIndexOf('/')+1)+filename}); rejected(changed);
  }
});

test('AC03: directory and basename must match the validated UTC date and instrument', () => {
  for (const url of [archiveUrl.replace('/20261001/','/20261002/'),archiveUrl.replace('/400lv/','/50lv/'),archiveUrl.replace('/daily/','/monthly/'),archiveUrl.replace('/pro/L2/','/L2/'),archiveUrl.replace('/20261001/','/20261001/extra/'),archiveUrl.replace('/20261001/','/'),archiveUrl.replace('BTC-USDT-L2','ETH-USDT-L2'),archiveUrl.replace('/cdn/okx/match/orderbook/pro/L2/400lv/daily/20261001/','/cdn/okex/traderecords/'),archiveUrl.replace('/orderbook/','/trades/')]) {
    const changed=data(); changed[0].details[0].groupDetails[0].url=url; rejected(changed);
  }
  const nextDay=data(); Object.assign(nextDay[0].details[0],{dateRangeStart:'1790899200000',dateRangeEnd:'1790899200000'}); nextDay[0].details[0].groupDetails[0].dateTs='1790899200000';
  rejected(nextDay,{...input,begin:'1790899200000',end:'1790899200000'});
});

test('AC04: new location preserves canonical URL and object safety guards', () => {
  for (const url of [archiveUrl.replace('https:','http:'),archiveUrl.replace('static.okx.com','static.okx.com.evil.test'),archiveUrl.replace('static.okx.com','user@static.okx.com'),archiveUrl.replace('static.okx.com','user:pass@static.okx.com'),archiveUrl.replace('static.okx.com','static.okx.com:443'),archiveUrl+'?x=1',archiveUrl+'#x',archiveUrl+' ',archiveUrl+'\n',archiveUrl.replace('/daily/','/../daily/'),archiveUrl.replace('/daily/','/./daily/'),archiveUrl.replace('/daily/','/%2e%2e/daily/'),archiveUrl.replace('/daily/','/%252e%252e/daily/'),archiveUrl.replace('/daily/','\\daily/'),archiveUrl.replace('/daily/','//daily/'),archiveUrl.replace('https://static','HTTPS://static')]) {
    const changed=data(); changed[0].details[0].groupDetails[0].url=url; rejected(changed);
  }
  const duplicate=data(); duplicate[0].details[0].groupDetails.push(structuredClone(duplicate[0].details[0].groupDetails[0])); rejected(duplicate);
  const groups=data(); groups[0].details=Array.from({length:101},()=>structuredClone(groups[0].details[0])); rejected(groups);
  const files=data(); files[0].details[0].groupDetails=Array.from({length:2001},()=>null); rejected(files);
});

test('AC05: retained metadata does not enable network by default', async () => {
  let calls=0;
  const fetch: FetchLike=async()=>{ calls++; throw new Error('unexpected fetch'); };
  await expect(createArchiveDiscoveryClient({fetch,now:()=>1800000000000,sleep:async()=>{}}).discover(input)).rejects.toMatchObject({kind:'offline'});
  expect(calls).toBe(0);
});
