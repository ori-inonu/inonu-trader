// Temporary layout probe: mounts the three dock cards and the disclosure against the real
// CSS modules at every required breakpoint and reports overflow plus header geometry.
// Temporary layout probe: mounts the three dock cards and the disclosure against the real
// CSS modules at every required breakpoint and reports overflow plus header geometry.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const widths = [380, 480, 768, 900, 1024, 1280, 1440, 1920];
const dir = "C:/Users/gabri/jev-trader/web/src/components";

function hashOf(css) {
  // postcss modules hash: any stable transform is fine, only uniqueness per file matters
  let h = 0;
  for (let i = 0; i < css.length; i++) h = (h * 31 + css.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function scope(css, name) {
  const map = new Map();
  const re = /\.([A-Za-z_][\w-]*)/g;
  let m;
  while ((m = re.exec(css))) {
    if (map.has(m[1])) continue;
    map.set(m[1], `_${name}_${hashOf(m[1] + name)}`);
  }
  let out = css;
  for (const [cls, hashed] of map) {
    out = out.replace(new RegExp(`\\.${cls}\\b`, "g"), `.${hashed}`);
  }
  return { css: out, map };
}

function buildModule(file, name) {
  const raw = readFileSync(`${dir}/${file}/${file}.module.css`, "utf8")
    .replace(/@container\s+(\w+)/g, "@container")
    .replace(/container-name:\s*\w+;/g, "");
  const { css, map } = scope(raw, name);
  return { css, map: (cls) => map.get(cls) };
}

const mods = {
  decision: buildModule("DecisionCenter", "dc"),
  wallet: buildModule("WalletPanel", "wp"),
  multi: buildModule("MultichainPanel", "mc"),
  dex: buildModule("DexReportPanel", "dr"),
  disclosure: buildModule("Disclosure", "ds"),
};

const globals = readFileSync("C:/Users/gabri/jev-trader/web/src/app/globals.css", "utf8");

const decision = (m) => `
<section class="${m("center")}">
  <header class="${m("header")}">
    <div class="${m("headingGroup")}">
      <p class="${m("eyebrow")}">CENTRAL DE DECISÕES</p>
      <h2 class="${m("title")}">Operador Jev sobre a carteira OKX</h2>
      <p class="${m("description")}">Inventário em todas as redes, candidatos com risco e retorno, escolha do Jev e execução com gates. Atualiza sozinho a cada 5 segundos.</p>
    </div>
    <div class="${m("status")}"><span class="${m("statusDot")} ${m("statusLive")}"></span><span>ciclo a3f21b9c há 12 s</span></div>
  </header>
  <div class="${m("body")}">
    <p class="${m("warn")}">Última atualização falhou (http 500). O painel mantém o último ciclo conhecido, sem recalcular nada.</p>
    <div class="${m("kpis")}">
      ${["Patrimônio conhecido|155.00 USD|cobertura completa","Candidatos|3 / 5|elegíveis / avaliados","Decisão do Jev|Ida e volta DEX|mock, 3 ms, peso 70%","Resultado realizado hoje|-12.3456 USD|só planos concluídos e reconciliados","Execução|enviada, aguardando reconciliação|gates: dry_run_default","Fonte|sintética|dados sintéticos de demonstração"]
        .map((r) => { const [a,b,c] = r.split("|"); return `<div class="${m("kpi")}"><span class="${m("kpiLabel")}">${a}</span><span class="${a.startsWith("Decis")||a==="Execução"?m("kpiValueText"):m("kpiValue")}">${b}</span><span class="${m("kpiMeta")}">${c}</span></div>`; }).join("")}
    </div>
    <div class="${m("columns")}">
      <div class="${m("block")}">
        <h3 class="${m("subtitle")}">Pesos da decisão</h3>
        <div class="${m("rows")}">
          ${["Ida e volta DEX USDT para OKB|70%|","Rebalance cross chain MON para USDC|15%","Spot maker Kuru|15%"].map((r)=>{const [l,v]=r.split("|");return `<div class="${m("row")}"><span class="${m("rowLabel")}">${l}</span><div class="${m("track")}"><span class="${m("fill")} ${m("fillChosen")}" style="transform:scaleX(0.7)"></span></div><span class="${m("mono")} ${m("num")}">${v}</span></div>`}).join("")}
        </div>
      </div>
      <div class="${m("block")}">
        <h3 class="${m("subtitle")}">Limites do dia</h3>
        <div class="${m("gauge")}"><div class="${m("gaugeHead")}"><span>Capital comprometido</span><span class="${m("mono")} ${m("num")}">1042.55 USD</span></div><div class="${m("track")}"><span class="${m("fill")}" style="transform:scaleX(0.6)"></span></div></div>
      </div>
    </div>
    <h3 class="${m("subtitle")} ${m("subtitleDivided")}">Candidatos avaliados neste ciclo</h3>
    <div class="${m("tableWrap")}" tabindex="0" role="region"><table class="${m("table")}">
      <thead><tr><th>Oportunidade</th><th>Rede</th><th class="${m("num")}">Tamanho</th><th class="${m("num")}">Líquido</th><th class="${m("num")}">Retorno</th><th class="${m("num")}">Impacto</th><th class="${m("num")}">Cotação</th><th>Risco</th><th class="${m("num")}">Peso Jev</th><th>Gate</th></tr></thead>
      <tbody>
        ${["Ida e volta DEX|USDT para OKB|196|40.00 USD|1.3000 USD|130.0 bps|-0.05%|0.8 s|baixo|70%|elegível"]
        .map((r)=>{const c=r.split("|");return `<tr class="${m("rowEligible")}"><td><span class="${m("cellTitle")}">${c[0]}</span><span class="${m("cellMeta")}">${c[1]}</span></td><td class="${m("mono")}">${c[2]}</td><td class="${m("mono")} ${m("num")}">${c[3]}</td><td class="${m("mono")} ${m("num")} ${m("pos")}">${c[4]}</td><td class="${m("mono")} ${m("num")}">${c[5]}</td><td class="${m("mono")} ${m("num")}">${c[6]}</td><td class="${m("mono")} ${m("num")}">${c[7]}</td><td><span class="${m("risk")} ${m("risk_baixo")}">${c[8]}</span></td><td class="${m("mono")} ${m("num")}">${c[9]}</td><td class="${m("cellMeta")}">${c[10]}</td></tr>`}).join("")}
        ${["Rebalance cross chain|MON para USDC nativo nativo nativo|143 para 1|120.00 USD|-4.0000 USD|-333.3 bps|-0.30%|20.0 s|alto|15%|net_below_minimum, quote_stale, price_impact_above_ceiling"].map((r)=>{const c=r.split("|");return `<tr class="${m("rowRejected")}"><td><span class="${m("cellTitle")}">${c[0]}</span><span class="${m("cellMeta")}">${c[1]}</span></td><td class="${m("mono")}">${c[2]}</td><td class="${m("mono")} ${m("num")}">${c[3]}</td><td class="${m("mono")} ${m("num")} ${m("neg")}">${c[4]}</td><td class="${m("mono")} ${m("num")}">${c[5]}</td><td class="${m("mono")} ${m("num")}">${c[6]}</td><td class="${m("mono")} ${m("num")}">${c[7]}</td><td><span class="${m("risk")} ${m("risk_alto")}">${c[8]}</span></td><td class="${m("mono")} ${m("num")}">${c[9]}</td><td class="${m("cellMeta")}">${c[10]}</td></tr>`}).join("")}
      </tbody>
    </table></div>
    <div class="${m("columns")}">
      <div class="${m("block")}">
        <h3 class="${m("subtitle")}">Patrimônio por rede</h3>
        <ul class="${m("chains")}"><li class="${m("chain")}"><div class="${m("chainHead")}"><span class="${m("cellTitle")}">Arbitrum One arbitrarily long chain name</span><span class="${m("mono")} ${m("num")}">85.00 USD parcial</span></div><div class="${m("assets")}"><span class="${m("asset")}"><span class="${m("cellMeta")}">USDC_Bridged</span><span class="${m("mono")}">250.000000000000000000</span></span></div></li></ul>
      </div>
      <div class="${m("block")}">
        <h3 class="${m("subtitle")}">Ciclos recentes</h3>
        <ul class="${m("timeline")}">${["10:12:03|manter|concluída e reconciliada|155.00 USD","10:12:08|Ida e volta DEX|enviada, aguardando reconciliação|155.25 USD"].map((r)=>{const c=r.split("|");return `<li class="${m("timelineRow")}"><span class="${m("mono")}">${c[0]}</span><span>${c[1]}</span><span class="${m("cellMeta")}">${c[2]}</span><span class="${m("mono")} ${m("num")}">${c[3]}</span></li>`}).join("")}</ul>
      </div>
    </div>
    <p class="${m("footer")}">Probabilidades são pesos de decisão, não taxas de acerto.</p>
  </div>
</section>`;

const wallet = (m) => `
<section class="${m("panel")}">
  <header class="${m("header")}">
    <div class="${m("headingGroup")}"><p class="${m("eyebrow")}">CARTEIRA</p><h2 class="${m("title")}">Carteira OKX</h2><p class="${m("description")}">Somente leitura. Conectar não habilita o executor.</p></div>
    <span class="${m("badge")}">Web3</span>
  </header>
  <div class="${m("content")}">
    <div class="${m("statusRow")}"><span class="${m("statusDot")} ${m("statusDotConnected")}"></span><span>Conectado à X Layer</span></div>
    <h3 class="${m("subtitle")}">Conta e rede</h3>
    <dl class="${m("details")}"><div class="${m("detailRow")}"><dt>Conta</dt><dd>0x1111…1111</dd></div><div class="${m("detailRow")}"><dt>Rede</dt><dd>X Layer (196)</dd></div></dl>
    <p class="${m("note")}">Cobertura limitada: MON e USDC nativo na Monad; OKB, USDT, USDT0, USDC nativo, USDC_Bridged e USDC.e na X Layer.</p>
    <h3 class="${m("subtitle")}">Saldos na X Layer</h3>
    <dl class="${m("balances")}">
      ${["OKB|12.34567890123456789","USDT|1.234567","USDT0|98.765432","USDC nativo|3.141592","USDC_Bridged|0.000007","USDC.e|250"].map((r)=>{const c=r.split("|");return `<div class="${m("balanceRow")}"><dt>${c[0]}</dt><dd>${c[1]}</dd></div>`}).join("")}
      <div class="${m("blockRow")}"><dt>Bloco consultado</dt><dd>0x123</dd></div>
    </dl>
    <p class="${m("note")}">OKB é o ativo nativo usado para taxas na X Layer; USDT não paga gas.</p>
    <div class="${m("actions")}"><button class="${m("primaryButton")}">Trocar para Monad</button><button class="${m("secondaryButton")}">Atualizar saldo</button><button class="${m("textButton")}">Desconectar deste painel</button></div>
    <p class="${m("footer")}">Este painel apenas consulta saldos.</p>
  </div>
</section>`;

const multi = (m) => `
<section class="${m("panel")}">
  <header class="${m("header")}">
    <div class="${m("headingGroup")}"><p class="${m("eyebrow")}">REDES</p><h2 class="${m("title")}">Patrimônio multichain</h2><p class="${m("description")}">Somente leitura. Conectar não habilita o executor.</p></div>
    <span class="${m("badge")}">OKX OnChain OS</span>
  </header>
  <div class="${m("content")}">
    <h3 class="${m("subtitle")}">Redes EVM da conta conectada</h3>
    <p class="${m("note")}">Conta 0x1111…1111. Cada rede responde pela sua própria RPC pública.</p>
    <button class="${m("primaryButton")}">Consultar todas as redes</button>
    <ul class="${m("chainList")}">
      <li class="${m("chainRow")}"><div class="${m("chainHead")}"><span class="${m("chainName")}">Arbitrum One</span><span class="${m("chainMeta")}">bloco 22144213</span></div>
        <dl class="${m("balances")}"><div class="${m("balanceRow")}"><dt>ETH</dt><dd>1.234567890123456789</dd></div><div class="${m("balanceRow")}"><dt>USDT</dt><dd>1000.000001</dd></div></dl></li>
      <li class="${m("chainRow")}"><div class="${m("chainHead")}"><span class="${m("chainName")}">BNB Chain</span><span class="${m("chainMeta")} ${m("chainMetaDown")}">indisponível: a RPC pública não respondeu</span></div></li>
    </ul>
    <h3 class="${m("subtitle")} ${m("subtitleDivided")}">Solana pela OKX Wallet</h3>
    <p class="${m("note")}">Conta Solana 7xKX…9fQe.</p>
    <dl class="${m("balances")}"><div class="${m("balanceRow")}"><dt>SOL</dt><dd>12.5</dd></div><div class="${m("balanceRow")}"><dt>USDC</dt><dd>250.75</dd></div></dl>
    <div class="${m("actions")}"><button class="${m("secondaryButton")}">Atualizar Solana</button><button class="${m("textButton")}">Desconectar Solana</button></div>
    <p class="${m("footer")}">Patrimônio exibido é leitura.</p>
  </div>
</section>`;

const dex = (m) => `
<section class="${m("panel")}">
  <header class="${m("header")}">
    <div class="${m("headingGroup")}"><p class="${m("eyebrow")}">ARQUIVO LOCAL</p><h2 class="${m("title")}">Relatório DEX offline</h2><p class="${m("description")}">Leitura local de arquivo histórico; nenhuma conexão ou ação de carteira.</p></div>
    <span class="${m("badge")}">Somente leitura local</span>
  </header>
  <div class="${m("content")}">
    <p class="${m("status")}">Relatório carregado. Resultado histórico, sem atualização de mercado.</p>
    <div class="${m("controls")}">
      <label class="${m("fileLabel")}">Selecionar relatório JSON local</label>
      <input class="${m("fileInput")}" type="file">
      <p class="${m("help")}">JSON local de até 65.536 bytes.</p>
      <button class="${m("primaryButton")}">Mostrar exemplo sintético</button>
      <button class="${m("secondaryButton")}">Limpar relatório</button>
    </div>
    <div class="${m("report")}">
      <div class="${m("badges")}"><span class="${m("reportBadge")}">Dados sintéticos: demonstração</span><span class="${m("reportBadge")}">Relatório histórico</span><span class="${m("reportBadge")} ${m("reportBadgeWarn")}">Frescor do mercado desconhecido</span></div>
      <p class="${m("age")}">Tempo desde a importação: 3 min 21 s</p>
      <dl class="${m("details")}">
        <div class="${m("detailRow")}"><dt>Estado declarado</dt><dd class="${m("prose")}">Delta bruto cotado</dd></div>
        <div class="${m("detailRow")}"><dt>Rede declarada (chainIndex)</dt><dd>8453</dd></div>
        <div class="${m("detailRow")}"><dt>Token A: contrato declarado</dt><dd>0x833589fCD6eDb6E08f4C7C32D4f71b54bdA02913</dd></div>
        <div class="${m("detailRow")}"><dt>Saldo da carteira</dt><dd class="${m("prose")}">Relatório não representa saldo da carteira</dd></div>
      </dl>
      <section class="${m("subsection")}"><h3 class="${m("subheading")}">Custos declarados por perna</h3>
        <ol class="${m("legs")}"><li class="${m("leg")}"><h4 class="${m("subheading")}">Perna 1</h4>
          <dl class="${m("details")}"><div class="${m("detailRow")}"><dt>Entrada atômica (token A)</dt><dd>1.234567890123456789 (valor declarado)</dd></div>
          <div class="${m("detailRow")}"><dt>Gas estimado (unidade nativa)</dt><dd class="${m("prose")}">140000000 unidades atômicas nativas (declaradas)</dd></div></dl></li></ol>
      </section>
      <p class="${m("safety")}">Este relatório não é uma cotação atual, retorno líquido, execução qualificada ou saldo da carteira.</p>
    </div>
  </div>
</section>`;

const disclosure = (m, inner) => `
<details class="${m("disclosure")}" open><summary class="${m("summary")}" aria-expanded="true"><span class="${m("label")}">Relatorio DEX</span><span class="${m("badge")}">Evidencia</span><span class="${m("chevron")}"></span></summary><div class="${m("body")}">${inner}</div></details>`;


const PROBE = `(() => {
  const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  const cards = [...document.querySelectorAll(".card > .dock > div > section")];
  const heads = cards.map((c) => {
    const h = c.querySelector("header");
    const cs = getComputedStyle(h);
    return { h: Math.round(h.getBoundingClientRect().height), pt: cs.paddingTop, pb: cs.paddingBottom, radius: getComputedStyle(c).borderRadius };
  });
  const overflowers = [];
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > window.innerWidth + 0.5 || r.left < -0.5)) {
      const cs = getComputedStyle(el);
      if (cs.overflowX === "auto" || cs.overflowX === "scroll" || cs.overflowX === "hidden" || cs.overflowX === "clip") continue;
      let scroller = false;
      for (let a = el.parentElement; a; a = a.parentElement) {
        const ax = getComputedStyle(a).overflowX;
        if (ax === "auto" || ax === "scroll" || ax === "hidden" || ax === "clip") { scroller = true; break; }
      }
      if (scroller) continue;
      overflowers.push(el.tagName + "." + (el.className || "").toString().split(" ")[0] + " right=" + Math.round(r.right));
    }
  }
  const small = [];
  for (const el of document.querySelectorAll("button, summary, input")) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.height < 40) small.push(el.tagName + "." + (el.className || "").toString().split(" ")[0] + " h=" + Math.round(r.height));
  }
  const widest = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.right > document.documentElement.clientWidth + 0.5) widest.push(el.tagName + "." + (el.className||"").toString().split(" ")[0] + " w=" + Math.round(r.width) + " right=" + Math.round(r.right) + " ovx=" + getComputedStyle(el).overflowX);
  }
  const hdrDebug = cards.map((c) => {
    const h = c.querySelector("header");
    return [...h.children].map((k) => k.tagName + "." + (k.className||"").toString().split(" ")[0] + "=" + Math.round(k.getBoundingClientRect().height) + " w=" + Math.round(k.getBoundingClientRect().width));
  });
  return {
    hdrDebug,
    htmlScroll: document.documentElement.scrollWidth,
    htmlClient: document.documentElement.clientWidth,
    bodyScroll: document.body.scrollWidth,
    widest: [...new Set(widest)].slice(0, 12),
    docOverflow,
    headHeights: heads.map((x) => x.h),
    headerPad: heads.map((x) => x.pt + "/" + x.pb),
    radii: [...new Set(heads.map((x) => x.radius))],
    cardTops: cards.map((c) => Math.round(c.getBoundingClientRect().top)),
    overflowers: [...new Set(overflowers)].slice(0, 8),
    small: [...new Set(small)],
  };
})()`;

const css = [globals, ...Object.values(mods).map((x) => x.css)].join("\n");

const page = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${css}</style></head>
<body><div class="card" style="padding:16px 24px 24px">
  <section class="dock" style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1fr);align-items:start;gap:16px">
    <div>${decision(mods.decision.map)}</div>
    <div>${wallet(mods.wallet.map)}</div>
    <div>${multi(mods.multi.map)}</div>
  </section>
  <section style="margin-top:16px">${disclosure(mods.disclosure.map, dex(mods.dex.map))}</section>
</div></body></html>`;

const EDGE_PATH = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const profileDir = mkdtempSync(join(tmpdir(), "jev-layout-probe-"));
const debugPort = 34500 + Math.floor(Math.random() * 400);
const htmlPath = join(profileDir, "probe.html");
writeFileSync(htmlPath, page, "utf8");

const edge = spawn(EDGE_PATH, [
  `--user-data-dir=${join(profileDir, "profile")}`,
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  `--remote-debugging-port=${debugPort}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

async function cdpTargets() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const list = await response.json();
      const target = list.find((entry) => entry.type === "page");
      if (target) return target;
    } catch {}
    await Bun.sleep(250);
  }
  throw new Error("Edge DevTools endpoint never answered");
}

const target = await cdpTargets();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let nextId = 1;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};
function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}
await send("Page.enable");
await send("Runtime.enable");

const results = [];
for (const width of widths) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `file:///${htmlPath.replace(/\\/g, "/")}` });
  await Bun.sleep(700);
  const response = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
  results.push({ width, ...response.result.result.value });
}
socket.close();
edge.kill();
console.log(JSON.stringify(results, null, 1));
process.exit(0);
