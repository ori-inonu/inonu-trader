import { parseEnvelope, parsePolicy, type CliRunner } from "../agent/cli";
import { HARD_CAPS } from "../agent/gate";

export interface CloudPolicyStatus { readonly allowed: boolean; readonly checkedAtMs: number | null }

/** Additional hosted boundary; never relaxes the model, quote, binary, session, balance or core gates. */
export function createCloudPolicyRunner(inner: CliRunner): CliRunner & { status(): CloudPolicyStatus } {
  let status: CloudPolicyStatus = { allowed: false, checkedAtMs: null };
  return {
    status: () => ({ ...status }),
    async run(args, options) {
      if (args[0] !== "swap") return inner.run(args, options);
      status = { allowed: false, checkedAtMs: Date.now() };
      if (options.signal.aborted) throw new Error("comando_recusado");
      // A failure here is before the swap process even exists, so the existing executor can record a clean refusal.
      let policy = null;
      try {
        const result = await inner.run(["wallet", "status"], { ...options, timeoutMs: Math.min(options.timeoutMs, 20_000) });
        const envelope = result.exitCode === 0 && !result.timedOut ? parseEnvelope(result.stdout) : null;
        policy = envelope?.ok === true ? parsePolicy(envelope.data) : null;
      } catch { /* unreadable policy stays refused */ }
      const valid = (v: number | null, max: number, min: number) => v !== null && Number.isFinite(v) && v >= min && v <= max;
      const allowed = policy !== null && valid(policy.perTxUsd, HARD_CAPS.policyPerTxUsd, 0.01) && valid(policy.dailyTradeUsd, HARD_CAPS.policyDailyUsd, 0.01) && valid(policy.dailyTransferUsd, HARD_CAPS.policyDailyUsd, 0) && policy.transferGuarded;
      status = { allowed, checkedAtMs: Date.now() };
      if (!allowed || options.signal.aborted) throw new Error("comando_recusado");
      return inner.run(args, options);
    },
  };
}
