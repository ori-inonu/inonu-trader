# Qualificação, em leitura, de todos os ativos da conta Solana (2026-10-14)

Pedido: o Codex pediu mint, programa, rota de saída (cotação), segurança e liquidez de **todos** os ativos da conta Solana atual, com fonte e instante, usando só a sessão existente. Feito **somente em leitura**: nenhum login novo, nenhuma venda, transferência ou aprovação, nenhum segredo lido ou copiado. Gerado em 2026-10-14T17:25:04Z (UTC) por um roteiro de leitura que não fica no repositório.

| Dado | Fonte | Instante |
| --- | --- | --- |
| ativos, quantidades e valores | `onchainos wallet balance --chain solana` (sessão existente) | 2026-10-14T17:25Z, no começo da execução |
| programa do token, autoridades, extensões | RPC público da Solana, `getMultipleAccounts` com `jsonParsed` | 2026-10-14T17:25Z |
| preço, liquidez, volume, detentores | OnchainOS `price-info` pelo gateway local (as credenciais ficam no servidor local) | `meta.ageMs` 0 (leitura na hora) |
| segurança | OnchainOS `token-risk` (advanced-info) pelo gateway local | idem |
| rota de saída | `onchainos swap quote` de cada ativo, **saldo inteiro**, para USDC (cotação, nada é assinado) | coluna "Instante" da tabela 3 |

Total lido: 13 ativos, US$ 129.56 (preços de memecoins mudam em minutos: dois instantes da mesma execução diferem em alguns por cento).

## 1. Mint, programa e autoridades

| Ativo | Mint | Programa | Autoridade de emissão | Autoridade de congelamento | Extensões (Token-2022) |
| --- | --- | --- | --- | --- | --- |
| Chonk | `2UfsAijU7msunH4yrSoR7ZmV9tb5z4qEXWeKVaCqpump` | Token-2022 | nenhuma | nenhuma | metadataPointer, tokenMetadata |
| Pedro | `3ME1VBnWV6qdCSrKNndCqteS6LHRoM4nFcV99AeHpump` | Token-2022 | nenhuma | nenhuma | metadataPointer, tokenMetadata |
| PINCHA | `EZ7RFLpHv14NK8b6wQuRefLvspYTy1TFpj5756TKpump` | Token-2022 | nenhuma | nenhuma | metadataPointer, tokenMetadata |
| MIKAN | `FbzHW79wqjB614fhTfCtEVyhT2w1Yngmb4tpB8dJpump` | Token-2022 | nenhuma | nenhuma | metadataPointer, tokenMetadata |
| CARDBACK | `7e5H5fZsheG5KiuS8J1BU5j5U7mEqCaqNqfp3oSqPCFW` | SPL Token | nenhuma | nenhuma | nenhuma |
| Abdulrahman | `fvT29UywGTM7wgRv5RCYpjtH1N9QKCM9LXyw53Tpump` | Token-2022 | nenhuma | nenhuma | metadataPointer, tokenMetadata |
| PEDRO | `FY6CZ5JZMYcKfboBYKqqBVkhbknfjUELqAFiq2Qupump` | Token-2022 | nenhuma | nenhuma | metadataPointer, tokenMetadata |
| ZECHOOKS | `Fud2nfbjCtmCWaST6UMt5v9xV9DXhaG1YS92EQkqpump` | Token-2022 | nenhuma | nenhuma | metadataPointer, tokenMetadata |
| KACY | `3zKe2553BfmRzb89zTzb7qD9Nz7VeyXqGXnTKxBFpump` | Token-2022 | nenhuma | nenhuma | metadataPointer, tokenMetadata |
| CMG | `CMGi497VQA9RiHVWpQi5B847vN8RLaEwcMhB5kEUhkAQ` | Token-2022 | **SIM** | **SIM** | metadataPointer, permanentDelegate, defaultAccountState, pausableConfig, confidentialTransferMint, transferHook, scaledUiAmountConfig, tokenMetadata |
| SOL | `11111111111111111111111111111111` | nativo (SOL) | n/a | n/a | n/a |
| MAIL | `EAEGkLq6YXXzuQBuMY3n8kmqAZjz9cyHvHQUXSu5GNwz` | Token-2022 | nenhuma | nenhuma | metadataPointer, tokenMetadata |
| DOGE | `DoGEV7LASBkQbibMc5k5vKnTZoMg423GpJ5QtJEGfm7R` | SPL Token | **SIM** | nenhuma | nenhuma |

