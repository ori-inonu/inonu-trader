/**
 * PreToolUse hook of the goal loop (src/goal/rails.ts): refuses, with the reason, what an unattended session must not touch (the live agent and its data, its release and scheduled tasks, the mutating endpoints of the
 * running core, processes stopped by name, git that publishes or discards). It only runs for the session the goal belongs to and only refuses: it never runs anything, and reading is never refused. A hook that fails
 * lets the call through (the refusal is a safety net, not a gate that can lock the session) and says so on stderr.
 * Input on stdin: the PreToolUse JSON (session_id, tool_name, tool_input). Output on stdout: a permissionDecision "deny" with the reason.
 */
import { loadState } from "../../src/goal/io";
import { railVerdict } from "../../src/goal/rails";

try {
  const input = JSON.parse((await Bun.stdin.text()) || "{}") as { session_id?: string; tool_name?: string; tool_input?: { command?: string; file_path?: string; path?: string } };
  const project = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const state = loadState(project);
  if (state !== null && state.active && state.sessionId === input.session_id && typeof input.tool_name === "string") {
    const call = { tool: input.tool_name, ...(input.tool_input?.command === undefined ? {} : { command: input.tool_input.command }), ...((input.tool_input?.file_path ?? input.tool_input?.path) === undefined ? {} : { filePath: input.tool_input?.file_path ?? input.tool_input?.path }) };
    const refusal = railVerdict(call);
    if (refusal !== null) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `[trilho do objetivo] ${refusal.deny}` } })}\n`);
  }
} catch (error) {
  console.error(`goal-rails: ${error instanceof Error ? error.message : "erro"}`);
}
process.exit(0);
