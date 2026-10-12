/**
 * Cache and persistence of wallet evidence over the EXISTING file port `CaptureFs` (src/onchainos/capture-types.ts), so the
 * same atomic write the capture recorder uses applies here and tests can use the in-memory port.
 *
 *  - one file per (account hash, request fingerprint) holds the LATEST evidence, written atomically;
 *  - an append-only journal keeps one small line per write, with a size cap and one rotated file;
 *  - a late or conflicting revision never replaces a newer one (RC5);
 *  - a file whose hash does not verify is ignored on read, never trusted.
 *
 * The file holds contracts and quantities but NOT the account address (only its hash). It lives under the ignored `data/`
 * directory by default of the CLI, and persistence is opt-in there.
 */

import type { CaptureFs } from "../onchainos/capture-types.ts";
import { verifyEvidence } from "./evidence.ts";
import { compareRevision } from "./reconcile.ts";
import type { Finding, WalletEvidence } from "./types.ts";

export const DEFAULT_MAX_JOURNAL_BYTES = 1_048_576;
export const MAX_EVIDENCE_BYTES = 8_388_608;

export interface PutResult {
  readonly written: boolean;
  /** Set when the write was refused (RC5). */
  readonly finding: Finding | null;
  readonly replacedCorrupt: boolean;
}

export interface EvidenceStore {
  put(evidence: WalletEvidence, fingerprint: string): PutResult;
  /** The latest evidence for this account and request, or null if absent, unreadable or altered. */
  latest(accountSha256: string, fingerprint: string): WalletEvidence | null;
}

export interface StoreOptions {
  readonly fs: CaptureFs;
  readonly dir: string;
  readonly maxJournalBytes?: number;
}

function safeName(part: string): string {
  if (!/^[0-9a-f]{16,64}$/.test(part)) throw new Error("identificador de armazenamento inválido");
  return part.slice(0, 16);
}

export function createEvidenceStore(options: StoreOptions): EvidenceStore {
  const { fs, dir } = options;
  const maxJournal = options.maxJournalBytes ?? DEFAULT_MAX_JOURNAL_BYTES;
  const pathFor = (accountSha256: string, fingerprint: string): string => `${dir}/evidence-${safeName(accountSha256)}-${safeName(fingerprint)}.json`;
  const journalPath = `${dir}/journal.jsonl`;
  const rotatedPath = `${dir}/journal.1.jsonl`;

  function read(path: string): { evidence: WalletEvidence | null; present: boolean } {
    if (!fs.exists(path)) return { evidence: null, present: false };
    try {
      if (fs.size(path) > MAX_EVIDENCE_BYTES) return { evidence: null, present: true };
      const parsed = JSON.parse(Buffer.from(fs.readBytes(path)).toString("utf8")) as WalletEvidence;
      return { evidence: verifyEvidence(parsed) ? parsed : null, present: true };
    } catch {
      return { evidence: null, present: true };
    }
  }

  function journal(evidence: WalletEvidence, fingerprint: string): void {
    const line = `${JSON.stringify({ evidenceId: evidence.evidenceId, contentSha256: evidence.contentSha256, generatedAtMs: evidence.generatedAtMs, revision: evidence.revision, status: evidence.status, origin: evidence.origin, key: fingerprint.slice(0, 16) })}\n`;
    if (!fs.exists(journalPath)) {
      fs.writeAtomic(journalPath, line);
      return;
    }
    if (fs.size(journalPath) + Buffer.byteLength(line, "utf8") > maxJournal) {
      fs.writeAtomic(rotatedPath, Buffer.from(fs.readBytes(journalPath)).toString("utf8"));
      fs.truncate(journalPath, 0);
    }
    fs.append(journalPath, line);
  }

  return {
    latest: (accountSha256, fingerprint) => read(pathFor(accountSha256, fingerprint)).evidence,

    put(evidence, fingerprint) {
      if (!verifyEvidence(evidence)) throw new Error("evidência com hash inválido não é gravada");
      const path = pathFor(evidence.accountRef.sha256, fingerprint);
      const previous = read(path);
      const finding = compareRevision(previous.evidence, evidence);
      if (finding !== null) return { written: false, finding, replacedCorrupt: false };
      fs.mkdirp(dir);
      fs.writeAtomic(path, JSON.stringify(evidence));
      journal(evidence, fingerprint);
      return { written: true, finding: null, replacedCorrupt: previous.present && previous.evidence === null };
    },
  };
}
