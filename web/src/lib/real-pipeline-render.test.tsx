import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RealPipelineView } from "../components/RealPipeline/RealPipelineView";
import { initialRealPipelineSnapshot, type RealHealth, type RealCycle } from "./real-pipeline";
import { walletServerSnapshot } from "./wallet-store";

const actions = { onConsent: () => {}, onRevoke: () => {}, onRefresh: () => {}, onRetry: () => {}, onConnect: () => {}, onAcknowledged: () => {} };

const blockedHealth: RealHealth = {
  mode: "paper",
  executionEnabled: false,
  services: {
    onchainos: { configured: false, access: "unverified", missing: ["credentials"] },
    jev: { credentialPresent: false, authorized: false, model: "unknown", costUsdPerMillion: null },
    worker: { running: true, intervalMs: 5000, lastCycleAtMs: null },
  },
  walletConsent: { active: false, identityKey: null, chainIndex: null, revision: null },
  dependencies: ["Credenciais pendentes"],
};

test('derived valuation shows exact subtotal, coverage and expiration separately from provider inventory',()=>{
 const valuation={status:'partial',mode:'unverified',context:{blockNumber:'42',blockHash:'0x'+'a'.repeat(64),observedAtMs:2,expiresAtMs:100},priceSource:'balance-tokenPrice-usd',knownValueUsd:'18014398509.481986',completeValueUsd:null,coverage:{observedAssets:2,qualifiedAssets:1,unknownAssets:1,scope:'observed-tokens-only'},assets:[],reasons:[]};
 const cycle:RealCycle={id:'fixture',sequence:1,startedAtMs:1,finishedAtMs:2,mode:'paper',executionEnabled:false,realizedPnlUsd:null,decision:{choice:'hold',status:'blocked',model:null,latencyMs:null,inputTokens:null,costUsd:null,reasons:[]},core:{correlationId:'fixture',chainIndex:'196',identityKey:'fixture',revision:1,observedAtMs:2,envelopes:{},capabilities:[],proposal:null,holdReasons:[],valuation}};
 const view=(nowMs:number)=>renderToStaticMarkup(createElement(RealPipelineView,{state:{...initialRealPipelineSnapshot,latest:{cycle,history:[]}},wallet:walletServerSnapshot,acknowledged:false,nowMs,...actions}));
 const fresh=view(10);expect(fresh).toContain('Avaliação derivada');expect(fresh).toContain('US$ 18014398509.481986');expect(fresh).toContain('2 / 1 / 1');expect(fresh).toContain('unverified');expect(fresh).not.toContain('US$ 0');
 const stale=view(100);expect(stale).toContain('Avaliação expirada');expect(stale).not.toContain('US$ 18014398509.481986');
});

test('a browser clock before collection cannot expose prices, valuation or an extended TTL', () => {
 const core = { correlationId: 'clock-fixture', chainIndex: '196', identityKey: 'fixture', revision: 1, observedAtMs: 1000, envelopes: { prices: { status: 'ready', source: 'onchainos-rest-v6', mode: 'fixture', endpoint: '/example', requestedAtMs: 1000, receivedAtMs: 1000, expiresAtMs: 1100, httpStatus: 200, unit: 'unknown', error: null, data: { prices: [{ tokenContractAddress: 'clock-token', price: '987654321' }] } } }, capabilities: [], proposal: null, holdReasons: [], valuation: { status: 'complete', knownValueUsd: '87654321', context: { observedAtMs: 1000, expiresAtMs: 1100 } } };
 const cycle = { id: 'clock-fixture', sequence: 1, startedAtMs: 1000, finishedAtMs: 1000, mode: 'paper', executionEnabled: false, realizedPnlUsd: null, decision: { choice: 'hold', status: 'blocked', model: null, latencyMs: null, inputTokens: null, costUsd: null, reasons: [] }, core } as RealCycle;
 const html = renderToStaticMarkup(createElement(RealPipelineView, { state: { ...initialRealPipelineSnapshot, latest: { cycle, history: [] } }, wallet: walletServerSnapshot, acknowledged: false, nowMs: -59000, ...actions }));
 expect(html).not.toContain('987654321'); expect(html).not.toContain('US$ 87654321'); expect(html).not.toContain('61 s'); expect(html).not.toContain('>Pronto<'); expect(html).toContain('Expirado');
});

