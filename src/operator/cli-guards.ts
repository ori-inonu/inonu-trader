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

/**
 * The operator wallet is dedicated: its key must not belong to the trader's account (R8 C4, R10 B1).
 * loadOperatorConfig already refuses two equal strings, but only when both variables sit in the same
 * environment, and a string compare cannot see two spellings of one key (letter case, or k and k plus
 * the order of the curve). This derives the address of each key locally (ethers, no network, nothing
 * signed) and refuses equality. With no trader key there is nothing to compare, which is the case
 * under `--env-file=.env.operator`: there only the guide's instruction to use a dedicated wallet
 * protects the trader's account. Messages never carry a key or an address.
 */
export async function assertOperatorKeyIsDedicated(operatorKey: string, traderKey: string | undefined): Promise<void> {
  if (!traderKey) return;
  const { ethers } = await import("ethers");
  const addressOf = (key: string, label: string): string => {
    try { return ethers.utils.computeAddress(key).toLowerCase(); }
    catch { throw new Error(`Cannot derive an address from ${label}; refusing to continue`); }
  };
  if (addressOf(operatorKey, "OPERATOR_PRIVATE_KEY") === addressOf(traderKey, "the trader PRIVATE_KEY"))
    throw new Error("OPERATOR_PRIVATE_KEY derives the same address as the trader PRIVATE_KEY; the operator wallet must be dedicated");
}
