# Fontes de vantagem (edge) para carteira pequena, spot, Solana

Data: 2026-10-17. Catálogo de hipóteses com o nível de evidência encontrado. **Nenhuma entrada abaixo prova retorno líquido para uma carteira de cerca de US$ 121 operando spot em Solana por um ciclo de 1 minuto.** O catálogo existe para dizer onde procurar e como testar em sombra, não para prometer. Fontes por afirmação: [evidence/pesquisa-t09-edge-on-chain.md](evidence/pesquisa-t09-edge-on-chain.md) e [evidence/pesquisa-t10-edge-estrutural.md](evidence/pesquisa-t10-edge-estrutural.md). Escopo atual decidido pelo dono (2026-10-15): somente spot e somente Solana, sem alavancagem, caixa não vai a empréstimo.

Escala de evidência: **P** primária (artigo revisado, documentação, código, dado medido no projeto); **S** secundária (fornecedor, blog, imprensa, working paper não revisado); **0** nenhuma encontrada.

## 1. Direcionais

| Fonte | Mecanismo | Evidência encontrada | Nível | Limite para a nossa escala | Teste em sombra |
| --- | --- | --- | --- | --- | --- |
| Momentum e rompimento de volume | continuação de tendência | Liu, Tsyvinski e Wu (Journal of Finance 77(2), 2022): três fatores (mercado, tamanho, momentum) explicam o corte transversal de retornos de cripto; horizonte semanal ou mensal, ativos grandes. No projeto, o motor de oportunidades (RAS-7) usou candles diários da OKX (27.263 pares-dia, 170 pares líquidos, 2025-08-31 a 2026-10-10, custo de 0,2% por volta) e **não superou a média dos pares no mesmo dia** | P | extrapolar para 1 minuto em memecoin é hipótese; o backtest é diário, não testa a meta | markout de 1, 5 e 15 min dos candidatos de momentum, custo real, janela de validação separada |
| Lançamentos e migração do pump.fun | cauda de retorno após a graduação | taxa de graduação: cerca de 1,4% (um mês de 2026, Dune via Solana Compass) a 6,7% (pico de um dia em julho de 2026 com o mecanismo BOOST, The Block); graduação perto de 85 SOL na curva (outra fonte diz 80) | S | pump.fun é dominado por rug e pump-and-dump (ver linha de fraude); os números de sobrevivência de liquidez e de mediana de tempo foram **retirados** por falta de fonte | `subscribeNewToken` e `subscribeMigration` (grátis) em sombra; medir o retorno líquido por token com saída rápida e custo de sanduíche e gorjeta |
| Seguir smart money e baleias (OnchainOS signals, rastreador) | informação de carteiras | o repo tem trilha de carteiras rastreadas e rotas Premium sem uso (top-traders, holders, clusters); o ADENDO-E trata o preço de entrada da carteira como referência histórica, sem garantia de saída | 0 | não medido aqui; depende da latência de descoberta | se o fato novo muda a resposta do Jev e separa compras que subiram das que caíram, markout de 1, 5 e 15 min (folga Premium de cerca de 5100 chamadas por dia, segundo o mapa) |
| Reversão à média após queda | sobrerreação | nenhuma fonte primária encontrada | 0 | atrito de 0,42% a 2,1% | sombra |
| Fluxo do agressor e desequilíbrio do book (bolsa) | pressão de ordens | o pulso já calcula equilíbrio de fluxo agressor de 5 min e volatilidade de 15 min para BTC e SOL | 0 | cobre só ativos da bolsa; a carteira opera tokens fora dela | sombra no conjunto interseção bolsa x Solana |
| Listagens e eventos | informação pública | não pesquisado nesta rodada | 0 | | |

## 2. Estruturais e entre venues