test('configuration and provenance expose exact units and correlation without claiming completed preflight', () => {
 const state={...initialRealPipelineSnapshot,health:{...blockedHealth,effectiveConfig:{intervalMs:15000,quotePair:{fromToken:'0x'+'1'.repeat(40),toToken:'0x'+'2'.repeat(40),amount:'9007199254740993',slippagePercent:'0.5'},rpcRecipients:[{chainIndex:'196',origin:'https://rpc.xlayer.tech'}]},jevCalls:{reserved:2,limit:10}}};
 const html=renderToStaticMarkup(createElement(RealPipelineView,{state,wallet:walletServerSnapshot,acknowledged:false,nowMs:10,...actions}));
 expect(html).toContain('Configuração efetiva');expect(html).toContain('9007199254740993');expect(html).toContain('https://rpc.xlayer.tech');expect(html).toContain('2 / 10');expect(html).toContain('Validação da proposta');expect(html).toContain('Não observado');expect(html).not.toContain('Simulação aprovada');
});

test('ready fixtures retain their mode and never become real transport claims', () => {
 const core = { correlationId: 'fixture', chainIndex: '196', identityKey: 'fixture', revision: 1, observedAtMs: 1, envelopes: { prices: { status: 'ready', source: 'onchainos-rest-v6', mode: 'fixture', endpoint: '/example', expiresAtMs: 100, httpStatus: 200, unit: 'unknown', error: null, data: {} } }, capabilities: [], proposal: null, holdReasons: [] };
 const cycle = { id: 'fixture', sequence: 1, startedAtMs: 1, finishedAtMs: 1, mode: 'paper', executionEnabled: false, realizedPnlUsd: null, decision: { choice: 'hold', status: 'blocked', model: null, latencyMs: null, inputTokens: null, costUsd: null, reasons: [] }, core } as RealCycle;
 const html = renderToStaticMarkup(createElement(RealPipelineView, { state: { ...initialRealPipelineSnapshot, latest: { cycle, history: [] } }, wallet: walletServerSnapshot, acknowledged: false, nowMs: 10, ...actions }));
 expect(html).toContain('<dt>Modo da fonte</dt><dd>fixture</dd>'); expect(html).not.toContain('Resposta real recebida');
});

test("the separate query consent names recipients, fields, purpose and limits before authorization", () => {
  const html = renderToStaticMarkup(createElement(RealPipelineView, { state: initialRealPipelineSnapshot, wallet: walletServerSnapshot, acknowledged: false, nowMs: 10, ...actions }));
  expect(html).toContain("backend local e OKX Web3");
  expect(html).toContain("RPC público da rede");
  expect(html).toContain("endereço público, rede e revisão");
  expect(html).toContain("saldo e cotação");
  expect(html).toContain("Nenhum endereço é enviado ao Jev");
  expect(html).toContain("Autorizar consulta");
  expect(html).toContain("PnL realizado");
  expect(html).toContain("Desconhecido");
  expect(html).not.toContain("US$ 0");
});

