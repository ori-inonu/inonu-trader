/**
 * The goal loop of a session, built on what Anthropic recommends for long running agents (Claude Code best practices; "Effective harnesses for long running agents"; "Building effective agents"):
 *  - a CHECK that returns pass or fail decides, never the model's own say-so: a feature only gets `passes: true` when its verify command exits 0 (the CLI runs it, `scripts/hooks/goal.ts pass`), and a Stop hook is the
 *    deterministic gate that keeps the session working until the goal's check says it is achieved;
 *  - one FEATURE at a time, in the order explore, plan, implement, verify, record (the plan is a file with what is out of scope and an end to end check; implementation starts with a test that fails; verification ends with an
 *    adversarial review by a fresh subagent that reports only gaps of correctness or of the stated requirements);
 *  - a feature list and a progress file that survive the context (state.json and progress.txt), read again at every session start;
 *  - STOPPING CONDITIONS and a human checkpoint: a stop with nothing new counts as idle, two idle stops send the session to the wayfinder step (ask the Jev, as evaluator and as a vote, which path to take), four make it
 *    stop and leave the question for the person, an hourly cap bounds the continuations, and a paused goal, an achieved goal and a goal past its deadline let the session stop.
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
  readonly loop: { readonly stops: number; readonly blocks: number; readonly idleStops: number; readonly lastDigest: string | null; readonly blockStamps: readonly number[] };
  /** Set when the loop stops on purpose and the person has to answer something. */
  readonly needsHuman: string | null;
}

/** CHOICES of this code, not calibrated: the stops with nothing new before the wayfinder step and before giving up, and the continuations an hour. */
export const LIMITS = { wayfinderAfterIdle: 2, maxIdleStops: 4, maxBlocksPerHour: 40 } as const;

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
    queue: [], decisions: [], loop: { stops: 0, blocks: 0, idleStops: 0, lastDigest: null, blockStamps: [] }, needsHuman: null,
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

/** The person came back: the loop starts counting again. */
export function humanReturned(s: GoalState): GoalState {
  return { ...s, needsHuman: null, loop: { ...s.loop, idleStops: 0 } };
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
    `Ao terminar: bun scripts/hooks/goal.ts pass ${t.id} --evidence "<arquivo, teste ou saida>". Se travar: bun scripts/hooks/goal.ts blocked ${t.id} --reason "<por que>".`,
    "Nao declare vitoria sem a verificacao e nao responda com relatorio sem dado novo: ou voce avanca este passo, ou registra o bloqueio.",
  ].join("\n");

const wayfinderMessage = (s: GoalState, idle: number): string =>
  [
    head(s),
    "",
    idle >= LIMITS.wayfinderAfterIdle ? `Nao houve artefato novo nas ultimas ${idle} paradas.` : "Nao ha passo na fila.",
    "Rode o passo Wayfinder agora, em vez de um relatorio: ache o proximo caminho, nunca feche um caminho dizendo que nao ha; diga a restricao que o prende e o experimento mais proximo que ela permite.",
    "1. Explorar: liste de 3 a 5 caminhos seguros para o proximo avanco rumo ao objetivo (o que ja esta decidido segue abaixo).",
    "2. Pergunte ao Jev pelo MCP jev-consensus (avaliador e votacao em varias molduras): consensus_plan (gratis) e depois consensus_run (allow_paid_inference true, max_calls ate 15) com esses caminhos, os trilhos e fatos sem endereco, chave ou saldo.",
    '3. Registre a decisao: bun scripts/hooks/goal.ts decide "<resumo>" --receipt <hash> --paid <n>. Adicione o caminho vencedor a fila, uma funcionalidade por vez: bun scripts/hooks/goal.ts add planejar "<titulo>" --verify "<comando>" (etapas: explorar, planejar, implementar, verificar, registrar) e comece pelo plano.',
    "4. Sem consenso: faca ao usuario a pergunta que o recibo indicar. Sem caminho novo: registre o bloqueio (goal.ts blocked) e pare, em vez de repetir.",
    ...(s.decisions.length > 0 ? ["", "Decisoes ja registradas:", ...s.decisions.slice(-3).map((d) => `- ${d.summary}`)] : []),
  ].join("\n");