## 2. Liquidez e segurança

`Risco` é o `riskLevel` do OnchainOS (1 baixo, 2 médio, 3 alto). Liquidez em US$. `Rugs do criador` é `devRugCount`.

| Ativo | US$ na conta | Liquidez (US$) | Detentores | Var. 24 h (%) | Risco | Top 10 (%) | Rugs do criador | Marcas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chonk | 31.59 | 26,558 | 416 | -21.03 | 1 | 25.6049 | 0 | devHoldingStatusSellAll, smartMoneyBuy, volumeChangeRateVolumePlunge, dexScreenerTokenCommunityTakeOver, dsPaid |
| Pedro | 27.74 | 8,552 | 550 | 80.65 | 1 | 27.5023 | 0 | devHoldingStatusSellAll, smartMoneyBuy, volumeChangeRateVolumePlunge, dexScreenerTokenCommunityTakeOver, dsPaid |
| PINCHA | 19.75 | 4,334 | 456 | -97.92 | 3 | 16.3858 | 16 | lowLiquidity, devHoldingStatusSellAll, smartMoneyBuy, dexScreenerTokenCommunityTakeOver, dsPaid |
| MIKAN | 10.90 | 3,756 | 239 | 2.35 | 3 | 14.5972 | 4 | lowLiquidity, devHoldingStatusSellAll, smartMoneyBuy, volumeChangeRateVolumeSurge, dsPaid |
| CARDBACK | 8.56 | 190 | 13 | -82.46 | 1 | 2.5188 | 0 | smartMoneyBuy |
| Abdulrahman | 7.90 | 12,185 | 305 | 790.49 | 1 | 22.8504 | 0 | smartMoneyBuy, volumeChangeRateVolumeSurge, dsPaid |
| PEDRO | 7.74 | 5,545 | 545 | 107.03 | 1 | 19.7243 | 0 | devHoldingStatusSellAll, smartMoneyBuy, dsPaid |
| ZECHOOKS | 7.39 | 3,256 | 151 | -38.07 | 3 | 9.9078 | 0 | lowLiquidity, devHoldingStatusSellAll, smartMoneyBuy, dexScreenerTokenCommunityTakeOver, dsPaid |
| KACY | 2.85 | 17,462 | 1217 | -91.06 | 1 | 15.6579 | 0 | smartMoneyBuy, volumeChangeRateVolumeSurge, dsPaid |
| CMG | 1.83 | 162,588 | 2306 | -2.25 | 2 | 19.2674 | 0 | communityRecognized, smartMoneyBuy, volumeChangeRateVolumePlunge |
| SOL | 1.25 | 6,584,328,146 | desconhecido | -2.5 | desconhecido | desconhecido | desconhecido | desconhecido |
| MAIL | 1.21 | 5,358 | 252 | 119.93 | 1 | 24.0797 | 0 | smartMoneyBuy, dsPaid |
| DOGE | 0.85 | 1,356,589 | 32778 | -1.78 | 2 | 19.4495 | 9 | communityRecognized, smartMoneyBuy |

## 3. Rota de saída (cotação do saldo inteiro para USDC)

Impacto de preço em % (negativo é custo), valor recebido em US$, e as rotas que o agregador escolheu.

