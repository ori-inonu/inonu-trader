import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve(import.meta.dir, '../../scripts/okx-market-scan.ts');
function run(args: string[], credentials: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'inonu-cli-'));
  const marker = join(directory, 'network-called');
  const guard = join(directory, 'guard.ts');
  writeFileSync(guard, `import { writeFileSync } from 'node:fs'; globalThis.fetch = async () => { writeFileSync(${JSON.stringify(marker)}, 'attempted'); throw new Error('network disabled in offline test'); };`);
  try {
    const result = spawnSync(process.execPath, ['--no-env-file', '--preload', guard, script, ...args], {
      cwd: directory, env: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', ...credentials },
      encoding: 'utf8', timeout: 10000,
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, networkCalled: existsSync(marker), error: result.error };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
test('CLI defaults to an explicitly synthetic finite scan with no environment or network dependency', () => {
  const result = run([]);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.networkCalled).toBe(false);
  const report = JSON.parse(result.stdout);
  expect(report.source).toBe('synthetic');
  expect(report.liveQualified).toBe(false);
  expect(report.items.map((x: { assessment: { status: string } }) => x.assessment.status)).toEqual(['research_candidate', 'blocked', 'unknown']);
  expect(report.items.every((x: { assessment: { execution: string } }) => x.assessment.execution === 'not_qualified')).toBe(true);
  expect(report.costUsd).toBeNull();
});
test('live mode rejects incomplete credentials and ambiguous or invalid scope before any network call', () => {
  const scope = ['--live', '--chain', '56', '--stage', 'NEW', '--protocol', 'actual', '--limit', '1'];
  const partial = run(scope, { OKX_WEB3_API_KEY: 'SYNTHETIC_KEY_NEVER_REAL' });
  expect(partial.status).toBe(1);
  expect(partial.networkCalled).toBe(false);
  expect(partial.stderr).toContain('credenciais OKX Web3 completas');
  expect(partial.stderr).not.toContain('SYNTHETIC_KEY_NEVER_REAL');
  expect(partial.stdout).toBe('');
  const complete = { OKX_WEB3_API_KEY: 'SYNTHETIC_KEY_NEVER_REAL', OKX_WEB3_API_SECRET: 'SYNTHETIC_SECRET_NEVER_REAL', OKX_WEB3_API_PASSPHRASE: 'SYNTHETIC_PASSPHRASE_NEVER_REAL' };
  for (const args of [ ['--live'], scope.slice(0, -2), [...scope.slice(0, -1), '31'], [...scope, '--chain', '501'], [...scope, '--wallet', 'forbidden'], ['--chain', '56'], [...scope.slice(0, -5), 'INVALID', '--protocol', 'actual', '--limit', '1'] ]) {
    const invalid = run(args, complete);
    expect(invalid.status).toBe(1);
    expect(invalid.networkCalled).toBe(false);
    expect(invalid.stdout).toBe('');
    expect(invalid.stderr).not.toContain('SYNTHETIC_SECRET_NEVER_REAL');
  }
  const help = run(['--help'], complete);
  expect(help.status).toBe(0);
  expect(help.networkCalled).toBe(false);
  expect(help.stdout).toContain('somente leitura');
});
