// Painel local dos motivos de operar e de recusar, da latência por etapa, dos custos e do orçamento de API.
// Junta os relatórios que já existem (baseline-audit, shadow-engine, edge-hypothesis, executor-health-sim, paper-run) em um HTML
// estático e autocontido: sem JavaScript, sem animação, sem rede. Somente leitura sobre data/bench.
// Run: bun --no-env-file scripts/decision-dashboard.ts   (gera data/bench/dashboard.html)
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { defaultLedgerPath } from "../src/api-budget/ledger";
import { assessHypothesis } from "../src/decision/hypothesis";
import type { Dist } from "../src/decision/metrics";
import { buildReport } from "./api-budget-report";
import { parseJsonl, runAudit } from "./baseline-audit";
import { inputsFrom } from "./edge-hypothesis";
import { readClosings, replayClosings, summarizeShadow } from "./shadow-engine";
import { simulate, terminalOrders } from "./simulate-executor-health";

type Json = Record<string, any>;

export interface DashboardInput {
  readonly baseline?: Json;
  readonly shadow?: Json;
  readonly hypothesis?: Json;
  readonly executorSim?: Json;
  readonly paperRun?: Json;
  readonly apiBudget?: Json;
  /** Rede até o host público (scripts/network-rtt.ts): conexão e TLS, separadas da cotação. */
  readonly network?: Json;
  readonly generatedAt: string;
}

const esc = (v: unknown): string => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: unknown, digits = 0): string => (typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: 0 }) : "sem dado");
const pct = (v: unknown, digits = 1): string => (typeof v === "number" && Number.isFinite(v) ? `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%` : "sem dado");

/** Texto exibido nunca leva ponto médio, travessão ou meia-risca (regra do produto). */
/** Ponto médio, meia-risca, travessão, sinal de menos e marcador, por código de ponto (o fonte não leva os caracteres). */
const BANNED = new RegExp("[" + [0xb7, 0x2013, 0x2014, 0x2212, 0x2022].map((c) => String.fromCharCode(c)).join("") + "]", "g");

export function clean(text: string): string {
  return text.replace(BANNED, "-");
}

const card = (label: string, value: string, note = ""): string => `<div class="card"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${note === "" ? "" : `<div class="note">${esc(note)}</div>`}</div>`;