| Ativo | Ação | Impacto (%) | Recebe (US$) | Honeypot | Imposto | Rotas | Instante |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chonk | ok | -0.6 | 31.404 | False | 0 | PumpSwap 100%; JIT Router 100% | 2026-10-14T17:24:32Z |
| Pedro | ok | -2.08 | 27.1597 | False | 0 | PumpSwap 100%; JIT Router 100%; Jup Lend AMM 100% | 2026-10-14T17:24:35Z |
| PINCHA | ok | -1.13 | 19.5234 | False | 0 | PumpSwap 100%; JIT Router 100% | 2026-10-14T17:24:38Z |
| MIKAN | ok | -1.43 | 10.7476 | False | 0 | PumpSwap 100%; Meteora DLMM 100% | 2026-10-14T17:24:40Z |
| CARDBACK | ok | -0.85 | 8.4874 | False | 0 | Meteora DBC 100%; Raydium CL 90%; PancakeSwap V3 SOL 10% | 2026-10-14T17:24:43Z |
| Abdulrahman | ok | -0.36 | 9.4011 | False | 0 | PumpSwap 100%; Tessera 96%; Raydium CL 4% | 2026-10-14T17:24:46Z |
| PEDRO | ok | -0.57 | 7.6655 | False | 0 | PumpSwap 100%; BisonFi 100% | 2026-10-14T17:24:49Z |
| ZECHOOKS | ok | -1.12 | 7.311 | False | 0 | PumpSwap 100%; ZeroFi 100% | 2026-10-14T17:24:52Z |
| KACY | ok | -0.21 | 2.8025 | False | 0 | PumpSwap 97%; Meteora DLMM 3%; Kipseli Solana 100% | 2026-10-14T17:24:54Z |
| CMG | ok | -0.1 | 1.8302 | False | 0 | Manifest 2%; Raydium CL 98% | 2026-10-14T17:24:57Z |
| SOL | ok | 0.05 | 1.2486 | False | 0 | Byreal CLMM 100% | 2026-10-14T17:24:59Z |
| MAIL | ok | -1.35 | 1.1941 | False | 0 | PumpSwap 100%; ZeroFi 99%; Raydium 1% | 2026-10-14T17:25:01Z |
| DOGE | ok | -0.03 | 0.8532 | False | 0 | Meteora DLMM 100% | 2026-10-14T17:25:04Z |

## O que a leitura mostra

- **Todos os 13 ativos têm rota de saída** hoje, nenhum é honeypot e nenhum tem imposto de transferência. O pior impacto de saída é Pedro (cerca de 2 por cento); o resto fica abaixo de 1,5.
- **Alto risco pelo OnchainOS** (nível 3): PINCHA (criador com 16 rugs anteriores, queda de 97 por cento em 24 h, liquidez de cerca de US$ 4 mil), MIKAN (criador com 4 rugs, liquidez de cerca de US$ 3,8 mil) e ZECHOOKS (liquidez baixa). É coerente com o Jev ter decidido sair de PINCHA e MIKAN.
- **CMG** é o único ativo com controles centralizados fortes: autoridade de emissão e de congelamento, e as extensões `metadataPointer, permanentDelegate, defaultAccountState, pausableConfig, confidentialTransferMint, transferHook, scaledUiAmountConfig, tokenMetadata`. Quem emite pode pausar, congelar ou tomar o saldo; é um risco de custódia, não de preço. **DOGE** tem autoridade de emissão (ativo ligado por ponte), sem congelamento.
- Os dez memecoins estão sem autoridade de emissão e sem autoridade de congelamento (emissão renunciada). Nove são Token-2022 só com extensões de metadados; CARDBACK usa o programa SPL Token comum, sem extensões.
- **Desconhecido:** se a liquidez está travada ou queimada (`lpBurnedPct` vem vazio em todos), a profundidade do livro além do saldo desta conta, e a parte da configuração de taxa de cada extensão Token-2022 (a lista de extensões é lida; os parâmetros de cada uma não foram abertos).
- Nada aqui é recomendação de venda, nem autoriza ordem ou muda os limites da OKX.

## Achado lateral que esta leitura produziu

A cotação real devolve `data` como **array de um registro**, e o executor lia `data` como registro: toda ordem real seria recusada como `quote_ilegivel` antes de assinar (falha segura, mas o agente nunca operaria). Corrigido em `cli.ts` com teste da forma real (`oneRecord`).
