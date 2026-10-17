/**
 * The Sistema tab: what the person owns of the machine. The connection of the wallet and what is missing of it, the orders the core sent and has no answer for (the one place the person's word is asked), the two things
 * the person can tell the agent to do (look now, stop), and the limits and rhythm in force. Every button is drawn here and carries a `data-action`; the page that owns the connection carries the action out.
 * Panels take their width: 880 on the wide stage, 480 in the narrow column. Text from outside the code is cleaned in model.ts or here, never put in as it came.
 */
import { WALLET_STEP, POLICY_URL } from "../../agent/view";
import type { HudModel, WalletStepId } from "../types";
import { STOPPED_TEXT } from "../insights";
import { capText, COL, fmt, fx, hex, hhmm, id, leverageText, plain, text, title, wrap } from "./h";

const pctText = (n: number): string => `${fmt(n, Number.isInteger(n) ? 0 : 1)}%`;
/** A share written as the words a person would say it in when it is a simple fraction, else as a percentage. */
const shareWords = (share: number): string => {
 const near = (x: number): boolean => Math.abs(share - x) < 0.005;
 return near(1 / 3) ? "UM TERCO" : near(0.5) ? "METADE" : near(0.25) ? "UM QUARTO" : near(0.2) ? "UM QUINTO" : near(2 / 3) ? "DOIS TERCOS" : near(0.75) ? "TRES QUARTOS" : pctText(share * 100);
};
const count = (n: number): string => fmt(n, 0);
/** How long ago a reading was taken, in the unit that reads best: minutes under an hour, hours under two days, days after. */
const ageWords = (ms: number): string => {
 const m = Math.round(ms / 60_000);
 if (m < 1) return "LIDO AGORA";
 if (m < 60) return `LIDO HA ${m} MIN`;
 const h = Math.round(m / 60);
 return h < 48 ? `LIDO HA ${h} H` : `LIDO HA ${Math.round(h / 24)} DIAS`;
};
const METER_WORDS: Readonly<Record<string, string>> = { corrupt: "LEITURA CORROMPIDA", unreadable: "LEITURA ILEGIVEL", month_mismatch: "LEITURA DE OUTRO MES", invalid: "LEITURA INVALIDA" };
const TIER_WORDS: Readonly<Record<string, string>> = { free: "FREE", basic: "BASIC", premium: "PREMIUM" };

const STEPS: readonly WalletStepId[] = ["instalar", "entrar", "depositar", "definir_politica"];
/** The room a second row of steps takes when the panel is narrow. */
const STEP_ROW = 34;
const STEP_LABEL: Readonly<Record<WalletStepId, string>> = { instalar: "PROGRAMA DA OKX", entrar: "ENTRAR NA CONTA", depositar: "SALDO NA CARTEIRA", definir_politica: "LIMITES NA OKX", operando: "OPERANDO" };

const up = (s: string): string => plain(s).toUpperCase();

/** A button: a cut-corner plate with a label and a small line under it, a faint light running along its edge that wakes up under the pointer, and a sheen that crosses it once when it is looked at. `off` greys it and drops the action. */
function button(x: number, y: number, w: number, h: number, label: string, sub: string, action: string, opts: { tone?: "cy" | "amber" | "green" | "red"; off?: boolean; data?: Record<string, string> } = {}): string {
 const col = opts.off === true ? "#2c5563" : { cy: COL.cy, amber: COL.amber, green: COL.green, red: COL.red }[opts.tone ?? "cy"];
 const data = Object.entries(opts.data ?? {}).map(([k, v]) => ` data-${k}="${v}"`).join("");
 const cut = Math.min(14, h / 3);
 const outline = `M${x + cut} ${y}H${x + w}V${y + h - cut}L${x + w - cut} ${y + h}H${x}V${y + cut}Z`;
 const attrs = opts.off === true ? ` aria-disabled="true"` : ` data-action="${action}"${data} role="button" tabindex="0"`;
 const clip = id("btnClip");
 const live = opts.off === true ? "" : `<path class="btn-flow" d="${outline}" pathLength="100" fill="none" stroke="${col}" stroke-width="2.4"/>
      <clipPath id="${clip}"><path d="${outline}"/></clipPath><rect class="btn-shine" x="${x - 60}" y="${y}" width="60" height="${h}" fill="url(#sweepGrad)" clip-path="url(#${clip})" style="--w:${w + 120}px"/>`;
 return `<g class="btn${opts.off === true ? " off" : ""}"${attrs} aria-label="${label}">
      <path class="plate" d="${outline}" fill="#041a23" stroke="${col}" stroke-width="1.6" ${opts.off === true ? "" : 'filter="url(#glow)"'}/>${live}
      ${text(x + w / 2, y + h / 2 + (sub === "" ? 5 : -2), label, "t-title", `fill:${opts.off === true ? "#5fa3b5" : col};font-size:${h >= 70 ? 16 : 12.5}px;letter-spacing:.2em`, "middle")}
      ${sub === "" ? "" : text(x + w / 2, y + h / 2 + 16, sub, "t-sub", "font-size:9px", "middle")}</g>`;
}