test("the health catalog exposes DeFi, signals and public funding without a wallet, credentials or core", () => {
  const state = {
    ...initialRealPipelineSnapshot,
    health: {
      ...blockedHealth,
      capabilities: [
        { family: "defi", chainIndex: "196", source: "onchainos-v6", endpoint: "/defi", status: "not-implemented", documented: true, implemented: false, integrated: false, exercisedReal: false, financiallyQualified: false, nextRequirement: "Implementar consulta DeFi" },
        { family: "signals", chainIndex: "143", source: "onchainos-v6", endpoint: "/signals", status: "blocked", documented: true, implemented: false, integrated: false, exercisedReal: false, financiallyQualified: false, dependency: "Verificar acesso a sinais" },
        { family: "funding", source: "okx-public-v5", endpoint: "/api/v5/public/funding-rate", status: "ready", reason: "Qualificação financeira pendente" },
      ],
    },
  };
  const html = renderToStaticMarkup(createElement(RealPipelineView, { state, wallet: walletServerSnapshot, acknowledged: false, nowMs: 10, ...actions }));
  expect(html).toContain("<summary>Capacidades por módulo e rede</summary>");
  expect(html).toContain("<td>defi<small>196</small>");
  expect(html).toContain("<td>signals<small>143</small>");
  expect(html).toContain("<td>funding<small>Desconhecido</small>");
  expect(html).toContain("Implementar consulta DeFi");
  expect(html).toContain("Verificar acesso a sinais");
  expect(html).toContain("Qualificação financeira pendente");
  expect(html).toContain("Fonte: okx-public-v5");
  expect(html).toContain("Exercitado real: não, financeiramente qualificado: não");
  expect(html).toContain("Exercitado real: Desconhecido, financeiramente qualificado: Desconhecido");
  expect(html).toContain("Não autorizado");
  expect(html).not.toContain("Ativo nesta revisão");
  expect(html).not.toContain("Capacidades ainda não observadas por uma consulta autorizada.");
});

test("core evidence wins its exact capability key while independent health capabilities remain visible once", () => {
  const key = { family: "defi", chainIndex: "196", source: "onchainos-v6", endpoint: "/defi" };
  const publicFunding = { family: "funding", source: "okx-public-v5", endpoint: "/api/v5/public/funding-rate", reason: "Funding público independente" };
  const cycle: RealCycle = {
    id: "test-cycle",
    sequence: 1,
    startedAtMs: 1,
    finishedAtMs: 2,
    mode: "paper",
    executionEnabled: false,
    realizedPnlUsd: null,
    decision: { choice: "hold", status: "blocked", model: null, latencyMs: null, inputTokens: null, costUsd: null, reasons: [] },
    core: {
      correlationId: "test-observation",
      chainIndex: "196",
      identityKey: "test-sanitized-identity",
      revision: 1,
      observedAtMs: 2,
      envelopes: {},
      capabilities: [{ ...key, status: "blocked", documented: true, implemented: false, integrated: false, exercisedReal: false, financiallyQualified: false, nextRequirement: "Dependência observada pelo core" }],
      proposal: null,
      holdReasons: [],
    },
  };
  const state = {
    ...initialRealPipelineSnapshot,
    latest: { cycle, history: [] },
    health: {
      ...blockedHealth,
      capabilities: [
        { ...key, status: "ready", exercisedReal: true, financiallyQualified: true, nextRequirement: "Duplicata do health" },
        { ...key, family: "signals", dependency: "Outro módulo" },
        { ...key, chainIndex: "143", dependency: "Outra rede" },
        { ...key, source: "catalog-source", dependency: "Outra fonte" },
        { ...key, endpoint: "/defi/positions", dependency: "Outro endpoint" },
        publicFunding,
        publicFunding,
      ],
    },
  };
  const html = renderToStaticMarkup(createElement(RealPipelineView, { state, wallet: walletServerSnapshot, acknowledged: false, nowMs: 10, ...actions }));
  const catalog = html.split("<summary>Capacidades por módulo e rede</summary>")[1]?.split("</details>")[0] ?? "";
  expect(catalog).toContain("Dependência observada pelo core");
  expect(catalog).not.toContain("Duplicata do health");
  expect(catalog).toContain("Exercitado real: não, financeiramente qualificado: não");
  expect(catalog).not.toContain("financeiramente qualificado: sim");
  expect(catalog).toContain("Outro módulo");
  expect(catalog).toContain("Outra rede");
  expect(catalog).toContain("Outra fonte");
  expect(catalog).toContain("Fonte: catalog-source");
  expect(catalog).toContain("Outro endpoint");
  expect(catalog.match(/Funding público independente/g)).toHaveLength(1);
  expect(catalog.match(/<tr>/g)).toHaveLength(7);
});
