/**
 * The thin executable around scripts/handover-quiesce.ts (steps of docs/sdd/agente-autonomo/PASSAGEM-ARTEFATO-QUALIFICADO-20261015.md).
 * It kills nothing and registers nothing: it only reads, and, when explicitly told, calls the agent's own disconnect/run/connect routes.
 *
 *   --step plan        READ-ONLY: the preflight and the settle against the real core. No POST route is ever called.
 *   --step quiesce     disconnect, prove the drain, verify, and write the facts of the quiescent process to --facts. Needs --execute and --owner.
 *                      --allow-open-plans keeps open exit plans across the pass (a held position) instead of waiting for none; see handover-quiesce.ts.
 *   --step reconnect   reconnect on the new version from the facts file. Needs --execute and --owner.
 *
 *   bun --no-env-file run scripts/handover-run.ts --home <absolute agent data dir> --step plan
 *   bun --no-env-file run scripts/handover-run.ts --home <...> --step quiesce --execute --owner <session id> --facts <absolute file OUTSIDE the home>
 *   bun --no-env-file run scripts/handover-run.ts --home <...> --step reconnect --execute --owner <session id> --facts <the same file>
 *
 * Exit 0 only on success. A failure prints {ok:false, code, agentState, detail}: `unknown` means a mutating call may or may not have applied,
 * and then NOTHING is killed or retried by hand; read the status and the disk first. The tool timeout must allow /agent/run (up to 180 s).
 */
import { isAbsolute, relative, resolve } from "node:path";
import { diskPersisted, httpAgentCall, liveOwner, planQuiescence, QuiesceError, quiesceLiveAgent, reconnectAgent, type Deps, type Expected } from "./handover-quiesce";

/** The only session that may run the mutating steps (Codex 169: the single owner of the pass). */
export const OWNER_SESSION = "a645aa24-a0d6-487a-bc12-0ed706e0c859";

export type Step = "plan" | "quiesce" | "reconnect";

export type Parsed =
  | { readonly ok: true; readonly step: Step; readonly home: string; readonly facts: string | null; readonly allowOpenPlans: boolean }
  | { readonly ok: false; readonly error: string };

/** Pure: decides whether a command line is allowed to do what it asks. Nothing here touches the disk or the network. */
export function checkArgs(argv: readonly string[]): Parsed {
  const get = (name: string): string | null => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] ?? null) : null; };
  const has = (name: string): boolean => argv.includes(name);
  const home = get("--home");
  const step = get("--step");
  const facts = get("--facts");
  if (home === null || !isAbsolute(home)) return { ok: false, error: "--home must be an absolute path to the agent data dir" };
  if (step !== "plan" && step !== "quiesce" && step !== "reconnect") return { ok: false, error: "--step must be plan, quiesce or reconnect" };
  const allowOpenPlans = has("--allow-open-plans");
  if (step === "plan") return { ok: true, step, home: resolve(home), facts: null, allowOpenPlans };
  if (!has("--execute")) return { ok: false, error: `--step ${step} changes the agent's state and needs --execute` };
  if (get("--owner") !== OWNER_SESSION) return { ok: false, error: "--owner must be the session that owns the pass" };
  if (facts === null || !isAbsolute(facts)) return { ok: false, error: "--facts must be an absolute file path" };
  const rel = relative(resolve(home), resolve(facts));
  if (!rel.startsWith("..") && !isAbsolute(rel)) return { ok: false, error: "--facts must be OUTSIDE the agent home" };
  return { ok: true, step, home: resolve(home), facts: resolve(facts), allowOpenPlans };
}

export function realDeps(home: string): Deps {
  return { call: httpAgentCall(fetch), persisted: diskPersisted(home), owner: liveOwner(home), sleep: (ms) => Bun.sleep(ms), now: () => Date.now() };
}

const fail = (code: string, agentState: string, detail: string): number => {
  console.log(JSON.stringify({ ok: false, code, agentState, detail }, null, 2));
  return 1;
};

async function main(): Promise<number> {
  const parsed = checkArgs(Bun.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.error);
    return 2;
  }
  const deps = realDeps(parsed.home);
  try {
    if (parsed.step === "plan") {
      console.log(JSON.stringify({ ok: true, step: "plan", mutated: false, plan: await planQuiescence(deps, { allowOpenPlans: parsed.allowOpenPlans }) }, null, 2));
      return 0;
    }
    if (parsed.step === "quiesce") {
      const q = await quiesceLiveAgent(deps, { allowOpenPlans: parsed.allowOpenPlans });
      await Bun.write(parsed.facts!, JSON.stringify({ disclosure: q.disclosure, walletBinding: q.walletBinding, configHash: q.configHash, pid: q.pid, modeBefore: q.modeBefore, ...(q.allowOpenPlans ? { plansHash: q.plansHash, plansCount: q.plansCount, plansDigest: q.plansDigest } : {}) }, null, 2));
      console.log(JSON.stringify({ ok: true, step: "quiesce", quiescent: q, factsFile: parsed.facts }, null, 2));
      return 0;
    }
    const saved = JSON.parse(await Bun.file(parsed.facts!).text()) as Partial<Expected>;
    if (typeof saved.disclosure !== "string" || typeof saved.walletBinding !== "string" || typeof saved.configHash !== "string") return fail("facts_invalid", "disconnected", "the facts file lacks the disclosure, the wallet binding or the config hash");
    // facts written by a pass that preserved open plans carry the plan set the new version must have loaded
    const plans = typeof saved.plansCount === "number"
      ? { plansCount: saved.plansCount, plansHash: typeof saved.plansHash === "string" ? saved.plansHash : null, ...(typeof saved.plansDigest === "string" ? { plansDigest: saved.plansDigest } : {}) }
      : {};
    await reconnectAgent(deps, { disclosure: saved.disclosure, walletBinding: saved.walletBinding, configHash: saved.configHash, ...plans });
    console.log(JSON.stringify({ ok: true, step: "reconnect", reconnected: true }, null, 2));
    return 0;
  } catch (e) {
    if (e instanceof QuiesceError) return fail(e.code, e.agentState, e.message);
    return fail("unexpected", "unknown", e instanceof Error ? e.message : "unexpected");
  }
}

if (import.meta.main) process.exit(await main());
