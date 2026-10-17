/** The panels of the command view: the Inonu at the centre, the instruments around it. Each panel draws in its own local coordinates (origin top left). */
import type { HudModel } from "../types";
import { blockedGroups, insights, STOPPED_TEXT, type InsightTone } from "../insights";
import { arc, at, capText, capUse, clamp, COL, countText, fmt, fx, hex, hhmm, leverageText, pct, pt, STOPPED_COUNT, STOPPED_STATE, text, ticks, title, id, wrap } from "./h";

export const FACET_META: readonly (readonly [string, string])[] = [["late_entry", "ATRASADO"], ["still_falling", "AINDA CAINDO"], ["accumulating", "ACUMULANDO"], ["exit_easy", "SAIDA FACIL"], ["distribution", "DISTRIBUICAO"], ["fading", "PERDENDO FORCA"]];
const PROFILE_TEXT: Readonly<Record<string, string>> = { alvo_2: "ALVO 2 STOP 1,5", alvo_5: "ALVO 5 STOP 4", alvo_10: "ALVO 10 STOP 6", alvo_20: "ALVO 20 STOP 10" };

export function createCommand(D: HudModel) {
  const cands = D.candidates;
  const trips = D.a.trips;
  const net = trips.reduce((a, t) => a + (t.out - t.in), 0);
  const feeSol = D.a.fees.lamports / 1e9;

  // what the wallet did and what the closed round trips gave. natural size 480 x 250
  function results(): string {
    const eq = D.equity;
    let s = title(480, "RESULTADO REAL", "O QUE A CARTEIRA FEZ E O QUE AS VOLTAS DERAM");
    s += text(0, 80, "PATRIMONIO GERIDO", "t-sub", "font-size:10px");
    if (D.wallet.total === null) {
      // no reading: say so and when the last one was, never a figure that was not read
      s += text(0, 104, "SEM LEITURA", "t-big", "font-size:22px");
      s += text(0, 126, D.wallet.lastReadMs === null ? "A CARTEIRA NUNCA FOI LIDA" : `ULTIMA LEITURA ${hhmm(D.wallet.lastReadMs)}`, "t-sub", "font-size:9px");
    } else {
      // the number takes the room the stats leave it: a big wallet is written smaller instead of running into them
      const size = Math.max(16, Math.min(30, 238 / (("US$ " + fmt(D.wallet.total, 2)).length * 0.62)));
      s += countText(0, 106, D.wallet.total, 2, "US$ ", "", "t-big", `font-size:${size.toFixed(1)}px`);
    }
    if (D.wallet.total !== null && D.wallet.observedAtMs !== null) s += text(0, 126, `SALDO LIDO HA ${Math.max(0, Math.round((D.snapshotAtMs - D.wallet.observedAtMs) / 60000))} MIN`, "t-sub", "font-size:9px");
    // the two figures of the round trips are stacked on the right (each is a label, a number and a note of its own), so no note can run into the other figure
    const stat = (y: number, label: string, value: number, d: number, pre: string, suf: string, sub: string, col: string): string => text(250, y, label, "t-sub", "font-size:10px") + countText(250, y + 21, value, d, pre, suf, "t-num", `font-size:18px;fill:${col}`) + text(250, y + 36, sub, "t-sub", "font-size:9px");
    if (D.analysisOk) {
      s += stat(66, "VOLTAS FECHADAS", net, 3, net > 0 ? "+" : "", " USDC", trips.length + " VOLTAS, ANTES DA TAXA", net >= 0 ? COL.green : COL.amber);
      s += stat(124, "TAXA DE REDE", feeSol, 5, "", " SOL", "SO A REDE, EM SOL", "#bfefff");
    } else s += text(250, 96, "VOLTAS E TAXAS:", "t-sub", "font-size:10px") + text(250, 112, "SEM DADOS DO NUCLEO", "t-sub", "font-size:10px");
    if (eq.length < 2) return s + text(0, 210, "AINDA SEM HISTORICO DA CARTEIRA", "t-sub", "font-size:10px");
    const x0 = 0, x1 = 480, y0 = 176, y1 = 226;
    const vmin = Math.min(...eq.map((p) => p.v)), vmax = Math.max(...eq.map((p) => p.v));
    const t0 = eq[0]!.t, t1 = eq[eq.length - 1]!.t;
    const px = (t: number): number => x0 + ((t - t0) / (t1 - t0 || 1)) * (x1 - x0);
    const py = (v: number): number => y1 - ((v - vmin) / (vmax - vmin || 1)) * (y1 - y0);
    const line = eq.map((p, i) => `${i ? "L" : "M"}${fx(px(p.t))} ${fx(py(p.v))}`).join("");
    const last = eq[eq.length - 1]!, first = eq[0]!;
    const marks = D.events.filter((e) => e.t >= t0 && e.stage === "executada").map((e) => {
      const x = px(e.t);
      const y = py(eq.reduce((m, p) => (Math.abs(p.t - e.t) < Math.abs(m.t - e.t) ? p : m)).v);
      return e.side === "buy" ? `<path d="M${fx(x)} ${fx(y - 9)}l5 8h-10z" fill="#38ffb4"/>` : `<path d="M${fx(x)} ${fx(y + 9)}l5 -8h-10z" fill="#ffb23e"/>`;
    }).join("");
    s += `<path d="${line}L${x1} ${y1}L${x0} ${y1}Z" fill="url(#areaGrad)" opacity=".8"/><path d="${line}" fill="none" stroke="#2ee6ff" stroke-width="1.8" class="glow"/>${marks}<circle r="3.4" fill="#e9fbff" class="glow"><animateMotion dur="9s" repeatCount="indefinite" path="${line}"/></circle>`;
    s += `<g style="--w:${x1}px;animation:hud-scan 9s linear infinite"><line x1="0" x2="0" y1="${y0 - 6}" y2="${y1 + 6}" stroke="#bff6ff" stroke-width="1.2" opacity=".5"/></g>`;
    s += text(0, 244, new Date(t0).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }), "t-sub", "font-size:9.5px");
    s += text(240, 244, `JANELA ${pct((last.v / first.v - 1) * 100, 1)} (INCLUI APORTES E PRECOS)`, "t-sub", "font-size:9.5px", "middle");
    s += text(480, 244, "AGORA", "t-sub", "font-size:9.5px", "end");
    return s;
  }

  // where the capital sits, and which part has an exit plan. natural size 480 x 232
  function positions(): string {
    const ps = D.wallet.positions;
    const total = D.wallet.total ?? ps.reduce((a, p) => a + (p.usd ?? 0), 0);
    const valid = D.wallet.quality === "current" || D.wallet.quality === "partial" || D.wallet.quality === "stale";
    let s = title(480, "ONDE ESTA O CAPITAL", "CAIXA, TOKENS E O QUE TEM PLANO DE SAIDA");
    if (!valid) return s + text(0, 100, "SEM LEITURA DA CARTEIRA", "t-sub", "font-size:10px");
    if (!(total > 0)) return s + text(0, 100, D.wallet.quality === "partial" ? "LEITURA PARCIAL: TOTAL VALORADO EM ZERO" : "TOTAL VALORADO EM ZERO", "t-sub", "font-size:10px");
    const cash = ps.filter((p) => p.cash).reduce((a, p) => a + (p.usd ?? 0), 0);
    const tok = ps.filter((p) => !p.cash && p.usd !== null && p.usd > 0);
    const withPlan = tok.filter((p) => p.plan !== null).reduce((a, p) => a + (p.usd ?? 0), 0);
    const noPlan = tok.filter((p) => p.plan === null).reduce((a, p) => a + (p.usd ?? 0), 0);
    const w = (v: number): number => (v / total) * 480;
    s += `<rect x="0" y="66" width="480" height="14" fill="#0b2c38"/>
      <rect class="grow-x" x="0" y="66" width="${fx(w(cash))}" height="14" fill="#2ee6ff"/>
      <rect class="grow-x" x="${fx(w(cash))}" y="66" width="${fx(w(withPlan))}" height="14" fill="#38ffb4"/>
      <rect class="grow-x" x="${fx(w(cash + withPlan))}" y="66" width="${fx(w(noPlan))}" height="14" fill="#ffb23e"/>`;
    s += text(0, 98, `CAIXA ${Math.round((cash / total) * 100)}%`, "t-sub", "font-size:10px;fill:#2ee6ff") + text(150, 98, `COM PLANO ${Math.round((withPlan / total) * 100)}%`, "t-sub", "font-size:10px;fill:#38ffb4") + text(330, 98, `SEM PLANO ${Math.round((noPlan / total) * 100)}%`, "t-sub", "font-size:10px;fill:#ffb23e");
    const rows = [...tok].sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0)).slice(0, 4);
    rows.forEach((p, i) => {
      const y = 126 + i * 24;
      const tag = p.plan === null ? "SEM PLANO" : `${PROFILE_TEXT[p.plan.profile] ?? "COM PLANO"}`;
      // the name has the room of its longest possible spelling (14 letters), then the dollars, then a bar that never reaches the plan's words on the right
      s += text(0, y, p.s, "t-num", "font-size:13px") + text(250, y, "US$ " + fmt(p.usd), "t-mono", "", "end");
      s += `<rect x="262" y="${y - 10}" width="${fx(Math.max(2, Math.min(96, ((p.usd ?? 0) / total) * 300)))}" height="8" fill="${p.plan === null ? "#ffb23e" : "#38ffb4"}" opacity=".85"/>`;
      s += text(480, y, tag, "t-sub", `font-size:9.5px;fill:${p.plan === null ? "#ffb23e" : "#38ffb4"}`, "end");
    });
    const unpriced = ps.filter((p) => !p.cash && (p.usd === null || p.usd <= 0)).length;
    s += text(0, 126 + rows.length * 24 + 4, `${unpriced ? "+ " + unpriced + " TOKENS SEM PRECO. " : ""}SEM PLANO, O AGENTE NAO ADMINISTRA`, "t-sub", "font-size:9.5px");
    return s;
  }

  // the candidates of the last look: a radar and a ranked list. natural size 480 x 310
  function decision(): string {
    const cx = 112, cy = 186, R = 84, pmax = 1;
    const open = cands.map((c, i) => [c, i] as const).filter(([c]) => !c.closed);
    const closed = cands.map((c, i) => [c, i] as const).filter(([c]) => c.closed);
    const ranked = [...open].sort((a, b) => (b[0].pbuy ?? 0) - (a[0].pbuy ?? 0));
    const best = ranked[0] ? ranked[0][0] : null;
    const nDropped = D.last.dropped.length;
    // an agent that runs no cycles has no "now": the panel is the last consult, and says so
    const posture = (D.last.posture ?? "-").toUpperCase();
    let s = !D.agent.cycling
      ? title(480, "ULTIMA DECISAO", D.last.atMs === null ? "SEM CONSULTA NESTA SESSAO, AGENTE PARADO" : `ULTIMA CONSULTA ${hhmm(D.last.atMs)}, AGENTE PARADO`)
      : title(480, "DECISAO AGORA", nDropped > 0 ? `POSTURA ${posture}, ${open.length} ABERTOS, ${nDropped} BLOQUEADO(S) PELO CODIGO` : `POSTURA ${posture}, ${open.length} ABERTOS DE ${cands.length} CANDIDATOS`);
    s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#031820" stroke="#17687f" stroke-width="1.2"/>`;
    for (const f of [0.25, 0.5, 0.75]) s += `<circle cx="${cx}" cy="${cy}" r="${R * f}" fill="none" stroke="#0f4a5c" stroke-width="1" stroke-dasharray="2 5"/>`;
    s += ticks(cx, cy, R - 5, R, 60, 'stroke="#2c7e93" stroke-width="1"');
    s += `<line x1="${cx - R}" x2="${cx + R}" y1="${cy}" y2="${cy}" stroke="#0f4a5c"/><line x1="${cx}" x2="${cx}" y1="${cy - R}" y2="${cy + R}" stroke="#0f4a5c"/>`;
    s += `<g class="spin-c" style="transform-origin:${cx}px ${cy}px"><path d="M${cx} ${cy}L${cx} ${cy - R}A${R} ${R} 0 0 0 ${fx(pt(cx, cy, R, -50)[0])} ${fx(pt(cx, cy, R, -50)[1])}Z" fill="url(#sweepGrad)" opacity=".55"/><line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - R}" stroke="#bff6ff" stroke-width="1.5"/></g>`;
    const dot = (closedOne: boolean, i: number, a: number, r: number, held = false): string => {
      const [bx, by] = pt(cx, cy, r, a);
      return `<circle class="blip" data-i="${i}" cx="${fx(bx)}" cy="${fx(by)}" r="5.5" fill="${closedOne ? "#031820" : held ? COL.amber : "#2ee6ff"}" stroke="${closedOne ? "#5fa3b5" : "#e9fbff"}" stroke-width="1.5"/>`;
    };
    open.forEach(([c, i], k) => { s += dot(false, i, 25 + k * (310 / Math.max(1, open.length)), Math.max(14, Math.min(R, ((c.pbuy ?? 0) / pmax) * R)), c.blocked !== null); });
    closed.forEach(([, i], k) => { s += dot(true, i, 160 + k * (200 / Math.max(1, closed.length)), R); });
    const x = 236;
    s += text(x, 76, "PREFERENCIA DE COMPRA, 0 A 100%", "t-sub", "font-size:9.5px");
    const list = [...ranked.map(([c]) => [c, "open"] as const), ...closed.map(([c]) => [c, "closed"] as const)].slice(0, 8);
    // the bar is 100 wide and the reading is right aligned at the panel's edge, so the longest word ("BLOQUEADO") never leaves the panel and never lands on the bar
    const barW = 100, barX = x + 82;
    list.forEach(([c, kind], k) => {
      const yy = 76 + 22 + k * 25;
      const p = c.pbuy ?? 0;
      const w = Math.min(barW, (p / pmax) * barW);
      // the Jev's choice is the decision: a purchase he asked for is green, one the code dropped after that is amber and says so where the preference would be written, the rest are cyan
      const held = kind === "open" && c.blocked !== null;
      const asked = kind === "open" && !held && c.applied !== null && c.applied !== "skip";
      const shade = held ? "#ffb23e" : asked ? COL.green : "#2ee6ff";
      s += text(x, yy, c.s.slice(0, 9), "t-mono", `font-size:12px;fill:${kind === "closed" ? "#5fa3b5" : "#e9fbff"}`);
      s += `<rect x="${barX}" y="${yy - 9}" width="${barW}" height="8" fill="#0b2c38"/>`;
      if (kind === "open") s += `<rect class="grow-x" x="${barX}" y="${yy - 9}" width="${fx(w)}" height="8" fill="${shade}" style="animation-delay:${(k * 0.05).toFixed(2)}s"/>`;
      s += text(480, yy, kind === "closed" ? "FECHADO" : held ? "BLOQUEADO" : c.pbuy === null ? "-" : Math.round(p * 100) + "%", "t-mono", `font-size:${held ? 10.5 : 11}px;fill:${kind === "closed" ? "#5fa3b5" : held ? "#ffb23e" : asked ? COL.green : "#7df3ff"}`, "end");
    });
    const bg = blockedGroups(D);
    if (bg.length > 0) {
      const g = bg[0]!, run = D.last.streak !== null && D.last.streak.exact && D.last.streak.cycles >= 2 ? `, ${D.last.streak.cycles} CICLOS SEGUIDOS` : "";
      s += text(0, 308, `PEDIU ${g.side === "buy" ? "COMPRAR" : "VENDER"} ${g.names}, O CODIGO BLOQUEOU: ${g.text}${run}${bg.length > 1 ? " E MAIS" : ""}`, "t-mono", `font-size:11px;fill:${COL.amber}`);
    }
    // the strongest preference is said once, with no bar to compare it with: what the Jev asked for is the decision
    if (best && best.pbuy !== null) s += text(0, 290, `MAIOR PREFERENCIA DE COMPRA: ${best.s} ${Math.round(best.pbuy * 100)}%`, "t-sub", "font-size:10px;fill:#7df3ff");
    return s;
  }

  // the health of the system, the alerts first. natural size 480 x 196
  function health(): string {
    const rows = healthRows();
    let s = title(480, "SAUDE DO SISTEMA", rows.some((r) => r.col === COL.amber && r.frac === null) ? "HA ITENS QUE PEDEM ATENCAO" : "NADA PEDE ATENCAO AGORA");
    rows.slice(0, 8).forEach((r, i) => {
      const y = 78 + i * 17;
      const bar = r.frac === null ? "" : `<rect x="0" y="${y + 4}" width="480" height="1.5" fill="#0b2c38"/><rect class="grow-x" x="0" y="${y + 4}" width="${fx(Math.max(1, Math.min(1, r.frac) * 480))}" height="1.5" fill="${r.col}" opacity=".85"/>`;
      s += text(0, y, r.label, "t-sub", "font-size:10px") + text(480, y, r.value, "t-mono", `fill:${r.col};font-size:12px`, "end") + bar;
    });
    return s;
  }

  interface HealthRow { label: string; value: string; col: string; frac: number | null }
  /** The rows of the health panel, the ones that ask for attention first. */
  function healthRows(): HealthRow[] {
    const H = D.health;
    const rows: HealthRow[] = [];
    // an agent that runs no cycles is the first thing that needs attention: nothing decides and no order leaves, whatever else is green
    if (!D.agent.cycling) rows.push({ label: "ATENCAO", value: STOPPED_TEXT, col: COL.amber, frac: null });
    if (D.agent.paused) rows.push({ label: "COMPRAS PAUSADAS", value: (D.agent.pauseReason ?? "PELO PROPRIO AGENTE").replace(/_/g, " ").toUpperCase(), col: COL.amber, frac: null });
    if (!H.lock) rows.push({ label: "OUTRO PROCESSO", value: "TEM A PASTA DO AGENTE", col: COL.amber, frac: null });
    if (H.inFlight > 0) rows.push({ label: "ORDEM SEM RESPOSTA", value: H.inFlight + " AGUARDANDO O RECIBO", col: COL.amber, frac: null });
    if (!H.ledgerOk || !H.plansOk) rows.push({ label: "REGISTROS", value: "COM PROBLEMA, VEJA OS CONTROLES", col: COL.amber, frac: null });
    rows.push({ label: "CONEXAO COM A CARTEIRA", value: H.login === "logado" ? "LOGADA" + (H.sessionDays === null ? "" : ", SESSAO " + Math.max(0, Math.round(H.sessionDays)) + " DIAS") : H.login.replace(/_/g, " ").toUpperCase(), col: H.login === "logado" && (H.sessionDays === null || H.sessionDays > 3) ? COL.green : COL.amber, frac: null });
    rows.push({ label: "MODELO", value: `${(D.agent.model ?? "-").toUpperCase()}, ${D.budget.tokens === null ? "-" : fmt(D.budget.tokens / 1e6, 2) + "M"} TOKENS HOJE`, col: H.modelOk ? COL.green : COL.amber, frac: null });
    rows.push({ label: "CONSULTAS DO DIA", value: `${D.budget.consults} DE ${D.budget.max}`, col: COL.cy, frac: D.budget.max > 0 ? D.budget.consults / D.budget.max : null });
    const dayCap = D.agent.caps === null ? undefined : D.agent.caps.maxDailyBuyUsd;
    const spent = D.analysisOk ? D.a.orders.spentToday.buy : null;
    if (D.analysisOk) {
      const ok = D.a.orders.outcomes.executada ?? 0, fail = D.a.orders.outcomes.falhou ?? 0;
      rows.push({ label: "ORDENS NA CADEIA", value: `${ok} OK, ${fail} COM FALHA`, col: fail > ok / 3 ? COL.amber : COL.green, frac: null });
    }
    rows.push({ label: "COMPRAS DO DIA", value: `${spent === null ? "SEM DADO DO NUCLEO" : `US$ ${fmt(spent, 0)}`}, LIMITE ${capText(dayCap)}`, col: COL.cy, frac: spent === null ? null : capUse(spent, dayCap) });
    rows.push({ label: "ALAVANCAGEM", value: leverageText(D.agent.leverage, true), col: D.agent.leverage !== null && D.agent.leverage.granted ? COL.soft : COL.mute, frac: null });
    return rows;
  }
  /** The height the health panel needs for its rows (the scenes that stack panels go by it). */
  const healthH = (): number => 80 + Math.min(8, healthRows().length) * 17 + 6;

  // what was skipped, measured afterwards. natural size 480 x 270
  function placar(): string {
    let s = title(480, "O QUE FOI PULADO", "O PRECO DEPOIS DA DECISAO DE NAO COMPRAR");
    if (!D.analysisOk) return s + text(0, 100, "SEM DADOS DO NUCLEO NESTA VERSAO", "t-sub", "font-size:10px");
    const g = [["PULADAS PELO JEV", "15 MIN", D.a.placar.skipped["15m"]], ["PULADAS PELO JEV", "1 HORA", D.a.placar.skipped["1h"]], ["FECHADAS PELO CODIGO", "15 MIN", D.a.placar.closed["15m"]], ["FECHADAS PELO CODIGO", "1 HORA", D.a.placar.closed["1h"]]] as const;
    g.forEach(([a, b, v], i) => {
      const cx = 36 + (i % 2) * 244, cy = 112 + Math.floor(i / 2) * 92;
      const share = v.n ? v.up / v.n : 0;
      const col = (v.mean ?? 0) >= 0 ? "#2ee6ff" : "#ffb23e";
      s += `<circle cx="${cx}" cy="${cy}" r="30" fill="none" stroke="#0e3948" stroke-width="7"/>
        <path d="${arc(cx, cy, 30, 0, Math.max(1, share * 359))}" fill="none" stroke="${col}" stroke-width="7" class="glow"/>
        <g class="${i % 2 ? "spin-c" : "spin-d"}" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="39" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="3 8"/></g>`;
      s += text(cx, cy + 5, Math.round(share * 100) + "%", "t-num", "font-size:15px", "middle") + text(cx + 52, cy - 14, a, "t-sub", "font-size:10px;letter-spacing:.06em") + text(cx + 52, cy - 1, b, "t-sub", "font-size:10px;fill:#7df3ff");
      s += text(cx + 52, cy + 17, `${v.up} DE ${v.n} SUBIRAM`, "t-mono", `font-size:11.5px;fill:${(v.mean ?? 0) >= 0 ? "#7df3ff" : "#ffb23e"}`) + text(cx + 52, cy + 31, `MEDIA ${pct(v.mean, 1)}`, "t-mono", "font-size:11.5px;fill:#5fa3b5");
    });
    return s + text(0, 262, "ANTES DE CUSTO E IMPACTO. NAO E RESULTADO REAL", "t-sub", "font-size:10px");
  }

  // the six judgments of the Jev about one candidate, as a hexagon flower. natural size 480 x 256
  function facets(): string {
    const cx = 240, cy = 148, r = 28, dist = r * 1.78;
    const pos = [[0, -1], [0.87, -0.5], [0.87, 0.5], [0, 1], [-0.87, 0.5], [-0.87, -0.5]] as const;
    let s = title(480, "FACETAS DO JEV", "O QUE ELE JULGOU DO CANDIDATO");
    s += `<g class="spin-e" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="${fx(dist + r + 1)}" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="3 9"/></g>`;
    s += `<path d="${hex(cx, cy, r * 0.95)}" fill="#031820" stroke="#2ee6ff" stroke-width="1.4" class="glow"/>`;
    FACET_META.forEach(([k, lab], i) => {
      const x = cx + pos[i]![0] * dist, y = cy + pos[i]![1] * dist;
      const side = pos[i]![0] >= 0 ? 1 : -1;
      const vertical = i === 0 || i === 3;
      s += `<path d="${hex(x, y, r * 0.95)}" fill="#031820" stroke="#17687f" stroke-width="1.2"/>
        <path class="hexfill" data-k="${k}" d="${hex(x, y, r * 0.95)}" fill="#2ee6ff" opacity=".1" stroke="#2ee6ff" stroke-width="1.4"/>
        <text class="t-num" data-v="${k}" x="${x}" y="${y + 6}" text-anchor="middle" style="font-size:15px">-</text>`;
      s += text(vertical ? x : x + side * (r + 12), vertical ? (i === 0 ? y - r - 6 : y + r + 15) : y + 4, lab, "t-sub", "font-size:10px", vertical ? "middle" : side > 0 ? "start" : "end");
    });
    s += text(480, 28, "-", "t-num flowerName", "font-size:17px", "end") + text(480, 46, "-", "t-sub flowerSub", "font-size:10px", "end");
    return s;
  }

  // order receipts, scrolling. natural size 480 x 142
  function feed(): string {
    const cid = id("feedClip");
    const lines = D.events.slice(-8).map((e) => {
      const ok = e.stage === "executada";
      const col = e.stage === "incerta" ? "#7df3ff" : ok ? (e.side === "buy" ? "#38ffb4" : "#7df3ff") : "#ffb23e";
      const what = e.stage === "incerta" ? "EM VOO" : ok ? (e.side === "buy" ? "COMPRA" : "VENDA") : "FALHOU";
      const why = !ok && e.stage !== "incerta" ? (e.reason ?? "").replace(/_/g, " ").toUpperCase() : e.stage === "incerta" ? "AGUARDANDO O RECIBO" : e.src === "protecao" ? "PROTECAO DO PLANO" : "DECISAO DO MODELO";
      return { col, line: `${hhmm(e.t)}  ${what} ${e.s} US$ ${fmt(e.usd, 0)}`, why };
    }).reverse();
    let s = title(480, "FLUXO DE ORDENS", "RECIBOS DA CADEIA, DO MAIS NOVO AO MAIS ANTIGO");
    if (lines.length === 0) return s + text(0, 100, "NENHUMA ORDEM AINDA", "t-sub", "font-size:10px");
    const rowH = 44, listH = lines.length * rowH;
    const rows = (off: number): string => lines.map((l, i) => `<g transform="translate(0 ${off + i * rowH})"><circle cx="8" cy="8" r="4.5" fill="${l.col}"/><line x1="8" x2="8" y1="15" y2="${rowH - 4}" stroke="#124c5f"/>${text(24, 12, l.line, "t-mono", `fill:${l.col};font-size:13px`)}${text(24, 28, l.why, "t-sub", "font-size:10px")}</g>`).join("");
    return `${s}<clipPath id="${cid}"><rect x="0" y="62" width="480" height="80"/></clipPath>
      <g clip-path="url(#${cid})"><g transform="translate(0 66)"><g style="--h:-${listH}px;animation:hud-rise ${Math.max(16, lines.length * 4)}s linear infinite">${rows(0)}${rows(listH)}</g></g></g>`;
  }

  // the last cycles, with motion. natural size 480 x 124
  function cyclesPanel(): string {
    const cyc = D.cycles.slice(-48);
    let s = title(480, "CICLOS RECENTES", "CADA BARRA E UM OLHAR DO AGENTE, DO MAIS ANTIGO AO MAIS NOVO");
    if (cyc.length === 0) return s + text(0, 100, "AINDA SEM CICLOS", "t-sub", "font-size:10px");
    const step = Math.min(40, 480 / cyc.length);
    const hOf = (c: { o: string }): number => (c.o === "decidido" ? 30 : c.o === "mantido" ? 18 : 9);
    const bars = cyc.map((c, i) => {
      const h = hOf(c);
      const col = c.p > 0 ? "#ffb23e" : c.o === "decidido" ? "#2ee6ff" : "#17687f";
      return `<g class="wave" style="animation-delay:-${(i * 0.14).toFixed(2)}s"><rect class="grow-y" x="${fx(i * step + 1)}" y="${94 - h}" width="${fx(Math.max(3, step - 4))}" height="${h}" fill="${col}" opacity=".92" style="animation-delay:${(i * 0.02).toFixed(2)}s"/></g>`;
    }).join("");
    const top = cyc.map((c, i) => `${i ? "L" : "M"}${fx(i * step + (step - 3) / 2)} ${94 - hOf(c) - 3}`).join("");
    const n = (k: string): number => cyc.filter((c) => c.o === k).length;
    const orders = cyc.filter((c) => c.p > 0).length;
    s += `<path d="${top}" fill="none" stroke="#7df3ff" stroke-width="1.2" class="flow-fast" opacity=".8"/>${bars}`;
    s += `<g style="--w:480px;animation:hud-scan 5s linear infinite"><rect x="-34" y="52" width="34" height="46" fill="url(#sweepGrad)" opacity=".7"/><line x1="0" x2="0" y1="52" y2="98" stroke="#e9fbff" stroke-width="1.2" opacity=".6"/></g>`;
    s += text(0, 114, n("decidido") + " DECIDIDOS", "t-sub", "font-size:9.5px;fill:#2ee6ff") + text(128, 114, n("mantido") + " MANTIDOS", "t-sub", "font-size:9.5px") + text(236, 114, orders + " COM ORDEM", "t-sub", "font-size:9.5px;fill:#ffb23e");
    return s + text(480, 114, `${hhmm(cyc[cyc.length - 1]!.t)} O ULTIMO`, "t-sub", "font-size:9.5px", "end");
  }

  const lines = insights(D);
  const TONE: Record<InsightTone, string> = { warn: COL.amber, ok: COL.green, info: COL.soft };

  // the model at work: the line the Inonu "says" and what it reads from its own numbers, scrolling, on a solid plate, with a thin waveform in a band of its own under the text (y 108 to 118), so nothing animated is ever
  // behind a letter. natural size 700 x 150: the plate is the room between the two brackets (y 10 to 120 at the middle); the text ends at y 105 and the band begins at 108
  function command(): string {
    let wave = "";
    for (let i = 0; i < 52; i++) {
      const h = 3 + 7 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21));
      wave += `<rect class="bar" x="${fx(60 + i * 11.6)}" y="${fx(113 - h / 2)}" width="5" height="${fx(h)}" fill="#2ee6ff" opacity=".4" style="animation-duration:${(1.6 + (i % 7) * 0.23).toFixed(2)}s;animation-delay:-${(i * 0.17).toFixed(2)}s"/>`;
    }
    const open = cands.filter((c) => !c.closed).length;
    const head = !D.agent.cycling ? `INONU > AGENTE PARADO, SO ACOMPANHAMENTO${D.last.atMs === null ? "" : `. ULTIMA CONSULTA ${hhmm(D.last.atMs)}`}` : D.last.atMs === null ? "INONU > AINDA SEM CONSULTA NESTA SESSAO" : `INONU > ULTIMA CONSULTA ${hhmm(D.last.atMs)}, POSTURA ${(D.last.posture ?? "-").toUpperCase()}, ${cands.length} CANDIDATOS, ${open} ABERTOS`;
    const cid = id("tickClip");
    const rowH = 19;
    const row = (l: { tone: InsightTone; text: string }, i: number): string => `<g transform="translate(0 ${i * rowH})"><path d="${hex(60, 8, 4)}" fill="${TONE[l.tone]}"/>${text(74, 12, l.text, "t-mono", `font-size:11.5px;fill:${TONE[l.tone]}`)}</g>`;
    const scrolling = lines.length > 3;
    const listH = lines.length * rowH;
    const rows = lines.map(row).join("");
    const list = lines.length === 0 ? "" : scrolling
      ? `<g style="--h:-${listH}px;animation:hud-rise ${Math.max(14, lines.length * 4)}s linear infinite">${rows}<g transform="translate(0 ${listH})">${rows}</g></g>`
      : rows;
    return `<path d="M0 36h30l18 -26h604l18 26h30" fill="none" stroke="#17687f" stroke-width="1.3"/><path d="M0 146h30l18 -26h604l18 26h30" fill="none" stroke="#17687f" stroke-width="1.3"/>
      <rect x="48" y="13" width="604" height="106" fill="#02101a" opacity=".94"/>${text(350, 34, head, "t-mono", "fill:#7df3ff", "middle")}${wave}
      <clipPath id="${cid}"><rect x="30" y="46" width="650" height="59"/></clipPath><g clip-path="url(#${cid})"><g transform="translate(30 52)">${list}</g></g>`;
  }

  // the reading of the Inonu, written out, for narrow screens. natural size 480 x 290
  function reading(): string {
    let s = title(480, "LEITURA DO INONU", "O QUE OS NUMEROS DIZEM AGORA, SEM PROMESSA DE LUCRO");
    if (lines.length === 0) return s + text(0, 100, "AINDA SEM O QUE LER", "t-sub", "font-size:10px");
    let y = 84;
    lines.slice(0, 6).forEach((l, i) => {
      const parts = wrap(l.text, 66);
      s += `<g class="slide" style="animation-delay:${(i * 0.08).toFixed(2)}s"><path d="${hex(6, y - 4, 4)}" fill="${TONE[l.tone]}"/>`;
      parts.forEach((part, k) => { s += text(20, y + k * 14, part, "t-mono", `font-size:11px;fill:${TONE[l.tone]}`); });
      s += "</g>";
      y += parts.length * 14 + 12;
    });
    return s;
  }

  /** The height the reading needs for its lines (the scenes that stack panels go by it). */
  const readingH = (): number => (lines.length === 0 ? 110 : 84 + lines.slice(0, 6).reduce((a, l) => a + wrap(l.text, 66).length * 14 + 12, 0));

  // counters. natural size 440 x 100
  function counters(): string {
    return text(0, 16, "CONSULTAS DO DIA") + text(0, 44, String(D.budget.consults), "t-num") + text(34, 44, "DE " + D.budget.max, "t-sub", "font-size:11px")
      + text(170, 16, "TOKENS DO MODELO") + text(170, 44, D.budget.tokens === null ? "-" : fmt(D.budget.tokens / 1e6, 2) + "M", "t-num")
      + text(440, 16, "RITMO", "t-sub", "", "end") + text(440, 44, D.agent.cycling ? D.rhythm.intervalMin + " MIN" : STOPPED_COUNT, "t-num", "", "end")
      + text(0, 72, `TETO DE COMPRA ${capText(D.agent.caps === null ? undefined : D.agent.caps.maxBuyUsd)}`, "t-sub", "font-size:10px")
      + text(0, 90, "A ESCOLHA DO JEV NAO E CHANCE DE LUCRO", "t-sub", "font-size:10px");
  }

  // the core: the Inonu itself, with its rings. natural size 700 x 820, centre (350, 380)
  /** `boost` enlarges the type of the labels (not the drawing) for the scenes that draw the core smaller than its own size, so what is written on it keeps the size it has on the stage. */
  function core(boost = 1): string {
    const b = (n: number): number => Math.round(n * boost * 10) / 10;
    const cx = 350, cy = 380;
    const total = D.wallet.total ?? 0;
    const quotaShare = D.budget.max > 0 ? D.budget.consults / D.budget.max : 0;
    const priced = D.wallet.positions.filter((p) => p.usd !== null && p.usd > 0);
    const colors = ["#2ee6ff", "#38ffb4", "#7df3ff", "#ffb23e", "#5fa3b5", "#a58cff"];
    let acc = 0;
    let donut = "";
    let sats = "";
    if (total > 0) priced.forEach((p, i) => {
      const sw = ((p.usd ?? 0) / total) * 360;
      if (sw > 0.6) {
        donut += `<path d="${arc(cx, cy, 112, acc + 1, acc + sw - 1)}" stroke="${colors[i % colors.length]}" stroke-width="9" fill="none"/>`;
        // a satellite per holding, starting at the middle of its slice and turning at its own pace
        if (i < 6) sats += `<g style="transform-origin:${cx}px ${cy}px;animation:hud-spin ${46 + i * 11}s linear infinite${i % 2 ? " reverse" : ""}"><g transform="rotate(${fx(acc + sw / 2)} ${cx} ${cy})"><circle cx="${cx}" cy="${cy - 127}" r="3.8" fill="${colors[i % colors.length]}" class="glow"/></g></g>`;
      }
      acc += sw;
    });
    let quota = "";
    for (let i = 0; i < 60; i++) { const on = i < Math.round(quotaShare * 60); quota += `<path d="${arc(cx, cy, 218, i * 6 + 0.8, i * 6 + 5.2)}" stroke="${on ? "#2ee6ff" : "#103e4e"}" stroke-width="11" fill="none" ${on ? 'class="glow"' : ""}/>`; }
    const lastEv = D.events[D.events.length - 1];
    const nodes = [{ n: "BRIEF", s: "ok" }, { n: "JEV", s: "ok" }, { n: "COTACAO", s: lastEv ? "ok" : "idle" }, { n: "EXECUTOR", s: lastEv ? "ok" : "idle" }, { n: "RECIBO", s: lastEv ? (lastEv.stage === "executada" ? "ok" : lastEv.stage === "incerta" ? "wait" : "erro") : "idle" }];
    let pipe = "";
    let labels = "";
    nodes.forEach((nd, i) => {
      // five stations, clockwise: the one that was between the Jev and the quote is gone, and its place at the top left is left free for the quota text
      const a = ([-150, -90, 30, 90, 150] as const)[i]!;
      const [x, y] = pt(cx, cy, 262, a);
      const col = nd.s === "ok" ? "#2ee6ff" : nd.s === "erro" ? "#ffb23e" : nd.s === "wait" ? "#7df3ff" : "#1b5266";
      const side = Math.abs(a) === 90;
      const [lx, ly] = side ? [x + (a < 0 ? 26 : -26), y] : pt(cx, cy, 236, a);
      const anchor = side ? (a < 0 ? "start" : "end") : "middle";
      const plateW = nd.n.length * 8.2 * boost + 18;
      const plateX = anchor === "start" ? lx - 9 : anchor === "end" ? lx - plateW + 9 : lx - plateW / 2;
      pipe += `<path d="${hex(x, y, 14)}" fill="#031820" stroke="${col}" stroke-width="2" ${nd.s === "idle" ? "" : 'class="glow"'}/><circle cx="${fx(x)}" cy="${fx(y)}" r="4.5" fill="${col}"/>`;
      labels += `<rect x="${fx(plateX)}" y="${fx(ly - 10 * boost)}" width="${fx(plateW)}" height="${fx(17 * boost)}" fill="#02101a" opacity=".92" stroke="#124c5f" stroke-width="1"/>${text(lx, ly + 4 * boost, nd.n, "t-sub", `fill:${col};font-size:${b(10.5)}px`, anchor)}`;
    });
    return `<circle cx="${cx}" cy="${cy}" r="350" fill="url(#coreHalo)"/>
      <g class="spin-f" style="transform-origin:${cx}px ${cy}px" fill="none" stroke="#17687f" stroke-width="1.2"><circle cx="${cx}" cy="${cy}" r="340" stroke-dasharray="2 9" opacity=".7"/>${ticks(cx, cy, 330, 340, 120, 'stroke="#1c8aa3"')}</g>
      <g class="spin-b" style="transform-origin:${cx}px ${cy}px" fill="none" stroke-linecap="round">
        <path d="${arc(cx, cy, 322, 10, 70)}" stroke="#2ee6ff" stroke-width="3" class="glow"/><path d="${arc(cx, cy, 322, 130, 150)}" stroke="#2ee6ff" stroke-width="3"/>
        <path d="${arc(cx, cy, 322, 200, 262)}" stroke="#17687f" stroke-width="3"/><path d="${arc(cx, cy, 322, 290, 330)}" stroke="#2ee6ff" stroke-width="3" class="glow"/></g>
      <circle cx="${cx}" cy="${cy}" r="262" fill="none" stroke="#124c5f" stroke-width="1.4"/>
      <circle cx="${cx}" cy="${cy}" r="262" fill="none" stroke="#2ee6ff" stroke-width="2" class="flow" opacity=".85"/>
      <g class="spin-c" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy - 262}" r="5" fill="#e9fbff" class="glow"/><circle cx="${cx}" cy="${cy + 262}" r="3.5" fill="#2ee6ff"/></g>
      ${quota}${pipe}
      ${text(cx, cy - 232, `COTA DO DIA ${D.budget.consults} DE ${D.budget.max}`, "t-sub", `font-size:${b(10)}px`, "middle")}
      <circle cx="${cx}" cy="${cy}" r="170" fill="none" stroke="#0e3948" stroke-width="11"/>
      <path class="countArc glow" d="${arc(cx, cy, 170, 0, 1)}" fill="none" stroke="#2ee6ff" stroke-width="11"/>
      <circle class="countHead" r="7" cx="${cx}" cy="${cy - 170}" fill="#e9fbff" style="filter:url(#glow)"/>
      <g class="spin-d" style="transform-origin:${cx}px ${cy}px" fill="none" stroke="#2ee6ff" stroke-width="1" opacity=".55"><circle cx="${cx}" cy="${cy}" r="148"/>${ticks(cx, cy, 141, 148, 96)}</g>
      <circle cx="${cx}" cy="${cy}" r="112" fill="none" stroke="#0b2c38" stroke-width="9"/>${donut}${sats}
      <g class="spin-e" style="transform-origin:${cx}px ${cy}px" fill="none" stroke="#7df3ff" stroke-width="1.4" opacity=".7"><path d="${arc(cx, cy, 99, 0, 80)}"/><path d="${arc(cx, cy, 99, 180, 260)}"/></g>
      <circle cx="${cx}" cy="${cy}" r="88" fill="url(#coreFill)" class="glow2"/>
      <circle cx="${cx}" cy="${cy}" r="88" fill="none" stroke="#bff6ff" stroke-width="1.5" opacity=".7"/>
      <g class="spin-d" style="transform-origin:${cx}px ${cy}px" opacity=".85"><path d="${hex(cx, cy, 80)}" fill="none" stroke="#02161d" stroke-width="1.4"/></g>
      ${text(cx, cy - 34, "INONU", "t-title", `fill:#02222c;font-weight:700;font-size:${b(13)}px`, "middle")}
      ${D.wallet.total === null ? text(cx, cy + 6, "SEM LEITURA", "t-big", "fill:#02222c;font-size:17px", "middle") : countText(cx, cy + 6, D.wallet.total, 2, "US$ ", "", "t-big", "fill:#02222c;font-size:23px", "middle")}
      ${text(cx, cy + 28, "CARTEIRA GERIDA", "t-sub", "fill:#03323f;font-size:10px", "middle")}
      ${text(cx, cy + 48, D.wallet.cash === null ? (D.wallet.lastReadMs === null ? "NUNCA LIDA" : "LIDA AS " + hhmm(D.wallet.lastReadMs)) : "CAIXA US$ " + fmt(D.wallet.cash), "t-sub", "fill:#03323f;font-size:10px", "middle")}
      ${text(cx, cy + 372, D.agent.cycling ? "AGUARDANDO O PROXIMO OLHAR" : STOPPED_STATE, "t-title coreState", `font-size:${b(15)}px`, "middle")}
      ${text(cx, cy + 404, D.agent.cycling ? "00:00" : STOPPED_COUNT, "t-num coreCount", `fill:#2ee6ff;font-size:${b(22)}px`, "middle")}
      ${labels}`;
  }

  return { results, positions, decision, health, healthH, placar, facets, feed, cycles: cyclesPanel, command, reading, readingH, counters, core };
}

export { at, clamp };
