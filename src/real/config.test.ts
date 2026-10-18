import { expect, test } from 'bun:test';
import { loadRealConfig, publicRealConfig } from './config';

test('a standalone paper runtime remains diagnosable without Kuru or Web3 keys', () => {
  const config = loadRealConfig({ MODEL: 'jev', PRIVATE_KEY: 'broken' });
  const view = publicRealConfig(config);
  expect(view.mode).toBe('paper');
  expect(view.services.onchainos.missing).toEqual(['OKX_WEB3_API_KEY', 'OKX_WEB3_API_SECRET', 'OKX_WEB3_API_PASSPHRASE']);
  expect(view.executionEnabled).toBe(false);
});

test('public configuration never exposes secrets or grants application consumption by key presence', () => {
 const view = publicRealConfig(loadRealConfig({ OKX_WEB3_API_KEY: 'api-secret', OKX_WEB3_API_SECRET: 'hmac-secret', OKX_WEB3_API_PASSPHRASE: 'pass-secret', TYPESAFE_AI_API_KEY: 'jev-secret' }));
 expect(view.services.onchainos.access).toBe('unverified');
 expect(view.services.jev.authorized).toBe(false);
 expect(JSON.stringify(view)).not.toContain('secret');
 expect(() => loadRealConfig({ REAL_INTERVAL_MS: 'NaN' })).toThrow();
 expect(() => loadRealConfig({ REAL_DASHBOARD_ORIGINS: 'https://outside.example' })).toThrow();
 expect(() => loadRealConfig({ REAL_AMOUNT: '0' })).toThrow();
});

test('effective quote units and RPC recipients are inspectable before wallet consent', () => {
 const config=loadRealConfig({REAL_FROM_TOKEN:'0x'+'1'.repeat(40),REAL_TO_TOKEN:'0x'+'2'.repeat(40),REAL_AMOUNT:'9007199254740993',REAL_SLIPPAGE_PERCENT:'0.5',REAL_INTERVAL_MS:'15000'});
 const view=publicRealConfig(config);
 expect(view.effectiveConfig.quotePair).toEqual(config.pair ?? null);
 expect(view.effectiveConfig.intervalMs).toBe(15000);
 expect(view.effectiveConfig.rpcRecipients).toEqual([{chainIndex:'196',origin:'https://rpc.xlayer.tech'},{chainIndex:'143',origin:'https://rpc.monad.xyz'}]);
 expect(view.effectiveConfig.quotePair?.amount).toBe('9007199254740993');
});