/** What to do when the session stops: the new state and the output that keeps it going, or null to let it stop. Pure. */
export function onStop(s0: GoalState, input: StopInput): { state: GoalState; output: StopOutput | null } {
  if (!s0.active || s0.sessionId !== input.sessionId) return { state: s0, output: null };
  if (input.goalAchieved === true) return { state: { ...s0, active: false }, output: null };
  if (s0.deadlineMs !== null && input.nowMs >= s0.deadlineMs) return { state: { ...s0, active: false }, output: null };
  if (s0.paused || s0.needsHuman !== null) return { state: s0, output: null };

  const idle = s0.loop.lastDigest !== null && s0.loop.lastDigest === input.digest ? s0.loop.idleStops + 1 : 0;
  const stamps = s0.loop.blockStamps.filter((t) => input.nowMs - t < 3_600_000);
  const base: GoalState = { ...s0, loop: { ...s0.loop, stops: s0.loop.stops + 1, idleStops: idle, lastDigest: input.digest, blockStamps: stamps } };

  if (idle >= LIMITS.maxIdleStops) return { state: { ...base, needsHuman: `Sem artefato novo em ${idle} paradas seguidas: o laco parou de continuar sozinho. Qual caminho ou dado novo voce quer que eu siga?` }, output: null };
  // human checkpoint: when nothing is left to do and what remains is blocked, one wayfinder step is enough; a repeated stop with nothing new hands the question to the person instead of looping
  const blocked = base.queue.filter((t) => t.status === "blocked");
  if (idle >= 1 && blocked.length > 0 && !base.queue.some((t) => t.status === "todo" || t.status === "doing")) {
    return { state: { ...base, needsHuman: `Tudo que resta esta bloqueado: ${blocked.map((t) => `${t.title} (${t.reason ?? "sem motivo"})`).join("; ")}. Qual destes voce destrava, ou que dado novo devo seguir?` }, output: null };
  }
  if (stamps.length >= LIMITS.maxBlocksPerHour) return { state: { ...base, needsHuman: `Limite de ${LIMITS.maxBlocksPerHour} continuacoes por hora atingido: o laco parou para nao gastar sem controle. Quer que eu continue?` }, output: null };

  const pending = idle >= LIMITS.wayfinderAfterIdle ? undefined : base.queue.find((t) => t.status === "doing") ?? base.queue.find((t) => t.status === "todo");
  const next: GoalState = pending !== undefined && pending.status === "todo" ? setTask(base, pending.id, { status: "doing" }) : base;
  const reason = pending !== undefined ? taskMessage(next, next.queue.find((t) => t.id === pending.id)!) : wayfinderMessage(next, idle);
  return { state: { ...next, loop: { ...next.loop, blocks: next.loop.blocks + 1, blockStamps: [...stamps, input.nowMs] } }, output: { decision: "block", reason } };
}

/** A short account of where the goal stands, for the session start: the goal, the features with their passes, the last decisions and what the person is waited for. */
export function bearings(s: GoalState): string {
  const done = s.queue.filter((t) => t.passes).length;
  return [
    `Objetivo em curso (ate ${s.deadlineMs === null ? "sem prazo" : new Date(s.deadlineMs).toISOString()}): ${s.goal}`,
    `Funcionalidades: ${done} de ${s.queue.length} passaram.`,
    ...(s.smokeCommand ? [`Verificacao basica antes de comecar (pegue o rumo): ${s.smokeCommand}`] : []),
    ...s.queue.map((t) => `- [${t.passes ? "x" : t.status === "blocked" ? "!" : " "}] ${t.id} ${t.stage}: ${t.title}${t.status === "blocked" && t.reason !== null ? ` (bloqueada: ${t.reason})` : ""}`),
    ...(s.decisions.length > 0 ? ["Ultimas decisoes:", ...s.decisions.slice(-3).map((d) => `- ${d.summary}`)] : []),
    ...(s.needsHuman !== null ? [`Esperando o usuario: ${s.needsHuman}`] : []),
    "Trilhos:",
    ...s.rails.map((r) => `- ${r}`),
  ].join("\n");
}
