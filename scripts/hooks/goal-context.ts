/**
 * SessionStart and UserPromptSubmit hook of the goal loop: Anthropic's "get your bearings" routine for a long running agent. At a session start (startup, resume, after a compaction) it hands the session the goal, the
 * feature list with what passes, the last decisions, the tail of the progress file and the latest commits, so a fresh context does not start blind. At every prompt of the person it adds a short reminder of the goal. It does nothing for a session the goal does not belong to, reads only the project folder and never throws into the session.
 * Input on stdin: the hook JSON (hook_event_name, session_id...). Output on stdout: {"hookSpecificOutput":{"hookEventName":...,"additionalContext":...}}.
 */
import { loadState, progressTail, runShell, saveState } from "../../src/goal/io";
import { bearings } from "../../src/goal/loop";

try {
  const input = JSON.parse((await Bun.stdin.text()) || "{}") as { session_id?: string; hook_event_name?: string };
  const project = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const state = loadState(project);
  if (state !== null && state.active && state.sessionId === input.session_id) {
    const event = input.hook_event_name === "SessionStart" ? "SessionStart" : "UserPromptSubmit";
    let text: string;
    if (event === "SessionStart") {
      const log = runShell("git log --oneline -3", project, 4000).output.trim();
      const tail = progressTail(project, 8);
      text = [bearings(state), ...(tail.length > 0 ? ["Progresso (ultimas linhas):", ...tail] : []), ...(log !== "" ? ["Ultimos commits:", log] : []), "Fluxo: explorar, planejar, implementar, verificar, registrar; uma funcionalidade de cada vez; a verificacao e um comando que passa ou falha."].join("\n");
    } else {
      text = [`Objetivo em curso: ${state.goal}`, `Funcionalidades: ${state.queue.filter((t) => t.passes).length} de ${state.queue.length} passaram. Decisoes pelo MCP jev-consensus; trilhos: ${state.rails.join(" | ")}`].join("\n");
    }
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } })}\n`);
  }
} catch (error) {
  console.error(`goal-context: ${error instanceof Error ? error.message : "erro"}`);
}
process.exit(0);
