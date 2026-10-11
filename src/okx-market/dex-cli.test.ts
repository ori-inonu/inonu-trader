import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve(import.meta.dir, '../../scripts/okx-dex-quote.ts');
function run(args: string[], credentials: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'inonu-dex-cli-'));
  const marker = join(directory, 'network-called');
  const guard = join(directory, 'guard.ts');
  writeFileSync(guard, `import { writeFileSync } from 'node:fs'; globalThis.fetch = async () => { writeFileSync(${JSON.stringify(marker)}, 'attempted'); throw new Error('network forbidden in offline test'); };`);
  writeFileSync(join(directory, '.env'), 'OKX_WEB3_API_KEY=ENV_FILE_SENTINEL\nOKX_WEB3_API_SECRET=ENV_FILE_SENTINEL\nOKX_WEB3_API_PASSPHRASE=ENV_FILE_SENTINEL');
  try {
    // The child budget is the repo test timeout, not an ad hoc 10s: this spawn contends for CPU with the
    // rest of the suite, and a child killed by its own timeout reports ETIMEDOUT as a bare error instead of
    // the assertion that actually matters.
    const result = spawnSync(process.execPath, ['--no-env-file', '--preload', guard, script, ...args], {
      cwd: directory, env: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', ...credentials }, encoding: 'utf8', timeout: 30000 });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, networkCalled: existsSync(marker), error: result.error };
  } finally {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + '\\') && !resolve(directory).startsWith(resolve(tmpdir()) + '/')) throw new Error('Unsafe temporary directory');
    rmSync(directory, { recursive: true, force: true });
  }
}

test('DEX CLI defaults to synthetic paired quotes without fetch or credential dependencies', () => {
  const result = run([]);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.networkCalled).toBe(false);
  const report = JSON.parse(result.stdout);
  expect(report.source).toBe('synthetic');
  expect(report.status).toBe('quoted_gross_delta');
  expect(report.quotedGrossDeltaAtomic).toBe('-5000');
  expect(report.netAtomic).toBeNull();
  expect(report.costsCoverage).toBe('unknown');
  expect(report.liveQualified).toBe(false);
  expect(report.execution).toBe('not_qualified');
  expect(report.costUsd).toBeNull();
  expect(report.quotaRemaining).toBeNull();
  expect(report.legs).toHaveLength(2);
  expect(result.stdout).not.toContain('ENV_FILE_SENTINEL');
});

test('live DEX scope and complete credentials are mandatory before any fetch', () => {
  const scope = ['--live', '--chain', '1', '--token-a', '0xAa', '--token-b', '0xBb', '--decimals-a', '18', '--decimals-b', '6',
    '--metadata-source-a', 'public-catalog', '--metadata-source-b', 'public-catalog', '--amount-atomic', '9007199254740993'];
  const absent = run(scope);
  expect(absent.status).toBe(1);
  expect(absent.stderr).toContain('credenciais OKX Web3 completas');
  expect(absent.networkCalled).toBe(false);
  expect(absent.stdout).toBe('');
  const partial = run(scope, { OKX_WEB3_API_KEY: 'KEY_SENTINEL' });
  expect(partial.status).toBe(1);
  expect(partial.networkCalled).toBe(false);
  expect(partial.stderr).not.toContain('SENTINEL');
  const keys = { OKX_WEB3_API_KEY: 'KEY_SENTINEL', OKX_WEB3_API_SECRET: 'SECRET_SENTINEL', OKX_WEB3_API_PASSPHRASE: 'PASSPHRASE_SENTINEL' };
  const badScopes = [ ['--live'], scope.slice(0, -2), [...scope, '--live'], [...scope, '--chain', '56'],
    [...scope, '--wallet', 'WALLET_SENTINEL'], [...scope.slice(0, -1), '0'], [...scope.slice(1)],
    scope.map((value, i) => i === 8 ? '256' : value), scope.map((value, i) => i === 4 ? 'bad address' : value),
    scope.map((value, i) => i === 12 ? '' : value), scope.map((value, i) => i === 2 ? '1&wallet=SECRET' : value) ];
  for (const args of badScopes) {
    const result = run(args, keys);
    expect(result.status).toBe(1);
    expect(result.networkCalled).toBe(false);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toContain('SENTINEL');
  }
  const help = run(['--help'], keys);
  expect(help.status).toBe(0);
  expect(help.networkCalled).toBe(false);
  expect(help.stdout).toContain('somente leitura');
});

test('CLI duplicate-token validation follows chain-aware address identity without credentials', () => {
  const scope = (chain: string, tokenA: string, tokenB: string) => ['--live', '--chain', chain, '--token-a', tokenA, '--token-b', tokenB,
    '--decimals-a', '18', '--decimals-b', '6', '--metadata-source-a', 'public-catalog', '--metadata-source-b', 'public-catalog',
    '--amount-atomic', '1'];
  const cases = [
    { chain: '1', tokenA: '0xAbCd', tokenB: '0xabcd', expected: 'Rede, tokens ou quantidade atômica inválidos.' },
    { chain: '195', tokenA: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8', tokenB: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8', expected: 'Rede, tokens ou quantidade atômica inválidos.' },
    { chain: '195', tokenA: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8', tokenB: 'tjrabprwbzy45sbavfcjinpjc18kjprtv8', expected: 'Configure as credenciais OKX Web3 completas' },
    { chain: '999999', tokenA: 'UnknownAaCase', tokenB: 'unknownaacase', expected: 'Configure as credenciais OKX Web3 completas' },
  ];
  for (const item of cases) {
    const result = run(scope(item.chain, item.tokenA, item.tokenB));
    expect(result.status).toBe(1);
    expect(result.networkCalled).toBe(false);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(item.expected);
    expect(result.stderr).not.toContain('SENTINEL');
  }
});