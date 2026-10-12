import { statSync } from "node:fs";

/**
 * Pure guards the operator CLI (scripts/okx-operator.ts) applies to its arguments and to the files it
 * checks. They live here, away from the script, because importing the script runs it: this is what
 * lets them be tested directly instead of only through a child process. Nothing here touches the
 * network, a key or a gate.
 */

/**
 * The signed result a person types for `--reconcile <planId> <closed|failed> --realized <usd>` (R10 M2).
 * A plain decimal only, and never beyond twice the plan size limit in absolute value: one plan commits at
 * most `maxPlanUsd`, and the doubled bound leaves room for gas and for the two legs. A typo such as +42
 * instead of -0.42 would otherwise erase a loss stop that already fired.
 */
export function parseRealizedUsd(raw: string | undefined, maxPlanUsd: number): number {
  const limit = 2 * maxPlanUsd;
  const value = raw !== undefined && /^-?\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value) || Math.abs(value) > limit) {
    throw new Error(`--realized exige um valor em USD entre -${limit} e ${limit} (duas vezes o limite por plano de ${maxPlanUsd} USD), por exemplo --realized -0.42`);
  }
  // A negative zero would print as a plain zero in the note; store a plain zero.
  return value === 0 ? 0 : value;
}

/**
 * True when the STOP file (OPERATOR_KILL_SWITCH_PATH) must be treated as set. Only a clear ENOENT means
 * "absent": any other answer (EACCES, EPERM, EIO, a broken directory, an error without a code) is a
 * filesystem that cannot say, and a kill switch that cannot be read counts as set (R8 N15). existsSync
 * answers false for every error, which would let an unreadable STOP read as "not stopped".
 */
export function killSwitchPresent(path: string, stat: (path: string) => unknown = statSync): boolean {
  try {
    stat(path);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException | null)?.code !== "ENOENT";
  }
}
