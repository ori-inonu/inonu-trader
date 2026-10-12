# Auditoria da integração de dados OKX/Web3

Data: 2026-10-11. Baseline do código: `055a637f27f28cbf357cfb492534f7ed33d9b68f`. Esta entrega é uma auditoria documental de interfaces existentes; não implementa um adaptador, não altera a SPEC congelada e não qualifica operações financeiras.

## Resultado

O projeto já dispõe de clientes de leitura OnchainOS para Signals, Leaderboard e DeFi. Criar outra camada HTTP para essas mesmas famílias duplicaria trabalho. A ligação com os relatórios econômicos ainda precisa de um contrato explícito: o resultado normalizado dos clientes não satisfaz diretamente os formatos de captura e observação dos relatórios existentes.

A investigação foi limitada a essas interfaces, ao gravador e aos contratos locais. Não certifica toda a integração do bot, todas as funcionalidades da Wallet ou acesso real às APIs.

## Interfaces e limites observados

| Recurso | Base existente | Lacuna para a decisão do GEV |
| --- | --- | --- |
| Signals | `createSignalsClient().signals()` em `src/onchainos/signals.ts` produz `Read<SignalRow[]>`, com cadeia, endereço do token, relógio e atributos numéricos. | `joinEvidence()` em `src/okx-evidence/report.ts` exige `okx_signals_observations_v1` e o relatório do scanner, incluindo query e origem declarada. É necessária uma conversão especificada; `Read<SignalRow[]>` não é esse relatório. |
| Leaderboard | O mesmo cliente lê o ranking, com filtros REST próprios, até 20 linhas e até três tokens por linha. | `LeaderboardRow` descarta deliberadamente o endereço da carteira. O resultado serve para atributos agregados; não permite selecionar ou acompanhar uma carteira por endereço. O contexto de cadeia da consulta também deve acompanhar os tokens do ranking. |
| DeFi | `createDefiReadClient()` em `src/onchainos/defi-read.ts` oferece busca, detalhe, séries de taxa/TVL/profundidade e descoberta de cadeias/plataformas. | `buildDefiReport()` em `src/okx-defi/report.ts` exige `okx_defi_capture_v1`, endpoint, origem declarada, captura local e envelope `response.code === 0` com `response.data`. O modelo normalizado não preserva esse envelope nem todas as representações literais. |
| Gravação Web3 | `createOnchainosCaptureSource()` em `src/onchainos/capture-sources.ts` utiliza o cliente de preços e grava `mark` e `candle` para o laboratório. | Essa fonte não grava Signals, Leaderboard, DeFi ou Meme Pump. Os clientes de leitura dessas famílias e o gravador atual são capacidades distintas. |
| Custos e retorno | Os relatórios de evidência e DeFi mantêm execução não qualificada e retorno líquido desconhecido. | As leituras analisadas não fornecem uma prova completa de custo de entrada e saída, venda executável, resgate, disponibilidade de capital ou lucro realizado. |

O gravador público OKX v5 tem outras espécies (`ticker`, `funding`, `mark`, `candle`, `book`, `oi`), que não ampliam por si só a cobertura de recursos da Wallet. O catálogo e os clientes existentes não demonstram elegibilidade pessoal para Rewards, equivalência com Alpha Radar ou oportunidades lucrativas de arbitragem.

## Informação que uma futura ligação precisa preservar

1. **Identidade e consulta.** Manter cadeia e endereço do token; para DeFi, cadeia e `investmentId`. Preservar os filtros enviados. Os códigos de categorias de Signals e Leaderboard são diferentes; os códigos do CLI também não devem ser copiados para o REST sem conversão específica.
2. **Relógios.** `ReadMeta.requestedAtMs` e `receivedAtMs` são relógios locais do transporte. Não representam o instante de mercado do provedor. `readEpochMsByExample()` reconhece milissegundos por plausibilidade e continua uma interpretação heurística. Não converter isso em unidade declarada ou garantia de atualização.
3. **Origem e envelope.** `Read<T>` guarda o valor normalizado e metadados, não o corpo bruto do provedor. `ReadMeta.endpoint` guarda o caminho sem query. Não reconstruir uma suposta captura original a partir de valores já normalizados. Um futuro mecanismo de captura deve definir o que realmente preserva e sua verificação, sem tratar hash local ou `sourceClaim` como prova de autenticidade.
4. **Unidades e representações.** A busca DeFi declara taxa anunciada em fração decimal e TVL em USD; detalhe e séries conservam unidades desconhecidas quando o contrato não as declara. A cotação de `mark` da fonte Web3 permanece `priceQuote: "unknown"`. Preservar também números literais quando exigidos pelos relatórios; a conversão normalizada pode perder essa representação.
5. **Cobertura e interpretação.** Um ranking limitado e a busca DeFi paginada não demonstram cobertura completa. PnL histórico e taxa anunciada não são retorno líquido futuro. Suporte a investir/resgatar/claim não prova que a carteira do usuário pode fazê-lo.

## Próximo ponto de implementação, quando elegível

Reutilizar os clientes e o transporte existentes. Definir adaptadores explícitos para os contratos dos relatórios, com exemplos de entrada reais ou sintéticos identificados, sem inventar envelopes. Se a análise exigir endereços de carteiras do Leaderboard, especificar uma extensão de identidade separada antes de utilizar esse dado. A gravação de novas famílias também precisa de contrato de eventos próprio; não inserir esses eventos como se fossem preços ou candles.

A SPEC do relatório combinado em `docs/okx-ecosystem-v1/SPEC.md` permanece inalterada, inclusive seus critérios EC1–EC7. Rewards, portfólio e Alpha Radar não foram incluídos nessa entrega. O gate local permanece em auditoria concluída, revisão 46; a tentativa anterior de `begin_cycle` retornou `stale_evidence`. Esta auditoria não renova cobertura terminal nem autoriza mudança do harness.

Para decisões de compra, venda, resgate ou reinvestimento, ainda são necessários preços comparáveis, saída executável, custos completos, restrições de acesso e reconciliação dos fluxos de capital. Nenhum retorno ou crescimento composto foi demonstrado por esta entrega.

## Verificação e critérios da auditoria

- `bun --no-env-file test src/onchainos scripts/onchainos-capture.test.ts --timeout 15000`: **309 passaram, zero falhas**, 4.667 expectativas, 16 arquivos. São testes locais com fixtures e transporte controlado, incluindo chamadas de `runCli` com I/O injetado; não exercitam o CLI em subprocesso nem comprovam acesso live.
- `bun --no-env-file run typecheck`: **exit 0**, comando `tsc --noEmit -p tsconfig.verification.json`. Não inclui o typecheck separado do frontend.
- Baseline de 41 arquivos e logs exatos preservados localmente em `C:/Users/gabri/.codex/tmp/okx-data-audit-01a1221e-20261011/` e `.scratch/okx-ecosystem-v1/data-audit20-*`.

Critérios imutáveis para a revisão independente desta entrega:

- DA1: cada ligação ou lacuna da tabela deve corresponder às interfaces do baseline fornecido.
- DA2: distinguir dado normalizado, captura bruta, relógio local, relógio heurístico e origem não verificada, sem elevar sua certeza.
- DA3: não afirmar implementação nova, cobertura completa, acesso live, elegibilidade, lucro ou autorização financeira.
- DA4: preservar EC1–EC7 e o gate terminal; registrar somente documentação nova, sem alterar código ou trabalho concorrente.
- DA5: reportar testes e typecheck com seus limites reais e preservar hashes das fontes usadas.

