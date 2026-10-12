import { existsSync } from "node:fs";
import { config } from "../src/config";
import { loadOperatorConfig, operatorLiveGate } from "../src/operator/config";
import { persistCycle, runOperatorCycle } from "../src/operator/cycle";
import { JevOperatorModel, MockOperatorModel, type OperatorModel } from "../src/operator/jev-selector";
import { createEthersEvmSigner, type ExecutorDeps } from "../src/operator/executor";
import { acquireLock, createOperatorLedger, initLedgerFile, ledgerFilePersister, readLedgerFile, type OperatorLedger } from "../src/operator/ledger";
import { parseRealizedUsd } from "../src/operator/cli-guards";
import { buildFundingCandidates, DEFAULT_FUNDING_INSTRUMENTS, okxPublicFundingSource, type FundingObservation } from "../src/operator/funding";
import { DEFAULT_PAIRS, type BridgeQuoter, type DefiSource, type SwapQuoter } from "../src/operator/candidates";
import { createOkxPortfolioClient, normalizeInventory, syntheticInventory, type InventorySnapshot } from "../src/okx-wallet/portfolio";
import { createOkxTradeClient, okxBridgeQuoter, okxSwapQuoter, prepareEvmSwap } from "../src/okx-wallet/trade";
import { okxDefiSource } from "../src/okx-wallet/defi";
import { chainByIndex } from "../src/okx-wallet/chains";

/**
 * Jev as financial operator over the OKX Wallet inventory.
 *
 * Default: offline synthetic inventory and quotes, mock model, nothing sent.
 * --live  reads the real inventory, quotes, DeFi products and funding rates
 *         (OKX_WEB3_API_KEY/SECRET/PASSPHRASE and OPERATOR_ADDRESS required).
 * --jev   asks real Jev (TYPESAFE_AI_API_KEY).
 * --loop  repeats every OPERATOR_INTERVAL_MS.
 * --init-ledger creates data/operator/ledger.json once; execution refuses to run
 *         without it or with a corrupt one (fail closed).
 * --reconcile <planId> <closed|failed> --realized <usd> closes a leg after manual on-chain checks and records
 *         its signed result once (the value is mandatory unless the leg already carries one).
 * --routers prints the router the swap endpoint would call per EVM chain.
 *
 * Live execution is gated by the operator's own settings only: OPERATOR_EXECUTE,
 * OPERATOR_LIVE_ACK=OWN_FUNDS_RISK_OPERATOR, OPERATOR_PRIVATE_KEY (dedicated
 * wallet), --jev, OPERATOR_RPC_<chainIndex>, OPERATOR_ROUTER_<chainIndex>,
 * OPERATOR_SPENDER_<chainIndex> and OPERATOR_SELECTORS_<chainIndex>. The trader's
 * DRY_RUN, LIVE_ACK and PRIVATE_KEY are never consulted. Solana live is disabled.
 */
class UsageError extends Error {}

/** Deterministic demo quotes: X Layer shows a small positive edge so the full plan path is visible; the others lose to fees. */
function syntheticSwapQuoter(now: () => number): SwapQuoter {
  return {
    unitsQualified: true,
    async quote(input) {
      const amount = BigInt(input.amountAtomic);
      const native = input.fromTokenAddress.startsWith("0xEeee") || input.fromTokenAddress === "11111111111111111111111111111111";
      const decimalsFrom = native ? (input.chainIndex === "501" ? 9 : 18) : 6;
      const decimalsTo = native ? 6 : (input.chainIndex === "501" ? 9 : 18);
      const price = input.chainIndex === "143" ? 1.8 : input.chainIndex === "196" ? 50 : input.chainIndex === "501" ? 150 : 3000;
      const legFactor = input.chainIndex === "196" ? (native ? 1.0075 : 0.9985) : 0.9985;
      const units = Number(amount) / 10 ** decimalsFrom;
      const out = native ? units * price * legFactor : (units / price) * legFactor;
      return { fromAmountAtomic: input.amountAtomic, toAmountAtomic: BigInt(Math.floor(out * 10 ** decimalsTo)).toString(), priceImpactPercent: -0.05, tradeFeeUsd: input.chainIndex === "1" ? 2.5 : 0.01, receivedAtMs: now() };
    },
  };
}

