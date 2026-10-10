# INONU TRADER — meta de engenharia vigente

Evoluir o INONU TRADER, integrado à OKX Wallet via Web3, para buscar crescimento composto e uso eficiente de capital comparando modalidades qualificadas: trading spot, futuros/funding, arbitragem de swaps/entre venues e rendimento. Classificar oportunidades por retorno líquido conservador, custos, liquidez, exposição, margem e liquidação. Alavancagem depende de validação própria; ganhos extraordinários relatados não são evidência nem promessa.

Usar como recursos verificados `docs/OPPORTUNITY-ARCHITECTURE.md`, `src/backtest.ts` e `scripts/backtest.ts`. Descobrir fontes, contratos, dados históricos, acesso, unidades, validade e custos necessários antes de implementar cada adapter; lacunas permanecem desconhecidas e impedem aprovar a modalidade.

Entregar inventário e scanner elegíveis de X Layer, adapters expansíveis, cálculo econômico determinístico, ranking, limites de capital/perda, simulação paper e reconciliação. Reinvestir somente ganhos líquidos realizados e conciliados. Preparar supervisor para funcionamento 24 horas com journal, checkpoints, idempotência, cancelamento, retomada e interrupção diante de dados ou contabilidade divergentes; registrar a duração realmente observada.

Verificar em três passagens: testes de cálculos, precisão, custos, limites e falhas; backtests reproduzíveis com separação temporal entre seleção e avaliação, dados fora da amostra, horizontes curto/médio/longo declarados e cenários de taxas, slippage, latência, fills e liquidação; simulação reconciliada, recuperação após interrupção, tipos/build e revisão/auditoria independentes contra critérios congelados. Cobertura insuficiente não autoriza inferir retorno diário ou de longo prazo. Backtest positivo não garante lucro futuro.

Concluir cada entrega somente com código exercitado, fontes/hashes, critérios cobertos e limitações documentadas no repositório. Comparar retorno líquido e drawdown, preservando o saldo real durante testes. Preparar execução revisável; transações, ordens, assinaturas, approve, pagamentos e operação real exigem autorização financeira explícita com limites. Preservar mudanças concorrentes, sigilo e ledgers.

Escolhas técnicas seguem a delegação ao Jev com recibos reais; fatos não são inventados. Desenvolver e validar esse sistema no INONU TRADER é a meta: trabalhar autonomamente nas entregas elegíveis, sem pedir “continue”, respeitando autorização, pausas e limites nativos.
