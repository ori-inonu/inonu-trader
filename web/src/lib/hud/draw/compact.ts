/** The analysis panels redrawn for a narrow column: every one is 480 wide, so the type stays readable on a phone or a side pane. Same data and same honesty as analysis.ts; only the arrangement changes. */
import type { HudModel, WindowStats } from "../types";
import { blockedGroups } from "../insights";
import { approxWidth, arc, capText, capUse, clamp, COL, fmt, fx, hhmm, leverageText, pct, readNote, text, thinLabels, title, unavailable, wrap } from "./h";

const ribbon = (x0: number, y0: number, h0: number, x1: number, y1: number, h1: number): string => {
  const xm = (x0 + x1) / 2;
  return `M${fx(x0)} ${fx(y0)}C${fx(xm)} ${fx(y0)} ${fx(xm)} ${fx(y1)} ${fx(x1)} ${fx(y1)}L${fx(x1)} ${fx(y1 + h1)}C${fx(xm)} ${fx(y1 + h1)} ${fx(xm)} ${fx(y0 + h0)} ${fx(x0)} ${fx(y0 + h0)}Z`;
};
const NO_ANALYSIS = "A VERSAO DO NUCLEO NAO ENVIA A ANALISE";
const NO_BAR = "O CODIGO NAO TEM BARRA DE CONVICCAO: A ESCOLHA DO JEV E A DECISAO";
const HISTORY = "ATE 14/10 HAVIA UMA BARRA DE 20 (P 60%), JA RETIRADA: SO HISTORICO, NAO REGRA";
const ALLOC_COLORS = ["#2ee6ff", "#38ffb4", "#7df3ff", "#ffb23e", "#5fa3b5", "#a58cff", "#ff6048", "#8fd3ff"];

/** The natural height of each compact panel (the width is always 480): the scene stacks them with these. */
export const COMPACT_H = { funnel: 412, hist: 370, matrix: 500, preferences: 450, timeline: 110, allocation: 620, equityMarks: 370, tripCards: 500, limits: 500, kpis: 340, cumulative: 370, outcomes: 430, activity: 350, moves: 410, recent: 560 } as const;

