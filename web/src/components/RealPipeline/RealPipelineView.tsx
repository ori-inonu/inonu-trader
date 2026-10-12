import type { RealCapability, RealEnvelope, RealPipelineSnapshot } from "../../lib/real-pipeline";
import { walletChainIndex, type SharedWalletSnapshot } from "../../lib/wallet-store";
import styles from "./RealPipeline.module.css";

export interface RealPipelineViewProps {
  state: RealPipelineSnapshot;
  wallet: SharedWalletSnapshot;
  acknowledged: boolean;
  nowMs: number;
  onAcknowledged(value: boolean): void;
  onConsent(): void;
  onRevoke(): void;
  onRefresh(): void;
  onRetry(): void;
  onConnect(): void;
}

const unknown = "Desconhecido";
const text = (value: unknown): string => typeof value === "string" && value.length > 0 ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : unknown;
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const stamp = (value: number | null | undefined) => {
  const date = typeof value === "number" && Number.isFinite(value) ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString().replace("T", " ").replace(".000Z", " UTC").replace("Z", " UTC") : unknown;
};
const usd = (value: unknown) => text(value) === unknown ? unknown : `US$ ${text(value)}`;
const proof = (value: unknown) => value === true ? "sim" : value === false ? "não" : unknown;
const validWindow = (observedAtMs: unknown, expiresAtMs: unknown, nowMs: number): boolean => typeof observedAtMs === 'number' && Number.isFinite(observedAtMs) && typeof expiresAtMs === 'number' && Number.isFinite(expiresAtMs) && Number.isFinite(nowMs) && observedAtMs <= nowMs && expiresAtMs > nowMs;
const ready = (envelope: RealEnvelope | undefined, nowMs: number): boolean => envelope?.status === "ready" && validWindow(envelope.receivedAtMs ?? envelope.observedAtMs, envelope.expiresAtMs, nowMs) && (envelope.requestedAtMs === undefined || (Number.isFinite(envelope.requestedAtMs) && envelope.requestedAtMs <= (envelope.receivedAtMs ?? envelope.observedAtMs)!));
const labels: Record<string, string> = { balance: "Inventário", prices: "Preços", candles: "Velas, 1 minuto", quote: "Cotação", build: "Proposta sem assinatura", marketSupport: "Suporte de mercado", balanceSupport: "Suporte de saldo", dexSupport: "Suporte DEX", defiChains: "Redes DeFi", defiDetail: "Produto DeFi", leaderboard: "Leaderboard" };
const statusLabels: Record<string, string> = { ready: "Pronto", blocked: "Bloqueado", error: "Erro", unsupported: "Sem suporte", "not-implemented": "Não implementado", unverified: "Acesso não verificado" };

