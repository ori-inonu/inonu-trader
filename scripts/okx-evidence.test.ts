import { expect, setDefaultTimeout, test } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { collectSignals } from '../src/okx-signals/report';
import { createSyntheticSignalsClient, SYNTHETIC_SIGNALS_TIME_MS } from '../src/okx-signals/fixture';
import { scanOpportunities } from '../src/okx-market/okx-scan';
import { createSyntheticOkxClient, SYNTHETIC_SCAN_TIME_MS, SYNTHETIC_PROTOCOL_ID } from '../src/okx-market/okx-fixture';
import { DEFAULT_RESEARCH_POLICY } from '../src/okx-market/okx-opportunities';

// Each run starts a child bun process that contends for CPU with the rest of the suite; a child killed by its own
// timeout reports a null exit. The child budget and the per test budget are generous so load cannot fail the test.
// This integration test supervises a real OS child; fake JavaScript timers cannot model its deadline.
const CHILD_TIMEOUT_MS = 45000;
setDefaultTimeout(120_000);
const script = resolve(import.meta.dir, 'okx-evidence.ts');
async function run(args: string[] = [], env: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, '--no-env-file', script, ...args], { cwd: resolve(import.meta.dir, '..'), env: { SystemRoot: process.env.SystemRoot ?? 'C:/Windows', PATH: process.env.PATH ?? '', ...env }, stdout: 'pipe', stderr: 'pipe' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { child.kill(); reject(new Error(`OKX Evidence child exceeded ${CHILD_TIMEOUT_MS}ms deadline`)); }, CHILD_TIMEOUT_MS); });
    const [exit, out, err] = await Promise.race([
      Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]),
      timeout,
    ]);
    return { exit, out, err };
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
async function failure(args: string[], code: string) { const child = await run(args); expect(child.exit).toBe(1); expect(child.out).toBe(''); expect(child.err.trim()).toBe(`OKX Evidence: ${code}`); }

test('CLI demo is deterministic, preserves fixture clocks and remains unqualified without network', async () => {
  const first = await run(); const second = await run([], { OKX_WEB3_API_KEY: 'DO-NOT-EXPORT', OKX_WEB3_API_SECRET: 'DO-NOT-EXPORT', HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1' });
  expect(first.exit).toBe(0); expect(first.err).toBe(''); expect(second.exit).toBe(0); expect(first.out).toBe(second.out);
  const report = JSON.parse(first.out); expect(report.schema).toBe('okx_evidence_offline_v1'); expect(report.comparedAtMs).toBe(SYNTHETIC_SIGNALS_TIME_MS); expect(report.rows).toHaveLength(3);
  expect(report.rows.every((r: any) => r.scanner.startedAtMs === SYNTHETIC_SCAN_TIME_MS && r.scanner.reportFreshness === 'stale' && r.scanner.assessment.status === 'blocked' && r.execution === 'not_qualified')).toBe(true);
  expect(first.out).not.toContain('DO-NOT-EXPORT'); expect(report.netReturnUsd).toBeNull(); expect(report.observedApiCostUsd).toBeNull();
});

test('validates all flags before opening files and exposes isolated help', async () => {
  for (const args of [['--live'], ['--unknown'], ['--help', '--scan', 'DO-NOT-EXPORT'], ['--signals', 'missing'], ['--signals', 'missing', '--scan', 'missing', '--max-age-ms', '0'], ['--signals', 'missing', '--scan', 'missing', '--max-age-ms', '3600001'], ['--signals', 'missing', '--scan', 'missing', '--max-age-ms', '1.5'], ['--signals', 'missing', '--scan', 'missing', '--max-age-ms', '1', '--signals', 'again']]) await failure(args, 'invalid_input');
  const help = await run(['--help']); expect(help.exit).toBe(0); expect(help.err).toBe(''); expect(help.out).toContain('--max-age-ms');
});

test('imports only bounded regular UTF8 JSON files with finite errors and a whitelist', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gev-evidence-test-'));
  try {
    const signal = await collectSignals({ client: createSyntheticSignalsClient(), query: { chainIndex: '56', walletTypes: ['1', '2', '3'], limit: 3 }, now: () => SYNTHETIC_SIGNALS_TIME_MS, source: 'synthetic' });
    const scan = await scanOpportunities({ client: createSyntheticOkxClient(), chainIndex: '56', stage: 'NEW', protocolId: SYNTHETIC_PROTOCOL_ID, limit: 3, policy: DEFAULT_RESEARCH_POLICY, now: () => SYNTHETIC_SCAN_TIME_MS, source: 'synthetic' });
    const signalsPath = join(dir, 'signals.json'), scanPath = join(dir, 'scan.json'), badPath = join(dir, 'DO-NOT-EXPORT.json');
    writeFileSync(signalsPath, '\uFEFF' + JSON.stringify({ ...signal, secret: 'DO-NOT-EXPORT', source: 'okx_authenticated' })); writeFileSync(scanPath, JSON.stringify(scan));
    const args = ['--signals', signalsPath, '--scan', scanPath, '--max-age-ms', '60000'];
    const child = await run(args); expect(child.exit).toBe(0); expect(child.err).toBe(''); const output = JSON.parse(child.out); expect(output.rows[0].signals[0].sourceClaim).toBe('okx_authenticated'); expect(output.provenance).toBe('unverified'); expect(child.out).not.toContain('DO-NOT-EXPORT');
    const badArgs = ['--signals', badPath, '--scan', scanPath, '--max-age-ms', '60000'];
    await failure(badArgs, 'file_error'); writeFileSync(badPath, '{DO-NOT-EXPORT'); await failure(badArgs, 'invalid_report');
    writeFileSync(badPath, Buffer.from([0xff, 0xfe])); await failure(badArgs, 'invalid_report');
    writeFileSync(badPath, Buffer.alloc(1024 * 1024 + 1)); await failure(badArgs, 'file_error');
    writeFileSync(badPath, '{}'); await failure(badArgs, 'invalid_report');
    await failure(['--signals', dir, '--scan', scanPath, '--max-age-ms', '1'], 'file_error');
    for (const file of ['https://DO-NOT-EXPORT', 'file://DO-NOT-EXPORT', '\\\\DO-NOT-EXPORT\\file', 'NUL', 'CON.json', 'signals.json:DO-NOT-EXPORT']) await failure(['--signals', file, '--scan', scanPath, '--max-age-ms', '1'], 'invalid_input');
  } finally { for (const name of ['signals.json', 'scan.json', 'DO-NOT-EXPORT.json']) rmSync(join(dir, name), { force: true }); rmdirSync(dir); }
});
