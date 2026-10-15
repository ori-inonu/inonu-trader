/** The analysis panels for wide screens: where every decision, asset and result can be examined. Each panel draws in local coordinates; the size is in the comment of each. */
import type { HudModel } from "../types";
import { blockedGroups } from "../insights";
import { approxWidth, arc, capText, capUse, clamp, COL, countText, fmt, fx, hhmm, leverageText, pct, readNote, text, thinLabels, title, unavailable } from "./h";

const ribbon = (x0: number, y0: number, h0: number, x1: number, y1: number, h1: number): string => {
  const xm = (x0 + x1) / 2;
  return `M${fx(x0)} ${fx(y0)}C${fx(xm)} ${fx(y0)} ${fx(xm)} ${fx(y1)} ${fx(x1)} ${fx(y1)}L${fx(x1)} ${fx(y1 + h1)}C${fx(xm)} ${fx(y1 + h1)} ${fx(xm)} ${fx(y0 + h0)} ${fx(x0)} ${fx(y0 + h0)}Z`;
};
const NO_ANALYSIS = "A VERSAO DO NUCLEO NAO ENVIA A ANALISE";
const NO_BAR = "O CODIGO NAO TEM BARRA DE CONVICCAO: A ESCOLHA DO JEV E A DECISAO";
const HISTORY = "ATE 14/10 HAVIA UMA BARRA DE 20 (P 60%), JA RETIRADA: SO HISTORICO, NAO REGRA";
const ALLOC_COLORS = ["#2ee6ff", "#38ffb4", "#7df3ff", "#ffb23e", "#5fa3b5", "#a58cff", "#ff6048", "#8fd3ff"];

