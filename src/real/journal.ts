import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, statSync, truncateSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { RealCycle } from './runtime-types';

const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const INSPECTION_LIMIT_BYTES = 20_000_000;
const validCycle = (cycle: RealCycle | undefined, sequence: number) => Boolean(cycle && typeof cycle.id === 'string' && cycle.id.length && cycle.sequence === sequence && cycle.mode === 'paper' && cycle.executionEnabled === false && cycle.realizedPnlUsd === null && Number.isFinite(cycle.startedAtMs) && Number.isFinite(cycle.finishedAtMs) && cycle.finishedAtMs >= cycle.startedAtMs && cycle.decision?.choice === 'hold' && ['ready', 'blocked', 'error'].includes(cycle.decision.status) && typeof cycle.decision.called === 'boolean' && Array.isArray(cycle.decision.reasons) && cycle.decision.reasons.every(reason => typeof reason === 'string') && (cycle.reservationOnly === undefined || cycle.reservationOnly === true));

export function openRealJournal(inputPath: string) {
  const path = resolve(inputPath);
  mkdirSync(dirname(path), { recursive: true });
  const lock = `${path}.lock`;
  const owner = JSON.stringify({ pid: process.pid, id: randomUUID() });
  let fd: number;
  try { fd = openSync(lock, 'wx'); } catch { throw new Error('Real journal already owned; inspect the recorded process before recovering a stale lock'); }
  writeFileSync(fd, owner);
  closeSync(fd);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (existsSync(lock) && readFileSync(lock, 'utf8') === owner) unlinkSync(lock);
  };
  try {
    const history: RealCycle[] = [];
    if (existsSync(path) && statSync(path).size > INSPECTION_LIMIT_BYTES) throw new Error('Real journal exceeds inspection limit; preserve its consumption reservations before archiving');
    const bytes = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
    const lastNewline = bytes.lastIndexOf(10);
    const prefix = bytes.subarray(0, lastNewline + 1);
    const tail = bytes.subarray(lastNewline + 1);
    for (const line of prefix.toString('utf8').split('\n').filter(Boolean)) {
      let record: { version?: number; checksum?: string; cycle?: RealCycle };
      try { record = JSON.parse(line); } catch { throw new Error('Real journal integrity failure'); }
      const cycle = record.cycle;
      if (!cycle || record.version !== 1 || record.checksum !== digest(JSON.stringify(cycle)) || !validCycle(cycle, history.length + 1)) throw new Error('Real journal integrity failure');
      history.push(cycle);
    }
    // A valid complete prefix is immutable; preserve the exact torn bytes before truncating.
    if (tail.length) {
      writeFileSync(`${path}.torn-${randomUUID()}`, tail, { flag: 'wx' });
      truncateSync(path, prefix.length);
    }
    return {
      path, history, recoveredTailBytes: tail.length,
      append(cycle: RealCycle) {
        if (closed) throw new Error('Real journal closed');
        if (!validCycle(cycle, history.length + 1)) throw new Error('Invalid real journal append');
        const serialized = JSON.stringify(cycle);
        const entry = JSON.stringify({ version: 1, checksum: digest(serialized), cycle }) + '\n';
        if ((existsSync(path) ? statSync(path).size : 0) + Buffer.byteLength(entry, 'utf8') > INSPECTION_LIMIT_BYTES) throw new Error('Real journal inspection limit would be exceeded; preserve the valid prefix and consumption reservations');
        const handle = openSync(path, 'a');
        try { appendFileSync(handle, entry); fsyncSync(handle); } finally { closeSync(handle); }
        history.push(structuredClone(cycle));
      },
      close,
    };
  } catch (error) { close(); throw error; }
}

export type RealJournal = ReturnType<typeof openRealJournal>;