function syntheticBridgeQuoter(now: () => number): BridgeQuoter {
  return {
    qualified: true,
    async quote(input) {
      const amount = BigInt(input.amountAtomic);
      const out = (amount * BigInt(997)) / BigInt(1000);
      return { fromAmountAtomic: input.amountAtomic, toAmountAtomic: out.toString(), minimumReceivedAtomic: ((out * BigInt(995)) / BigInt(1000)).toString(), totalFeeUsd: 0.8, estimatedMinutes: 6, receivedAtMs: now() };
    },
  };
}

function syntheticDefiSource(): DefiSource {
  return {
    async products(chainIndex, tokenContractAddress) {
      if (chainIndex !== "196") return [];
      return [{ id: "demo-xlayer-usdt-earn", name: "Produto sintético USDT Earn", chainIndex, tokenContractAddress, apyPercent: 4.2, tvlUsd: 1_000_000, subscribeFeeUsd: null }];
    },
  };
}

function syntheticFunding(now: () => number): FundingObservation[] {
  return [{ instId: "BTC-USDT-SWAP", fundingRate: 0.0001, nextFundingRate: 0.00012, fundingTimeMs: now() + 3_600_000, observedAtMs: now() }];
}

function usage(): string {
  return [
    "Inonu Trader: Jev como operador financeiro da carteira OKX (multichain).",
    "Sem flags: inventário, cotações, DeFi e funding sintéticos, modelo mock, nada é enviado.",
    "--live   inventário, cotações, produtos DeFi e funding reais (OKX_WEB3_API_KEY/SECRET/PASSPHRASE, OPERATOR_ADDRESS).",
    "--jev    decisão pelo Jev real (TYPESAFE_AI_API_KEY).",
    "--loop   repete a cada OPERATOR_INTERVAL_MS.",
    "--init-ledger cria o ledger uma única vez (com histórico existente exige --accept-history).",
    "--reconcile <planId> <closed|failed> --realized <usd> fecha uma perna após conferência on-chain e registra o resultado assinado, com gás, que alimenta as paradas de perda:",
    "  --realized é obrigatório, aceita no máximo 2 vezes OPERATOR_MAX_PLAN_USD em valor absoluto e vale uma única vez por plano; uma perna que já tem resultado muda de estado sem ele.",
    "Rode com bun --no-env-file --env-file=.env.operator run scripts/okx-operator.ts para não herdar o .env do trader.",
    "--routers (com --live) imprime o router (tx.to) por rede EVM para conferir no explorer; nada é enviado.",
    "Estado: OPERATOR_STATE_PATH, OPERATOR_JOURNAL_PATH, OPERATOR_LEDGER_PATH, OPERATOR_LOCK_PATH; kill switch: OPERATOR_KILL_SWITCH_PATH (data/operator/STOP).",
    "Execução real exige OPERATOR_EXECUTE=true, OPERATOR_LIVE_ACK=OWN_FUNDS_RISK_OPERATOR, OPERATOR_PRIVATE_KEY de carteira dedicada, --jev,",
    "OPERATOR_RPC_, OPERATOR_ROUTER_, OPERATOR_SPENDER_ e OPERATOR_SELECTORS_<chainIndex>; OPERATOR_TRUST_QUOTE_UNITS libera idas e voltas. Solana live está desligado.",
  ].join("\n");
}

function openLedger(ledgerPath: string, allowInit: boolean, historyExists: boolean, acceptHistory: boolean): { ledger: OperatorLedger; ready: boolean; note: string | null } {
  const file = readLedgerFile(ledgerPath);
  if (file.status === "corrupt") throw new UsageError(`Ledger corrompido em ${ledgerPath}: ${file.message}. Corrija ou mova o arquivo antes de continuar.`);
  if (file.status === "missing") {
    if (allowInit) {
      // Cumulative limits restart from zero; with existing history that must be an explicit choice (R8 C3).
      if (historyExists && !acceptHistory) throw new UsageError("Já existe histórico do operador sem ledger; os limites acumulados recomeçariam do zero. Repita com --init-ledger --accept-history se isso for intencional.");
      const state = initLedgerFile(ledgerPath);
      return { ledger: createOperatorLedger(state, ledgerFilePersister(ledgerPath)), ready: true, note: `ledger criado em ${ledgerPath}` };
    }
    // Without a file, cumulative limits have no memory: never execute; report only.
    return {
      ledger: createOperatorLedger(initLedgerFileInMemory(), () => {}),
      ready: false,
      note: historyExists ? "ledger ausente com histórico existente: execução bloqueada até --init-ledger" : "ledger ausente: rode --init-ledger antes de qualquer execução",
    };
  }
  return { ledger: createOperatorLedger(file.state, ledgerFilePersister(ledgerPath)), ready: true, note: null };
}