export function createAnalysis(D: HudModel) {
  const A = D.a;
  const cands = D.candidates;
  const net = A.trips.reduce((a, t) => a + (t.out - t.in), 0);

  // from every item of purchase down to the order that really went out. natural size 1100 x 400
  function funnel(): string {
    if (!D.analysisOk) return unavailable(1100, 400, "DO ITEM AO RECIBO", NO_ANALYSIS);
    const F = A.funnel;
    const scale = 132 / Math.max(1, F.items);
    const hh = (c: number): number => Math.max(6, c * scale);
    const cy = 208;
    const blocked = blockedLine();
    // no bar of conviction stands between what the Jev asked for and the order: what the code drops is blocked by its own checks (cash, minimum of the network, ceilings, the order of the cycle), and each is said as that
    const stages: [string, number][] = [["ITENS DE COMPRA", F.items], ["ABERTOS AO JEV", F.open], ["PEDIDOS PELO JEV", F.asked], ["ORDENS ENVIADAS", F.applied], ["EXECUTADAS", F.executed]];
    const drops: [string, number, string][] = [["FECHADOS PELO CODIGO", F.items - F.open, COL.mute], ["PULADOS PELO JEV", F.open - F.asked, COL.cy], ["BLOQUEADOS PELO CODIGO", F.asked - F.applied, COL.amber], ["NAO EXECUTADOS", F.applied - F.executed, COL.red]];
    const xs = [90, 310, 530, 750, 970];
    const bw = 26;
    let s = title(1100, "DO ITEM AO RECIBO", `AS ULTIMAS ${F.consults} CONSULTAS: ONDE CADA CANDIDATO FICOU PELO CAMINHO`);
    stages.forEach(([name, c], i) => {
      const h = hh(c), y = cy - h / 2, x = xs[i]!;
      s += `<rect class="grow-y" x="${x}" y="${fx(y)}" width="${bw}" height="${fx(h)}" fill="${COL.cy}" opacity=".9" style="animation-delay:${(i * 0.12).toFixed(2)}s"/>`;
      s += text(x + bw / 2, 84, name, "t-sub", "font-size:10px;fill:#7df3ff", "middle") + countText(x + bw / 2, 112, c, 0, "", "", "t-num", "font-size:22px", "middle");
      if (i < stages.length - 1) {
        const cn = stages[i + 1]![1], hn = hh(cn), yn = cy - hn / 2, x1 = xs[i + 1]!;
        s += `<path d="${ribbon(x + bw, y, hn, x1, yn, hn)}" fill="${COL.cy}" opacity=".22"/>`;
        s += text((x + bw + x1) / 2, cy + 4, c ? Math.round((cn / c) * 100) + "%" : "-", "t-mono", "font-size:11px;fill:#bfefff", "middle");
        const [dn, dc, dcol] = drops[i]!;
        const dh = hh(dc), dy = 296, dx = x + 90;
        s += `<path d="${ribbon(x + bw, y + hn, Math.max(2, Math.min(dh, h - hn)), dx, dy, dh)}" fill="${dcol}" opacity=".25"/>`;
        s += `<rect class="grow-y" x="${dx}" y="${dy}" width="${bw}" height="${fx(dh)}" fill="${dcol}" opacity=".9" style="animation-delay:${(0.5 + i * 0.12).toFixed(2)}s"/>`;
        s += text(dx + bw + 10, dy + 12, String(dc), "t-num", `font-size:17px;fill:${dcol}`) + text(dx + bw + 10, dy + 28, dn, "t-sub", "font-size:9.5px");
        // the reason the code gave for what it dropped in the last cycle, under the count
        if (i === 2 && blocked.length > 0) s += text(dx + bw + 10, dy + 42, blocked[0]!, "t-mono", `font-size:9.5px;fill:${COL.amber}`);
      }
    });
    const flow = `M${xs[0]! + bw} ${cy}` + xs.slice(1).map((x) => `L${x} ${cy}`).join("");
    s += `<circle r="4" fill="#e9fbff" class="glow"><animateMotion dur="5s" repeatCount="indefinite" path="${flow}"/></circle>`;
    s += `<circle r="3" fill="#2ee6ff"><animateMotion dur="5s" begin="-2.5s" repeatCount="indefinite" path="${flow}"/></circle>`;
    return s + text(0, 382, "CADA ITEM E UM TOKEN OFERECIDO EM UMA CONSULTA. O MESMO TOKEN PODE APARECER EM VARIAS CONSULTAS", "t-sub", "font-size:9.5px") + text(0, 397, "FECHADOS PELO CODIGO: SEM CAIXA OU ABAIXO DO MINIMO DA REDE. BLOQUEADOS PELO CODIGO: PEDIDOS DO JEV QUE O CODIGO NAO ENVIOU", "t-sub", "font-size:9.5px");
  }

  /** What the code dropped in the last cycle, as a short line for under a count (empty when it dropped nothing): the first symbols and the reason. */
  function blockedLine(): string[] {
    const g = blockedGroups(D)[0];
    return g === undefined ? [] : [`ULTIMO: ${g.names}, ${g.text}`.slice(0, 40)];
  }

  // how much the Jev wanted to buy, over every answer. natural size 700 x 400
  function hist(): string {
    if (!D.analysisOk) return unavailable(700, 400, "O QUANTO O JEV QUIS COMPRAR", NO_ANALYSIS);
    const all = A.hist.all, nw = A.hist.fresh;
    const x0 = 30, W = 640, y1 = 330, Hh = 240, bw = W / 20;
    const max = Math.max(...all, 1);
    const total = all.reduce((a, b) => a + b, 0);
    let s = title(700, "O QUANTO O JEV QUIS COMPRAR", `PREFERENCIA DE COMPRA EM ${total} RESPOSTAS, DE 0 A 100%`);
    for (let i = 0; i < 4; i++) s += `<line x1="${x0}" x2="${x0 + W}" y1="${y1 - (i * Hh) / 3}" y2="${y1 - (i * Hh) / 3}" stroke="${COL.grid}" stroke-dasharray="2 6"/>`;
    all.forEach((c, i) => {
      const h = (c / max) * Hh, x = x0 + i * bw;
      s += `<rect class="grow-y" x="${fx(x + 3)}" y="${fx(y1 - h)}" width="${fx(bw - 6)}" height="${fx(Math.max(h, 0.5))}" fill="#136a80" style="animation-delay:${(i * 0.03).toFixed(2)}s"/>`;
      const hn = ((nw[i] ?? 0) / max) * Hh;
      if (nw[i]) s += `<rect class="grow-y" x="${fx(x + 8)}" y="${fx(y1 - hn)}" width="${fx(bw - 16)}" height="${fx(hn)}" fill="${COL.cy}" style="animation-delay:${(0.4 + i * 0.03).toFixed(2)}s"/>`;
      if (c >= max * 0.45) s += text(x + bw / 2, y1 - h - 6, String(c), "t-mono", "font-size:10.5px", "middle");
    });
    for (const v of [0, 20, 40, 60, 80, 100]) s += text(x0 + (v / 100) * W, y1 + 18, v + "%", "t-sub", "font-size:10px", "middle");
    s += text(x0, 372, "ESCURO: TODAS AS RESPOSTAS. CLARO: DEPOIS DA REDACAO NOVA DAS PERGUNTAS", "t-sub", "font-size:9.5px");
    return s + text(x0, 388, "A ALTURA E QUANTAS VEZES O JEV DEU ESSA PREFERENCIA. NAO E CHANCE DE LUCRO", "t-sub", "font-size:9.5px");
  }

  // the six judgments of the Jev about each candidate. natural size 1100 x 420
  function matrix(): string {
    const open = cands.filter((c) => !c.closed).sort((a, b) => (b.pbuy ?? 0) - (a.pbuy ?? 0));
    const rows = [...open, ...cands.filter((c) => c.closed)].slice(0, 9);
    const cols: [string, string, string][] = [["late_entry", "ATRASADO", "risk"], ["still_falling", "AINDA CAINDO", "risk"], ["accumulating", "ACUMULANDO", "good"], ["exit_easy", "SAIDA FACIL", "good"], ["distribution", "DISTRIB.", "risk"], ["fading", "PERDE FORCA", "risk"]];
    const x0 = 200, cw = 100, y0 = 98, rh = 34;
    let s = title(1100, "O QUE O JEV JULGOU, CANDIDATO POR CANDIDATO", "CADA CELULA E UMA PERGUNTA FECHADA, DE 0 A 100. AMBAR: RISCO. CIANO: FAVOR");
    if (rows.length === 0) return s + text(0, 120, "AINDA SEM CONSULTA COM CANDIDATOS NESTA SESSAO", "t-sub", "font-size:10px");
    s += text(0, y0 - 14, "CANDIDATO", "t-sub", "font-size:10px") + text(112, y0 - 14, "COMPRA", "t-sub", "font-size:9.5px");
    cols.forEach(([, lab], i) => { s += text(x0 + i * cw + cw / 2 - 4, y0 - 14, lab, "t-sub", "font-size:9.5px", "middle"); });
    s += text(x0 + 6 * cw + 20, y0 - 14, "SITUACAO", "t-sub", "font-size:10px");
    rows.forEach((c, r) => {
      const y = y0 + r * rh, dim = c.closed;
      s += text(0, y + 20, c.s, "t-num", `font-size:15px;fill:${dim ? COL.mute : COL.white}`);
      if (!dim) s += `<rect x="112" y="${y + 12}" width="48" height="6" fill="${COL.dim}"/><rect class="grow-x" x="112" y="${y + 12}" width="${fx(clamp((c.pbuy ?? 0) / 0.8, 0, 1) * 48)}" height="6" fill="${COL.cy}" style="animation-delay:${(r * 0.05).toFixed(2)}s"/>`;
      s += text(x0 - 10, y + 19, dim || c.pbuy === null ? "-" : Math.round(c.pbuy * 100) + "%", "t-mono", `font-size:12px;fill:${dim ? COL.mute : "#7df3ff"}`, "end");
      const vals = cols.map(([k]) => c.facets[k]);
      const mx = Math.max(...vals.filter((v): v is number => typeof v === "number"), -1);
      cols.forEach(([k, , kind], i) => {
        const v = c.facets[k], x = x0 + i * cw, has = typeof v === "number";
        const col = kind === "good" ? COL.cy : COL.amber;
        s += `<rect x="${x + 2}" y="${y + 2}" width="${cw - 8}" height="${rh - 6}" fill="${has ? col : "#0b2c38"}" opacity="${has ? (0.1 + 0.8 * v).toFixed(2) : "0.25"}" ${has && v === mx ? `stroke="${COL.white}" stroke-width="1.4"` : ""}/>`;
        s += text(x + cw / 2 - 4, y + 21, has ? String(Math.round(v * 100)) : "-", "t-mono", `font-size:13px;fill:${has ? COL.white : COL.mute}`, "middle");
      });
      // what the Jev asked for is his own choice; a request the code dropped afterwards is not a decision carried out, and the screen says who stopped it
      const asked = c.applied !== null && c.applied !== "skip";
      const status = dim ? "FECHADO PELO CODIGO" : c.blocked !== null ? "PEDIU E O CODIGO BLOQUEOU" : asked ? "PEDIU COMPRAR" : "O JEV PULOU";
      const scol = dim ? COL.mute : c.blocked !== null ? COL.amber : asked ? COL.green : COL.soft;
      s += text(x0 + 6 * cw + 20, y + (c.blocked !== null ? 17 : 20), status, "t-sub", `font-size:10px;fill:${scol}`);
      if (c.blocked !== null && !dim) s += text(x0 + 6 * cw + 20, y + 30, c.blocked.text, "t-mono", `font-size:9.5px;fill:${COL.amber}`);
    });
    s += `<g style="--h:${rows.length * rh}px;animation:hud-scany 6s linear infinite"><rect x="0" y="${y0 - 8}" width="1100" height="3" fill="${COL.cy}" opacity=".35"/><rect x="0" y="${y0 - 30}" width="1100" height="22" fill="url(#sweepV)"/></g>`;
    return s + text(0, 412, "A CELULA COM CONTORNO E A MAIOR DA LINHA. NENHUMA REGRA DO CODIGO LE A FACETA PERDE FORCA HOJE", "t-sub", "font-size:9.5px");
  }

  // the Jev's own preference for each purchase he asked for, with no bar line: his choice is the decision. natural size 700 x 420
  function preferences(): string {
    if (!D.analysisOk) return unavailable(700, 420, "PREFERENCIA DO JEV POR PEDIDO", NO_ANALYSIS);
    const asks = A.asks.slice(-10).reverse();
    let s = title(700, "PREFERENCIA DO JEV POR PEDIDO", `${A.asks.length} PEDIDOS DE COMPRA NAS ULTIMAS CONSULTAS, COM A PROBABILIDADE QUE ELE MESMO DEU`);
    const gx = 220, gw = 280;
    s += text(gx, 80, "PREFERENCIA DE COMPRA, 0 A 100%", "t-sub", "font-size:9.5px");
    asks.forEach((a, i) => {
      const y = 94 + i * 30, pass = a.ok;
      // a request of the last cycle that the code then dropped is not a decision carried out, so it says who stopped it
      const held = pass && D.last.atMs !== null && Math.abs(a.t - D.last.atMs) < 1000 && D.last.dropped.some((d) => d.side === "buy" && d.s === (a.s ?? "").slice(0, 14));
      const shade = held ? COL.amber : pass ? COL.cy : COL.mute;
      s += text(0, y + 12, hhmm(a.t), "t-mono", "font-size:11.5px;fill:#5fa3b5") + text(58, y + 12, (a.s ?? "-").slice(0, 9), "t-num", "font-size:14px");
      s += `<rect x="${gx}" y="${y + 3}" width="${gw}" height="10" fill="${COL.dim}"/><rect class="grow-x" x="${gx}" y="${y + 3}" width="${fx(clamp(a.p, 0, 1) * gw)}" height="10" fill="${shade}" style="animation-delay:${(i * 0.06).toFixed(2)}s"/>`;
      s += text(gx + gw + 14, y + 13, "P " + Math.round(a.p * 100) + "%", "t-mono", "font-size:12px;fill:#bfefff") + text(700, y + 13, held ? "BLOQUEADA" : pass ? "PEDIDA" : "SEM ORDEM", "t-sub", `font-size:10px;fill:${shade}`, "end");
    });
    s += text(0, 396, NO_BAR, "t-sub", "font-size:9.5px");
    // older requests that did not become an order are history: until 2026-10-14 a bar of 20 (P 60%) stood there, and it is gone
    return A.asks.some((a) => !a.ok) ? s + text(0, 411, HISTORY, "t-sub", `font-size:9.5px;fill:${COL.mute}`) : s;
  }

  // every consult of the last hours, as a strip. natural size 1840 x 84
  function timeline(): string {
    if (!D.analysisOk || A.timeline.length === 0) return text(0, 14, D.analysisOk ? "AINDA SEM CONSULTAS NESTA SESSAO" : "LINHA DO TEMPO: " + NO_ANALYSIS, "t-sub", "font-size:10px");
    const T = A.timeline, w = 1840 / T.length, mx = Math.max(...T.map((t) => t.open), 1);
    let s = text(0, 12, `ULTIMAS ${T.length} CONSULTAS: ABERTOS AO JEV (CIANO), PEDIDOS DE COMPRA (AMBAR), ORDENS ENVIADAS (VERDE)`, "t-sub", "font-size:10px");
    T.forEach((t, i) => {
      const x = i * w;
      const h = (v: number): number => Math.max(v ? 3 : 0, (v / mx) * 30);
      s += `<rect class="grow-y" x="${fx(x + 3)}" y="${fx(54 - h(t.open))}" width="${fx(w * 0.3)}" height="${fx(h(t.open))}" fill="${COL.cy}" opacity=".85" style="animation-delay:${(i * 0.02).toFixed(2)}s"/>`;
      s += `<rect class="grow-y" x="${fx(x + 3 + w * 0.34)}" y="${fx(54 - h(t.asked))}" width="${fx(w * 0.3)}" height="${fx(h(t.asked))}" fill="${COL.amber}" style="animation-delay:${(i * 0.02).toFixed(2)}s"/>`;
      s += `<rect class="grow-y" x="${fx(x + 3 + w * 0.68)}" y="${fx(54 - h(t.applied))}" width="${fx(w * 0.25)}" height="${fx(h(t.applied))}" fill="${COL.green}" style="animation-delay:${(i * 0.02).toFixed(2)}s"/>`;
      if (i % 5 === 0) s += text(x + 3, 68, hhmm(t.t), "t-sub", "font-size:9px");
    });
    return s;
  }

  // the wallet by asset. natural size 900 x 480
  function allocation(): string {
    const ps = D.wallet.positions.filter((p) => p.usd !== null && p.usd > 0).sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
    const total = D.wallet.total ?? ps.reduce((a, p) => a + (p.usd ?? 0), 0);
    let s = title(900, "A CARTEIRA, ATIVO POR ATIVO", total > 0 ? `US$ ${fmt(total)} NA CARTEIRA GERIDA, SO O QUE TEM PRECO` : readNote(D.wallet.lastReadMs));
    if (!(total > 0)) return s + text(0, 100, "SEM LEITURA DA CARTEIRA", "t-sub", "font-size:10px");
    const cx = 190, cy = 275, R = 128;
    let acc = 0;
    let donut = "";
    ps.forEach((p, i) => { const sw = ((p.usd ?? 0) / total) * 360; if (sw > 0.4) donut += `<path class="draw" pathLength="1" d="${arc(cx, cy, R, acc + 0.8, acc + sw - 0.8)}" stroke="${ALLOC_COLORS[i % ALLOC_COLORS.length]}" stroke-width="34" fill="none" style="animation-delay:${(i * 0.12).toFixed(2)}s"/>`; acc += sw; });
    s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${COL.dim}" stroke-width="34"/>${donut}`;
    s += `<g class="spin-d" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="${R + 30}" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="3 9"/></g><g class="spin-c" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="${R - 30}" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="1 7"/></g>`;
    s += countText(cx, cy - 4, total, 2, "US$ ", "", "t-big", "font-size:30px", "middle") + text(cx, cy + 22, ps.length + " ATIVOS COM PRECO", "t-sub", "font-size:10.5px", "middle");
    ps.slice(0, 8).forEach((p, i) => {
      const y = 100 + i * 42, share = (p.usd ?? 0) / total, col = ALLOC_COLORS[i % ALLOC_COLORS.length]!;
      s += `<rect x="400" y="${y - 12}" width="14" height="14" fill="${col}"/>` + text(426, y, p.s, "t-num", "font-size:17px") + text(700, y, "US$ " + fmt(p.usd), "t-mono", "font-size:14px", "end");
      s += `<rect x="716" y="${y - 10}" width="120" height="8" fill="${COL.dim}"/><rect class="grow-x" x="716" y="${y - 10}" width="${fx(Math.max(2, share * 120))}" height="8" fill="${col}" style="animation-delay:${(i * 0.08).toFixed(2)}s"/>` + text(900, y, fmt(share * 100, 1) + "%", "t-mono", "font-size:13px", "end");
      const tag = p.cash ? "CAIXA EM USDC" : p.plan ? "COM PLANO DE SAIDA" : "SEM PLANO DE SAIDA";
      s += text(426, y + 16, tag, "t-sub", `font-size:9.5px;fill:${p.cash ? COL.soft : p.plan ? COL.green : COL.amber}`);
    });
    const unpriced = D.wallet.positions.filter((p) => p.usd === null || p.usd <= 0).length;
    return unpriced ? s + text(400, 100 + Math.min(8, ps.length) * 42 + 4, `+ ${unpriced} TOKENS SEM PRECO NA LEITURA, FORA DESTA SOMA`, "t-sub", "font-size:10px") : s;
  }

  // the equity curve with every order on it. natural size 900 x 480
  function equityMarks(): string {
    const eq = D.equity;
    let s = title(900, "O PATRIMONIO E AS ORDENS", "CADA TRIANGULO E UMA ORDEM EXECUTADA. VALORES DA CARTEIRA GERIDA");
    if (eq.length < 2) return s + text(0, 100, "AINDA SEM HISTORICO DA CARTEIRA", "t-sub", "font-size:10px");
    const x0 = 20, x1 = 880, y0 = 100, y1 = 380;
    const vmin = Math.min(...eq.map((p) => p.v)), vmax = Math.max(...eq.map((p) => p.v));
    const t0 = eq[0]!.t, t1 = eq[eq.length - 1]!.t;
    const px = (t: number): number => x0 + ((t - t0) / (t1 - t0 || 1)) * (x1 - x0);
    const py = (v: number): number => y1 - ((v - vmin) / (vmax - vmin || 1)) * (y1 - y0);
    const line = eq.map((p, i) => `${i ? "L" : "M"}${fx(px(p.t))} ${fx(py(p.v))}`).join("");
    for (let i = 0; i < 5; i++) { const y = y0 + (i * (y1 - y0)) / 4; s += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="${COL.grid}" stroke-dasharray="2 6"/>` + text(x1, y - 4, "US$ " + fmt(vmax - (i * (vmax - vmin)) / 4), "t-sub", "font-size:9.5px", "end"); }
    s += `<path d="${line}L${x1} ${y1}L${x0} ${y1}Z" fill="url(#areaGrad)"/><path class="draw glow" pathLength="1" d="${line}" fill="none" stroke="${COL.cy}" stroke-width="2.2"/><circle r="4" fill="#e9fbff" class="glow"><animateMotion dur="12s" repeatCount="indefinite" path="${line}"/></circle>`;
    const labelled: number[] = [];
    // the latest orders first, so the label that stays is the newest one
    [...D.events].filter((e) => e.t >= t0).reverse().forEach((e) => {
      const x = px(e.t), y = py(eq.reduce((m, p) => (Math.abs(p.t - e.t) < Math.abs(m.t - e.t) ? p : m)).v), ok = e.stage === "executada";
      const col = !ok ? COL.red : e.side === "buy" ? COL.green : COL.amber;
      s += ok ? (e.side === "buy" ? `<path d="M${fx(x)} ${fx(y - 12)}l7 12h-14z" fill="${col}"/>` : `<path d="M${fx(x)} ${fx(y + 12)}l7 -12h-14z" fill="${col}"/>`) : `<path d="M${fx(x - 5)} ${fx(y - 5)}l10 10M${fx(x + 5)} ${fx(y - 5)}l-10 10" stroke="${col}" stroke-width="2"/>`;
      if (e.t > t1 - 150 * 60000 && !labelled.some((lx) => Math.abs(lx - x) < 64)) { labelled.push(x); s += text(x, y + (e.side === "buy" ? -18 : 26), e.s, "t-sub", `font-size:9.5px;fill:${col}`, "middle"); }
    });
    s += `<g style="--w:${x1 - x0}px;animation:hud-scan 11s linear infinite"><line x1="${x0}" x2="${x0}" y1="${y0 - 10}" y2="${y1 + 10}" stroke="#bff6ff" stroke-width="1.3" opacity=".5"/></g>`;
    s += text(x0, y1 + 24, new Date(t0).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }), "t-sub", "font-size:10px") + text(x1, y1 + 24, "AGORA", "t-sub", "font-size:10px", "end");
    s += `<path d="M${x0} 440l9 -10h14z" fill="${COL.green}"/>` + text(x0 + 28, 440, "COMPRA", "t-sub", "font-size:10px") + `<path d="M${x0 + 110} 430l9 10h14z" fill="${COL.amber}"/>` + text(x0 + 138, 440, "VENDA", "t-sub", "font-size:10px");
    s += `<path d="M${x0 + 215} 432l10 10M${x0 + 225} 432l-10 10" stroke="${COL.red}" stroke-width="2"/>` + text(x0 + 236, 440, "ORDEM COM FALHA", "t-sub", "font-size:10px");
    return s + text(x0, 466, "A CURVA MISTURA APORTES, PRECOS DOS TOKENS QUE JA ESTAVAM NA CARTEIRA E O RESULTADO DAS ORDENS. NAO E LUCRO DO SISTEMA", "t-sub", "font-size:9.5px");
  }

  // each closed position, entry to exit. natural size 900 x 380
  function tripCards(): string {
    if (!D.analysisOk) return unavailable(900, 380, "POSICOES JA ENCERRADAS", NO_ANALYSIS);
    const rows = A.trips.slice(-2);
    let s = title(900, "POSICOES JA ENCERRADAS", "DA COMPRA A VENDA, COM O CAIXA QUE ENTROU E O QUE VOLTOU");
    if (!rows.length) return s + text(0, 100, "AINDA NAO HA VOLTA FECHADA", "t-sub", "font-size:11px");
    rows.forEach((t, i) => {
      const x = i * 450, col = t.pct >= 0 ? COL.green : COL.amber, mins = Math.round((t.sellAt - t.buyAt) / 60000), len = Math.min(190, Math.abs(t.pct) * 60);
      s += `<g transform="translate(${x} 70)"><rect x="0" y="0" width="420" height="250" fill="#031820" stroke="#124c5f" stroke-width="1"/><path d="M0 0h30M0 0v30M420 250h-30M420 250v-30" stroke="${COL.cy}" stroke-width="2" fill="none"/>
        ${text(20, 38, t.s, "t-big", `font-size:${Math.min(28, Math.floor(245 / (Math.max(1, t.s.length) * 0.74)))}px`)}${text(400, 36, pct(t.pct), "t-big", `font-size:28px;fill:${col}`, "end")}${text(20, 60, `FICOU ${mins} MINUTOS, ${hhmm(t.buyAt)} ATE ${hhmm(t.sellAt)}`, "t-sub", "font-size:10px")}
        <line x1="40" y1="120" x2="380" y2="120" stroke="#124c5f" stroke-width="2"/><line x1="40" y1="120" x2="380" y2="120" stroke="${col}" stroke-width="2" class="flow-fast"/>
        <circle cx="40" cy="120" r="8" fill="#031820" stroke="${COL.green}" stroke-width="2"/><circle cx="380" cy="120" r="8" fill="#031820" stroke="${col}" stroke-width="2"/>
        <circle r="4.5" fill="#e9fbff" class="glow"><animateMotion dur="${(3 + i).toFixed(1)}s" repeatCount="indefinite" path="M40 120L380 120"/></circle>
        ${text(40, 148, "COMPRA", "t-sub", "font-size:9.5px", "middle")}${text(380, 148, "VENDA", "t-sub", "font-size:9.5px", "middle")}
        ${text(40, 98, fmt(t.in) + " USDC", "t-mono", "font-size:12.5px;fill:#bfefff", "middle")}${text(380, 98, fmt(t.out) + " USDC", "t-mono", `font-size:12.5px;fill:${col}`, "middle")}
        ${text(20, 190, "RESULTADO DO CAIXA", "t-sub", "font-size:10px")}${text(400, 192, (t.out - t.in >= 0 ? "+" : "") + fmt(t.out - t.in, 4) + " USDC", "t-num", `font-size:19px;fill:${col}`, "end")}
        <rect x="20" y="206" width="380" height="8" fill="${COL.dim}"/><rect class="grow-x" x="${t.pct >= 0 ? 210 : 210 - len}" y="206" width="${len}" height="8" fill="${col}"/><line x1="210" x2="210" y1="200" y2="220" stroke="${COL.soft}"/>
        ${text(20, 238, "ANTES DA TAXA EM SOL. QUEM VENDEU FOI A DECISAO DO MODELO", "t-sub", "font-size:9.5px")}</g>`;
    });
    const withPlan = D.wallet.positions.filter((p) => p.plan !== null);
    return s + text(0, 360, withPlan.length ? `${withPlan.length} POSICAO(OES) ABERTA(S) COM PLANO, VEJA ONDE ESTA O CAPITAL` : "SEM POSICAO ABERTA COM PLANO AGORA. QUANDO HOUVER, O PLANO (ALVO, STOP, PRAZO) APARECE AQUI", "t-sub", "font-size:10px");
  }

  // the limits of the day. natural size 900 x 380
  function limits(): string {
    const sp = A.orders.spentToday;
    const cap = D.agent.caps ?? { maxBuyUsd: undefined, maxDailyBuyUsd: undefined, maxDailySellUsd: undefined };
    const total = D.wallet.total ?? 0;
    // a wallet nobody read has no share of cash: the ring stays empty and says so, instead of a zero that looks like a fact
    const unread = D.wallet.cash === null || !(total > 0);
    const cashShare = unread ? 0 : (D.wallet.cash as number) / total;
    const known = D.analysisOk;
    // a day with no ceiling has no share of it to draw: the ring stays empty and says "LIVRE"
    const gauges: [string, number | null, string, string, string?][] = [
      ["COMPRAS HOJE", capUse(sp.buy, cap.maxDailyBuyUsd), known ? `US$ ${fmt(sp.buy, 0)} DE ${capText(cap.maxDailyBuyUsd)}` : "SEM DADOS DO NUCLEO", COL.cy],
      ["VENDAS HOJE", capUse(sp.sell, cap.maxDailySellUsd), known ? `US$ ${fmt(sp.sell, 0)} DE ${capText(cap.maxDailySellUsd)}` : "SEM DADOS DO NUCLEO", COL.soft],
      ["CONSULTAS DO MODELO", D.budget.max > 0 ? D.budget.consults / D.budget.max : 0, `${D.budget.consults} DE ${D.budget.max}`, COL.cy],
      ["CAIXA LIVRE", cashShare, unread ? "SEM LEITURA DA CARTEIRA" : `${Math.round(cashShare * 100)}% DA CARTEIRA`, COL.green, unread ? "-" : undefined],
    ];
    let s = title(900, "LIMITES E RISCO DO DIA", "ATE ONDE O AGENTE PODE IR SEM PEDIR NADA A VOCE");
    gauges.forEach(([lab, f, val, col, centre], i) => {
      const cx = 100 + i * 230, cy = 140, fr = clamp(f ?? 0, 0, 1);
      s += `<circle cx="${cx}" cy="${cy}" r="52" fill="none" stroke="${COL.dim}" stroke-width="12"/><path class="draw" pathLength="1" d="${arc(cx, cy, 52, 0, Math.max(2, fr * 359))}" fill="none" stroke="${col}" stroke-width="12" style="animation-delay:${(i * 0.15).toFixed(2)}s"/>
        <g class="${i % 2 ? "spin-c" : "spin-d"}" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="66" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="3 9"/></g>
        ${text(cx, cy + 6, centre ?? (f === null ? "LIVRE" : Math.round(fr * 100) + "%"), "t-num", `font-size:${f === null ? 14 : 20}px`, "middle")}${text(cx, cy + 92, lab, "t-sub", "font-size:10px", "middle")}${text(cx, cy + 108, val, "t-mono", "font-size:11.5px;fill:#7df3ff", "middle")}`;
    });
    // only what the core says: no risk per operation and no minimum order are rules of the code any more (the Jev sizes the order), and a ceiling is shown as it is, "SEM TETO" when there is none
    const rules: [string, string][] = [["TETO DE UMA COMPRA", capText(cap.maxBuyUsd)], ["RESERVA EM CAIXA", fmt(D.agent.reserveShare * 100, 0) + "%"], ["ALAVANCAGEM", leverageText(D.agent.leverage)], ["AUTORIDADE", D.agent.authority.toUpperCase() + ", PERFIL " + D.agent.profile.toUpperCase()]];
    rules.forEach(([a, b], i) => { const x = (i % 3) * 300, y = 290 + Math.floor(i / 3) * 44; s += text(x, y, a, "t-sub", "font-size:10px") + text(x, y + 18, b, "t-mono", "font-size:12.5px;fill:#bfefff"); });
    return s;
  }

  function kpis(): string {
    if (!D.analysisOk) return unavailable(1840, 150, "RESULTADO", NO_ANALYSIS);
    const neg = A.trips.filter((t) => t.pct < 0).length, o = A.orders.outcomes;
    const eq = D.equity;
    const win = eq.length > 1 ? (eq[eq.length - 1]!.v / eq[0]!.v - 1) * 100 : null;
    const ok = o.executada ?? 0, fail = o.falhou ?? 0;
    // [label, text, note, colour, count?]: a number that counts up carries [value, decimals, prefix, suffix]
    type Count = readonly [number, number, string, string];
    const blocks: [string, string, string, string, Count?][] = [
      ["VOLTAS FECHADAS", String(A.trips.length), `${neg} DE ${A.trips.length} NEGATIVAS`, COL.white, [A.trips.length, 0, "", ""]],
      ["CAIXA DAS VOLTAS", (net > 0 ? "+" : "") + fmt(net, 3) + " USDC", "ANTES DA TAXA EM SOL", net >= 0 ? COL.green : COL.amber, [net, 3, net > 0 ? "+" : "", " USDC"]],
      ["TAXAS DE REDE", fmt(A.fees.lamports / 1e9, 5) + " SOL", `${A.fees.fills} RECIBOS, SO A REDE`, COL.white, [A.fees.lamports / 1e9, 5, "", " SOL"]],
      ["ORDENS", `${ok} OK DE ${ok + fail}`, `${fail} FALHARAM NA CADEIA`, fail ? COL.amber : COL.green],
      ["CARTEIRA NA JANELA", pct(win, 1), "INCLUI APORTES, NAO E LUCRO", COL.soft, win === null ? undefined : [win, 1, win > 0 ? "+" : "", "%"]],
    ];
    let s = "";
    blocks.forEach(([lab, val, sub, col, count], i) => {
      const x = i * 372;
      s += `<path d="M${x} 6V0H${x + 332}" fill="none" stroke="${COL.cy}" stroke-width="1.4"/>${text(x + 4, 28, lab, "t-title", "font-size:12.5px")}${count === undefined ? text(x + 4, 82, val, "t-big", `font-size:36px;fill:${col}`) : countText(x + 4, 82, count[0], count[1], count[2], count[3], "t-big", `font-size:36px;fill:${col}`)}${text(x + 4, 108, sub, "t-sub", "font-size:10.5px")}
        <rect x="${x + 4}" y="124" width="300" height="2" fill="${COL.dim}"/><rect class="grow-x" x="${x + 4}" y="124" width="300" height="2" fill="${col}" style="animation-delay:${(i * 0.1).toFixed(2)}s"/>`;
    });
    return s;
  }

  function cumulative(): string {
    if (!D.analysisOk) return unavailable(900, 400, "CAIXA ACUMULADO DAS VOLTAS", NO_ANALYSIS);
    const tr = A.trips, x0 = 60, x1 = 860, y0 = 80, y1 = 330;
    let cum = 0;
    const pts: [number, number, string][] = [[0, 0, "INICIO"]];
    tr.forEach((t) => { cum += t.out - t.in; pts.push([t.sellAt, cum, t.s]); });
    const vmin = Math.min(0, ...pts.map((p) => p[1])) - 0.05, vmax = Math.max(0, ...pts.map((p) => p[1])) + 0.05;
        // one step per round trip, evenly spaced: trips that closed minutes apart would otherwise sit on top of each other
    const px = (_t: number, i: number): number => x0 + (i * (x1 - x0 - 40)) / Math.max(1, pts.length - 1);
    const py = (v: number): number => y1 - ((v - vmin) / (vmax - vmin)) * (y1 - y0);
    let s = title(900, "CAIXA ACUMULADO DAS VOLTAS", "SOMA DO QUE SAIU MENOS O QUE ENTROU, EM USDC, ANTES DA TAXA EM SOL");
    s += `<line x1="${x0}" x2="${x1}" y1="${fx(py(0))}" y2="${fx(py(0))}" stroke="${COL.soft}" stroke-width="1.4" stroke-dasharray="5 5"/>` + text(x1, py(0) - 6, "EMPATE", "t-sub", "font-size:10px;fill:#7df3ff", "end");
    let path = "";
    pts.forEach((p, i) => { const x = px(p[0], i), y = py(p[1]); path += i ? `L${fx(x)} ${fx(py(pts[i - 1]![1]))}L${fx(x)} ${fx(y)}` : `M${fx(x)} ${fx(y)}`; });
    s += `<path class="draw glow" pathLength="1" d="${path}L${x1} ${fx(py(cum))}" fill="none" stroke="${cum >= 0 ? COL.green : COL.amber}" stroke-width="2.4"/><path d="${path}L${x1} ${fx(py(cum))}L${x1} ${fx(py(0))}L${x0} ${fx(py(0))}Z" fill="${COL.amber}" opacity=".12"/>`;
    // the labels of the steps are written only where they have room: the newest first
    const steps = pts.slice(1).map((p, k) => ({ p, x: px(p[0], k + 1), y: py(p[1]) }));
    const nameOn = thinLabels(steps.map((t) => t.x), steps.map((t) => approxWidth(t.p[2], 10, 0.14, false, false)));
    const valueW = steps.map((t) => approxWidth((t.p[1] > 0 ? "+" : "") + fmt(t.p[1], 3), 12, 0.02, true, false));
    const valueOn = thinLabels(steps.map((t, k) => t.x + 10 + valueW[k]! / 2), valueW);
    steps.forEach((t, k) => { s += `<circle cx="${fx(t.x)}" cy="${fx(t.y)}" r="6" fill="#031820" stroke="${COL.amber}" stroke-width="2"/>` + (nameOn[k] ? text(t.x, t.y + 24, t.p[2], "t-sub", "font-size:10px", "middle") + text(t.x, t.y + 38, hhmm(t.p[0]), "t-sub", "font-size:9px", "middle") : "") + (valueOn[k] ? text(t.x + 10, t.y - 9, (t.p[1] > 0 ? "+" : "") + fmt(t.p[1], 3), "t-mono", `font-size:12px;fill:${COL.amber}`) : ""); });
    s += `<g style="--w:${x1 - x0}px;animation:hud-scan 10s linear infinite"><line x1="${x0}" x2="${x0}" y1="${y0 - 6}" y2="${y1 + 6}" stroke="#bff6ff" stroke-width="1.2" opacity=".45"/></g>`;
    s += text(0, 372, `PARA VOLTAR AO EMPATE O CAIXA PRECISA GANHAR ${fmt(Math.abs(Math.min(0, cum)), 3)} USDC, MAIS O CUSTO DA REDE`, "t-sub", "font-size:10px");
    return s + text(0, 390, A.trips.length < 5 ? `${A.trips.length} VOLTAS SAO POUCAS PARA CONCLUIR QUALQUER COISA SOBRE O AGENTE` : `${A.trips.length} VOLTAS FECHADAS ATE AGORA`, "t-sub", "font-size:10px;fill:#7df3ff");
  }

  function outcomes(): string {
    if (!D.analysisOk) return unavailable(900, 400, "O QUE ACONTECEU COM AS ORDENS", NO_ANALYSIS);
    const o = A.orders.outcomes, rs = A.orders.reasons;
    const parts: [string, number, string][] = [["EXECUTADAS", o.executada ?? 0, COL.green], ["FALHARAM", o.falhou ?? 0, COL.amber], ["INCERTAS", o.incerta ?? 0, COL.mute]];
    const tot = parts.reduce((a, p) => a + p[1], 0) || 1;
    const cx = 160, cy = 220, R = 90;
    let acc = 0;
    let s = title(900, "O QUE ACONTECEU COM AS ORDENS", "DE TODAS AS ORDENS ENVIADAS A CADEIA, COMO TERMINARAM");
    s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${COL.dim}" stroke-width="26"/>`;
    parts.forEach(([, n, col], i) => { const sw = (n / tot) * 360; if (n) s += `<path class="draw" pathLength="1" d="${arc(cx, cy, R, acc + 1, acc + sw - 1)}" stroke="${col}" stroke-width="26" fill="none" style="animation-delay:${(i * 0.2).toFixed(2)}s"/>`; acc += sw; });
    s += `<g class="spin-d" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="${R + 24}" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="3 9"/></g>`;
    s += text(cx, cy + 4, String(parts.reduce((a, p) => a + p[1], 0)), "t-big", "font-size:34px", "middle") + text(cx, cy + 24, "ORDENS", "t-sub", "font-size:10px", "middle");
    parts.forEach(([lab, n, col], i) => { s += `<rect x="330" y="${96 + i * 34}" width="12" height="12" fill="${col}"/>` + text(352, 107 + i * 34, lab, "t-sub", "font-size:11px") + text(560, 107 + i * 34, String(n), "t-num", "font-size:18px", "end"); });
    const names: Record<string, string> = { simulacao_falhou: "A SIMULACAO FALHOU ANTES DE ASSINAR", recibo_erro: "O RECIBO VOLTOU COM ERRO", confirmando: "A FERRAMENTA PEDIU CONFIRMACAO", resolvida_pelo_usuario: "RESOLVIDA A MAO PELO DONO" };
    s += text(330, 222, "POR QUE FALHARAM", "t-sub", `font-size:10.5px;fill:${COL.amber}`);
    Object.entries(rs).slice(0, 6).forEach(([k, n], i) => { s += text(330, 246 + i * 26, names[k] ?? k.replace(/_/g, " ").toUpperCase(), "t-sub", "font-size:10.5px") + `<rect x="660" y="${236 + i * 26}" width="${Math.min(200, n * 40)}" height="8" fill="${COL.amber}" opacity=".8"/>` + text(900, 246 + i * 26, String(n), "t-mono", "font-size:13px", "end"); });
    return s + text(0, 394, "FALHA NA CADEIA E CUSTO SEM RESULTADO: CADA UMA DESPERDICA UMA CONSULTA DO MODELO E UMA CHANCE", "t-sub", "font-size:9.5px");
  }

  function activity(): string {
    if (!D.analysisOk) return unavailable(1840, 230, "A ATIVIDADE DO AGENTE", NO_ANALYSIS);
    const F = A.funnel;
    const items: [string, number, number, string][] = [["CONSULTAS DO DIA", D.budget.consults, Math.max(1, D.budget.max), COL.cy], ["ITENS AVALIADOS", F.items, Math.max(1, F.items), COL.soft], ["PEDIDOS DE COMPRA", F.asked, Math.max(1, F.open), COL.amber], ["BLOQUEADOS PELO CODIGO", F.asked - F.applied, Math.max(1, F.asked), COL.amber], ["ORDENS EXECUTADAS", F.executed, Math.max(1, F.applied), COL.green], ["FALHAS NA CADEIA", F.failed, Math.max(1, F.applied), COL.red]];
    let s = text(0, 18, `A ATIVIDADE DO AGENTE (ITENS E PEDIDOS: ULTIMAS ${F.consults} CONSULTAS)`, "t-title", "font-size:12.5px");
    items.forEach(([lab, v, mx, col], i) => {
      const cx = 150 + i * 308, cy = 112;
      s += `<circle cx="${cx}" cy="${cy}" r="56" fill="none" stroke="${COL.dim}" stroke-width="10"/><path class="draw" pathLength="1" d="${arc(cx, cy, 56, 0, Math.max(2, clamp(v / mx, 0, 1) * 359))}" fill="none" stroke="${col}" stroke-width="10" style="animation-delay:${(i * 0.12).toFixed(2)}s"/>
        <g class="${i % 2 ? "spin-c" : "spin-d"}" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="70" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="2 8"/></g>
        ${countText(cx, cy + 8, v, 0, "", "", "t-big", "font-size:28px", "middle")}${text(cx, cy + 96, lab, "t-sub", "font-size:10.5px", "middle")}`;
    });
    return s;
  }

  function moves(win: "15m" | "1h"): string {
    const name = win === "15m" ? "O PRECO 15 MINUTOS DEPOIS" : "O PRECO 1 HORA DEPOIS";
    if (!D.analysisOk) return unavailable(900, 420, name, NO_ANALYSIS);
    const G: [string, import("../types").WindowStats, string][] = [["PULADAS PELO JEV", A.placar.skipped[win], COL.cy], ["FECHADAS PELO CODIGO", A.placar.closed[win], COL.amber], ["PEDIDAS E SEM ORDEM", A.placar.gated[win], COL.white]];
    const lo = -20, hi = 20, nb = 10, bw = (hi - lo) / nb, x0 = 20, W = 860, y1 = 330, Hh = 230, slot = W / nb;
    const bins = G.map(([, g]) => { const b = new Array<number>(nb).fill(0); g.vals.forEach((v) => { const k = clamp(Math.floor((clamp(v, lo, hi - 0.001) - lo) / bw), 0, nb - 1); b[k] = (b[k] ?? 0) + 1; }); const n = g.vals.length || 1; return b.map((c) => c / n); });
    const mx = Math.max(0.05, ...bins.flat());
    let s = title(900, name, "PARA O QUE NAO FOI COMPRADO. CONTRAFACTUAL, ANTES DE CUSTO E IMPACTO");
    s += `<line x1="${x0 + ((0 - lo) / (hi - lo)) * W}" x2="${x0 + ((0 - lo) / (hi - lo)) * W}" y1="72" y2="${y1}" stroke="${COL.soft}" stroke-width="1.4" stroke-dasharray="5 5"/>`;
    for (let i = 0; i <= nb; i += 2) s += text(x0 + i * slot, y1 + 18, lo + i * bw + "%", "t-sub", "font-size:10px", "middle");
    G.forEach(([, g, col], gi) => {
      if (g.n < 5) return;
      bins[gi]!.forEach((v, bi) => { const h = (v / mx) * Hh, x = x0 + bi * slot + 6 + (gi * (slot - 12)) / 3; s += `<rect class="grow-y" x="${fx(x)}" y="${fx(y1 - h)}" width="${fx((slot - 12) / 3 - 2)}" height="${fx(Math.max(h, 0.4))}" fill="${col}" opacity=".85" style="animation-delay:${(bi * 0.04 + gi * 0.1).toFixed(2)}s"/>`; });
      if (g.mean !== null) { const mxp = x0 + ((clamp(g.mean, lo, hi) - lo) / (hi - lo)) * W; s += `<line x1="${fx(mxp)}" x2="${fx(mxp)}" y1="84" y2="${y1}" stroke="${col}" stroke-width="1.6" stroke-dasharray="2 4"/>`; }
    });
    G.forEach(([lab, g, col], gi) => { const x = gi * 300; s += `<rect x="${x}" y="368" width="12" height="12" fill="${col}"/>` + text(x + 20, 378, lab, "t-sub", "font-size:10px") + text(x + 20, 394, g.n < 5 ? `${g.n} CASOS, POUCOS PARA DESENHAR` : `${g.n} CASOS, ${g.up} SUBIRAM, MEDIA ${pct(g.mean, 1)}`, "t-mono", `font-size:11.5px;fill:${col}`); });
    return s + text(0, 414, "ALTURA = PARTE DE CADA GRUPO NA FAIXA. TRACEJADO = MEDIA DO GRUPO", "t-sub", "font-size:9px");
  }

  function recent(): string {
    if (!D.analysisOk) return unavailable(1840, 440, "AS ULTIMAS DECISOES DE NAO COMPRAR", NO_ANALYSIS);
    const measured = (r: { m15: number | null; m1h: number | null }): number => (r.m15 !== null || r.m1h !== null ? 1 : 0);
    const R = [...A.recent].sort((a, b) => measured(b) - measured(a) || b.t - a.t).slice(0, 14);
    let s = title(1840, "AS ULTIMAS DECISOES DE NAO COMPRAR, E O QUE O PRECO FEZ", "CADA LINHA: A HORA, O ATIVO, QUEM DECIDIU E O MOVIMENTO DEPOIS. CONTRAFACTUAL, ANTES DE CUSTO");
    if (R.length === 0) return s + text(0, 100, "AINDA SEM DECISOES MEDIDAS", "t-sub", "font-size:11px");
    const kinds: Record<string, [string, string]> = { "pulada pelo Jev": [COL.cy, "O JEV PULOU"], "puxada pelo codigo": [COL.amber, "FECHADO PELO CODIGO"], "pedida e recusada": [COL.white, "PEDIU E NAO VIROU ORDEM"] };
    const cell = (x: number, y: number, label: string, v: number | null): string => {
      const head = text(x, y - 14, label, "t-sub", "font-size:9px");
      if (v === null) return head + text(x, y + 1, "AINDA MEDINDO", "t-sub", `font-size:10px;fill:${COL.mute}`);
      const w = Math.min(100, Math.abs(v) * 7), col = v >= 0 ? COL.green : COL.amber;
      return head + `<line x1="${x + 110}" x2="${x + 110}" y1="${y - 10}" y2="${y + 6}" stroke="${COL.mute}"/><rect class="grow-x" x="${v >= 0 ? x + 110 : x + 110 - w}" y="${y - 7}" width="${fx(Math.max(w, 1))}" height="9" fill="${col}" opacity=".9"/>` + text(x + 280, y + 3, pct(v, 1), "t-mono", `font-size:12.5px;fill:${col}`, "end");
    };
    R.forEach((r, i) => {
      const col = Math.floor(i / 7), row = i % 7, x = col * 920, y = 108 + row * 44;
      const [kc, kl] = kinds[r.kind] ?? [COL.mute, r.kind.toUpperCase()];
      s += `<circle cx="${x + 6}" cy="${y - 4}" r="5" fill="${kc}"/>` + text(x + 20, y, hhmm(r.t), "t-mono", "font-size:12px;fill:#5fa3b5") + text(x + 74, y, (r.s ?? "-").slice(0, 10), "t-num", "font-size:15px") + text(x + 74, y + 16, kl, "t-sub", `font-size:9px;fill:${kc}`);
      s += cell(x + 250, y, "15 MIN", r.m15) + cell(x + 580, y, "1 HORA", r.m1h);
    });
    return s;
  }

  return { funnel, hist, matrix, preferences, timeline, allocation, equityMarks, tripCards, limits, kpis, cumulative, outcomes, activity, moves, recent };
}
