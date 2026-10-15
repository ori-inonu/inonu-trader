/**
 * The rails of a session that runs a goal without a person watching (the owner's request of 2026-10-15): a PreToolUse hook asks `railVerdict` before a command or a file write and the answer is a refusal with the reason
 * or nothing. It protects what must not be touched from an unattended session: the live agent and its data, its release and its scheduled tasks, the mutating endpoints of the running core, processes stopped by NAME (which
 * can hit one that is not ours), and git actions that cannot be undone or that were never asked for. Reading is never refused: reading the data of the agent, asking its status, running tests and scripts all pass. The hook
 * only refuses; it never runs anything, and a rule that is wrong costs a refusal that the person can lift, never a damage. Pure: the entry point (scripts/hooks/goal-rails.ts) reads the call from stdin.
 */
export interface ToolCall {
  readonly tool: string;
  readonly command?: string;
  readonly filePath?: string;
}

export interface Refusal {
  readonly deny: string;
}

const LIVE_PATH = /InonuTrader(Releases)?[\\/]/i;
const DESTRUCTIVE = /\b(Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Rename-Item|Copy-Item|New-Item|rm|del|rmdir|mv|cp|tee|truncate|sed\s+-i)\b|(^|[^0-9&>])>>?(?![&>])/i;
const MUTATING_HTTP = /(-X\s*(POST|PUT|PATCH|DELETE)\b|-Method\s+(Post|Put|Patch|Delete)\b|\s(--data|--data-raw|-d)\s|\s-Body\s)/i;

const RULES: readonly { readonly test: (c: ToolCall) => boolean; readonly why: string }[] = [
  { test: (c) => /\b(Stop-Process|spps)\b[^|;&\n]*-Name\b|\btaskkill\b[^\n]*\/IM\b|\b(pkill|killall)\b|Get-Process[^|\n]*\|\s*(Stop-Process|kill|spps)\b/i.test(c.command ?? ""), why: "parar processo por NOME e proibido: pode atingir um processo que nao e seu (pare so o PID que voce iniciou, depois de conferir o comando e a hora de inicio)" },
  { test: (c) => /(InonuTrader\.exe|src[\\/]desktop[\\/](main|dev)\.ts)/i.test(c.command ?? "") && /\b(Start-Process|Stop-Process|taskkill|kill|bun\b[^\n]*run)\b/i.test(c.command ?? ""), why: "iniciar, parar ou reiniciar o core do agente so com o aviso previo do dono" },
  { test: (c) => /\b(Start|Stop|Enable|Disable|Register|Unregister|Set)-ScheduledTask\b[^\n]*(inonu|jev)|\bschtasks\b[^\n]*\/(create|delete|change|end|run)\b[^\n]*(inonu|jev)/i.test(c.command ?? ""), why: "tarefas agendadas do Inonu ou do Jev nao se mexem daqui" },
  { test: (c) => (c.tool === "Edit" || c.tool === "Write" || c.tool === "NotebookEdit") && LIVE_PATH.test(c.filePath ?? ""), why: "os dados e o release do agente vivo nao se editam daqui" },
  { test: (c) => LIVE_PATH.test(c.command ?? "") && DESTRUCTIVE.test(c.command ?? ""), why: "escrever, apagar, mover ou copiar para os dados ou o release do agente vivo nao se faz daqui (ler pode)" },
  { test: (c) => /\b(curl|Invoke-WebRequest|iwr|Invoke-RestMethod|irm)\b/i.test(c.command ?? "") && MUTATING_HTTP.test(c.command ?? "") && /(localhost|127\.0\.0\.1):3000\/(agent|inonu)/i.test(c.command ?? ""), why: "chamada que MUDA o core vivo (POST, PUT, PATCH ou DELETE em /agent ou /inonu) nao se faz daqui; consultar (GET) pode" },
  { test: (c) => /\bgit\s+(push|reset\s+--hard|clean\b|checkout\s+--|restore\b|stash\s+drop|branch\s+-D|rebase\b|commit\b)/i.test(c.command ?? ""), why: "git que publica, descarta ou grava (push, reset --hard, clean, checkout --, restore, stash drop, branch -D, rebase, commit) so a pedido explicito do usuario" },
];

/** The refusal for a call, or null when the call may go on. */
export function railVerdict(call: ToolCall): Refusal | null {
  for (const rule of RULES) if (rule.test(call)) return { deny: rule.why };
  return null;
}
