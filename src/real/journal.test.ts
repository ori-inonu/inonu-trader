import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRealJournal } from './journal';

test('paper journal survives restart, blocks a second writer and recovers only a torn final append', () => {
  const dir = mkdtempSync(join(tmpdir(), 'real-journal-'));
  const path = join(dir, 'cycles.jsonl');
  try {
    const first = openRealJournal(path);
    const cycle = { id: 'cycle-1', sequence: 1, startedAtMs: 1, finishedAtMs: 2, mode: 'paper' as const, core: null, decision: { choice: 'hold', status: 'blocked' as const, model: null, latencyMs: null, inputTokens: null, costUsd: null, called: false, reasons: ['consent absent'] }, realizedPnlUsd: null, executionEnabled: false as const };
    first.append(cycle);
    expect(() => first.append({ ...cycle, sequence: 2, finishedAtMs: NaN })).toThrow('Invalid');
    expect(() => first.append({ ...cycle, sequence: 2, finishedAtMs: 0 })).toThrow('Invalid');
    expect(() => openRealJournal(path)).toThrow('already owned');
    first.close();
    appendFileSync(path, '{"torn":');
    const second = openRealJournal(path);
    expect(second.history).toEqual([cycle]);
    expect(second.recoveredTailBytes).toBe(8);
    expect(readFileSync(path, 'utf8').endsWith('\n')).toBe(true);
    second.close();
    const contents = readFileSync(path, 'utf8');
    appendFileSync(path, contents.replace('consent absent', 'tampered'));
    expect(() => openRealJournal(path)).toThrow('integrity');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an oversized append is rejected before disk/history mutation and the valid prefix can restart', () => {
 const dir = mkdtempSync(join(tmpdir(), 'real-journal-size-')), path = join(dir, 'cycles.jsonl');
 try {
  const journal = openRealJournal(path);
  const cycle = { id: 'valid', sequence: 1, startedAtMs: 1, finishedAtMs: 2, mode: 'paper' as const, core: null, decision: { choice: 'hold' as const, status: 'blocked' as const, model: null, latencyMs: null, inputTokens: null, costUsd: null, called: false, reasons: ['known prefix'] }, realizedPnlUsd: null, executionEnabled: false as const };
  journal.append(cycle); const before = readFileSync(path);
  expect(() => journal.append({ ...cycle, sequence: 2, decision: { ...cycle.decision, reasons: ['á'.repeat(10_000_000)] } })).toThrow('inspection limit');
  expect(readFileSync(path).equals(before)).toBe(true); expect(journal.history).toEqual([cycle]);
  journal.close(); const reopened = openRealJournal(path); expect(reopened.history).toEqual([cycle]); reopened.close();
 } finally { rmSync(dir, { recursive: true, force: true }); }
});
