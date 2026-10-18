/**
 * The goal loop of a session, built on what Anthropic recommends for long running agents (Claude Code best practices; "Effective harnesses for long running agents"; "Building effective agents"):
 *  - a CHECK that returns pass or fail decides, never the model's own say-so: a feature only gets `passes: true` when its verify command exits 0 (the CLI runs it, `scripts/hooks/goal.ts pass`), and a Stop hook is the
 *    deterministic gate that keeps the session working until the goal's check says it is achieved;
 *  - one FEATURE at a time, in the order explore, plan, implement, verify, record (the plan is a file with what is out of scope and an end to end check; implementation starts with a test that fails; verification ends with an
 *    adversarial review by a fresh subagent that reports only gaps of correctness or of the stated requirements);
 *  - a feature list and a progress file that survive the context (state.json and progress.txt), read again at every session start;
 *  - NO QUESTIONS TO THE PERSON: a stop with nothing new counts as idle, two idle stops send the session to the wayfinder step, where every open question is written as a structured decision request and sent to the Jev
 *    (as evaluator and as a vote). If the Jev is unavailable the session picks the most reversible option, records it and goes on. Items the Jev may not decide (money, wallet, secrets, data migrations, history rewrites,
 *    production dependencies, billing) are recorded as blocked and skipped; the session keeps working on the rest. The only exits are: goal achieved, goal paused, goal past its deadline, goal closed.
 * It is bound to ONE session: any other session is never held back. The hook never spends anything and never orders anything: it only builds the message that continues the session. Pure: no clock, no storage, no process,
 * no network; the entry points (scripts/hooks) read and write the state.
 */
export type Stage = "explorar" | "planejar" | "implementar" | "verificar" | "registrar";
export const STAGES: readonly Stage[] = ["explorar", "planejar", "implementar", "verificar", "registrar"];

export interface Task {
  readonly id: string;
  readonly stage: Stage;
  readonly title: string;
  /** What the feature must do, as steps a person could check (the `steps` of Anthropic's feature list). */
  readonly steps: readonly string[];
  /** The command that proves it: exit 0 is the only way `passes` becomes true. Null when the stage has no check of its own. */
  readonly verify: string | null;
  readonly passes: boolean;
  readonly status: "todo" | "doing" | "done" | "blocked";
  readonly evidence: string | null;
  readonly reason: string | null;
}

export interface Decision {
  readonly atMs: number;
  readonly summary: string;
  readonly receiptHash: string | null;
  readonly paidCalls: number;
}

export interface GoalState {
  readonly v: 1;
  /** The one session this goal belongs to. */
  readonly sessionId: string;
  readonly goal: string;
  readonly active: boolean;
  readonly paused: boolean;
  readonly createdAtMs: number;
  readonly deadlineMs: number | null;
  /** A read-only command whose output says whether the goal is achieved, run by the hook entry point; null when there is none. */
  readonly checkCommand: string | null;
  /** The basic check run at the start of a session before new work (Anthropic's `init.sh`): it catches a broken state left behind. Optional. */
  readonly smokeCommand?: string | null;
  /** Limits that are not crossed; repeated in every message so a long session does not forget them. */
  readonly rails: readonly string[];
  readonly queue: readonly Task[];
  readonly decisions: readonly Decision[];
  readonly loop: { readonly stops: number; readonly blocks: number; readonly idleStops: number; readonly lastDigest: string | null };
}

/** CHOICES of this code, not calibrated: the stops with nothing new before the wayfinder step. There is no cap that ends the session: only the deadline, a pause, or an achieved goal does. */
export const LIMITS = { wayfinderAfterIdle: 2 } as const;

/** Work the Jev may never decide and the session may never ask the person about: it is recorded as blocked and the session moves to the next item. */
export const FENCED_TOPICS: readonly string[] = [
  "dinheiro real, carteira, ordens, saques e transferencias",
  "segredos, chaves e credenciais",
  "limites de risco e liberacao de live",
  "migracoes de dados ou de schema, inclusive os journals",
  "reescrita de historico e apagar branches",
  "dependencias de producao novas ou trocadas",
  "billing, contratos e servicos pagos",
];

export interface StopInput {
  readonly sessionId: string;
  readonly nowMs: number;
  /** A digest of the work in the folder (modified and new files): equal to the last one means nothing new was made. */
  readonly digest: string;
  /** The result of the check command: true achieved, false not achieved, null when there is no check or it could not be read. */
  readonly goalAchieved: boolean | null;
}

export interface StopOutput {
  readonly decision: "block";
  readonly reason: string;
}

