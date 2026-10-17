/**
 * The goal of a session, from the command line: the state that the hooks (goal-stop, goal-context, goal-rails) read. Modeled on Anthropic's harness for long running agents: a feature list whose `passes` only becomes
 * true when the feature's verify command exits 0 (this CLI runs it; the model cannot declare it), a progress file, a basic check for the session start and a check for the goal itself.
 * It writes only `.claude/goal/` of the project, calls no model and no network, places no order and changes no setting.
 *
 *   bun scripts/hooks/goal.ts set --session <id> --goal "<texto>" [--check "<cmd>"] [--smoke "<cmd>"] [--until HH:MM] [--rail "<texto>"]...
 *   bun scripts/hooks/goal.ts retarget --goal "<texto>" [--check "<cmd>"]   (muda o objetivo e a verificacao e mantem fila, decisoes e progresso)
 *   bun scripts/hooks/goal.ts add <explorar|planejar|implementar|verificar|registrar> "<titulo>" [--steps "a;b;c"] [--verify "<cmd>"]
 *   bun scripts/hooks/goal.ts pass <id> [--evidence "<texto>"]      (roda o --verify da funcionalidade; so exit 0 marca passes)
 *   bun scripts/hooks/goal.ts blocked <id> --reason "<texto>"
 *   bun scripts/hooks/goal.ts decide "<resumo>" [--receipt <hash>] [--paid <n>]
 *   bun scripts/hooks/goal.ts progress "<texto>" | status | check | smoke | pause | resume | ack | clear
 */
import { appendProgress, goalDir, loadState, progressTail, runShell, saveState, verdictOf } from "../../src/goal/io";
import { addTask, bearings, blockTask, decide, markPassed, newState, STAGES, type GoalState, type Stage } from "../../src/goal/loop";

const project = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const [command, ...rest] = process.argv.slice(2);

export const DEFAULT_RAILS: readonly string[] = [
  "Nunca enviar, assinar ou preparar ordem de compra ou venda a partir daqui; so o agente vivo opera, pelo seu executor.",
  "O codigo nunca converte um skip do Jev em compra em producao; quantidade, tamanho e alocacao sao escolhas do Jev (ADENDO-H).",
  "Nunca reiniciar, parar ou trocar o core vivo sem o aviso previo do dono; nunca mexer nos dados ou no release do agente vivo.",
  "Nunca subir os limites de risco do agente vivo nem criar alavancagem.",
  "Uma recomendacao do Jev (recibo de consenso) nao autoriza nada: so os portoes do codigo e a decisao do dono.",
  "Nao afirmar resultado sem evidencia (teste, saida, medicao); chamar de ganho so o que foi medido.",
];

const positional = (): string[] => {
  const out: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i]!.startsWith("--")) i++;
    else out.push(rest[i]!);
  }
  return out;
};
const flag = (name: string): string | undefined => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const flags = (name: string): string[] => rest.flatMap((x, i) => (x === name && rest[i + 1] !== undefined ? [rest[i + 1]!] : []));
const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};
const need = (): GoalState => loadState(project) ?? fail("nenhum objetivo: rode `goal.ts set` primeiro");
const save = (s: GoalState, line?: string): void => {
  saveState(project, s);
  if (line !== undefined) appendProgress(project, line, Date.now());
};

const untilMs = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (hm !== null) {
    const d = new Date();
    d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
    return d.getTime() > Date.now() ? d.getTime() : d.getTime() + 86_400_000;
  }
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : fail("--until invalido (use HH:MM ou uma data ISO)");
};

