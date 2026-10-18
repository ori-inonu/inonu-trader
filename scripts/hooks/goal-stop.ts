/**
 * Stop hook of the goal loop (src/goal/loop.ts): the deterministic gate that Anthropic recommends for an unattended run. When the session stops it reads the goal state of the project, runs the goal's CHECK command, measures
 * whether anything new was made, and answers with the NEXT step of the workflow or the wayfinder step, or lets the session stop (goal achieved, paused, past the deadline, no new work for too long, hourly cap). It does
 * nothing at all for a session the goal does not belong to. It spends nothing, orders nothing and never throws into the session: any error lets the session stop and goes to stderr.
 * Registered in .claude/settings.local.json (Stop). Input on stdin: the Stop hook JSON (session_id, stop_hook_active, last_assistant_message...). Output on stdout: {"decision":"block","reason":...} to continue.
 */
import { loadState, runShell, saveState, verdictOf, workDigest } from "../../src/goal/io";
import { onStop } from "../../src/goal/loop";

try {
  const input = JSON.parse((await Bun.stdin.text()) || "{}") as { session_id?: string };
  const project = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const state = loadState(project);
  if (state !== null && state.active && state.sessionId === input.session_id) {
    let goalAchieved: boolean | null = null;
    if (state.checkCommand !== null && state.checkCommand !== "") {
      const r = runShell(state.checkCommand, project, 15_000);
      goalAchieved = verdictOf(r.output, r.exitCode);
    }
    const { state: next, output } = onStop(state, { sessionId: state.sessionId, nowMs: Date.now(), digest: workDigest(project), goalAchieved });
    saveState(project, next);
    if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
  }
} catch (error) {
  console.error(`goal-stop: ${error instanceof Error ? error.message : "erro"}`);
}
process.exit(0);
