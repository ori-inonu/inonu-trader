# Correção factual do contrato de transporte

A SPEC congelada SHA-256 13ba216cca87b8fd139d95895cd84a30df536788602fa4679201b8307aa856cb contém uma frase incorreta: depois de distinguir tokenList, afirma que todos os demais endpoints retornam data como array.

O contrato oficial de [advanced-info](https://web3.okx.com/onchainos/dev-docs/market/market-token-advanced-info) retorna data como objeto identificado. O cliente deve validar esse objeto e normalizá-lo para um array de um elemento na interface pública advanced(identity), preservando a interface previamente acordada. Uma resposta de transporte em array deve falhar; não é uma alternativa documentada.

Fonte independente: OKX-INTEGRATION-RESEARCH-20261009.md, seção 3.4, SHA-256 c83291232ea82f0a9505f647e0caeff14a4a494fce44f11392159c5eb69fdfa0. Captura pública S05: SHA-256 4507bba88863c64510330426779d44e3dd851522282487026d0545b9143d1877, observada em 2026-10-09T20:56:41.996Z.

Esta errata registra a correção sem alterar os bytes congelados ou reduzir E1–E8. E1 continua exigindo schema correto segundo fonte oficial; E3 continua exigindo identidade. A revisão deve considerar a frase incorreta explicitamente substituída por este fato verificado, e registrar qualquer incompatibilidade remanescente. Não há prova de acesso autenticado ou de rentabilidade.