export function createSystem(D: HudModel) {
 const S = D.system;
 const W = S.wallet;
 const busy = D.ui.busy !== null;

 /** Where everything of the wallet panel goes, so its height is known to the scene before it is drawn. */
 function walletLayout(w: number): { wide: boolean; operating: boolean; body: string[]; buttonY: number; hasButton: boolean; addrY: number; h: number } {
  const wide = w > 640;
  const operating = W.next === "operando";
  const body = operating ? [] : wrap(up(WALLET_STEP[W.next].body), wide ? 118 : 56).slice(0, wide ? 3 : 5);
  const hasButton = !operating && (W.next === "instalar" || (W.next === "entrar" && (W.loginUrl !== null || W.cli === "instalado")) || W.next === "definir_politica");
  const base = 214 + (wide ? 0 : STEP_ROW);
  const buttonY = base + body.length * 14 + 10;
  const afterStep = operating ? base : hasButton ? buttonY + 40 + 22 : buttonY;
  const addrY = afterStep + 14;
  const addresses = (W.solana !== null ? 1 : 0) + (W.evm !== null ? 1 : 0);
  return { wide, operating, body, buttonY, hasButton, addrY, h: addrY + addresses * 40 + 8 };
 }

 /** The wallet of the agent: where it stands in the four steps, what is missing, and the addresses to fund. */
 function wallet(w: number): string {
  const L = walletLayout(w);
  const { wide, operating } = L;
  const at = STEPS.indexOf(W.next as WalletStepId);
  let s = title(w, "CARTEIRA DO AGENTE", operating ? "PRONTA: O AGENTE EXECUTA SOZINHO" : "O QUE FALTA PARA ELE EXECUTAR SOZINHO");
  // four steps in a row when there is room for the words, two by two when there is not
  const per = wide ? STEPS.length : 2;
  const sw = w / per;
  const dy = wide ? 0 : STEP_ROW;
  STEPS.forEach((id, i) => {
   const done = operating || (at >= 0 && i < at), now_ = !operating && i === at;
   const col = done ? COL.green : now_ ? COL.amber : COL.mute;
   const x = (i % per) * sw, y = 94 + Math.floor(i / per) * STEP_ROW;
   s += `<path d="${hex(x + 16, y, 10)}" fill="${done ? col : "#031820"}" stroke="${col}" stroke-width="1.6"/>`;
   s += text(x + 34, y - 4, STEP_LABEL[id], "t-sub", `font-size:${wide ? 10.5 : 10}px;fill:${col}`);
   s += text(x + 34, y + 10, done ? "FEITO" : now_ ? "AGORA" : "DEPOIS", "t-sub", `font-size:9px;fill:${col}`);
   if (wide && i < STEPS.length - 1) s += `<line x1="${fx(x + sw - 22)}" x2="${fx(x + sw - 6)}" y1="94" y2="94" stroke="#17687f" stroke-dasharray="3 4"/>`;
  });
  const rows: [string, string, string][] = [
   ["ENTRADA NA CONTA OKX", W.login === "logado" ? "LOGADA" + (W.sessionDays === null ? "" : `, A SESSAO DURA MAIS ${Math.max(0, Math.round(W.sessionDays))} DIAS`) : up(W.login).replace(/_/g, " "), W.login === "logado" && (W.sessionDays === null || W.sessionDays > 3) ? COL.green : COL.amber],
   ["PROGRAMA OFICIAL DA OKX", W.cli === "instalado" ? "INSTALADO E CONFERIDO" : "AINDA NAO INSTALADO", W.cli === "instalado" ? COL.green : COL.amber],
   ["LIMITES DA CARTEIRA NA OKX", W.policy === "ok" ? "LIGADOS (TRAVA DA PROPRIA OKX)" : up(W.policy), W.policy === "ok" ? COL.green : COL.amber],
  ];
  rows.forEach(([a, b, col], i) => { s += text(0, 144 + dy + i * 24, a, "t-sub", "font-size:10px") + text(w, 144 + dy + i * 24, b, "t-mono", `font-size:${wide ? 12 : 10.5}px;fill:${col}`, "end"); });
  // the step that needs the person, as one button
  const step = WALLET_STEP[W.next];
  L.body.forEach((l, i) => { s += text(0, 214 + dy + i * 14, l, "t-sub", "font-size:9.5px;fill:#7df3ff"); });
  const by = L.buttonY, bw = wide ? 360 : w;
  if (L.hasButton) {
   if (W.next === "instalar") s += button(0, by, bw, 40, up(step.action ?? "INSTALAR"), "", "wallet", { data: { step: "install" }, off: busy });
   else if (W.next === "entrar" && W.loginUrl !== null) s += button(0, by, bw, 40, up(step.action ?? "ENTRAR"), "A PAGINA E DA PROPRIA OKX", "open", { data: { url: encodeURIComponent(W.loginUrl) }, tone: "green" });
   else if (W.next === "entrar") s += button(0, by, bw, 40, "PREPARAR A ENTRADA", "", "wallet", { data: { step: "login" }, off: busy });
   else if (W.next === "definir_politica") s += button(0, by, bw, 40, up(step.action ?? "ABRIR LIMITES"), "A PAGINA E DA PROPRIA OKX", "open", { data: { url: encodeURIComponent(POLICY_URL) }, tone: "amber" });
  }
  let y = L.addrY;
  if (W.solana !== null) { s += text(0, y, "ENDERECO NA SOLANA (SOL, USDC E OS OUTROS ATIVOS DA SOLANA)", "t-sub", "font-size:9px") + text(0, y + 16, W.solana, "t-mono", `font-size:${wide ? 12 : 10}px`); y += 40; }
  if (W.evm !== null) s += text(0, y, "ENDERECO NAS REDES EVM (ETHEREUM, BASE, BNB CHAIN E OUTRAS)", "t-sub", "font-size:9px") + text(0, y + 16, W.evm, "t-mono", `font-size:${wide ? 12 : 10}px`);
  return s;
 }

 /** The line at the top of the tab when the core runs no cycles: this tab is about what the person owns of the machine, and the first thing to know is that nothing decides now. */
 function stopped(w: number, slim = false): string {
  const wide = w > 640;
  const lines = wide ? [STOPPED_TEXT] : wrap(STOPPED_TEXT, 40);
  const h = stoppedH(w, slim);
  const cut = slim ? 9 : 12;
  const outline = `M${cut} 0H${w}V${h - cut}L${w - cut} ${h}H0V${cut}Z`;
  let s = `<path d="${outline}" fill="#1a1204" stroke="${COL.amber}" stroke-width="1.6"/><path d="${hex(24, h / 2, slim ? 7 : 9)}" fill="${COL.amber}"/>`;
  lines.forEach((l, i) => { s += text(46, h / 2 + 4 + (i - (lines.length - 1) / 2) * 17, l, "t-mono", `font-size:${slim ? 13 : wide ? 14 : 12.5}px;fill:${COL.amber}`); });
  return s;
 }
 /** The height of the line: a slim one fits in the gap between the top bar and the panels of the stage, so nothing under it has to move. */
 const stoppedH = (w: number, slim = false): number => (slim ? 28 : w > 640 ? 44 : wrap(STOPPED_TEXT, 40).length * 17 + 24);
 const walletH = (w: number): number => walletLayout(w).h;
 const inflightH = (w: number): number => {
  const wide = w > 640;
  const shown = Math.min(S.inFlight.length, wide ? 3 : 2);
  return S.inFlight.length === 0 ? (wide ? 190 : 218) : 84 + shown * (wide ? 112 : 128) + (S.inFlight.length > shown ? 24 : 0) + 8;
 };

 /** Orders sent with no answer. Only an order that never showed a transaction asks for the person's word; the others the core confirms by itself. */
 function inflight(w: number): string {
  const wide = w > 640;
  let s = title(w, "ORDENS SEM RECIBO", "O AGENTE ENVIOU E AINDA NAO SABE SE SAIU");
  if (S.inFlight.length === 0) {
   s += `<path d="${hex(18, 104, 12)}" fill="${COL.green}"/>` + text(40, 109, "NENHUMA ORDEM AGUARDANDO RECIBO", "t-mono", `font-size:13px;fill:${COL.green}`);
   const note = wrap("QUANDO UMA ORDEM SAIR SEM RESPOSTA, ELA APARECE AQUI. AS QUE FORAM A REDE O AGENTE CONFIRMA SOZINHO PELO RECIBO DA OKX; SO PEDE A SUA PALAVRA QUANDO A TRANSACAO NUNCA FOI VISTA.", wide ? 104 : 56);
   return note.reduce((acc, l, i) => acc + text(0, 150 + i * 16, l, "t-sub", "font-size:9.5px"), s);
  }
  S.inFlight.slice(0, wide ? 3 : 2).forEach((o, i) => {
   const y = 84 + i * (wide ? 112 : 128);
   const col = o.side === "buy" ? COL.green : COL.soft;
   s += `<rect x="0" y="${y}" width="${w}" height="${wide ? 100 : 116}" fill="#031820" stroke="#124c5f"/>`;
   s += text(14, y + 26, `${o.side === "buy" ? "COMPRA" : "VENDA"} ${o.symbol} US$ ${fmt(o.usd, 0)}`, "t-num", `font-size:${wide ? 18 : 15}px;fill:${col}`);
   // the age of the order is written beside the order's name when there is room, and on the line under it when there is not
   s += text(w - 14, y + (wide ? 26 : 46), `${o.stage === "enviando" ? "ENVIADA, SEM RESPOSTA" : "SEM CONFIRMACAO"}, HA ${o.ageMin} MIN`, "t-sub", "font-size:9.5px", "end");
   s += text(14, y + 46, o.source === "protecao" ? "ORDEM DO PLANO DA POSICAO" : "ESCOLHA DO MODELO", "t-sub", "font-size:9.5px");
   if (o.said !== null) s += text(14, y + 62, "A OKX DISSE: " + up(o.said).slice(0, wide ? 100 : 48), "t-sub", "font-size:9px;fill:#7df3ff");
   if (o.needsWord) {
    const bw = wide ? 250 : (w - 38) / 2;
    s += button(14, y + (wide ? 70 : 76), bw, 34, "CONFERI: SAIU", "", "resolve", { data: { key: o.key, outcome: "executada" }, tone: "green", off: busy });
    s += button(24 + bw, y + (wide ? 70 : 76), bw, 34, "CONFERI: NAO SAIU", "", "resolve", { data: { key: o.key, outcome: "falhou" }, tone: "amber", off: busy });
   } else s += text(14, y + (wide ? 90 : 96), "A TRANSACAO FOI A REDE: O AGENTE CONFIRMA SOZINHO, SEM CLIQUE", "t-sub", `font-size:9.5px;fill:${COL.green}`);
  });
  if (S.inFlight.length > (wide ? 3 : 2)) s += text(0, 84 + (wide ? 3 : 2) * (wide ? 112 : 128) + 14, `+ ${S.inFlight.length - (wide ? 3 : 2)} ORDEM(NS) NA FILA`, "t-sub", "font-size:10px");
  return s;
 }

 /** Where the parts of the actions panel go. On the stage they have fixed places; in a narrow panel each one follows the one above it, so nothing leaves a hole when there is no notice to show. */
 function actionsLayout(w: number): { ny: number; sy: number; noteY: number; h: number } {
  if (w > 640) return { ny: 196, sy: 236, noteY: 304, h: 320 };
  const bottom = D.ui.confirmStop ? 204 : 158;
  const said = D.ui.busy !== null ? 1 : D.ui.notice === null ? 0 : wrap(up(D.ui.notice.text), 56).slice(0, 4).length;
  const sy = bottom + 18 + (said > 0 ? said * 16 + 8 : 0);
  return { ny: bottom + 22, sy, noteY: sy + 44 + 22, h: sy + 44 + 22 + 2 * 14 + 8 };
 }
 const actionsH = (w: number): number => actionsLayout(w).h;

 /** What the person can tell the agent: look now, stop. The stop asks twice. */
 function actions(w: number): string {
  const wide = w > 640;
  const L = actionsLayout(w);
  let s = title(w, "ACOES", "O QUE VOCE PODE PEDIR AO AGENTE");
  const bw = wide ? 420 : w;
  // the agent decides when to look: there is no button that forces a cycle, and the screen says so
  if (!D.ui.confirmStop) s += button(0, 80, bw, 78, "PARAR O AGENTE", "DESCONECTA A CARTEIRA. O AGENTE PARA NA HORA", "stop", { tone: "red", off: busy });
  else {
   s += button(0, 80, bw, 78, "CONFIRMAR: PARAR", "AS POSICOES ABERTAS CONTINUAM NA CARTEIRA", "stop-confirm", { tone: "red", off: busy });
   s += button(wide ? 440 : 0, wide ? 80 : 170, wide ? 200 : bw, 34, "CANCELAR", "", "stop-cancel", { tone: "cy" });
  }
  const ny = L.ny;
  if (D.ui.busy !== null) s += text(0, ny, { stop: "PARANDO O AGENTE", resolve: "ANOTANDO A SUA PALAVRA", wallet: "FAZENDO O PASSO DA CARTEIRA" }[D.ui.busy], "t-mono", `font-size:12px;fill:${COL.soft}`);
  else if (D.ui.notice !== null) {
   const col = D.ui.notice.tone === "ok" ? COL.green : COL.amber;
   wrap(up(D.ui.notice.text), wide ? 110 : 56).slice(0, 4).forEach((l, i) => { s += text(0, ny + i * 16, l, "t-mono", `font-size:12px;fill:${col}`); });
  }
  s += button(0, L.sy, wide ? 420 : w, 44, "CHAVES E CONFIGURACOES", "ONDE FICAM AS CHAVES DA OKX E DO MODELO", "settings", { tone: "cy" });
  // the note is wrapped to the room it has: on the stage the limits are next to it
  wrap("O INONU DECIDE SOZINHO QUANDO OLHAR O MERCADO: NAO HA BOTAO PARA FORCAR UM CICLO", wide ? 200 : 56).forEach((l, i) => { s += text(0, L.noteY + i * 14, l, "t-sub", "font-size:9px;fill:#7df3ff"); });
  return s;
 }

 /** The limits and the rhythm in force, read from the core: what stops the agent and what does not. */
 function limits(w: number): string {
  const wide = w > 640;
  const cap = D.agent.caps ?? { maxBuyUsd: undefined, maxDailyBuyUsd: undefined, maxDailySellUsd: undefined };
  const usd = (n: number): string => "US$ " + fmt(n, 0);
  const spent = D.analysisOk ? D.a.orders.spentToday : null;
  const rows: [string, string, string][] = [
   ["AUTORIDADE E MODO", `${up(S.authority)}, ${up(S.mode)}`, COL.white],
   ["PERFIL DO DONO", up(S.profile), COL.white],
   ["RITMO DOS OLHARES", D.agent.cycling ? `A CADA ${D.rhythm.intervalMin} MIN, E ANTES SE O MERCADO MUDAR` : "PARADO", D.agent.cycling ? COL.white : COL.amber],
   ["COMPRAS DO DIA", `${spent === null ? "SEM DADO DO NUCLEO" : `${usd(spent.buy)} GASTOS`}, LIMITE ${capText(cap.maxDailyBuyUsd)}`, COL.cy],
   ["VENDAS DO DIA", `${spent === null ? "SEM DADO DO NUCLEO" : `${usd(spent.sell)} FEITAS`}, LIMITE ${capText(cap.maxDailySellUsd)}`, COL.cy],
   ["TETO DE UMA COMPRA", capText(cap.maxBuyUsd), COL.cy],
   ["ALAVANCAGEM", leverageText(D.agent.leverage, w < 560), D.agent.leverage !== null && D.agent.leverage.granted ? COL.soft : COL.mute],
  ];
  let s = title(w, "LIMITES E RITMO EM VIGOR", "O QUE O CODIGO AINDA DEFENDE E O QUE O JEV DECIDE");
  const L = limitsLayout(w, rows.length);
  rows.forEach(([a, b, col], i) => { const y = 88 + i * L.pitch; s += text(0, y, a, "t-sub", "font-size:10px") + text(w, y, b, "t-mono", `font-size:${wide ? 12 : 10}px;fill:${col}`, "end"); });
  s = L.note.reduce((acc, l, i) => acc + text(0, L.noteY + i * 14, l, "t-sub", "font-size:9.5px;fill:#7df3ff"), s);
  return s + guardsBlock(w, L.guardsY);
 }

 /** Where the parts of the limits panel go: the rows, the footnote of the owner's lock, and the choices of the code under them. */
 function limitsLayout(w: number, rows = 8): { pitch: number; note: string[]; noteY: number; guardsY: number; h: number } {
  const wide = w > 640;
  const pitch = wide ? 28 : 32;
  const note = wrap("A TRAVA DA CARTEIRA NA OKX E DELA: O APLICATIVO NAO CONSEGUE DESFAZER", wide ? 90 : Math.floor(w / 8.2));
  const noteY = 88 + rows * pitch + 10;
  const guardsY = noteY + note.length * 14 + 24;
  return { pitch, note, noteY, guardsY, h: guardsY + guardsH(w) };
 }
 const limitsH = (w: number): number => limitsLayout(w, 8).h;

 /** The numbers of the code's own checks after the quote of an order, all from the core: a heading that says they are the code's choice and under review, and one row for each. Without them the core's word is missing, not zero. */
 function guardsRows(): { label: string; value: string; note: string | null }[] {
  const G = D.guards;
  if (G === null) return [];
  const trio = (t: { buy: number; sell: number; protecao: number }): string => `COMPRA ${pctText(t.buy)}, VENDA ${pctText(t.sell)}, PROTECAO ${pctText(t.protecao)}`;
  const reserve = G.nativeReserve;
  const fixed = reserve.kind === "fixa";
  return [
   { label: "VETO DE IMPACTO NA COTACAO", value: trio(G.impactPct), note: `A COMPRA ACEITA NO MAXIMO ${shareWords(G.buyCostShareOfStop)} DO STOP DO PERFIL` },
   { label: "VETO DE IMPOSTO DO TOKEN", value: pctText(G.taxPct), note: null },
   { label: "DERRAPAGEM ACEITA", value: trio(G.slippagePct), note: null },
   { label: "RESERVA DE TAXA EM MOEDA NATIVA", value: fixed ? (reserve.usd === null ? "FIXA, VALOR NAO LIDO" : `US$ ${fmt(reserve.usd, Number.isInteger(reserve.usd) ? 0 : 2)} FIXO`) : "TAXA MEDIDA POR REDE", note: fixed ? null : reserve.usd === null ? "SEM TAXA MEDIDA AINDA" : `ULTIMA TAXA MEDIDA: US$ ${fmt(reserve.usd, 2)}` },
  ];
 }
 const guardsH = (w: number): number => 36 + (D.guards === null ? 24 : guardsRows().reduce((a, r) => a + 28 + (r.note === null ? 0 : 14), 0));
 function guardsBlock(w: number, y0: number): string {
  let s = text(0, y0, "ESCOLHAS DO CODIGO, EM REVISAO", "t-title", `font-size:11.5px;fill:${COL.soft}`) + `<line x1="0" x2="${w}" y1="${y0 + 8}" y2="${y0 + 8}" stroke="#124c5f"/>`;
  if (D.guards === null) return s + text(0, y0 + 28, "SEM DADO DO NUCLEO", "t-mono", `font-size:11px;fill:${COL.mute}`);
  let y = y0 + 30;
  for (const r of guardsRows()) {
   s += text(0, y, r.label, "t-sub", "font-size:10px") + text(w, y, r.value, "t-mono", `font-size:11px;fill:${COL.white}`, "end");
   if (r.note !== null) { s += text(0, y + 14, r.note, "t-sub", `font-size:9.5px;fill:${COL.soft}`); y += 14; }
   y += 28;
  }
  return s;
 }

 /** Where each part of the resources panel goes, so its height is known to the scene before it is drawn. */
 function resourcesLayout(w: number): { legendY: number; tierY: number; tierPitch: number; notesY: number; notes: string[]; modelY: number; h: number } {
  const R = D.resources;
  const per = Math.floor(w / 7.6);
  const notes: string[] = [];
  if (R !== null) {
   const evidence = new Set<string>();
   for (const id of ["free", "basic", "premium"] as const) for (const m of [R.tiers[id].local, R.tiers[id].account]) if (m.status === "valid") evidence.add(m.capEvidence);
   if (evidence.has("local_configuration")) notes.push(...wrap("TETO CONFIGURADO LOCALMENTE", per));
   if (evidence.has("provider_reported")) notes.push(...wrap("TETO INFORMADO PELO PROVEDOR", per));
   if (R.rate.requestsPerSecond !== null || R.rate.tokensPerSecond !== null) notes.push(...wrap(`LIMITES DA CONTA: ${R.rate.requestsPerSecond === null ? "-" : count(R.rate.requestsPerSecond)} PEDIDOS POR SEGUNDO, ${R.rate.tokensPerSecond === null ? "-" : count(R.rate.tokensPerSecond)} TOKENS POR SEGUNDO`, per));
   notes.push(...wrap("A IDADE DE CADA LEITURA SOBE COM O RELOGIO DESTA TELA, SEM NOVA LEITURA", per));
  }
  const legendY = 86;
  const tierY = R === null ? legendY + 8 : 126;
  const tierPitch = 64;
  const notesY = R === null ? tierY + 30 : tierY + 3 * tierPitch + 4;
  const modelY = notesY + notes.length * 14 + 24;
  return { legendY, tierY, tierPitch, notesY, notes, modelY, h: modelY + 70 + 28 };
 }
 const resourcesH = (w: number): number => resourcesLayout(w).h;

 /** The quota of the data provider by tier, what this machine sent against what the account says, and the model side from the budget the screen already has. Unknown is a dash, never a zero. */
 function resources(w: number): string {
  const R = D.resources;
  const L = resourcesLayout(w);
  let s = title(w, "RECURSOS E CONSUMO", R === null ? "O QUE O AGENTE CONSOME DOS DADOS E DO MODELO" : `COTA MENSAL DO PROVEDOR DE DADOS, MES ${R.monthKey} (${R.days} DIAS)`);
  if (R === null) s += text(0, L.tierY + 14, "NUCLEO NAO ENVIA OS RECURSOS", "t-mono", `font-size:12px;fill:${COL.amber}`);
  else {
   s += text(0, L.legendY, "LOCAL = CONTADOR LOCAL: O QUE ESTA MAQUINA ENVIOU", "t-sub", "font-size:9.5px;fill:#7df3ff");
   s += text(0, L.legendY + 14, "CONTA = O QUE A CONTA DO PROVEDOR INFORMA", "t-sub", "font-size:9.5px;fill:#7df3ff");
   (["free", "basic", "premium"] as const).forEach((id, i) => {
    const y = L.tierY + i * L.tierPitch;
    s += text(0, y, TIER_WORDS[id]!, "t-title", `font-size:11.5px;fill:${COL.soft}`) + `<line x1="62" x2="${w}" y1="${y - 4}" y2="${y - 4}" stroke="#124c5f"/>`;
    (["local", "account"] as const).forEach((scope, k) => {
     const m = R.tiers[id][scope];
     const ry = y + 20 + k * 20;
     const valid = m.status === "valid";
     const used = valid ? `${count(m.used ?? 0)} DE ${m.monthlyCap === null ? (scope === "local" ? "SEM TETO LOCAL" : "SEM TETO") : count(m.monthlyCap)}` : m.status === "unreported" ? (scope === "account" ? "CONTA NAO LIDA" : "CONTADOR LOCAL NAO LIDO") : (METER_WORDS[m.status] ?? "LEITURA INVALIDA");
     const remain = valid && m.remaining !== null ? `RESTAM ${count(m.remaining)}` : "RESTAM -";
     const age = valid && m.ageMs !== null ? ageWords(m.ageMs) : "-";
     s += text(0, ry, scope === "local" ? "LOCAL" : "CONTA", "t-sub", "font-size:9.5px") + text(52, ry, valid && m.used === null ? "-" : used, "t-mono", `font-size:11px;fill:${valid ? COL.white : COL.amber}`);
     s += text(w - 232, ry, remain, "t-mono", `font-size:11px;fill:${valid && m.remaining !== null ? COL.cy : COL.mute}`) + text(w, ry, age, "t-mono", `font-size:11px;fill:${COL.mute}`, "end");
    });
   });
   s = L.notes.reduce((acc, l, i) => acc + text(0, L.notesY + i * 14, l, "t-sub", "font-size:9.5px;fill:#7df3ff"), s);
  }
  // the model side, from the budget the screen already has: the tokens and the cost of each attempt are not measured apart yet, and the screen says so
  s += text(0, L.modelY, "MODELO", "t-title", `font-size:11.5px;fill:${COL.soft}`) + `<line x1="62" x2="${w}" y1="${L.modelY - 4}" y2="${L.modelY - 4}" stroke="#124c5f"/>`;
  s += text(0, L.modelY + 20, "CONSULTAS DO DIA", "t-sub", "font-size:10px") + text(w, L.modelY + 20, `${D.budget.consults} DE ${D.budget.max}`, "t-mono", `font-size:11px;fill:${COL.white}`, "end");
  s += text(0, L.modelY + 40, "TOKENS DO DIA", "t-sub", "font-size:10px") + text(w, L.modelY + 40, D.budget.tokens === null ? "SEM MEDIDA" : `${fmt(D.budget.tokens / 1e6, 2)}M`, "t-mono", `font-size:11px;fill:${D.budget.tokens === null ? COL.mute : COL.white}`, "end");
  return wrap("TOKENS E CUSTO POR TENTATIVA AINDA NAO SAO MEDIDOS SEPARADAMENTE", Math.floor(w / 7.6)).reduce((acc, l, i) => acc + text(0, L.modelY + 60 + i * 14, l, "t-sub", `font-size:9.5px;fill:${COL.mute}`), s);
 }

 /** What the agent did, newest first: cycles, orders at their last stage, the person's own connect and disconnect. */
 function log(w: number): string {
  const wide = w > 1000;
  let s = title(w, "REGISTRO DO AGENTE", "GRAVADO ANTES DE CADA ACAO, DO MAIS NOVO AO MAIS ANTIGO");
  if (S.log.length === 0) return s + text(0, 100, "NADA REGISTRADO AINDA", "t-sub", "font-size:10px");
  const per = wide ? 4 : 8;
  // a narrow panel wraps a long line of the log under its own time, so the text never runs out of the panel; each line keeps the room it needs
  let yNarrow = 92;
  S.log.slice(0, 8).forEach((l, i) => {
   const col = wide ? Math.floor(i / per) : 0, row = wide ? i % per : i;
   const parts = wide ? [l.text] : wrap(l.text, LOG_NARROW);
   const x = col * (w / 2 + 10), y = wide ? 92 + row * 24 : yNarrow;
   const c = l.tone === "ok" ? COL.green : l.tone === "warn" ? COL.amber : COL.soft;
   s += `<circle cx="${x + 5}" cy="${y - 4}" r="4" fill="${c}"/>` + text(x + 18, y, hhmm(l.t), "t-mono", "font-size:11.5px;fill:#5fa3b5");
   parts.forEach((part, k) => { s += text(x + 74, y + k * 14, part, "t-mono", `font-size:${wide ? 12 : 10.5}px;fill:${c}`); });
   yNarrow += parts.length * 14 + 10;
  });
  return s;
 }
 /** The height of the log in a narrow panel: its lines, the longer ones wrapped. */
 const logH = (w: number): number => (w > 1000 ? SYSTEM_WIDE.log : S.log.length === 0 ? 130 : 92 + S.log.slice(0, 8).reduce((a, l) => a + wrap(l.text, LOG_NARROW).length * 14 + 10, 0));

 return { wallet, walletH, inflight, inflightH, actions, actionsH, limits, limitsH, resources, resourcesH, log, logH, stopped, stoppedH };
}

/** The natural heights of the panels in the narrow column (width 480). */
export const SYSTEM_H = { wallet: 470, inflight: 330, actions: 450, limits: 420, log: 290 } as const;
/** How many characters of a line of the log fit beside its time in a panel that is 480 wide. */
const LOG_NARROW = 56;
/** The heights of the wide panels that do not change with the data, and the room the stage has. */
export const SYSTEM_WIDE = { actions: 320, limits: 330, log: 190, bottom: 1040 } as const;