switch (command) {
  case "set": {
    const session = flag("--session") ?? fail("--session <id> e obrigatorio: o objetivo pertence a UMA sessao e nenhuma outra e segurada");
    const goal = flag("--goal") ?? fail('--goal "<texto>" e obrigatorio');
    const state: GoalState = { ...newState({ sessionId: session, goal, nowMs: Date.now(), deadlineMs: untilMs(flag("--until")), checkCommand: flag("--check") ?? null, rails: [...DEFAULT_RAILS, ...flags("--rail")] }), smokeCommand: flag("--smoke") ?? null };
    save(state, `objetivo definido: ${goal}`);
    console.log(`objetivo definido para a sessao ${session}; estado em ${goalDir(project)}`);
    break;
  }
  case "retarget": {
    // changes the words of the goal and its check, and keeps the queue, the decisions and the progress (a goal that was reframed by the owner is not a new goal)
    const s = need();
    const goal = flag("--goal") ?? fail('--goal "<texto>" e obrigatorio');
    const next: GoalState = { ...s, goal, checkCommand: flag("--check") ?? s.checkCommand, loop: { ...s.loop, idleStops: 0 } };
    save(next, `objetivo redefinido pelo dono: ${goal}`);
    console.log("objetivo redefinido; fila, decisoes e progresso mantidos");
    break;
  }
  case "add": {
    const [stage, title] = positional();
    if (!STAGES.includes(stage as Stage) || title === undefined) fail(`uso: add <${STAGES.join("|")}> "<titulo>" [--steps "a;b"] [--verify "<cmd>"]`);
    const steps = (flag("--steps") ?? "").split(";").map((x) => x.trim()).filter(Boolean);
    const next = addTask(need(), { stage: stage as Stage, title: title!, steps, verify: flag("--verify") ?? null });
    save(next, `funcionalidade ${next.queue.at(-1)!.id} (${stage}) adicionada: ${title}`);
    console.log(`adicionada ${next.queue.at(-1)!.id}`);
    break;
  }
  case "pass": {
    const [id] = positional();
    const s = need();
    const task = s.queue.find((t) => t.id === id) ?? fail(`funcionalidade desconhecida: ${id}`);
    let evidence = flag("--evidence") ?? "";
    if (task!.verify !== null) {
      const r = runShell(task!.verify, project, 180_000);
      if (r.exitCode !== 0) {
        console.error(`NAO passou: o comando de verificacao saiu com ${r.exitCode === null ? "tempo esgotado" : `codigo ${r.exitCode}`}.\n${r.output.split("\n").slice(-12).join("\n")}`);
        appendProgress(project, `verificacao de ${id} falhou (${task!.verify})`, Date.now());
        process.exit(1);
      }
      evidence = `verify exit 0: ${task!.verify}${evidence === "" ? "" : `; ${evidence}`}`;
    } else if (evidence === "") fail("esta funcionalidade nao tem --verify: passe --evidence com o arquivo, teste ou saida que a prova");
    save(markPassed(s, id!, evidence), `funcionalidade ${id} passou: ${evidence}`);
    console.log(`${id} passou (${evidence})`);
    break;
  }
  case "blocked": {
    const [id] = positional();
    const reason = flag("--reason") ?? fail('--reason "<por que>" e obrigatorio');
    save(blockTask(need(), id!, reason), `funcionalidade ${id} bloqueada: ${reason}`);
    console.log(`${id} bloqueada`);
    break;
  }
  case "decide": {
    const [summary] = positional();
    if (summary === undefined) fail('uso: decide "<resumo>" [--receipt <hash>] [--paid <n>]');
    save(decide(need(), { summary: summary!, ...(flag("--receipt") === undefined ? {} : { receiptHash: flag("--receipt")! }), paidCalls: Number(flag("--paid") ?? 0) || 0, nowMs: Date.now() }), `decisao: ${summary}`);
    console.log("decisao registrada");
    break;
  }
  case "progress": {
    const [text] = positional();
    if (text === undefined) fail('uso: progress "<texto>"');
    appendProgress(project, text!, Date.now());
    console.log("progresso registrado");
    break;
  }
  case "status": {
    const s = need();
    console.log([bearings(s), "", `Sessao: ${s.sessionId}  ativo: ${s.active}  pausado: ${s.paused}`, `Laco: ${s.loop.stops} paradas, ${s.loop.blocks} continuacoes, ${s.loop.idleStops} paradas sem novidade seguidas`, ...progressTail(project, 5)].join("\n"));
    break;
  }
  case "check": {
    const s = need();
    if (s.checkCommand === null) fail("este objetivo nao tem --check");
    const r = runShell(s.checkCommand!, project, 30_000);
    console.log(`${r.output.trim()}\nveredito: ${verdictOf(r.output, r.exitCode) === null ? "desconhecido" : verdictOf(r.output, r.exitCode) ? "ATINGIDO" : "NAO ATINGIDO"}`);
    break;
  }
  case "smoke": {
    const s = need();
    if (!s.smokeCommand) fail("este objetivo nao tem --smoke");
    const r = runShell(s.smokeCommand!, project, 180_000);
    console.log(`${r.output.trim().split("\n").slice(-10).join("\n")}\nverificacao basica: ${r.exitCode === 0 ? "ok" : "FALHOU, conserte antes de seguir"}`);
    process.exit(r.exitCode === 0 ? 0 : 1);
  }
  case "pause":
    save({ ...need(), paused: true }, "objetivo pausado");
    console.log("pausado: a sessao pode parar");
    break;
  case "resume":
    save({ ...need(), paused: false }, "objetivo retomado");
    console.log("retomado");
    break;
  case "clear":
    save({ ...need(), active: false }, "objetivo encerrado");
    console.log("objetivo encerrado: nenhuma sessao e mais segurada");
    break;
  default:
    fail("uso: goal.ts set|add|pass|blocked|decide|progress|status|check|smoke|pause|resume|clear (veja o cabecalho do arquivo)");
}