export function newState(input: { sessionId: string; goal: string; nowMs: number; deadlineMs: number | null; checkCommand: string | null; rails: readonly string[] }): GoalState {
  return {
    v: 1, sessionId: input.sessionId, goal: input.goal, active: true, paused: false, createdAtMs: input.nowMs, deadlineMs: input.deadlineMs, checkCommand: input.checkCommand, rails: input.rails,
    queue: [], decisions: [], loop: { stops: 0, blocks: 0, idleStops: 0, lastDigest: null },
  };
}

export function addTask(s: GoalState, task: { stage: Stage; title: string; steps?: readonly string[]; verify?: string | null }): GoalState {
  const id = `t${s.queue.length + 1}`;
  return { ...s, queue: [...s.queue, { id, stage: task.stage, title: task.title, steps: task.steps ?? [], verify: task.verify ?? null, passes: false, status: "todo", evidence: null, reason: null }] };
}

const setTask = (s: GoalState, id: string, patch: Partial<Task>): GoalState => ({ ...s, queue: s.queue.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
/** Called by the CLI only after the verify command of the task exited 0 (or, for a task with none, with the evidence the person or the session gives). `passes` is set here and nowhere else. */
export const markPassed = (s: GoalState, id: string, evidence: string): GoalState => setTask(s, id, { status: "done", passes: true, evidence });
export const blockTask = (s: GoalState, id: string, reason: string): GoalState => setTask(s, id, { status: "blocked", reason });

export function decide(s: GoalState, d: { summary: string; receiptHash?: string; paidCalls?: number; nowMs: number }): GoalState {
  return { ...s, decisions: [...s.decisions, { atMs: d.nowMs, summary: d.summary, receiptHash: d.receiptHash ?? null, paidCalls: d.paidCalls ?? 0 }] };
}

const head = (s: GoalState): string => [`[Gancho do objetivo] Objetivo: ${s.goal}`, "Trilhos (nao cruzar, em nenhuma etapa):", ...s.rails.map((r) => `- ${r}`)].join("\n");

const STAGE_HELP: Readonly<Record<Stage, string>> = {
  explorar: "Somente leitura: entenda antes de mudar. Se a investigacao for grande, use um subagente para nao encher o contexto. Entregue achados, nao codigo.",
  planejar: "Escreva o plano em um ARQUIVO (docs/...): arquivos e interfaces envolvidos, o que fica FORA de escopo e um passo de verificacao ponta a ponta. Registre o comando de verificacao de cada funcionalidade com goal.ts add ... --verify.",
  implementar: "Teste que falha primeiro, depois so a mudanca do plano; rode o teste especifico e, no fim, o conjunto e o typecheck. Uma funcionalidade de cada vez.",
  verificar: "Rode bun scripts/hooks/goal.ts pass <id>: ele executa o comando de verificacao e so ele marca passes. Depois peca ao subagente jev-reviewer a revisao adversarial do diff contra o plano e trate so as lacunas de corretude ou de requisito.",
  registrar: 'Atualize o progresso: bun scripts/hooks/goal.ts progress "<o que foi feito e o que falta>". Deixe o ambiente limpo e funcionando. Commit so se o usuario pediu.',
};

const taskMessage = (s: GoalState, t: Task): string =>
  [
    head(s),
    "",
    `Etapa: ${t.stage}. ${t.status === "doing" ? "Continue o passo em andamento" : "Proximo passo"}: ${t.title} (id ${t.id}).`,
    STAGE_HELP[t.stage],
    ...(t.steps.length > 0 ? ["O que deve ficar pronto:", ...t.steps.map((x) => `- ${x}`)] : []),
    ...(t.verify !== null ? [`Verificacao (exit 0 = passou): ${t.verify}`] : []),
    `Ao terminar: bun scripts/hooks/goal.ts pass ${t.id} --evidence "<arquivo, teste ou saida>". Se travar: bun scripts/hooks/goal.ts blocked ${t.id} --reason "<por que>" e siga para a proxima funcionalidade.`,
    "Nao declare vitoria sem a verificacao e nao responda com relatorio sem dado novo: ou voce avanca este passo, ou registra o bloqueio.",
  ].join("\n");

const wayfinderMessage = (s: GoalState, idle: number): string =>
  [
    head(s),
    "",
    idle >= LIMITS.wayfinderAfterIdle ? `Nao houve artefato novo nas ultimas ${idle} paradas.` : "Nao ha passo na fila.",
    "Rode o passo Wayfinder agora, em vez de um relatorio: ache o proximo caminho, nunca feche um caminho dizendo que nao ha; diga a restricao que o prende e o experimento mais proximo que ela permite.",
    "1. Explorar: liste de 3 a 5 caminhos seguros para o proximo avanco rumo ao objetivo (o que ja esta decidido segue abaixo).",
    "2. Monte cada duvida como decisao estruturada, nao como pergunta ao usuario: {\"pergunta\": \"...\", \"opcoes\": [{\"id\": \"A\", \"descricao\": \"...\", \"evidencia\": \"...\"}], \"restricoes\": [\"trilhos e fatos\"], \"reversivel\": true}. Sem endereco, chave ou saldo.",
    "3. Leve a decisao ao Jev pelo MCP jev-consensus: consensus_run, sem teto de chamadas (o dono paga o Jev e nao quer teto). Se o servidor MCP nao estiver conectado, use bun scripts/jev-consensus.ts run com o mesmo JSON.",
    '4. Registre a decisao: bun scripts/hooks/goal.ts decide "<resumo>" --receipt <hash> --paid <n>. Adicione o caminho vencedor a fila, uma funcionalidade por vez: bun scripts/hooks/goal.ts add planejar "<titulo>" --verify "<comando>" (etapas: explorar, planejar, implementar, verificar, registrar) e comece pelo plano.',
    "5. Sem consenso, ou com o Jev fora do ar: escolha a opcao mais reversivel e de menor risco, registre com goal.ts decide (receipt sem-jev) e siga. Nunca pare para perguntar ao usuario.",
    `6. Fora do Jev, nunca decida nem pergunte: ${FENCED_TOPICS.join("; ")}. Se a tarefa depender disso, registre goal.ts blocked com o motivo e escolha outra. Esses bloqueios ficam na lista para o dono ler depois.`,
    "7. Sem caminho novo: registre o bloqueio (goal.ts blocked) e siga com o proximo caminho, em vez de repetir o relatorio.",
    ...(s.decisions.length > 0 ? ["", "Decisoes ja registradas:", ...s.decisions.slice(-3).map((d) => `- ${d.summary}`)] : []),
  ].join("\n");

/** What to do when the session stops: the new state and the output that keeps it going. It returns null only when the goal is inactive, paused, achieved or past its deadline. Pure. */
export function onStop(s0: GoalState, input: StopInput): { state: GoalState; output: StopOutput | null } {
  if (!s0.active || s0.sessionId !== input.sessionId) return { state: s0, output: null };
  if (input.goalAchieved === true) return { state: { ...s0, active: false }, output: null };
  if (s0.deadlineMs !== null && input.nowMs >= s0.deadlineMs) return { state: { ...s0, active: false }, output: null };
  if (s0.paused) return { state: s0, output: null };

  const idle = s0.loop.lastDigest !== null && s0.loop.lastDigest === input.digest ? s0.loop.idleStops + 1 : 0;
  const base: GoalState = { ...s0, loop: { ...s0.loop, stops: s0.loop.stops + 1, idleStops: idle, lastDigest: input.digest } };

  const pending = idle >= LIMITS.wayfinderAfterIdle ? undefined : base.queue.find((t) => t.status === "doing") ?? base.queue.find((t) => t.status === "todo");
  const next: GoalState = pending !== undefined && pending.status === "todo" ? setTask(base, pending.id, { status: "doing" }) : base;
  const reason = pending !== undefined ? taskMessage(next, next.queue.find((t) => t.id === pending.id)!) : wayfinderMessage(next, idle);
  return { state: { ...next, loop: { ...next.loop, blocks: next.loop.blocks + 1 } }, output: { decision: "block", reason } };
}

/** A short account of where the goal stands, for the session start: the goal, the features with their passes and the last decisions. */
export function bearings(s: GoalState): string {
  const done = s.queue.filter((t) => t.passes).length;
  return [
    `Objetivo em curso (ate ${s.deadlineMs === null ? "sem prazo" : new Date(s.deadlineMs).toISOString()}): ${s.goal}`,
    `Funcionalidades: ${done} de ${s.queue.length} passaram.`,
    ...(s.smokeCommand ? [`Verificacao basica antes de comecar (pegue o rumo): ${s.smokeCommand}`] : []),
    ...s.queue.map((t) => `- [${t.passes ? "x" : t.status === "blocked" ? "!" : " "}] ${t.id} ${t.stage}: ${t.title}${t.status === "blocked" && t.reason !== null ? ` (bloqueada: ${t.reason})` : ""}`),
    ...(s.decisions.length > 0 ? ["Ultimas decisoes:", ...s.decisions.slice(-3).map((d) => `- ${d.summary}`)] : []),
    "Trilhos:",
    ...s.rails.map((r) => `- ${r}`),
  ].join("\n");
}
