# O que o ecossistema OKX oferece ao agente, o que ele usa e o que depende do dono (2026-10-14)

Fonte: a documentação do OnchainOS espelhada localmente (499 páginas, `docs/sdd/inonu-desktop-v1/onchainos-coverage.*`) e o que o agente já faz ao vivo. Esta página só afirma o que as páginas dizem; o que não foi executado de verdade está marcado.

## Em uso hoje (verificado ao vivo)

| Capacidade | Como o agente usa | Evidência |
| --- | --- | --- |
| Carteira Agentic (TEE, `onchainos`) | assina compras e vendas sozinha, na carteira do dono | STONK US$ 12 comprado e vendido, recibos `recibo_sucesso` |
| Cotação e troca (`swap quote`, `swap execute`) | dimensiona e executa, nunca reenvia ordem sem desfecho | `transmitida` só vira `executada` por recibo ou pela rede pública |
| Market API (`hot-token`, `signals`, `token-risk`, velas, preço) | candidatos, trilha de carteiras rastreadas, risco e momento da entrada | Brief de cada consulta em `briefs.jsonl` |
| Histórico da carteira (`wallet history`) e RPC pública Solana (somente leitura) | recibo de cada ordem, inclusive a achada pela carteira quando a OKX recusou sem prova | `recibo_recuperado` |
| Modelo Jev (System One) | decide cada compra, venda, postura, perfil de alvo e stop por perguntas fechadas; as facetas `late_entry` e `still_falling` decidem as entradas marcadas | 12 de 12 consultas gravadas |

## Existe e não está ligado (ainda sem instrumento implementado; a alavancagem foi AUTORIZADA pelo dono em 2026-10-14)

1. **Rendimento do caixa parado (DeFi API, "Single Earn").** A página `defi-transaction-enter` mostra depósito em protocolos de empréstimo (exemplo: Aave V3 USDC) e a página `defi-transaction-exit` o resgate. Hoje 70% da carteira do agente (US$ 85) é USDC parado, que rende zero. Ligar isso é uma **classe nova de risco** (contrato do protocolo, liquidez de resgate, taxa de entrada e saída) e uma ação nova com o dinheiro; o dono nunca autorizou. Falta também ler `defi-product-search` e `defi-product-supported-platforms` para saber quais produtos existem em Solana (a carteira está em Solana) e a que rendimento.
2. **Alavancagem por empréstimo.** O dono autorizou, no chat de 2026-10-14, que o sistema opere alavancagem financeira (a tela dizia "desligada, decisão do dono": era texto do próprio agente, deixado assim enquanto o dono não respondia, e estava errado). A autorização existe; o instrumento ainda não: o estudo de viabilidade está em `ALAVANCAGEM-VIABILIDADE-20261014.md`. A mesma API diz "subscribe (deposit/borrow)" e "redeem (withdraw/repay)" e traz exemplos de borrow (Aave V3, NAVI). Isso permite, em tese, depositar colateral, pedir emprestado e comprar mais: uma posição alavancada, com **risco de liquidação** (perder o colateral). Não há produto de alavancagem na própria carteira Agentic; o que existe é montar a posição sobre esses protocolos. Com cerca de US$ 121 de carteira, a taxa de cada passo e o risco de liquidação pesam muito mais que em carteiras grandes. **Não foi implementado, nem testado, nem ligado.** Só entraria com a escolha explícita do dono, com teto de LTV, e por fases (primeiro só medir em sombra).
3. **Perpétuos.** Não são da carteira: ficam na OKX exchange, com conta, chave e margem próprias. Com a autorização de alavancagem do dono passam a estar no escopo, mas exigem credenciais de negociação da exchange que o aplicativo não tem e que só o dono pode criar.
4. **WebSocket do OnchainOS (eventos).** Exige plano pago (Market subscription, 3 conexões por segundo por chave, 480 inscrições por hora): sem plano, o ritmo rápido é polling dentro da cota gratuita (`hotWithinQuota`). O despachante do Codex (`src/decision-review/events.ts`) está pronto e sem fonte para despachar.
5. **Gas Station (taxa paga em USDC em vez de SOL).** A OKX pede consentimento de quem é dono da carteira; o agente nunca responde. A carteira tem cerca de US$ 1 de SOL, e uma venda cujo caminho pedir mais que isso falha com `gas_station_pendente`.

## O que o agente já faz sozinho para crescer sem alavancagem

- Compra só o que o Jev decide, em fração do máximo executável que o Jev escolhe (um décimo, um terço, dois terços ou tudo do caixa da rede do candidato, e no máximo 95% do limite por transação ligado no portal da OKX); o código não impõe teto diário, piso de US$ 10, barra de convicção nem limite de risco ou concentração (decisão do dono em 2026-10-14, ADENDO-B). Sai pelo plano de cada perfil (alvo, stop, trailing, tempo) ou pelo Jev.
- Mede o que deixou de comprar (Placar das compras puladas) e devolve isso ao Brief do Jev como histórico por família de evidência.
- Mostra ao Jev candidatos que ainda não subiram (no máximo metade do grupo já subiu mais de 30% em 24 h) além dos que decolaram.

## O que eu proponho ao dono, em ordem de risco

1. Primeiro, **decidir sobre o Gas Station** (afeta se as vendas saem).
2. Depois, **autorizar a medição em sombra** do rendimento do caixa parado: o agente lê os produtos de empréstimo de USDC em Solana e registra o que teria rendido, sem depositar nada.
3. Só então **decidir sobre depósito real** (valor máximo, produto, resgate automático) e, por último e separado, **alavancagem** com liquidação possível.