function catalogCapabilities(core: RealCapability[] = [], health: RealCapability[] = []): RealCapability[] {
  const seen = new Set<string>();
  return [...core, ...health].filter((capability) => {
    const key = JSON.stringify([capability.family, capability.chainIndex, capability.source, capability.endpoint]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function nextDependency({ state, wallet }: Pick<RealPipelineViewProps, "state" | "wallet">, nowMs: number): string {
  const health = state.health;
  if (!health) return "Inicie o backend local e tente sincronizar o pipeline.";
  if (!health.services.onchainos.configured) return "Configure as credenciais OnchainOS no backend local para consultar fontes reais.";
  if (health.services.onchainos.access === "blocked") return health.dependencies[0] ?? "Verifique o acesso OnchainOS indicado pelo backend.";
  if (!wallet.available) return "Disponibilize a extensão OKX Wallet neste navegador para conectar uma conta local.";
  if (!wallet.snapshot.account) return "Conecte a OKX Wallet localmente antes de autorizar consultas.";
  if (!walletChainIndex(wallet.snapshot)) return "Selecione X Layer ou Monad no painel da wallet.";
  if (!wallet.identityKey) return "Aguarde a identificação desta conta e revisão.";
  if (!state.consent) return "Autorize explicitamente a consulta de saldo e cotação abaixo.";
  if (!health.services.jev.credentialPresent || !health.services.jev.authorized) return "Configure e autorize o Jev no backend para avaliar a observação sanitizada.";
  const core = state.latest?.cycle?.core;
  if (!core) return "Atualize o ciclo para observar a conta autorizada nesta revisão.";
  const unavailable = Object.entries(core.envelopes).find(([key, envelope]) => ['balance','prices','candles','quote','build'].includes(key) && !ready(envelope, nowMs));
  if (unavailable) return unavailable[1].error ?? `${labels[unavailable[0]] ?? unavailable[0]} ainda precisa de uma observação válida.`;
  return core.holdReasons[0] ?? health.dependencies[0] ?? "A simulação e a prova de saldo e unidades ainda precisam de qualificação para execução. O modo continua paper.";
}

function Metrics({ values }: { values: [string, string][] }) {
  return <dl className={styles.metrics}>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function Envelope({ name, envelope, nowMs }: { name: string; envelope: RealEnvelope; nowMs: number }) {
  const expired = envelope.status === "ready" && !ready(envelope, nowMs);
  return <div className={styles.source}>
    <div className={styles.sourceHeading}><h4>{labels[name] ?? name}</h4><span className={styles.badge}>{expired ? "Expirado" : statusLabels[envelope.status]}</span></div>
    <p>{envelope.error ?? (expired ? "Validade encerrada; solicite uma atualização." : envelope.status === "ready" ? "Resposta recebida; verifique modo e evidência de transporte. Execução desativada." : "Esta fonte ainda não entregou dados válidos.")}</p>
    <dl className={styles.provenance}>
      <div><dt>Fonte</dt><dd>{envelope.source}</dd></div>
      <div><dt>Modo da fonte</dt><dd>{text(envelope.mode)}</dd></div>
      <div><dt>Endpoint</dt><dd>{envelope.endpoint}</dd></div>
      <div><dt>Método / rede</dt><dd>{text(envelope.method)}, {text(envelope.chainIndex)}</dd></div>
      <div><dt>Correlação</dt><dd>{text(envelope.correlationId)}</dd></div>
      <div><dt>Solicitado</dt><dd>{stamp(envelope.requestedAtMs)}</dd></div>
      <div><dt>Recebido</dt><dd>{stamp(envelope.receivedAtMs ?? envelope.observedAtMs)}</dd></div>
      <div><dt>Timestamp da fonte</dt><dd>{stamp(envelope.sourceAtMs)}</dd></div>
      <div><dt>Validade / TTL restante</dt><dd>{stamp(envelope.expiresAtMs)}, {ready(envelope, nowMs) ? `${Math.max(0, Math.ceil((envelope.expiresAtMs! - nowMs) / 1000))} s` : "0 s"}</dd></div>
      <div><dt>HTTP / unidade</dt><dd>{text(envelope.httpStatus)}, {text(envelope.unit)}</dd></div>
    </dl>
  </div>;
}

export function RealPipelineView(props: RealPipelineViewProps) {
  const { state, wallet, acknowledged, nowMs } = props;
  const health = state.health;
  const cycle = state.latest?.cycle;
  const core = cycle?.core;
  const capabilities = catalogCapabilities(core?.capabilities, health?.capabilities);
  const chainIndex = walletChainIndex(wallet.snapshot);
  const balanceEnvelope = core?.envelopes.balance;
  const inventory = ready(balanceEnvelope, nowMs) ? record(balanceEnvelope?.data) : {};
  const quoteEnvelope = core?.envelopes.quote;
  const quote = ready(quoteEnvelope, nowMs) ? record(quoteEnvelope?.data) : {};
  const priceEnvelope = core?.envelopes.prices;
  const prices = ready(priceEnvelope, nowMs) ? record(priceEnvelope?.data) : {};
  const candleEnvelope = core?.envelopes.candles;
  const candles = ready(candleEnvelope, nowMs) ? record(candleEnvelope?.data) : {};
  const canConsent = Boolean(wallet.snapshot.account && chainIndex && wallet.identityKey && wallet.snapshot.status === "connected");
  const remoteConsent = health?.walletConsent.active === true;
  const history = state.latest?.history ?? [];
  const effective = health?.effectiveConfig;
  const coreCurrent = core && core.observedAtMs <= nowMs && ['balance','prices','candles','quote'].every(key => ready(core.envelopes[key], nowMs));
  const semantic = coreCurrent ? record(core?.semanticProof) : {};
  const rpcCandidate = record(core?.rpcObservation);
  const rpcContext = record(rpcCandidate.context);
  const rpc = validWindow(rpcContext.observedAtMs, rpcContext.expiresAtMs, nowMs) ? rpcCandidate : {};
  const proposal = validWindow(core?.proposal?.requestedAtMs, core?.proposal?.expiresAtMs, nowMs) ? core?.proposal : null;
  const derived = record(core?.valuation);
  const derivedContext = record(derived.context);
  const derivedFresh = validWindow(derivedContext.observedAtMs, derivedContext.expiresAtMs, nowMs);
  const valuation = derivedFresh ? derived : {};
  const defi = ready(core?.envelopes.defiDetail, nowMs) ? record(core?.envelopes.defiDetail?.data) : {};
  const leaderboard = ready(core?.envelopes.leaderboard, nowMs) ? list(core?.envelopes.leaderboard?.data) : [];
  return <section className={styles.panel} aria-labelledby="real-pipeline-title">
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>OKX Web3, observação</p><h2 id="real-pipeline-title">Pipeline real</h2><p>Observação e decisão em paper. Execução financeira desativada.</p></div>
      <span className={styles.badge}>Paper, execução OFF</span>
    </header>
    <div className={styles.content}>
      <div className={styles.dependency} role="status"><span>Próxima dependência</span><p>{nextDependency(props, nowMs)}</p></div>
      {state.error && <p className={styles.error} role="alert">{state.error}</p>}
      <div className={styles.actions}>
        <button type="button" onClick={props.onRetry} disabled={state.busy}>Tentar sincronizar</button>
        <button type="button" onClick={props.onRefresh} disabled={state.busy || (!state.consent && remoteConsent)}>Atualizar ciclo</button>
        <span>Sincronização a cada 5 s, {stamp(state.syncedAtMs)}</span>
      </div>
      <div className={styles.services} aria-label="Estado dos serviços">
        <div><span>OnchainOS</span><strong>{health ? !health.services.onchainos.configured ? "Credenciais pendentes" : statusLabels[health.services.onchainos.access] : unknown}</strong><small>{health?.services.onchainos.missing.length ? `Faltam: ${health.services.onchainos.missing.join(", ")}` : "Configuração não comprova acesso real."}</small></div>
        <div><span>Jev</span><strong>{health ? health.services.jev.authorized && health.services.jev.credentialPresent ? "Consulta autorizada" : "Autorização pendente" : unknown}</strong><small>{health?.services.jev.model ?? unknown}, tarifa / milhão: {usd(health?.services.jev.costUsdPerMillion)}</small></div>
        <div><span>Worker</span><strong>{health ? health.services.worker.running ? "Em execução" : "Parado" : unknown}</strong><small>Último ciclo: {stamp(health?.services.worker.lastCycleAtMs)}, intervalo {text(health?.services.worker.intervalMs)} ms</small></div>
      </div>
      <details className={styles.details}><summary>Configuração efetiva</summary><Metrics values={[["Par / quantidade base", effective?.quotePair ? `${effective.quotePair.fromToken} → ${effective.quotePair.toToken}, ${effective.quotePair.amount}` : "Par ainda não configurado"], ["Slippage (%)", text(effective?.quotePair?.slippagePercent)], ["Chamadas Jev reservadas / limite", health?.jevCalls ? `${health.jevCalls.reserved} / ${health.jevCalls.limit}` : unknown], ["Intervalo do worker (ms)", text(effective?.intervalMs)]]} /><p>Destinatários RPC: {effective?.rpcRecipients.map(item => `${item.chainIndex}: ${item.origin}`).join(", ") ?? unknown}</p><p>Quantidade base preservada como inteiro exato. A configuração do par não comprova liquidez, decimals, acesso ou saldo.</p></details>
      <div className={styles.consent}>
        <div className={styles.sourceHeading}><h3>Consentimento de consulta</h3><span className={styles.badge}>{state.consent ? "Ativo nesta revisão" : "Não autorizado"}</span></div>
        <p>Conectar a wallet permanece local. Esta autorização adicional envia <strong>endereço público, rede e revisão</strong> ao <strong>backend local e OKX Web3</strong> para consultar <strong>saldo e cotação</strong>, e ao <strong>RPC público da rede (X Layer ou Monad)</strong> para conferir saldo, decimals e bloco. Os provedores recebem essas consultas de leitura.</p>
        <p>Nenhum endereço é enviado ao Jev. A consulta não solicita assinaturas, aprovações de tokens ou trades. Você pode revogar a qualquer momento; mudanças de conta, rede ou revisão revogam a autorização.</p>
        <p className={styles.muted}>Rede: {chainIndex === "196" ? "X Layer" : chainIndex === "143" ? "Monad" : "Selecione X Layer ou Monad"}, revisão {wallet.revision}. O endereço fica apenas na sessão deste navegador até esta autorização.</p>
        {remoteConsent && !state.consent && <p className={styles.error}>O backend informa uma autorização anterior. Revogue antes de iniciar outra consulta.</p>}
        {!state.consent && <label className={styles.check}><input type="checkbox" checked={acknowledged} onChange={(event) => props.onAcknowledged(event.target.checked)} disabled={!canConsent || state.busy} /><span>Autorizo essa consulta de saldo e cotação e seus destinatários.</span></label>}
        <div className={styles.actions}>
          {!wallet.snapshot.account && <button type="button" onClick={props.onConnect} disabled={!wallet.available || wallet.snapshot.status === "connecting"}>Conectar OKX localmente</button>}
          {!state.consent && <button type="button" onClick={props.onConsent} disabled={!canConsent || !acknowledged || state.busy || remoteConsent}>Autorizar consulta</button>}
          <button type="button" onClick={props.onRevoke} disabled={!state.consent && !remoteConsent && !state.error && !state.busy}>Revogar consulta</button>
        </div>
      </div>
      <div className={styles.grid}>
        <article className={styles.card}><h3>Inventário observado</h3><p>Somente tokens observados. Total conhecido não prova cobertura completa.</p><Metrics values={[["Valor conhecido", usd(inventory.knownValueUsd)], ["Valor completo", usd(inventory.completeValueUsd)], ["Bloco", text(inventory.blockNumber)], ["Ativos observados / USD conhecido", `${text(record(inventory.coverage).observedAssets)} / ${text(record(inventory.coverage).usdKnown)}`]]} />
          {list(inventory.assets).length > 0 ? <div className={styles.tableWrap}><table><caption>Ativos retornados pelo serviço de saldo</caption><thead><tr><th>Ativo</th><th>Saldo / unidade</th><th>Valor USD</th></tr></thead><tbody>{list(inventory.assets).map((asset, index) => { const item = record(asset); return <tr key={index}><td>{text(item.symbol)}<small>{text(item.tokenContractAddress)}</small></td><td>{text(item.balance)}<small>Unidade do provedor, decimais {text(item.decimals)}</small><small>Saldo base: {text(item.rawBalance)}</small></td><td>{usd(item.valueUsd)}</td></tr>; })}</tbody></table></div> : <p className={styles.empty}>Saldo desconhecido. Nenhum inventário válido nesta revisão.</p>}
        </article>
        <article className={styles.card}><h3>Avaliação derivada</h3><p>{derived.context && !derivedFresh ? 'Avaliação expirada; atualize a observação.' : derived.context ? 'Consistência de saldo bruto e decimals avaliada em um bloco; preço USD vem de Balance.tokenPrice. Veja as razões por ativo.' : 'Aguardando inventário e leitura RPC compatíveis; valor permanece desconhecido.'}</p><Metrics values={[["Subtotal conhecido",usd(valuation.knownValueUsd)],["Total dos tokens observados",usd(valuation.completeValueUsd)],["Observados / qualificados / desconhecidos",`${text(record(valuation.coverage).observedAssets)} / ${text(record(valuation.coverage).qualifiedAssets)} / ${text(record(valuation.coverage).unknownAssets)}`],["Bloco / modo",`${text(derivedContext.blockNumber)}, ${text(derived.mode)}`],["Validade",stamp(typeof derivedContext.expiresAtMs==='number'?derivedContext.expiresAtMs:null)]]}/><p>Validação local e transporte real têm provas separadas. Esta avaliação não qualifica execução financeira.</p>{list(valuation.assets).length?<ul className={styles.items}>{list(valuation.assets).map((asset,index)=>{const item=record(asset);return <li key={index}>{text(item.token)}<strong>{usd(item.valueUsd)}</strong><small>Decimais {text(item.decimals)}, {list(item.reasons).map(text).join(', ')||'Consistência local conferida'}</small></li>})}</ul>:null}</article>
        <article className={styles.card}><h3>Cotação e custos</h3><p>Quantidades exatas na menor unidade do token; decimais são referência do provedor.</p><Metrics values={[["Entrada base", text(quote.fromTokenAmount)], ["Saída base", text(quote.toTokenAmount)], ["Token de entrada", text(record(quote.fromToken).tokenContractAddress)], ["Token de saída", text(record(quote.toToken).tokenContractAddress)], ["Decimais entrada / saída",`${text(record(quote.fromToken).decimals)} / ${text(record(quote.toToken).decimals)}`], ["Impacto de preço (%)", text(quote.priceImpactPercent)], ["Taxa de rede estimada", usd(quote.estimatedNetworkFeeUsd)], ["Gas estimado base", text(quote.estimatedGasRaw)], ["Rotas", text(quote.routeCount)]]} /><p className={styles.muted}>Unidade: {text(quote.amountUnit)}. Sem cotação válida, nenhum custo é tratado como zero.</p>
          {list(quote.routes).length?<details><summary>Rotas da cotação</summary><ul>{list(quote.routes).map((route,index)=>{const item=record(route);return <li key={index}>{text(item.dexName)}, {text(item.fromToken)} → {text(item.toToken)}, proporção {text(item.percent)}</li>})}</ul></details>:null}
          {proposal && <details><summary>Preflight da proposta</summary><p>Execução desativada, transação não assinada.</p><p>Hash: {text(proposal.transactionHash)}</p><p>{list(record(proposal.preflight).reasons).map(text).join(", ") || "Qualificação financeira desconhecida."}</p></details>}
        </article>
        <article className={styles.card}><h3>Mercado observado</h3><p>Moeda e unidades desconhecidas continuam explícitas.</p>{list(prices.prices).length ? <ul className={styles.items}>{list(prices.prices).map((price, index) => { const item = record(price); return <li key={index}>{text(item.tokenContractAddress)}<strong>{text(item.price)}, moeda desconhecida</strong><small>Fonte: {stamp(typeof item.sourceAtMs === "number" ? item.sourceAtMs : null)}</small></li>; })}</ul> : <p className={styles.empty}>Preço desconhecido.</p>}
          {list(candles.series).map((series, index) => { const item = record(series); const entries = list(item.candles); const last = record(entries.at(-1)); return <p key={index}>{text(item.tokenContractAddress)}, {entries.length} velas de 1 min, último fechamento {text(last.close)}, {stamp(typeof last.closedAtMs === "number" ? last.closedAtMs : null)}</p>; })}
        </article>
        <article className={styles.card}><h3>Validação da proposta</h3><Metrics values={[["Build sem assinatura", proposal ? "Recebido; verificar fonte" : "Não observado"], ["Leitura RPC / bloco", rpc.context ? `${text(rpc.status)}, ${text(record(rpc.context).blockNumber)}` : "Não observado"], ["Semântica local", semantic.localChecksPassed === true ? "Verificações locais passaram" : semantic.status ? "Bloqueada" : "Não observado"], ["Simulação remota", semantic.simulation === "not-exercised" ? "Não exercitada" : "Não observado"], ["Qualificação financeira", "Pendente"], ["Execução", "Desativada"]]} />{list(semantic.localReasons).length ? <ul>{list(semantic.localReasons).map((reason,index)=><li key={index}>{text(reason)}</li>)}</ul> : null}<p>RPC, preflight local e simulação remota têm provas próprias. ABI, deployment, fees e validade precisam estar qualificados antes de qualquer elegibilidade financeira.</p></article>
        <article className={styles.card}><h3>Decisão observada</h3><Metrics values={[["Escolha / estado", cycle ? `${cycle.decision.choice}, ${statusLabels[cycle.decision.status]}` : unknown], ["Modelo", cycle?.decision.model ?? unknown], ["Latência (ms)", text(cycle?.decision.latencyMs)], ["Tokens de entrada", text(cycle?.decision.inputTokens)], ["Custo real da consulta", usd(cycle?.decision.costUsd)], ["PnL realizado", unknown]]} /><p className={styles.muted}>Paper não realiza lucro ou perda. Custo não informado permanece desconhecido.</p>{cycle?.decision.reasons.length ? <ul>{cycle.decision.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul> : null}{core?.holdReasons.length ? <ul>{core.holdReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul> : null}</article>
      </div>
      <details className={styles.details}><summary>Leitura RPC e consistência de bloco</summary><p>Fonte: {text(rpc.source)}, modo {text(rpc.mode)}, bloco {text(record(rpc.context).blockNumber)}, hash {text(record(rpc.context).blockHash)}</p><p>Coleta: {stamp(typeof record(rpc.context).observedAtMs==='number'?record(rpc.context).observedAtMs as number:null)}, validade: {stamp(typeof record(rpc.context).expiresAtMs==='number'?record(rpc.context).expiresAtMs as number:null)}, consistência: {proof(rpc.blockConsistent)}</p>{list(rpc.receipts).length ? <ul>{list(rpc.receipts).map((value,index)=>{const receipt=record(value);return <li key={index}>{text(receipt.endpoint)}, {text(receipt.rpcMethod)}, HTTP {text(receipt.httpStatus)}, {text(receipt.outcome)}, bloco {text(receipt.blockNumber)}</li>})}</ul> : <p>Nenhuma leitura RPC observada nesta revisão.</p>}</details>
      <details className={styles.details}><summary>DeFi e leaderboard opcionais</summary><p>Consultas desligadas até existir qualificação própria por endpoint e rede. Estes dados não estabelecem saldo, oportunidade elegível ou retorno realizado do operador.</p><Metrics values={[["Produto DeFi",text(defi.investmentId)],["Taxa anunciada / unidade desconhecida",text(defi.advertisedRate)],["TVL / unidade desconhecida",text(defi.tvl)],["Fee / unidade desconhecida",text(defi.feeRate)]]}/>{leaderboard.length ? <ul>{leaderboard.map((value,index)=>{const row=record(value);return <li key={index}>Registro {index+1}, PnL do provedor {usd(row.realizedPnlUsd)}, volume {usd(row.txVolumeUsd)}, transações {text(row.txs)}</li>})}</ul> : <p>Leaderboard ainda não observado. Timestamp de atividade não prova atualidade da coleta.</p>}</details>
      <details className={styles.details} open><summary>Fontes, timestamps e validade</summary><p>Observação: {stamp(core?.observedAtMs)}, revisão {core?.revision ?? unknown}, correlação {text(core?.correlationId)}</p><div className={styles.sources}>{core ? Object.entries(core.envelopes).map(([name, envelope]) => <Envelope key={name} name={name} envelope={envelope} nowMs={nowMs} />) : <p className={styles.empty}>Nenhuma amostra autorizada válida nesta revisão.</p>}</div></details>
      <details className={styles.details}>
        <summary>Capacidades por módulo e rede</summary>
        {capabilities.length ? <div className={styles.tableWrap}><table>
          <caption>Documentação, implementação e prova real são estados distintos</caption>
          <thead><tr><th>Módulo / rede</th><th>Estado</th><th>Evidência</th><th>Dependência</th></tr></thead>
          <tbody>{capabilities.map((capability, index) => <tr key={index}>
            <td>{capability.family ?? capability.module ?? unknown}<small>{capability.chainIndex ?? capability.network ?? unknown}</small></td>
            <td>{statusLabels[capability.status ?? ""] ?? capability.status ?? unknown}</td>
            <td>Documentado: {proof(capability.documented)}<small>Implementado: {proof(capability.implemented)}, integrado: {proof(capability.integrated)}</small><small>Exercitado real: {proof(capability.exercisedReal)}, financeiramente qualificado: {proof(capability.financiallyQualified)}</small><small>Fonte: {text(capability.source)}</small></td>
            <td>{capability.nextRequirement ?? capability.dependency ?? capability.reason ?? unknown}<small>{capability.endpoint ?? unknown}</small></td>
          </tr>)}</tbody>
        </table></div> : <p className={styles.empty}>Catálogo de capacidades ainda não informado pelo backend.</p>}
      </details>
      <details className={styles.details}><summary>Histórico real de ciclos ({history.length})</summary>{history.length ? <div className={styles.tableWrap}><table><caption>Ciclos efetivamente retornados pelo backend local</caption><thead><tr><th>Ciclo / finalização UTC</th><th>Decisão</th><th>Latência / custo</th><th>PnL realizado</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>#{item.sequence}<small>{stamp(item.finishedAtMs)}</small></td><td>{item.decision.choice}<small>{statusLabels[item.decision.status]}</small></td><td>{text(item.decision.latencyMs)} ms<small>{usd(item.decision.costUsd)}</small></td><td>{unknown}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>Nenhum ciclo registrado. O painel não usa fixtures.</p>}</details>
    </div>
  </section>;
}