export function createCompact(D: HudModel) {
  const A = D.a;
  const cands = D.candidates;
  const net = A.trips.reduce((a, t) => a + (t.out - t.in), 0);

  function funnel(): string {
    if (!D.analysisOk) return unavailable(480, COMPACT_H.funnel, "DO ITEM AO RECIBO", NO_ANALYSIS);
    const F = A.funnel;
    const scale = 120 / Math.max(1, F.items);
    const hh = (c: number): number => Math.max(6, c * scale);
    const cy = 158;
    const stages: [string, number][] = [["ITENS", F.items], ["ABERTOS", F.open], ["PEDIDOS", F.asked], ["ENVIADAS", F.applied], ["EXECUT.", F.executed]];
    const drops: [string, number, string][] = [["FECHADOS PELO CODIGO", F.items - F.open, COL.mute], ["PULADOS PELO JEV", F.open - F.asked, COL.cy], ["BLOQUEADOS PELO CODIGO", F.asked - F.applied, COL.amber], ["NAO EXECUTADOS", F.applied - F.executed, COL.red]];
    const xs = [30, 140, 250, 360, 450];
    const bw = 18;
    let s = title(480, "DO ITEM AO RECIBO", `AS ULTIMAS ${F.consults} CONSULTAS, CANDIDATO A CANDIDATO`);
    stages.forEach(([name, c], i) => {
      const h = hh(c), y = cy - h / 2, x = xs[i]!;
      s += `<rect class="grow-y" x="${x}" y="${fx(y)}" width="${bw}" height="${fx(h)}" fill="${COL.cy}" opacity=".9" style="animation-delay:${(i * 0.1).toFixed(2)}s"/>`;
      s += text(x + bw / 2, 68, name, "t-sub", "font-size:9.5px;fill:#7df3ff", "middle") + text(x + bw / 2, 86, String(c), "t-num", "font-size:18px", "middle");
      if (i < stages.length - 1) {
        const cn = stages[i + 1]![1], hn = hh(cn), yn = cy - hn / 2, x1 = xs[i + 1]!;
        s += `<path d="${ribbon(x + bw, y, hn, x1, yn, hn)}" fill="${COL.cy}" opacity=".22"/>`;
        s += text((x + bw + x1) / 2, cy + 4, c ? Math.round((cn / c) * 100) + "%" : "-", "t-mono", "font-size:9.5px;fill:#bfefff", "middle");
      }
    });
    const flow = `M${xs[0]! + bw} ${cy}` + xs.slice(1).map((x) => `L${x} ${cy}`).join("");
    s += `<circle r="3.5" fill="#e9fbff" class="glow"><animateMotion dur="5s" repeatCount="indefinite" path="${flow}"/></circle>`;
    // what the code dropped in the last cycle is named under its count: the symbols and the reason
    const why = blockedGroups(D)[0];
    drops.forEach(([n, c, col], i) => {
      const y = 258 + i * 34;
      s += `<rect x="0" y="${y - 12}" width="14" height="14" fill="${col}"/>` + text(26, y, n, "t-sub", "font-size:10.5px") + text(480, y, String(c), "t-num", `font-size:19px;fill:${col}`, "end");
      if (i === 2 && why !== undefined) s += text(26, y + 13, `ULTIMO: ${why.names}, ${why.text}`.slice(0, 52), "t-mono", `font-size:10px;fill:${COL.amber}`);
    });
    return s + text(0, 396, "CADA ITEM E UM TOKEN OFERECIDO EM UMA CONSULTA", "t-sub", "font-size:9.5px") + text(0, 411, "FECHADOS: SEM CAIXA OU ABAIXO DO MINIMO DA REDE", "t-sub", "font-size:9.5px");
  }

  function hist(): string {
    if (!D.analysisOk) return unavailable(480, COMPACT_H.hist, "O QUANTO O JEV QUIS COMPRAR", NO_ANALYSIS);
    const all = A.hist.all, nw = A.hist.fresh;
    const x0 = 10, W = 460, y1 = 250, Hh = 160, bw = W / 20;
    const max = Math.max(...all, 1);
    const total = all.reduce((a, b) => a + b, 0);
    let s = title(480, "O QUANTO O JEV QUIS COMPRAR", `PREFERENCIA DE COMPRA EM ${total} RESPOSTAS`);
    for (let i = 0; i < 4; i++) s += `<line x1="${x0}" x2="${x0 + W}" y1="${y1 - (i * Hh) / 3}" y2="${y1 - (i * Hh) / 3}" stroke="${COL.grid}" stroke-dasharray="2 6"/>`;
    all.forEach((c, i) => {
      const h = (c / max) * Hh, x = x0 + i * bw;
      s += `<rect class="grow-y" x="${fx(x + 2)}" y="${fx(y1 - h)}" width="${fx(bw - 4)}" height="${fx(Math.max(h, 0.5))}" fill="#136a80" style="animation-delay:${(i * 0.03).toFixed(2)}s"/>`;
      const hn = ((nw[i] ?? 0) / max) * Hh;
      if (nw[i]) s += `<rect class="grow-y" x="${fx(x + 5)}" y="${fx(y1 - hn)}" width="${fx(bw - 10)}" height="${fx(hn)}" fill="${COL.cy}" style="animation-delay:${(0.4 + i * 0.03).toFixed(2)}s"/>`;
    });
    for (const v of [0, 20, 40, 60, 80, 100]) s += text(x0 + (v / 100) * W, y1 + 16, v + "%", "t-sub", "font-size:9.5px", "middle");
    return s + text(0, 302, "ESCURO: TODAS AS RESPOSTAS. CLARO: REDACAO NOVA", "t-sub", "font-size:9.5px") + text(0, 320, "A ALTURA E QUANTAS VEZES O JEV DEU ESSA PREFERENCIA", "t-sub", "font-size:9.5px") + text(0, 338, "NAO E CHANCE DE LUCRO", "t-sub", "font-size:9.5px");
  }

  function matrix(): string {
    const open = cands.filter((c) => !c.closed).sort((a, b) => (b.pbuy ?? 0) - (a.pbuy ?? 0));
    const rows = [...open, ...cands.filter((c) => c.closed)].slice(0, 9);
    const cols: [string, string, string][] = [["late_entry", "ATRAS.", "risk"], ["still_falling", "CAINDO", "risk"], ["accumulating", "ACUM.", "good"], ["exit_easy", "SAIDA", "good"], ["distribution", "DISTR.", "risk"], ["fading", "FORCA", "risk"]];
    const x0 = 156, cw = 54, y0 = 92, rh = 42;
    let s = title(480, "O QUE O JEV JULGOU", "AMBAR: RISCO. CIANO: FAVOR. DE 0 A 100");
    if (rows.length === 0) return s + text(0, 120, "AINDA SEM CONSULTA COM CANDIDATOS NESTA SESSAO", "t-sub", "font-size:10px");
    s += text(0, y0 - 12, "CANDIDATO", "t-sub", "font-size:9px") + text(x0 - 6, y0 - 12, "COMPRA", "t-sub", "font-size:9px", "end");
    cols.forEach(([, lab], i) => { s += text(x0 + i * cw + cw / 2 - 2, y0 - 12, lab, "t-sub", "font-size:8.5px", "middle"); });
    rows.forEach((c, r) => {
      const y = y0 + r * rh, dim = c.closed;
      const asked = c.applied !== null && c.applied !== "skip";
      const status = dim ? "FECHADO PELO CODIGO" : c.blocked !== null ? "PEDIU, CODIGO BLOQUEOU" : asked ? "PEDIU COMPRAR" : "O JEV PULOU";
      const scol = dim ? COL.mute : c.blocked !== null ? COL.amber : asked ? COL.green : COL.soft;
      s += text(0, y + 16, c.s.slice(0, 10), "t-num", `font-size:14px;fill:${dim ? COL.mute : COL.white}`) + text(0, y + 36, status, "t-sub", `font-size:9.5px;letter-spacing:.06em;fill:${scol}`);
      s += text(x0 - 6, y + 22, dim || c.pbuy === null ? "-" : Math.round(c.pbuy * 100) + "%", "t-mono", `font-size:12px;fill:${dim ? COL.mute : "#7df3ff"}`, "end");
      const vals = cols.map(([k]) => c.facets[k]);
      const mx = Math.max(...vals.filter((v): v is number => typeof v === "number"), -1);
      cols.forEach(([k, , kind], i) => {
        const v = c.facets[k], has = typeof v === "number", x = x0 + i * cw, col = kind === "good" ? COL.cy : COL.amber;
        s += `<rect x="${x + 1}" y="${y + 4}" width="${cw - 5}" height="${rh - 12}" fill="${has ? col : "#0b2c38"}" opacity="${has ? (0.1 + 0.8 * v).toFixed(2) : "0.25"}" ${has && v === mx ? `stroke="${COL.white}" stroke-width="1.3"` : ""}/>`;
        s += text(x + cw / 2 - 2, y + 24, has ? String(Math.round(v * 100)) : "-", "t-mono", `font-size:12px;fill:${has ? COL.white : COL.mute}`, "middle");
      });
    });
    return s + text(0, y0 + rows.length * rh + 14, "CONTORNO: A MAIOR DA LINHA. NENHUMA REGRA LE PERDE FORCA", "t-sub", "font-size:9px");
  }

  // the Jev's own preference for each purchase he asked for, with no bar line: his choice is the decision
  function preferences(): string {
    if (!D.analysisOk) return unavailable(480, COMPACT_H.preferences, "PREFERENCIA DO JEV POR PEDIDO", NO_ANALYSIS);
    const asks = A.asks.slice(-8).reverse();
    const gx = 118, gw = 190;
    let s = title(480, "PREFERENCIA DO JEV POR PEDIDO", `${A.asks.length} PEDIDOS, COM A PROBABILIDADE QUE ELE DEU`);
    s += text(gx, 82, "PREFERENCIA DE COMPRA, 0 A 100%", "t-sub", "font-size:9px");
    asks.forEach((a, i) => {
      const y = 100 + i * 34, pass = a.ok;
      // a request of the last cycle that the code then dropped is not a decision carried out, so it says who stopped it
      const held = pass && D.last.atMs !== null && Math.abs(a.t - D.last.atMs) < 1000 && D.last.dropped.some((d) => d.side === "buy" && d.s === (a.s ?? "").slice(0, 14));
      const shade = held ? COL.amber : pass ? COL.cy : COL.mute;
      s += text(0, y + 12, hhmm(a.t), "t-mono", "font-size:11px;fill:#5fa3b5") + text(46, y + 12, (a.s ?? "-").slice(0, 8), "t-num", "font-size:13px");
      s += `<rect x="${gx}" y="${y + 3}" width="${gw}" height="10" fill="${COL.dim}"/><rect class="grow-x" x="${gx}" y="${y + 3}" width="${fx(clamp(a.p, 0, 1) * gw)}" height="10" fill="${shade}" style="animation-delay:${(i * 0.06).toFixed(2)}s"/>`;
      s += text(gx + gw + 10, y + 13, "P " + Math.round(a.p * 100) + "%", "t-mono", "font-size:11.5px;fill:#bfefff") + text(480, y + 13, held ? "BLOQUEADA" : pass ? "PEDIDA" : "SEM ORDEM", "t-sub", `font-size:9px;fill:${shade}`, "end");
    });
    s += wrap(NO_BAR, 62).reduce((acc, l, i) => acc + text(0, 394 + i * 14, l, "t-sub", "font-size:9.5px"), "");
    // older requests that did not become an order are history: until 2026-10-14 a bar of 20 (P 60%) stood there, and it is gone
    return A.asks.some((a) => !a.ok) ? s + wrap(HISTORY, 62).reduce((acc, l, i) => acc + text(0, 424 + i * 14, l, "t-sub", `font-size:9.5px;fill:${COL.mute}`), "") : s;
  }

  function timeline(): string {
    if (!D.analysisOk || A.timeline.length === 0) return text(0, 14, D.analysisOk ? "AINDA SEM CONSULTAS NESTA SESSAO" : "LINHA DO TEMPO: " + NO_ANALYSIS, "t-sub", "font-size:9.5px");
    const T = A.timeline, w = 480 / T.length, mx = Math.max(...T.map((t) => t.open), 1);
    let s = text(0, 12, `ULTIMAS ${T.length} CONSULTAS: ABERTOS, PEDIDOS, ENVIADAS`, "t-sub", "font-size:9.5px");
    const kinds: ["open" | "asked" | "applied", string][] = [["open", COL.cy], ["asked", COL.amber], ["applied", COL.green]];
    T.forEach((t, i) => {
      const x = i * w;
      const h = (v: number): number => Math.max(v ? 3 : 0, (v / mx) * 40);
      kinds.forEach(([k, col], j) => { s += `<rect class="grow-y" x="${fx(x + 1 + (j * (w - 2)) / 3)}" y="${fx(76 - h(t[k]))}" width="${fx((w - 2) / 3 - 0.5)}" height="${fx(h(t[k]))}" fill="${col}" opacity=".9" style="animation-delay:${(i * 0.02).toFixed(2)}s"/>`; });
      if (i % 8 === 0) s += text(x, 92, hhmm(t.t), "t-sub", "font-size:8.5px");
    });
    return s;
  }

  function allocation(): string {
    const ps = D.wallet.positions.filter((p) => p.usd !== null && p.usd > 0).sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
    const total = D.wallet.total ?? ps.reduce((a, p) => a + (p.usd ?? 0), 0);
    let s = title(480, "A CARTEIRA, ATIVO POR ATIVO", total > 0 ? `US$ ${fmt(total)} NA CARTEIRA GERIDA` : readNote(D.wallet.lastReadMs));
    if (!(total > 0)) return s + text(0, 100, "SEM LEITURA DA CARTEIRA", "t-sub", "font-size:10px");
    const cx = 240, cy = 180, R = 98;
    let acc = 0;
    let donut = "";
    ps.forEach((p, i) => { const sw = ((p.usd ?? 0) / total) * 360; if (sw > 0.4) donut += `<path class="draw" pathLength="1" d="${arc(cx, cy, R, acc + 0.8, acc + sw - 0.8)}" stroke="${ALLOC_COLORS[i % ALLOC_COLORS.length]}" stroke-width="26" fill="none" style="animation-delay:${(i * 0.12).toFixed(2)}s"/>`; acc += sw; });
    s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${COL.dim}" stroke-width="26"/>${donut}<g class="spin-d" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="${R + 22}" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="3 9"/></g>`;
    s += text(cx, cy, "US$ " + fmt(total), "t-big", "font-size:24px", "middle") + text(cx, cy + 20, ps.length + " ATIVOS", "t-sub", "font-size:10px", "middle");
    ps.slice(0, 8).forEach((p, i) => {
      const y = 330 + i * 36, share = (p.usd ?? 0) / total, col = ALLOC_COLORS[i % ALLOC_COLORS.length]!;
      s += `<rect x="0" y="${y - 12}" width="12" height="12" fill="${col}"/>` + text(20, y, p.s, "t-num", "font-size:15px") + text(296, y, "US$ " + fmt(p.usd), "t-mono", "font-size:12.5px", "end");
      s += `<rect x="306" y="${y - 9}" width="110" height="7" fill="${COL.dim}"/><rect class="grow-x" x="306" y="${y - 9}" width="${fx(Math.max(2, share * 110))}" height="7" fill="${col}"/>` + text(480, y, fmt(share * 100, 1) + "%", "t-mono", "font-size:12px", "end");
      s += text(20, y + 14, p.cash ? "CAIXA EM USDC" : p.plan ? "COM PLANO DE SAIDA" : "SEM PLANO DE SAIDA", "t-sub", `font-size:8.5px;fill:${p.cash ? COL.soft : p.plan ? COL.green : COL.amber}`);
    });
    return s;
  }

  function equityMarks(): string {
    const eq = D.equity;
    let s = title(480, "O PATRIMONIO E AS ORDENS", "TRIANGULO = ORDEM EXECUTADA");
    if (eq.length < 2) return s + text(0, 100, "AINDA SEM HISTORICO DA CARTEIRA", "t-sub", "font-size:10px");
    const x0 = 8, x1 = 472, y0 = 96, y1 = 270;
    const vmin = Math.min(...eq.map((p) => p.v)), vmax = Math.max(...eq.map((p) => p.v));
    const t0 = eq[0]!.t, t1 = eq[eq.length - 1]!.t;
    const px = (t: number): number => x0 + ((t - t0) / (t1 - t0 || 1)) * (x1 - x0);
    const py = (v: number): number => y1 - ((v - vmin) / (vmax - vmin || 1)) * (y1 - y0);
    const line = eq.map((p, i) => `${i ? "L" : "M"}${fx(px(p.t))} ${fx(py(p.v))}`).join("");
    for (const i of [0, 2, 4]) { const y = y0 + (i * (y1 - y0)) / 4; s += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="${COL.grid}" stroke-dasharray="2 6"/>` + text(x1, y - 4, "US$ " + fmt(vmax - (i * (vmax - vmin)) / 4), "t-sub", "font-size:9px", "end"); }
    s += `<path d="${line}L${x1} ${y1}L${x0} ${y1}Z" fill="url(#areaGrad)"/><path d="${line}" fill="none" stroke="${COL.cy}" stroke-width="2" class="glow"/>`;
    D.events.filter((e) => e.t >= t0).forEach((e) => {
      const x = px(e.t), y = py(eq.reduce((m, p) => (Math.abs(p.t - e.t) < Math.abs(m.t - e.t) ? p : m)).v), ok = e.stage === "executada";
      const col = !ok ? COL.red : e.side === "buy" ? COL.green : COL.amber;
      s += ok ? (e.side === "buy" ? `<path d="M${fx(x)} ${fx(y - 10)}l6 10h-12z" fill="${col}"/>` : `<path d="M${fx(x)} ${fx(y + 10)}l6 -10h-12z" fill="${col}"/>`) : `<path d="M${fx(x - 4)} ${fx(y - 4)}l8 8M${fx(x + 4)} ${fx(y - 4)}l-8 8" stroke="${col}" stroke-width="2"/>`;
    });
    s += text(x0, y1 + 20, new Date(t0).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }), "t-sub", "font-size:9.5px") + text(x1, y1 + 20, "AGORA", "t-sub", "font-size:9.5px", "end");
    s += `<path d="M0 318l8 -10h12z" fill="${COL.green}"/>` + text(26, 318, "COMPRA", "t-sub", "font-size:9.5px") + `<path d="M110 308l8 10h12z" fill="${COL.amber}"/>` + text(136, 318, "VENDA", "t-sub", "font-size:9.5px") + `<path d="M210 308l9 9M219 308l-9 9" stroke="${COL.red}" stroke-width="2"/>` + text(230, 318, "ORDEM COM FALHA", "t-sub", "font-size:9.5px");
    return s + text(0, 344, "A CURVA MISTURA APORTES E PRECOS COM AS ORDENS.", "t-sub", "font-size:9px") + text(0, 358, "NAO E LUCRO DO SISTEMA", "t-sub", "font-size:9px");
  }

  function tripCards(): string {
    if (!D.analysisOk) return unavailable(480, COMPACT_H.tripCards, "POSICOES JA ENCERRADAS", NO_ANALYSIS);
    const rows = A.trips.slice(-2);
    let s = title(480, "POSICOES JA ENCERRADAS", "DA COMPRA A VENDA");
    if (!rows.length) return s + text(0, 100, "AINDA NAO HA VOLTA FECHADA", "t-sub", "font-size:11px");
    rows.forEach((t, i) => {
      const y = 70 + i * 212, col = t.pct >= 0 ? COL.green : COL.amber, mins = Math.round((t.sellAt - t.buyAt) / 60000);
      s += `<g transform="translate(0 ${y})"><rect x="0" y="0" width="480" height="196" fill="#031820" stroke="#124c5f"/><path d="M0 0h24M0 0v24M480 196h-24M480 196v-24" stroke="${COL.cy}" stroke-width="2" fill="none"/>
        ${text(16, 36, t.s, "t-big", "font-size:26px")}${text(464, 34, pct(t.pct), "t-big", `font-size:26px;fill:${col}`, "end")}${text(16, 56, `FICOU ${mins} MIN, ${hhmm(t.buyAt)} ATE ${hhmm(t.sellAt)}`, "t-sub", "font-size:10px")}
        <line x1="50" y1="112" x2="430" y2="112" stroke="#124c5f" stroke-width="2"/><line x1="50" y1="112" x2="430" y2="112" stroke="${col}" stroke-width="2" class="flow-fast"/>
        <circle cx="50" cy="112" r="7" fill="#031820" stroke="${COL.green}" stroke-width="2"/><circle cx="430" cy="112" r="7" fill="#031820" stroke="${col}" stroke-width="2"/>
        <circle r="4" fill="#e9fbff" class="glow"><animateMotion dur="${(3 + i).toFixed(1)}s" repeatCount="indefinite" path="M50 112L430 112"/></circle>
        ${text(50, 90, fmt(t.in) + " USDC", "t-mono", "font-size:12px;fill:#bfefff", "middle")}${text(430, 90, fmt(t.out) + " USDC", "t-mono", `font-size:12px;fill:${col}`, "middle")}${text(50, 138, "COMPRA", "t-sub", "font-size:9px", "middle")}${text(430, 138, "VENDA", "t-sub", "font-size:9px", "middle")}
        ${text(16, 172, "RESULTADO DO CAIXA", "t-sub", "font-size:9.5px")}${text(464, 175, (t.out - t.in >= 0 ? "+" : "") + fmt(t.out - t.in, 4) + " USDC", "t-num", `font-size:17px;fill:${col}`, "end")}</g>`;
    });
    return s;
  }

  function limits(): string {
    const sp = A.orders.spentToday;
    const cap = D.agent.caps ?? { maxBuyUsd: undefined, maxDailyBuyUsd: undefined, maxDailySellUsd: undefined };
    const total = D.wallet.total ?? 0;
    // a wallet nobody read has no share of cash: the ring stays empty and says so, instead of a zero that looks like a fact
    const unread = D.wallet.cash === null || !(total > 0);
    const cashShare = unread ? 0 : (D.wallet.cash as number) / total;
    const known = D.analysisOk;
    // A placeholder zero is not a reported spend; ceilings still come from core status.
    const gauges: [string, number | null, string, string, string?][] = [
      ["COMPRAS HOJE", known ? capUse(sp.buy, cap.maxDailyBuyUsd) : null, known ? `US$ ${fmt(sp.buy, 0)} DE ${capText(cap.maxDailyBuyUsd)}` : `SEM DADO DO NUCLEO, LIMITE ${capText(cap.maxDailyBuyUsd)}`, COL.cy, known ? undefined : "SEM DADO"],
      ["VENDAS HOJE", known ? capUse(sp.sell, cap.maxDailySellUsd) : null, known ? `US$ ${fmt(sp.sell, 0)} DE ${capText(cap.maxDailySellUsd)}` : `SEM DADO DO NUCLEO, LIMITE ${capText(cap.maxDailySellUsd)}`, COL.soft, known ? undefined : "SEM DADO"],
      ["CONSULTAS", D.budget.max > 0 ? D.budget.consults / D.budget.max : 0, `${D.budget.consults} DE ${D.budget.max}`, COL.cy],
      ["CAIXA LIVRE", cashShare, unread ? "SEM LEITURA DA CARTEIRA" : `${Math.round(cashShare * 100)}% DA CARTEIRA`, COL.green, unread ? "-" : undefined],
    ];
    let s = title(480, "LIMITES E RISCO DO DIA", "ATE ONDE O AGENTE VAI SEM PEDIR");
    gauges.forEach(([lab, f, val, col, centre], i) => {
      const cx = 120 + (i % 2) * 240, cy = 150 + Math.floor(i / 2) * 160, fr = clamp(f ?? 0, 0, 1);
      s += `<circle cx="${cx}" cy="${cy}" r="44" fill="none" stroke="${COL.dim}" stroke-width="10"/><path class="draw" pathLength="1" d="${arc(cx, cy, 44, 0, Math.max(2, fr * 359))}" fill="none" stroke="${col}" stroke-width="10"/><g class="${i % 2 ? "spin-c" : "spin-d"}" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="56" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="3 9"/></g>`;
      s += text(cx, cy + 6, centre ?? (f === null ? "LIVRE" : Math.round(fr * 100) + "%"), "t-num", `font-size:${f === null ? 13 : 17}px`, "middle") + text(cx, cy + 76, lab, "t-sub", "font-size:9.5px", "middle") + text(cx, cy + 92, val, "t-mono", "font-size:11px;fill:#7df3ff", "middle");
    });
    // only what the core says: no risk per operation and no minimum order are rules of the code any more (the Jev sizes the order)
    const rules: [string, string][] = [["TETO DE COMPRA", capText(cap.maxBuyUsd)], ["RESERVA EM CAIXA", fmt(D.agent.reserveShare * 100, 0) + "%"], ["ALAVANCAGEM", leverageText(D.agent.leverage, true)], ["AUTORIDADE", D.agent.authority.toUpperCase()]];
    rules.forEach(([a, b], i) => { const x = (i % 2) * 240, y = 428 + Math.floor(i / 2) * 38; s += text(x, y, a, "t-sub", "font-size:9.5px") + text(x, y + 15, b, "t-mono", "font-size:12px;fill:#bfefff"); });
    return s;
  }

  function kpis(): string {
    if (!D.analysisOk) return unavailable(480, COMPACT_H.kpis, "RESULTADO", NO_ANALYSIS);
    const neg = A.trips.filter((t) => t.pct < 0).length, o = A.orders.outcomes;
    const eq = D.equity;
    const win = eq.length > 1 ? (eq[eq.length - 1]!.v / eq[0]!.v - 1) * 100 : null;
    const ok = o.executada ?? 0, fail = o.falhou ?? 0;
    const blocks: [string, string, string, string][] = [
      ["VOLTAS FECHADAS", String(A.trips.length), `${neg} DE ${A.trips.length} NEGATIVAS`, COL.white],
      ["CAIXA DAS VOLTAS", (net > 0 ? "+" : "") + fmt(net, 3), "USDC, ANTES DA TAXA", net >= 0 ? COL.green : COL.amber],
      ["TAXAS DE REDE", fmt(A.fees.lamports / 1e9, 5), "SOL, SO A REDE", COL.white],
      ["ORDENS", `${ok} DE ${ok + fail}`, `${fail} FALHARAM`, fail ? COL.amber : COL.green],
      ["CARTEIRA NA JANELA", pct(win, 1), "NAO E LUCRO", COL.soft],
    ];
    let s = "";
    blocks.forEach(([lab, val, sub, col], i) => {
      const x = (i % 2) * 250, y = Math.floor(i / 2) * 108;
      s += `<path d="M${x} ${y + 6}V${y}H${x + 220}" fill="none" stroke="${COL.cy}" stroke-width="1.3"/>` + text(x + 2, y + 24, lab, "t-title", "font-size:10.5px") + text(x + 2, y + 66, val, "t-big", `font-size:28px;fill:${col}`) + text(x + 2, y + 86, sub, "t-sub", "font-size:9.5px") + `<rect class="grow-x" x="${x + 2}" y="${y + 94}" width="200" height="2" fill="${col}"/>`;
    });
    return s;
  }

  function cumulative(): string {
    if (!D.analysisOk) return unavailable(480, COMPACT_H.cumulative, "CAIXA ACUMULADO DAS VOLTAS", NO_ANALYSIS);
    const tr = A.trips, x0 = 20, x1 = 440, y0 = 80, y1 = 250;
    let cum = 0;
    const pts: [number, number, string][] = [[0, 0, "INICIO"]];
    tr.forEach((t) => { cum += t.out - t.in; pts.push([t.sellAt, cum, t.s]); });
    const vmin = Math.min(0, ...pts.map((p) => p[1])) - 0.05, vmax = Math.max(0, ...pts.map((p) => p[1])) + 0.05;
    const px = (_t: number, i: number): number => x0 + (i * (x1 - x0 - 30)) / Math.max(1, pts.length - 1);
    const py = (v: number): number => y1 - ((v - vmin) / (vmax - vmin)) * (y1 - y0);
    let s = title(480, "CAIXA ACUMULADO DAS VOLTAS", "USDC, ANTES DA TAXA EM SOL");
    s += `<line x1="${x0}" x2="${x1}" y1="${fx(py(0))}" y2="${fx(py(0))}" stroke="${COL.soft}" stroke-dasharray="5 5"/>` + text(x1, py(0) - 6, "EMPATE", "t-sub", "font-size:9.5px;fill:#7df3ff", "end");
    let path = "";
    pts.forEach((p, i) => { const x = px(p[0], i), y = py(p[1]); path += i ? `L${fx(x)} ${fx(py(pts[i - 1]![1]))}L${fx(x)} ${fx(y)}` : `M${fx(x)} ${fx(y)}`; });
    s += `<path d="${path}L${x1} ${fx(py(cum))}" fill="none" stroke="${cum >= 0 ? COL.green : COL.amber}" stroke-width="2.2" class="glow draw" pathLength="1"/>`;
    // the labels of the steps are written only where they have room: the newest first, a crowded run keeps every other one that fits
    const steps = pts.slice(1).map((p, k) => ({ p, x: px(p[0], k + 1), y: py(p[1]) }));
    const nameOn = thinLabels(steps.map((t) => Math.min(t.x, 440)), steps.map((t) => approxWidth(t.p[2], 10.5, 0.14, false, false)));
    const valueW = steps.map((t) => approxWidth((t.p[1] > 0 ? "+" : "") + fmt(t.p[1], 3), 11.5, 0.02, true, false));
    const valueOn = thinLabels(steps.map((t, k) => Math.min(t.x, 420) + 8 + valueW[k]! / 2), valueW);
    steps.forEach((t, k) => { s += `<circle cx="${fx(t.x)}" cy="${fx(t.y)}" r="5" fill="#031820" stroke="${COL.amber}" stroke-width="2"/>` + (nameOn[k] ? text(Math.min(t.x, 440), t.y + 22, t.p[2], "t-sub", "font-size:9.5px", "middle") : "") + (valueOn[k] ? text(Math.min(t.x, 420) + 8, t.y - 9, (t.p[1] > 0 ? "+" : "") + fmt(t.p[1], 3), "t-mono", `font-size:11.5px;fill:${COL.amber}`) : ""); });
    return s + text(0, 296, `PARA O EMPATE FALTAM ${fmt(Math.abs(Math.min(0, cum)), 3)} USDC, MAIS A REDE`, "t-sub", "font-size:9.5px") + text(0, 314, A.trips.length < 5 ? `${A.trips.length} VOLTAS SAO POUCAS PARA CONCLUIR` : `${A.trips.length} VOLTAS FECHADAS`, "t-sub", "font-size:9.5px;fill:#7df3ff");
  }

  function outcomes(): string {
    if (!D.analysisOk) return unavailable(480, COMPACT_H.outcomes, "O QUE ACONTECEU COM AS ORDENS", NO_ANALYSIS);
    const o = A.orders.outcomes, rs = A.orders.reasons;
    const parts: [string, number, string][] = [["EXECUTADAS", o.executada ?? 0, COL.green], ["FALHARAM", o.falhou ?? 0, COL.amber], ["INCERTAS", o.incerta ?? 0, COL.mute]];
    const tot = parts.reduce((a, p) => a + p[1], 0) || 1;
    const cx = 240, cy = 150, R = 70;
    let acc = 0;
    let s = title(480, "O QUE ACONTECEU COM AS ORDENS", "COMO TERMINARAM AS ORDENS ENVIADAS");
    s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${COL.dim}" stroke-width="22"/>`;
    parts.forEach(([, n, col], i) => { const sw = (n / tot) * 360; if (n) s += `<path class="draw" pathLength="1" d="${arc(cx, cy, R, acc + 1, acc + sw - 1)}" stroke="${col}" stroke-width="22" fill="none" style="animation-delay:${(i * 0.2).toFixed(2)}s"/>`; acc += sw; });
    s += text(cx, cy + 4, String(parts.reduce((a, p) => a + p[1], 0)), "t-big", "font-size:28px", "middle") + text(cx, cy + 22, "ORDENS", "t-sub", "font-size:9.5px", "middle");
    parts.forEach(([lab, n, col], i) => { const x = 40 + i * 150; s += `<rect x="${x}" y="250" width="11" height="11" fill="${col}"/>` + text(x + 18, 260, lab, "t-sub", "font-size:10px") + text(x + 18, 282, String(n), "t-num", "font-size:18px"); });
    const names: Record<string, string> = { simulacao_falhou: "SIMULACAO FALHOU ANTES DE ASSINAR", recibo_erro: "RECIBO VOLTOU COM ERRO", confirmando: "FERRAMENTA PEDIU CONFIRMACAO", resolvida_pelo_usuario: "RESOLVIDA A MAO PELO DONO" };
    s += text(0, 316, "POR QUE FALHARAM", "t-sub", `font-size:10px;fill:${COL.amber}`);
    Object.entries(rs).slice(0, 4).forEach(([k, n], i) => { s += text(0, 342 + i * 24, names[k] ?? k.replace(/_/g, " ").toUpperCase(), "t-sub", "font-size:10px") + `<rect x="360" y="${334 + i * 24}" width="${Math.min(80, n * 36)}" height="8" fill="${COL.amber}" opacity=".8"/>` + text(480, 342 + i * 24, String(n), "t-mono", "font-size:12px", "end"); });
    return s;
  }

  function activity(): string {
    if (!D.analysisOk) return unavailable(480, COMPACT_H.activity, "A ATIVIDADE DO AGENTE", NO_ANALYSIS);
    const F = A.funnel;
    const items: [string, number, number, string][] = [["CONSULTAS DO DIA", D.budget.consults, Math.max(1, D.budget.max), COL.cy], ["ITENS AVALIADOS", F.items, Math.max(1, F.items), COL.soft], ["PEDIDOS DE COMPRA", F.asked, Math.max(1, F.open), COL.amber], ["BLOQUEADOS PELO CODIGO", F.asked - F.applied, Math.max(1, F.asked), COL.amber], ["EXECUTADAS", F.executed, Math.max(1, F.applied), COL.green], ["FALHAS NA CADEIA", F.failed, Math.max(1, F.applied), COL.red]];
    let s = title(480, "A ATIVIDADE DO AGENTE", `ITENS E PEDIDOS: ULTIMAS ${F.consults} CONSULTAS`);
    items.forEach(([lab, v, mx, col], i) => {
      const cx = 80 + (i % 3) * 160, cy = 130 + Math.floor(i / 3) * 140;
      s += `<circle cx="${cx}" cy="${cy}" r="40" fill="none" stroke="${COL.dim}" stroke-width="8"/><path class="draw" pathLength="1" d="${arc(cx, cy, 40, 0, Math.max(2, clamp(v / mx, 0, 1) * 359))}" fill="none" stroke="${col}" stroke-width="8"/><g class="${i % 2 ? "spin-c" : "spin-d"}" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="51" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="2 8"/></g>`;
      s += text(cx, cy + 7, String(v), "t-big", "font-size:22px", "middle") + text(cx, cy + 68, lab, "t-sub", "font-size:9px", "middle");
    });
    return s;
  }

  function moves(win: "15m" | "1h"): string {
    const name = win === "15m" ? "O PRECO 15 MINUTOS DEPOIS" : "O PRECO 1 HORA DEPOIS";
    if (!D.analysisOk) return unavailable(480, COMPACT_H.moves, name, NO_ANALYSIS);
    const G: [string, WindowStats, string][] = [["PULADAS PELO JEV", A.placar.skipped[win], COL.cy], ["FECHADAS PELO CODIGO", A.placar.closed[win], COL.amber], ["PEDIDAS E SEM ORDEM", A.placar.gated[win], COL.white]];
    const lo = -20, hi = 20, nb = 10, bw = (hi - lo) / nb, x0 = 10, W = 460, y1 = 250, Hh = 150, slot = W / nb;
    const bins = G.map(([, g]) => { const b = new Array<number>(nb).fill(0); g.vals.forEach((v) => { const k = clamp(Math.floor((clamp(v, lo, hi - 0.001) - lo) / bw), 0, nb - 1); b[k] = (b[k] ?? 0) + 1; }); const n = g.vals.length || 1; return b.map((c) => c / n); });
    const mx = Math.max(0.05, ...bins.flat());
    let s = title(480, name, "DO QUE NAO FOI COMPRADO. CONTRAFACTUAL");
    s += `<line x1="${x0 + W / 2}" x2="${x0 + W / 2}" y1="72" y2="${y1}" stroke="${COL.soft}" stroke-width="1.3" stroke-dasharray="5 5"/>`;
    for (let i = 0; i <= nb; i += 5) s += text(x0 + i * slot, y1 + 16, lo + i * bw + "%", "t-sub", "font-size:9.5px", "middle");
    G.forEach(([, g, col], gi) => {
      if (g.n < 5) return;
      bins[gi]!.forEach((v, bi) => { const h = (v / mx) * Hh, x = x0 + bi * slot + 3 + (gi * (slot - 6)) / 3; s += `<rect class="grow-y" x="${fx(x)}" y="${fx(y1 - h)}" width="${fx((slot - 6) / 3 - 1)}" height="${fx(Math.max(h, 0.4))}" fill="${col}" opacity=".85" style="animation-delay:${(bi * 0.04 + gi * 0.1).toFixed(2)}s"/>`; });
      if (g.mean !== null) { const mxp = x0 + ((clamp(g.mean, lo, hi) - lo) / (hi - lo)) * W; s += `<line x1="${fx(mxp)}" x2="${fx(mxp)}" y1="84" y2="${y1}" stroke="${col}" stroke-width="1.5" stroke-dasharray="2 4"/>`; }
    });
    G.forEach(([lab, g, col], gi) => { const y = 296 + gi * 36; s += `<rect x="0" y="${y - 10}" width="11" height="11" fill="${col}"/>` + text(18, y, lab, "t-sub", "font-size:10px") + text(480, y, g.n < 5 ? `${g.n} CASOS, POUCOS PARA DESENHAR` : `${g.n} CASOS, ${g.up} SUBIRAM, MEDIA ${pct(g.mean, 1)}`, "t-mono", `font-size:11px;fill:${col}`, "end"); });
    return s + text(0, 398, "ALTURA = PARTE DE CADA GRUPO. TRACEJADO = MEDIA", "t-sub", "font-size:9px");
  }

  function recent(): string {
    if (!D.analysisOk) return unavailable(480, COMPACT_H.recent, "ULTIMAS DECISOES DE NAO COMPRAR", NO_ANALYSIS);
    const measured = (r: { m15: number | null; m1h: number | null }): number => (r.m15 !== null || r.m1h !== null ? 1 : 0);
    const R = [...A.recent].sort((a, b) => measured(b) - measured(a) || b.t - a.t).slice(0, 8);
    const kinds: Record<string, [string, string]> = { "pulada pelo Jev": [COL.cy, "O JEV PULOU"], "puxada pelo codigo": [COL.amber, "FECHADO PELO CODIGO"], "pedida e recusada": [COL.white, "PEDIU, NAO VIROU ORDEM"] };
    let s = title(480, "ULTIMAS DECISOES DE NAO COMPRAR", "E O QUE O PRECO FEZ DEPOIS. CONTRAFACTUAL");
    if (R.length === 0) return s + text(0, 100, "AINDA SEM DECISOES MEDIDAS", "t-sub", "font-size:11px");
    const cell = (x: number, y: number, label: string, v: number | null): string => {
      const head = text(x, y, label, "t-sub", "font-size:8.5px");
      if (v === null) return head + text(x + 60, y, "AINDA MEDINDO", "t-sub", `font-size:9px;fill:${COL.mute}`);
      // the zero is at the middle of the bar zone, clear of the label on its left and of the figure on its right
      const w = Math.min(44, Math.abs(v) * 3.6), col = v >= 0 ? COL.green : COL.amber;
      return head + `<line x1="${x + 124}" x2="${x + 124}" y1="${y - 8}" y2="${y + 3}" stroke="${COL.mute}"/><rect class="grow-x" x="${v >= 0 ? x + 124 : x + 124 - w}" y="${y - 6}" width="${fx(Math.max(w, 1))}" height="8" fill="${col}"/>` + text(x + 214, y + 2, pct(v, 1), "t-mono", `font-size:11px;fill:${col}`, "end");
    };
    R.forEach((r, i) => {
      const y = 86 + i * 58, [kc, kl] = kinds[r.kind] ?? [COL.mute, r.kind.toUpperCase()];
      s += `<circle cx="6" cy="${y - 4}" r="5" fill="${kc}"/>` + text(20, y, hhmm(r.t), "t-mono", "font-size:11.5px;fill:#5fa3b5") + text(76, y, (r.s ?? "-").slice(0, 10), "t-num", "font-size:14px") + text(480, y, kl, "t-sub", `font-size:9px;fill:${kc}`, "end") + cell(20, y + 24, "15 MIN", r.m15) + cell(258, y + 24, "1 HORA", r.m1h);
    });
    return s;
  }

  return { funnel, hist, matrix, preferences, timeline, allocation, equityMarks, tripCards, limits, kpis, cumulative, outcomes, activity, moves, recent };
}
