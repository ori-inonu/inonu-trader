import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const script = resolve(import.meta.dir, 'okx-signals.ts');
function run(args: string[] = [], environment: Record<string, string> = {}) {
  const child = Bun.spawnSync([process.execPath, '--no-env-file', script, ...args], {
    cwd: resolve(import.meta.dir, '..'), env: { SystemRoot: process.env.SystemRoot ?? 'C:/Windows', PATH: process.env.PATH ?? '', ...environment },
    stdout: 'pipe', stderr: 'pipe', timeout: 5000,
  });
  return { exit: child.exitCode, out: child.stdout.toString(), err: child.stderr.toString() };
}
describe('OKX Signals command', () => {
  test('defaults to deterministic synthetic JSON without network or credentials', () => {
    const first = run();
    const second = run([], { OKX_WEB3_API_KEY: 'DO-NOT-EXPORT', OKX_WEB3_API_SECRET: 'DO-NOT-EXPORT', OKX_WEB3_API_PASSPHRASE: 'DO-NOT-EXPORT', HTTP_PROXY: 'http://127.0.0.1:1' });
    expect(first.exit).toBe(0); expect(first.err).toBe(''); expect(first.out).toBe(second.out);
    const report = JSON.parse(first.out);
    expect(report.source).toBe('synthetic'); expect(report.execution).toBe('not_qualified');
    expect(report.signals.length).toBeGreaterThan(0); expect(first.out).not.toContain('DO-NOT-EXPORT');
  });
  test('requires explicit valid live controls and complete credentials, with safe errors and empty stdout', () => {
    for (const args of [['--live'], ['--chain', '56'], ['--live', '--chain', '56', '--wallet-types', '1', '--limit', '101'], ['--live', '--chain', '56', '--wallet-types', '1,1', '--limit', '10'], ['--live', '--chain', '56', '--wallet-types', '1', '--limit', '10', '--live'], ['--unknown']]) {
      const child = run(args); expect(child.exit).toBe(1); expect(child.out).toBe(''); expect(child.err.trim()).toBe('OKX Signals: invalid_input');
    }
    const missing = run(['--live', '--chain', '56', '--wallet-types', '1', '--limit', '10']);
    expect(missing.exit).toBe(1); expect(missing.out).toBe(''); expect(missing.err.trim()).toBe('OKX Signals: invalid_input');
    const help = run(['--help']); expect(help.exit).toBe(0); expect(help.out).toContain('--wallet-types');
  });
});