| Fonte | Mecanismo | Evidência encontrada | Nível | Limite para a nossa escala | Teste em sombra |
| --- | --- | --- | --- | --- | --- |
| Deslocamento bolsa x DEX do mesmo ativo | informação lidera em um dos lados | Makarov e Schoar (Journal of Financial Economics 135(2), 2020): 34 bolsas em 19 países, desvios recorrentes e maiores entre países que dentro deles, ligados a controles de capital; componente comum explica 80% dos retornos de BTC (dados de 2017 e 2018). AFT 2025 (arXiv 2507.13023), Ethereum, 19 meses: cerca de US$ 233,8 milhões extraídos por 19 searchers em cerca de 7,2 milhões de arbitragens, três searchers com cerca de três quartos. **Nenhum estudo de CEX-DEX em Solana encontrado.** Working paper não revisado (Zenodo, dois dias de dados de 1 min): correlação de 0,98 a 0,99 e desvio médio absoluto de 0,06% a 0,08% entre DEX e CEX; liderança da bolsa em BTC, da DEX em ETH e SOL | P (Ethereum); S (Solana) | em majors o desvio médio é menor que o custo executável; o executor atual não faz arbitragem atômica de duas pernas | E0 classe 3 do ADENDO-E no conjunto de tokens listados nos dois lados, com bid/ask executável e duas pernas; custo desconhecido permanece desconhecido |
| Arbitragem entre pools Solana (cíclica, triangular) | preço diferente entre rotas | escala de ecossistema (fonte secundária, Helius com dados do detector da Jito): 90.445.905 arbitragens bem-sucedidas no "último ano", lucro médio de US$ 1,58, US$ 142,8 milhões no total; outro relatório da mesma fonte diz que mais de 50% das transações são arbitragens falhas (spam), confiança baixa | S | disputada por searchers com latência e atomicidade; um bundle exige gorjeta (mínimo 1000 lamports) | sombra apenas; não é prioridade |
| Depeg de stablecoin | restabelecimento do peg | em Ethereum, USDT voltou a 0,998 em menos de 24 h (2022) e USDC em 2 a 3 dias (2023); **nada em minutos, nada em Solana** | 0 a S | | |
| Captura de taxa de LP | taxa menos perda impermanente | guias divergem (84% a 88% das taxas ao LP; APY de 4% a 50% conforme a faixa); nenhum estudo primário de retorno líquido em Solana | S | sai de faixa, taxa zero | simulação com dados históricos de pool, não APY promocional |
| Liquidações e backrun | bônus do liquidante | Kamino: US$ 156,9 milhões liquidados em 2025, bônus médio de 0,8% (T1) para 0,14% (T4), 208 liquidantes únicos, a própria Kamino cita concorrência | P (Kamino) | exige inventário de token de dívida: fora do spot atual | só sombra |
| Basis e funding | prêmio entre spot e perpétuo | não pesquisado | 0 | **fora do escopo** (decisão de 2026-10-15) | |
| Airdrops e eventos | | não pesquisado | 0 | | |

## 3. Fatos de ambiente que mudam a conta

- **Fraude e rug pull.** arXiv 2603.24625: 76.469 de 100.063 tokens (Orca, Raydium, Meteora, primeiro semestre de 2025) rotulados como rug pull por regras de comportamento, com falso positivo de 0,26% numa auditoria manual de 382 rótulos. Solidus Labs (fornecedor): 98,7% dos tokens do pump.fun com características de pump-and-dump. Entrada indiscriminada tem expectativa muito negativa; qualquer fonte de edge precisa de um filtro de sobrevivência e de saída. Honeypot de contrato é raro em Solana; o risco é de liquidez e social (afirmação não verificada).
- **Sanduíche como custo.** Ver [arquitetura-e-decisao.md](arquitetura-e-decisao.md), seção 7.
- **Latência.** ShredStream da Jito: fornecedores falam em 33 a 200 ms de vantagem; um benchmark independente de fornecedor concorrente mediu p99 de 81,5 ms em Nova York. Para um ciclo de 60 s, 80 ms é irrelevante; para disputa por slot (400 ms) não é.
- **Alpenglow** (finalidade de cerca de 150 ms, ativação noticiada para 2026-10-21, fonte secundária) pode mudar o comportamento dos bots e o risco de reorganização para execução armada; acompanhar e medir antes e depois.

## 4. Leitura

1. As regiões da literatura que chegam mais perto de retornos por minuto na escala da meta são **episódicas**: janelas de lançamento, deslocamentos entre venues e eventos de liquidação, nunca um retorno contínuo a cada minuto. Isso casa com a decomposição em janelas de [matematica-da-meta.md](matematica-da-meta.md): lambda x R.
2. O caminho de menor atrito entre as hipóteses acima e o projeto é medir **janelas** (frequência, retorno líquido, custo) no conjunto de tokens para o qual já existe dado barato: o interseção entre os 445 ativos-base da bolsa e os tokens Solana negociáveis (217 símbolos-base da bolsa aparecem no registro de tokens da Jupiter, mas por símbolo, sem confirmar que o contrato é o mesmo: **identidade por endereço é pré-requisito**).
3. Dois itens da escada precisam de dado que o repositório não tem: minuto ou tick de memecoin Solana com licença para backtest, e retorno líquido por ciclo com custos reais. Sem eles, a meta de 1 minuto não tem como ser testada fora da sombra ao vivo.

## 5. Perguntas abertas

- Existe dado de tick ou de minuto de memecoin Solana com licença de uso para backtest?
- Qual o custo real de sanduíche e gorjeta por compra de US$ 10 a US$ 30 em memecoin nas condições atuais?
- A OKX conta no teto de cota as tentativas que voltam com erro?
- A latência de descoberta de lançamentos via PumpPortal e de migrações é compatível com uma janela de segundos?