function initLedgerFileInMemory() {
  return { version: 1 as const, executedKeys: [], dailyNotionalUsd: {}, dailyPlans: {}, dailyRealizedUsd: {}, cumulativeRealizedUsd: 0, peakRealizedUsd: 0, openLegs: [], lastExecutionAtMs: null };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { console.log(usage()); return; }
  const flags = new Set(["--live", "--jev", "--loop", "--routers", "--init-ledger", "--accept-history", "--reconcile", "--realized"]);
  const reconcileIndex = args.indexOf("--reconcile");
  const realizedIndex = args.indexOf("--realized");
  const positional = [
    ...(reconcileIndex >= 0 ? args.slice(reconcileIndex + 1, reconcileIndex + 3) : []),
    ...(realizedIndex >= 0 ? args.slice(realizedIndex + 1, realizedIndex + 2) : []),
  ];
  for (const arg of args) if (!flags.has(arg) && !positional.includes(arg)) throw new UsageError(`Flag desconhecida: ${arg}\n${usage()}`);
  // A flag that belongs to another one must not be silently ignored while the cycle runs anyway (R10 B3).
  if (realizedIndex >= 0 && reconcileIndex < 0) throw new UsageError("--realized só vale junto de --reconcile <planId> <closed|failed>; sozinho ele seria ignorado.");
  if (args.includes("--accept-history") && !args.includes("--init-ledger")) throw new UsageError("--accept-history só vale junto de --init-ledger; sozinho ele seria ignorado.");
  const live = args.includes("--live");
  const useJev = args.includes("--jev");
  const loop = args.includes("--loop");
  const operator = loadOperatorConfig();
  const now = () => Date.now();
  // Every file writer owns one interval, including offline state/journal runs.
  // Pure router inspection does not write operator files.
  const readOnlyRouters = live && args.includes("--routers") && !args.includes("--init-ledger") && reconcileIndex < 0;
  const releaseLock = readOnlyRouters ? () => {} : acquireLock(operator.lockPath);
  const shutdown = () => { releaseLock(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  try {
  const historyExists = existsSync(operator.journalPath) || existsSync(operator.statePath);
  const { ledger, ready: ledgerReady, note: ledgerNote } = openLedger(operator.ledgerPath, args.includes("--init-ledger"), historyExists, args.includes("--accept-history"));
  if (ledgerNote) console.log(ledgerNote);
  if (args.includes("--init-ledger") && !live && reconcileIndex < 0) return;

  if (reconcileIndex >= 0) {
    // Manual reconciliation records the signed realized result (gas included, checked on chain) once per plan,
    // in the same write that changes the leg; that record is what feeds the daily, weekly and drawdown stops
    // (R8 C3, N7; R10 M1, M2). The value is mandatory unless the leg already carries one.
    const [planId, status] = positional;
    if (!planId || (status !== "closed" && status !== "failed")) throw new UsageError("Uso: --reconcile <planId> <closed|failed> --realized <usd assinado, gás incluído, conferido on-chain> (sem --realized só para uma perna que já tem resultado lançado)");
    const realizedUsd = realizedIndex >= 0 ? parseRealizedUsd(args[realizedIndex + 1], operator.policy.maxPlanUsd) : null;
    if (!ledgerReady) throw new UsageError("Ledger ausente; nada a reconciliar.");
    const leg = ledger.openLegs().find((entry) => entry.planId === planId);
    if (!leg) throw new UsageError(`Nenhuma perna aberta com planId ${planId}.`);
    if (realizedUsd === null && leg.realizedUsd === undefined) throw new UsageError(`--realized é obrigatório: o plano ${planId} ainda não tem resultado lançado. Confira as transações no explorer e repita com --realized <usd assinado, gás incluído>, por exemplo --realized -0.42.`);
    if (realizedUsd !== null && leg.realizedUsd !== undefined) throw new UsageError(`O plano ${planId} já tem resultado lançado (${leg.realizedUsd} USD) e o ledger aceita um único resultado por plano. Para só trocar o estado, repita sem --realized.`);
    const stamp = new Date().toISOString();
    ledger.reconcileLeg(planId, status, realizedUsd, now(), realizedUsd === null ? `manual_reconcile_${stamp}` : `manual_reconcile_${stamp}_realized_${realizedUsd}`);
    if (realizedUsd === null) console.log(`perna ${planId} (${leg.pairKey}) marcada como ${status}; o resultado já lançado (${leg.realizedUsd!.toFixed(4)} USD) não foi alterado.`);
    else console.log(`perna ${planId} (${leg.pairKey}) marcada como ${status}; resultado ${realizedUsd.toFixed(4)} USD registrado (dia ${ledger.dayRealizedUsd(now()).toFixed(4)}, semana ${ledger.weekRealizedUsd(now()).toFixed(4)}, drawdown ${ledger.drawdownUsd().toFixed(4)})`);
    return;
  }

  const killSwitchExists = () => existsSync(operator.policy.killSwitchPath);

  let inventorySource: () => Promise<InventorySnapshot>;
  let swapQuoter: SwapQuoter;
  let bridgeQuoter: BridgeQuoter | undefined;
  let defiSource: DefiSource;
  let fundingObservations: () => Promise<FundingObservation[]>;
  let executor: ExecutorDeps | undefined;
  let inventoryAddress: string;
  const model: OperatorModel = useJev ? new JevOperatorModel(config.jevModelId) : new MockOperatorModel();
  const liveGate = operatorLiveGate(operator, model.name);
    if (live) {
      if (!operator.okx) throw new UsageError("Configure OKX_WEB3_API_KEY, OKX_WEB3_API_SECRET e OKX_WEB3_API_PASSPHRASE.");
      if (!operator.address) throw new UsageError("Configure OPERATOR_ADDRESS com o endereço público da carteira observada.");
      inventoryAddress = operator.address;
      const address = operator.address;
      const portfolio = createOkxPortfolioClient({ credentials: operator.okx, allowLiveRequests: true });
      const trade = createOkxTradeClient({ credentials: operator.okx, allowLiveRequests: true });
      inventorySource = async () => {
        const assets = await portfolio.allTokenBalances(address, operator.chains, false);
        return normalizeInventory({ address, queriedChains: operator.chains, assets, observedAtMs: now(), source: "okx_balance_api", riskTokensExcluded: true });
      };
      swapQuoter = okxSwapQuoter(trade, now, operator.policy.maxPriceImpactPercent, operator.trustQuoteUnits);
      bridgeQuoter = okxBridgeQuoter(trade, now, 0.5, operator.trustBridgeApi);
      defiSource = okxDefiSource(trade, (chainIndex, token) => DEFAULT_PAIRS.find((pair) => pair.chainIndex === chainIndex && pair.base.tokenContractAddress.toLowerCase() === token.toLowerCase())?.base.symbol ?? null);
      const funding = okxPublicFundingSource(fetch, now);
      fundingObservations = () => funding.fundingRates(DEFAULT_FUNDING_INSTRUMENTS);
      if (args.includes("--routers")) {
        for (const pair of DEFAULT_PAIRS) {
          if (!operator.chains.includes(pair.chainIndex) || chainByIndex(pair.chainIndex)?.kind !== "evm" || !/^0x[0-9a-fA-F]{40}$/.test(address)) continue;
          try {
            const prepared = await prepareEvmSwap(trade, { chainIndex: pair.chainIndex, fromTokenAddress: pair.base.tokenContractAddress, toTokenAddress: pair.counter.tokenContractAddress, amountAtomic: "1", slippagePercent: 0.5, userWalletAddress: address });
            console.log(`OPERATOR_ROUTER_${pair.chainIndex}=${prepared.to}  # ${chainByIndex(pair.chainIndex)?.name}: confira no explorer antes de usar; selector observado ${prepared.data.slice(0, 10)}`);
          } catch (error) {
            console.log(`# ${chainByIndex(pair.chainIndex)?.name} (${pair.chainIndex}): router não obtido: ${error instanceof Error ? error.message.slice(0, 80) : "erro"}`);
          }
        }
        return;
      }
      const evmSigner = liveGate.live && ledgerReady ? await createEthersEvmSigner(operator.evmPrivateKey!, operator.rpcByChain, operator.policy.maxFeeGwei) : undefined;
      if (!liveGate.live) console.log(`execução real desligada: ${liveGate.reasons.join("; ")}`);
      else if (!ledgerReady) console.log("execução real desligada: ledger ausente");
      executor = { tradeClient: trade, evmSigner, ledger, policy: operator.policy, inventoryAddress: address, now, slippagePercent: 0.5, killSwitchExists };
    } else {
      inventoryAddress = "synthetic";
      inventorySource = async () => syntheticInventory(now());
      swapQuoter = syntheticSwapQuoter(now);
      bridgeQuoter = syntheticBridgeQuoter(now);
      defiSource = syntheticDefiSource();
      fundingObservations = async () => syntheticFunding(now);
    }
    const gate = {
      operatorExecute: operator.execute,
      operatorLiveAck: operator.liveAck,
      realModel: model.name !== "mock",
      signerAvailable: executor?.evmSigner !== undefined,
    };

    const once = async () => {
      const funding = await fundingObservations();
      const cycle = await runOperatorCycle({
        inventorySource, model, policy: operator.policy, gate, now,
        candidateContext: { swapQuoter, bridgeQuoter, defiSource, homeChainIndex: "143", extraCandidates: buildFundingCandidates(funding, operator.policy.inferenceUsdPerCandidate) },
        executor, ledger, killSwitchExists,
        jevUsdPerMTok: useJev ? config.jevUsdPerMTok : 0,
      });
      persistCycle(cycle, operator.statePath, operator.journalPath);
      const chains = cycle.inventory.chains.map((chain) => `${chain.chainName} ${chain.knownValueUsd.toFixed(2)} USD${chain.valueComplete ? "" : " (parcial)"}`).join(" | ");
      console.log(`[${new Date(cycle.startedAtMs).toISOString()}] ${live ? `LIVE ${inventoryAddress.slice(0, 6)}...` : "SYNTHETIC"} ${model.name} perfil ${operator.profile} inventário ${cycle.inventory.knownValueUsd.toFixed(2)} USD${cycle.inventory.valueComplete ? "" : " (parcial)"}: ${chains}`);
      for (const candidate of cycle.candidates) {
        const verdict = cycle.verdicts.find((entry) => entry.candidateId === candidate.id)!;
        const chain = candidate.kind === "perp_funding_carry" ? "OKX Exchange" : chainByIndex(candidate.chainIndex)?.name ?? candidate.chainIndex;
        console.log(`  ${verdict.eligible ? "ELEGÍVEL " : "rejeitado"} ${candidate.id} [${candidate.kind}] ${chain} size ${candidate.sizeUsd ?? "?"} USD net ${candidate.netUsd === null ? "?" : candidate.netUsd.toFixed(6)} USD${verdict.reasons.length ? " " + verdict.reasons.join(",") : ""}`);
      }
      if (cycle.decision) {
        const top = Object.entries(cycle.decision.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, value]) => `${key} ${(value * 100).toFixed(0)}%`).join(" ");
        console.log(`  Jev (${cycle.decision.model}) escolheu ${cycle.decision.choice} em ${cycle.decision.latencyMs.toFixed(0)} ms: ${top}`);
      } else {
        console.log("  Nenhum candidato elegível; Jev não foi consultado.");
      }
      console.log(`  plano ${cycle.plan ? `${cycle.plan.planId} ${cycle.plan.executionQualification}` : "nenhum"}; execução ${cycle.execution.status} (${cycle.execution.reasons.join("; ")})`);
      if (cycle.ledger) console.log(`  ledger hoje ${cycle.ledger.dayPlans} planos / ${cycle.ledger.dayNotionalUsd.toFixed(2)} USD; realizado dia ${cycle.ledger.dayRealizedUsd.toFixed(4)} semana ${cycle.ledger.weekRealizedUsd.toFixed(4)} drawdown ${cycle.ledger.drawdownUsd.toFixed(4)} USD; legs abertas ${cycle.ledger.openLegs.length}${cycle.ledger.killSwitch ? "; KILL SWITCH ativo" : ""}`);
      if (cycle.execution.observedBalanceDeltaUsd !== undefined) console.log(`  variação observada do inventário (preços anteriores): ${cycle.execution.observedBalanceDeltaUsd === null ? "desconhecida" : cycle.execution.observedBalanceDeltaUsd.toFixed(4) + " USD"}; atribuição à operação pendente`);
      if (cycle.execution.realizedUsd !== undefined) console.log(`  resultado realizado atribuído deste plano: ${cycle.execution.realizedUsd === null ? "desconhecido" : cycle.execution.realizedUsd.toFixed(4) + " USD"}`);
      if (cycle.decision) console.log(`  provisão de inferência por tokens de entrada: ${cycle.inferenceUsd === null ? "desconhecida" : cycle.inferenceUsd.toFixed(6) + " USD"} (não representa a fatura completa confirmada)`);
    };

    await once();
    while (loop) {
      await Bun.sleep(operator.intervalMs);
      try { await once(); } catch (error) { console.error(`ciclo falhou: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`); }
    }
  } finally {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    releaseLock();
  }
}

main().catch((error) => {
  console.error(error instanceof UsageError ? error.message : error instanceof Error ? error.message.slice(0, 200) : String(error));
  process.exit(1);
});