/** `textCols` colunas à esquerda ficam alinhadas como texto; as demais são numéricas, à direita. */
function table(head: readonly string[], rows: readonly (readonly (string | number)[])[], empty = "sem dado", textCols = 1): string {
  if (rows.length === 0) return `<p class="muted">${esc(empty)}</p>`;
  const cls = (i: number) => (i < textCols ? "" : ' class="num"');
  return `<div class="scroll"><table><thead><tr>${head.map((h, i) => `<th${cls(i)}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${cls(i)}>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

/** Barras horizontais por contagem: a largura é a parte do maior valor. Sem animação. */
function bars(entries: readonly (readonly [string, number])[], empty = "sem dado"): string {
  if (entries.length === 0) return `<p class="muted">${esc(empty)}</p>`;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return `<div class="bars">${entries.map(([k, v]) => `<div class="bar"><span class="bk">${esc(k)}</span><span class="bt"><span class="bf" style="width:${((v / max) * 100).toFixed(1)}%"></span></span><span class="bv">${n(v)}</span></div>`).join("")}</div>`;
}

const distRow = (label: string, d: Dist | null | undefined, unit: string): (string | number)[] => {
  const digits = unit === "%" ? 2 : unit === "bps" ? 1 : 0;
  return d === null || d === undefined ? [label, "sem dado", "", "", "", ""] : [label, n(d.n), `${n(d.p50, digits)} ${unit}`, `${n(d.p95, digits)} ${unit}`, `${n(d.p99, digits)} ${unit}`, `${n(d.max, digits)} ${unit}`];
};

function section(id: string, title: string, intro: string, body: string): string {
  return `<section id="${esc(id)}"><h2>${esc(title)}</h2>${intro === "" ? "" : `<p class="intro">${esc(intro)}</p>`}${body}</section>`;
}

export function renderDashboard(input: DashboardInput): string {
  const b = input.baseline;
  const parts: string[] = [];

  if (b !== undefined) {
    const o = b.orders ?? {};
    const top = o.topBlocker;
    parts.push(
      section(
        "estado",
        "Estado do agente",
        `Janela de ${n(b.window?.hours, 1)} horas do journal real, somente leitura. Operação real continua desabilitada no motor de decisão.`,
        `<div class="cards">${[
          card("Ciclos", n(b.cycles?.total)),
          card("Ordens preparadas", n(o.prepared)),
          card("Ordens executadas", n(o.executed), o.executedShare === null || o.executedShare === undefined ? "" : `${pct(o.executedShare)} das preparadas`),
          card("Maior bloqueio", top ? top.reason : "nenhum", top ? `${n(top.count)} falhas, ${pct(top.shareOfFailures)} do total; ${n(top.executedAfterFirst)} execuções depois do primeiro` : ""),
          card("Drawdown do patrimônio", b.equity?.drawdown ? `${n(b.equity.drawdown.pct, 1)}%` : "sem dado", "inclui depósitos e preço das posições: não é lucro de trading"),
          card("Vendas pareadas", n(b.fills?.roundtrips?.matchedSells), `${n(b.fills?.roundtrips?.wins)} com ganho, retorno ${b.fills?.roundtrips?.returnPct === null ? "sem dado" : `${n(b.fills?.roundtrips?.returnPct, 2)}%`}`),
          card("Reconciliação", `${n(b.reconciliation?.withFill)} de ${n(b.reconciliation?.executed)}`, `executadas com fill; ${n(b.reconciliation?.unresolved?.count)} sem desfecho; ${n(b.reconciliation?.fillsWithoutOrder)} fill sem ordem`),
        ].join("")}</div>`,
      ),
    );

    const failures = Object.entries<number>(o.failuresByReason ?? {}) as [string, number][];
    parts.push(section("falhas", "Por que as ordens não saem", "Motivo das falhas de ordem no journal real, do mais frequente ao menos.", bars(failures, "nenhuma falha registrada")));

    const s = b.execution?.stagesMs ?? {};
    const failed = Object.entries<Dist>(b.execution?.failedAttemptMs ?? {});
    parts.push(
      section(
        "latencia",
        "Latência por etapa",
        `Cada etapa medida à parte. A decisão local não é o gargalo. Os comandos da CLI do executor entram assim que o cronômetro novo acumula amostras (${n(b.cliTiming?.n)} até agora); a assinatura fica dentro de swap execute, porque é a CLI que assina. A rede é medida até o host público, sem a API assinada.`,
        table(
          ["Etapa", "Amostras", "p50", "p95", "p99", "Máximo"],
          [
            ...(input.network === undefined ? [] : [distRow("Rede: conexão TCP", input.network.tcpMs, "ms"), distRow("Rede: handshake TLS", input.network.tlsMs, "ms")]),
            ...(b.cliTiming?.n > 0
              ? [
                  distRow("CLI do executor: swap quote (cotação)", b.cliTiming.byCommand?.["swap quote"], "ms"),
                  distRow("CLI do executor: swap execute (simulação, assinatura e transmissão)", b.cliTiming.byCommand?.["swap execute"], "ms"),
                  distRow("CLI do executor: wallet history (consulta de recibo)", b.cliTiming.byCommand?.["wallet history"], "ms"),
                ]
              : []),
            distRow("Modelo (pergunta até resposta)", b.jev?.latencyMs, "ms"),
            distRow("Cotação de entrada (pedido até resposta)", b.closings?.quoteNetworkMs, "ms"),
            distRow("Fila da ordem (preparada até enviando)", s.queue, "ms"),
            distRow("Executor: cotação, simulação, assinatura e envio", s.sendAndSign, "ms"),
            distRow("Inclusão (transmissão até o bloco, resolução de 1 s)", s.chainInclusion, "ms"),
            distRow("Recibo visto localmente (transmissão até recibo)", s.receipt, "ms"),
          ],
        ) + (failed.length > 0 ? `<h3>Tempo gasto por tentativa que falhou</h3>${table(["Motivo", "Amostras", "p50", "p95", "p99", "Máximo"], failed.map(([k, d]) => distRow(k, d, "ms")))}` : ""),
      ),
    );

    parts.push(
      section(
        "custos",
        "Custo e slippage",
        "Impacto de preço cotado na entrada e quanto a execução escorregou da cotação.",
        table(
          ["Medida", "Amostras", "p50", "p95", "p99", "Máximo"],
          [distRow("Impacto cotado, valor absoluto", b.closings?.absImpactPct, "%"), distRow("Slippage contra a cotação (positivo: recebeu menos)", b.execution?.slippageVsQuoteBps, "bps")],
        ) +
          `<p class="muted">Pares comparáveis de slippage: ${n(b.execution?.slippagePairs?.matched)}; sem cotação ou unidade compatível: ${n(b.execution?.slippagePairs?.unmatched)}.</p>`,
      ),
    );
  }

  const sh = input.shadow;
  if (sh !== undefined) {
    parts.push(
      section(
        "motor",
        "Motor de decisão contra o ciclo atual",
        `Replay em sombra sobre os fechamentos reais (probabilidade ${sh.pWinMode}). Compara o que o motor faria com custo completo e o que a produção faz; não diz quem acerta.`,
        `<div class="cards">${[card("Fechamentos", n(sh.total)), card("Avaliáveis", n(sh.evaluated), "todos os insumos presentes"), card("Motor opera", n(sh.engineOperates)), card("Produção compraria", n(sh.production?.would?.buy ?? 0))].join("")}</div>` +
          `<h3>Motivos de recusa do motor</h3>${bars(Object.entries<number>(sh.engine?.byReason ?? {}), "o motor não recusou nada")}` +
          table(["Medida", "Amostras", "p50", "p95", "p99", "Máximo"], [distRow("Edge bruto", sh.engine?.grossEdgeBps, "bps"), distRow("Custo de duas pernas", sh.engine?.costBps, "bps"), distRow("Edge líquido", sh.engine?.netEdgeBps, "bps")]) +
          `<p class="muted">Edge líquido mínimo exigido: ${n(sh.limits?.minNetEdgeBps)} bps. Não avaliáveis: ${n(sh.notEvaluated?.count)} (${esc(Object.entries<number>(sh.notEvaluated?.missing ?? {}).map(([k, v]) => `${k}=${v}`).join(", ") || "nenhum")}).</p>`,
      ),
    );
  }

  const pr = input.paperRun;
  if (pr !== undefined) {
    const rej = (pr.summary?.rejections ?? []) as { reason: string; count: number }[];
    parts.push(
      section(
        "paper",
        "Motivos de recusa no paper trading",
        "SIMULADO sobre dados sintéticos determinísticos: mostra a mistura de motivos do motor, não desempenho.",
        `<div class="cards">${[card("Decisões", n(pr.n)), card("Operar", n((pr.summary?.byAction?.COMPRAR ?? 0) + (pr.summary?.byAction?.VENDER ?? 0))), card("Não operar", n(pr.summary?.byAction?.NAO_OPERAR ?? 0)), card("Decisão local p95", `${n(pr.latency?.measured?.decisao_local?.p95, 3)} ms`, "limite de 80 ms")].join("")}</div>` +
          bars(rej.map((r) => [r.reason, r.count] as const), "sem recusas"),
      ),
    );
  }

  const ex = input.executorSim;
  if (ex !== undefined) {
    parts.push(
      section(
        "executor",
        "Breaker do executor",
        "Simulação sobre a sequência real de ordens do ledger.",
        `<div class="cards">${[card("Tentativas reais", n(ex.attempts)), card("Passariam", n(ex.allowed), `${n(ex.probes)} sondas`), card("Evitadas", n(ex.suppressed), pct(ex.avoidedShare)), card("Execuções barradas", n(ex.suppressedSuccesses), "precisa ser zero")].join("")}</div>`,
      ),
    );
  }

  const hy = input.hypothesis;
  if (hy !== undefined) {
    const findings = (hy.findings ?? []) as { id: string; status: string; evidence: string }[];
    const pw = (hy.requiredPWinBySymmetricMove ?? []) as { moveBps: number; costBps: number; pWin: number }[];
    parts.push(
      section(
        "hipotese",
        "Hipótese de 0,3% líquido",
        hy.verdict ?? "",
        table(["Frente", "Situação", "Evidência"], findings.map((f) => [f.id, f.status, f.evidence]), "sem dado", 3) +
          `<h3>Taxa de acerto exigida para o alvo</h3>${table(["Movimento simétrico", "Custo de duas pernas", "Taxa de acerto exigida"], pw.map((r) => [`${n(r.moveBps)} bps`, `${n(r.costBps, 1)} bps`, r.pWin > 1 ? "impossível" : pct(r.pWin)]))}`,
      ),
    );
  }

  const ap = input.apiBudget;
  if (ap !== undefined) {
    const pools = (ap.budget?.pools ?? []) as Json[];
    parts.push(
      section(
        "api",
        "Orçamento de API",
        `Tetos teóricos separados da franquia mensal. Ritmo do cliente: ${n(ap.clientPacing?.minIntervalMs)} ms entre requisições (política local, não limite do provedor).`,
        table(
          ["Pool", "Endpoints", "Teto por minuto", "Franquia mensal", "Usado no mês", "Estado"],
          pools.map((p) => [p.pool, n(p.endpoints), p.ceilings?.minute === null ? "não publicado" : n(p.ceilings?.minute), p.monthly?.franquia === null ? "sem franquia" : n(p.monthly?.franquia), n(p.monthly?.used), p.status]),
        ) +
          ["basic", "premium"]
            .filter((t) => ap.projection?.[t] !== undefined)
            .map((t) => {
              const q = ap.projection[t];
              return `<p class="muted">${esc(t)}: usado ${n(q.used)} de ${n(q.franquia)}, ritmo ${n(q.ratePerDay)} por dia, fim do mês ${n(q.projectedMonth)}, ${q.overQuota ? `estoura no dia ${n(q.exhaustionDay)}` : "cabe"}.</p>`;
            })
            .join(""),
      ),
    );
  }

  const caveats = (b?.caveats ?? []) as string[];
  const body = parts.length === 0 ? `<p class="muted">Nenhum relatório encontrado em data/bench. Rode os scripts de auditoria antes.</p>` : parts.join("\n");
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Motor de decisão</title>
<style>
:root{--bg:#f7f7f5;--fg:#1c1c1a;--muted:#62625c;--card:#fff;--line:#dcdcd4;--accent:#2b5fa5;--bar:#9db9de}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--fg:#ececE6;--muted:#a3a39b;--card:#1f1f1c;--line:#35352f;--accent:#7fa8de;--bar:#3d5a82}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:24px 16px 56px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 6px;padding-top:8px;border-top:1px solid var(--line)}h3{font-size:14px;margin:18px 0 6px;color:var(--muted)}
.intro,.muted,.note,.label{color:var(--muted)}.intro{margin:0 0 12px;max-width:80ch}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin:8px 0 14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px}
.label{font-size:12px}.value{font-size:22px;font-weight:600;word-break:break-word}.note{font-size:12px;margin-top:2px}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}
th,td{padding:6px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-weight:600;color:var(--muted)}.num{text-align:right;font-variant-numeric:tabular-nums}
.bars{display:grid;gap:4px;margin:6px 0 12px}.bar{display:grid;grid-template-columns:minmax(120px,240px) 1fr 70px;gap:8px;align-items:center;font-size:13px}
.bt{background:var(--card);border:1px solid var(--line);border-radius:4px;height:14px;overflow:hidden}.bf{display:block;height:100%;background:var(--bar)}.bv{text-align:right;font-variant-numeric:tabular-nums}
ul{margin:6px 0 0;padding-left:20px;color:var(--muted);font-size:13px}nav a{color:var(--accent);margin-right:12px;font-size:13px;text-decoration:none}
</style>
</head>
<body>
<main>
<h1>Motor de decisão e orçamento de API</h1>
<p class="muted">Gerado em ${esc(input.generatedAt)}. Dados do journal real em modo somente leitura. Nada aqui é lucro: execuções reais são poucas e a janela é curta.</p>
<nav>${parts.length > 0 ? ["estado", "falhas", "latencia", "custos", "motor", "paper", "executor", "hipotese", "api"].filter((id) => parts.some((p) => p.includes(`id="${id}"`))).map((id) => `<a href="#${id}">${esc(id)}</a>`).join("") : ""}</nav>
${body}
${caveats.length > 0 ? `<section id="limites"><h2>Limites desta leitura</h2><ul>${caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></section>` : ""}
</main>
</body>
</html>
`;
  return clean(html);
}

export interface LivePaths {
  /** Pasta dos journals do agente (ledger, fills, closings, scoreboard...), só leitura. */
  readonly agentDir: string;
  /** Pasta dos relatórios gerados (paper-run, rede, benchmark da decisão local). */
  readonly benchDir: string;
  readonly usagePath?: string | undefined;
  readonly ledgerPath?: string | undefined;
}

/** Monta o painel direto dos journals, sem depender de relatórios antigos em disco; só o que é gerado por outros scripts (paper-run, rede) vem de benchDir. */
export function buildLiveInput(paths: LivePaths, nowMs: number): DashboardInput {
  const baseline = runAudit(paths.agentDir, paths.usagePath ?? null, nowMs);
  const closingsPath = join(paths.agentDir, "closings.jsonl");
  const ledgerPath = join(paths.agentDir, "ledger.jsonl");
  const bench = (name: string) => read(join(paths.benchDir, name));
  const decisionBench = bench("decision-after.json") as { latencyMs?: { p95?: number } } | undefined;
  const hypothesis = assessHypothesis(inputsFrom(baseline, decisionBench ?? null, 30, 90));
  const apiBudget = buildReport({ ledgerPath: paths.ledgerPath ?? defaultLedgerPath(), plan: "free", now: nowMs, ...(paths.usagePath === undefined ? {} : { usagePath: paths.usagePath }) });
  return {
    generatedAt: new Date(nowMs).toISOString(),
    baseline: baseline as unknown as Json,
    shadow: existsSync(closingsPath) ? (summarizeShadow(replayClosings(readClosings(closingsPath), { mode: "bruta" }), "bruta", nowMs) as unknown as Json) : undefined,
    hypothesis: { ...hypothesis } as unknown as Json,
    executorSim: existsSync(ledgerPath) ? (simulate(terminalOrders(parseJsonl(readFileSync(ledgerPath, "utf8")).rows)) as unknown as Json) : undefined,
    paperRun: bench("paper-run.json"),
    network: bench("network-rtt.json"),
    apiBudget: JSON.parse(JSON.stringify(apiBudget)) as Json,
  };
}

/** Página para o servidor de relatórios: refaz o painel a cada `ttlMs` e, entre uma montagem e outra, devolve a anterior. */
export function createMotorPage(paths: LivePaths, options: { readonly ttlMs?: number; readonly now?: () => number } = {}): () => string {
  const ttlMs = options.ttlMs ?? 60_000;
  const now = options.now ?? Date.now;
  let cached: { at: number; html: string } | null = null;
  return () => {
    const t = now();
    if (cached === null || t - cached.at >= ttlMs) cached = { at: t, html: renderDashboard(buildLiveInput(paths, t)) };
    return cached.html;
  };
}

function read(path: string): Json | undefined {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Json) : undefined;
  } catch {
    return undefined;
  }
}

if (import.meta.main) {
  const bench = resolve(import.meta.dir, "../data/bench");
  const home = process.env.LOCALAPPDATA === undefined ? undefined : resolve(process.env.LOCALAPPDATA, "InonuTrader", "data", "onchain", `usage-${new Date().toISOString().slice(0, 7)}.json`);
  const apiBudget = buildReport({ ledgerPath: defaultLedgerPath(), ...(home !== undefined && existsSync(home) ? { usagePath: home } : {}), plan: "free", now: Date.now() });
  const html = renderDashboard({
    generatedAt: new Date().toISOString(),
    baseline: read(resolve(bench, "baseline-audit.json")),
    shadow: read(resolve(bench, "shadow-engine.json")),
    hypothesis: read(resolve(bench, "hypothesis-030.json")),
    executorSim: read(resolve(bench, "executor-health-sim.json")),
    paperRun: read(resolve(bench, "paper-run.json")),
    apiBudget: JSON.parse(JSON.stringify(apiBudget)) as Json,
    network: read(resolve(bench, "network-rtt.json")),
  });
  const out = resolve(bench, "dashboard.html");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html);
  console.log(`painel gerado: ${out} (${html.length} bytes)`);
}
