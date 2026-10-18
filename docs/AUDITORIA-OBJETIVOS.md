# Auditoria dos objetivos: Jev como operador financeiro da carteira OKX

Data: 2026-10-10. Compara cada item pedido nos objetivos (operador financeiro, OKX Wallet via Web3 em todas as redes, central de decisões dinâmica, risco e retorno, alavancagem) com o que existe no código da branch `feature/okx-operator`. Estado: **feito**, **parcial** ou **ausente**, com o motivo e o próximo passo.

| Objetivo | Estado | Onde | Observação |
| --- | --- | --- | --- |
| Jev decide compra e venda no MON/USDC em cada bloco (demo original) | feito | `src/trader.ts`, `src/model.ts` | Preservado; a central não altera o loop por bloco. |
| Jev como operador que escolhe entre oportunidades ou mantém | feito | `src/operator/jev-selector.ts` | Pergunta `choice` do TypeSafe com `hold` mais ids elegíveis; resposta validada contra o conjunto. |
| Integração com a OKX Wallet via Web3 | feito | `web/src/lib/okx-wallet.ts`, `okx-solana.ts` | Provider EVM e provider Solana da extensão; somente leitura e conexão explícita. |
| Saldos em todas as redes, não só X Layer | feito | `web/src/lib/evm-multichain.ts`, `src/okx-wallet/portfolio.ts` | 8 redes EVM por RPC pública no navegador; até 50 redes pela Balance API no backend; Solana pela extensão e pela API (endereço próprio). |
| Coletar dados de todo o ecossistema OKX | parcial | `src/okx-wallet/trade.ts`, `defi.ts`, `src/operator/funding.ts`, scanners existentes | Swap, cross-chain, DeFi search, funding público e Meme Pump cobertos; Signals e Alpha Radar existem como scanners separados e ainda não entram como candidatos. |
| Candidatos com maior potencial e probabilidade | feito | `src/operator/candidates.ts`, `risk-gate.ts` | Líquido conservador após custos, impacto, idade da cotação e motivos de rejeição; probabilidade de escolha vem do Jev. |
| Cálculo de risco e retorno | parcial | `src/operator/insights.ts`, `web/src/lib/operator-center.ts` | Retorno em bps, impacto, idade, custos e rótulo de risco por candidato; histórico por tipo com taxa de elegibilidade, escolha e acerto. Falta calibração estatística (intervalos) por falta de histórico real. |
| Central de decisões dinâmica na interface | feito | `web/src/components/DecisionCenter` | Atualiza a cada 5 s, mostra KPIs, pesos do Jev, tabela de candidatos, limites do dia, patrimônio por rede, histórico e sparkline. |
| Execução real nas redes | parcial | `src/operator/executor.ts` | EVM com duas pernas, allowlists obrigatórias de router, spender e selector, value e gas conferidos, simulação por eth_call. Solana desligado em código até haver política de transação; Tron, Sui, TON e Bitcoin sem signatário. Live só com os gates próprios do operador abertos pelo usuário. |
| Limites, kill switch e reconciliação | parcial | `src/operator/ledger.ts`, `cycle.ts`, CLI | Teto diário, planos por dia, cooldown, pernas abertas. Paradas diária, semanal e de drawdown só recebem dados pelo `--reconcile ... --realized` manual: cada plano concluído bloqueia o operador até essa reconciliação. R5 e R8 mantêm o live vetado; ver OKX-OPERADOR-JEV.md seções 2b e 2c. |
| Alavancagem exponencial | ausente por decisão | `src/operator/funding.ts`, `docs/OKX-OPERADOR-JEV.md` | Funding carry só como pesquisa. A carteira Web3 não tem margem na OKX Exchange e o carry medido fica abaixo do título público; alavancagem multiplica perdas e liquidação. Não há posição alavancada no código. |
| Lucro realizado | ausente | ledger `dailyRealizedUsd` | Só aparece após execução real reconciliada; depende de credenciais, carteira dedicada e abertura dos gates. |

## Decisões de arquitetura para o Jev decidir melhor

1. **Estado enxuto e tipado**: o Jev recebe somente números e rótulos (tamanho, líquido, bps, impacto, custos, idade) de candidatos já aprovados pelo gate. Menos ruído, menos tokens e nenhuma possibilidade de o texto do modelo virar instrução.
2. **Gate antes da inferência**: Jev só é consultado quando há elegíveis; ciclos vazios não custam inferência (`cycle.ts`).
3. **Perfis de política por fase** (`OPERATOR_PROFILE`): `micro` por padrão, `standard` para pesquisa; variáveis explícitas sobrepõem.
4. **Trust flags** para unidades e contratos não documentados (`OPERATOR_TRUST_QUOTE_UNITS`, `OPERATOR_TRUST_BRIDGE_API`): decisão humana explícita antes de dinheiro real.
5. **Histórico como insumo** (`GET /operator/insights`): taxa de elegibilidade, escolha e acerto por tipo. Próxima etapa: incluir esses agregados no estado enviado ao Jev para que ele pondere tipos com histórico ruim.
6. **Reconciliação manual com diagnóstico por saldo**: depois de um plano concluído o ciclo relê o inventário e informa a variação observada só como diagnóstico (`observedBalanceDeltaUsd`), sem atribuí-la ao plano; o resultado realizado fica desconhecido e o operador fica bloqueado até `--reconcile <planId> <closed|failed> --realized <usd>`, que alimenta as paradas diária, semanal e de drawdown.

## Próximas integrações sugeridas, em ordem

1. Rodar `--live --jev --loop` em dry run para acumular histórico real e calibrar `minNetUsd` e `maxPriceImpactPercent`.
2. Entrar com Signals e Alpha Radar como candidatos `research_only` com score, usando os scanners existentes.
3. Passar os agregados do histórico para o estado do Jev.
4. Estimar o custo de subscribe DeFi pelo endpoint de transação para tirar o `costs_incomplete` do rendimento.
5. Após qualificação independente (R5 da sessão paralela), abrir os gates com carteira dedicada.
