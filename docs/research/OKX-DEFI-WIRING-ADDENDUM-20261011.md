# DeFi: capacidade implementada versus integração operacional

Baseline verificado: `1f08e6edd589449a82eeb70638987a09572a3bd2`, árvore `15b1fe6b2ac58c5821b9ab77723610d0afe780aa`. Adendo à matriz anterior, preservada sem alteração. Pesquisa e verificação local; não certifica provedor live, execução financeira ou lucro.

## Correção da matriz

Existem dois clientes distintos. `src/okx-wallet/defi.ts` fornece ao operador busca simples de rendimentos. `src/onchainos/defi-read.ts` implementa descoberta mais abrangente, mas a busca delimitada em `src`, `scripts` e `web`, excluindo testes, encontrou apenas sua definição e nenhum consumidor de `createDefiReadClient`.

| Recurso de descoberta | Registrado | Cliente tipado | Consumido pelo operador observado | Qualificação |
|---|---|---|---|---|
| Redes suportadas | GET supported-chains | supportedChains | Não encontrado | Teste local com transporte fake |
| Plataformas suportadas | GET supported-platforms | supportedPlatforms | Não encontrado | Teste local com transporte fake |
| Busca de produtos | POST search, página 20 | search | Cliente simples separado, página 1, SINGLE_EARN | Testes locais; provedor live não verificado |
| Paginação limitada | Mesmo endpoint search | searchPages | Não encontrado | Teste local de parada e limites |
| Detalhe do produto | GET detail | detail | Não encontrado | Teste local de identidade e campos ausentes |
| Série de taxas | GET rate/chart | rateChart | Não encontrado | Teste local; unidade não declarada permanece desconhecida |
| Série de TVL | GET tvl/chart | tvlChart | Não encontrado | Teste local de timestamps e USD |
| Profundidade/preço | GET depth-price/chart | depthPriceChart | Não encontrado | Teste local de variantes e erro tipado |

O registro possui sete endpoints, não oito: paginação reutiliza search. O cliente tipado aceita SINGLE_EARN, DEX_POOL e LENDING. Existência de código ou testes não demonstra conexão ao JEV/UI nem acesso ao serviço real.

## Contrato oficial e limites

Documentação oficial consultada em 2026-10-11: [visão geral DeFi](https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/defi-api-overview) e [descoberta de produtos](https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/defi-product-introduction). A descoberta permite pesquisar produtos e consultar ativos subjacentes, taxas e operações suportadas. A API também documenta famílias de execução e posições. Estas páginas introdutórias não provam os contratos exatos de cada endpoint; a pesquisa independente desses contratos segue separada.

`scripts/okx-operator.ts:12,175` importa e instancia `okxDefiSource`. Essa fonte busca por símbolo de DEFAULT_PAIRS e atribui ao produto o endereço solicitado, sem provar a identidade do ativo subjacente retornado. Ausência de taxas de subscribe permanece `null`. Isso não basta para recomendar execução ou afirmar rentabilidade líquida.

O cliente completo distingue taxa anunciada na busca e unidades desconhecidas em detalhe/gráficos. Preparação, cálculo de entrada/saída/claim e posições ainda não são implementados nele. Não converter taxa anunciada em ganho realizado; não substituir ausência de custos ou de identidade por zero ou pelo token da consulta.

## Verificação executada

Comando original: `C:/Users/gabri/.bun/bin/bun.exe test src/onchainos/defi-read.test.ts`, cwd da worktree integradora. Execução via adaptador RTK/Headroom: exit 0, Bun 1.3.14, **19 pass, 0 fail, 110 assertions**, 218 ms reportados pelo runner. `makeStack` injeta fetch roteirizado e relógio manual; esta suite não consulta provedores nem opera fundos.

Métricas privadas: `C:/Users/gabri/.codex/rtk-headroom-defi-read-20261011-2008.json`. Adaptador retornou `command_not_allowlisted`, sem arquivo de recuperação (`archive_id=null`): saída original preservada, sem alegação de compressão ou economia. Recibo do comando observado: chunk `692e94`. Não se trata de avaliação shadow ou calibração do JEV.

## Próxima integração a especificar

1. Adaptar descoberta paginada e detalhe ao contrato do operador com identidade chain/token comprovada; manter hold quando ela não puder ser comprovada.
2. Preservar proveniência, freshness, limites de páginas/linhas, unidades e campos desconhecidos na entrada tipada do JEV.
3. Separar oportunidade anunciada, custo completo estimado e resultado realizado; ligar projeções somente quando houver evidência verificável.
4. Implementar leitura de posições e contratos de preparação conforme documentação primária. Execução, assinatura e permissões financeiras continuam dependentes de autorização específica.
5. Testar a cadeia descoberta → candidato → decisão → projeção usando os seams públicos, e avaliar em shadow contra baseline. Esta lista é trabalho pendente, não conclusão ou nova autorização.

## Hashes atuais de fontes

| Fonte | SHA256 |
|---|---|
| src/onchainos/defi-read.ts | 23b50cc9ba14b28932601b4b6ce17e2d5731c20728db681ed598d607f5af6432 |
| src/onchainos/defi-read.test.ts | 7e7a5f7e684621513164382cc9ca740395e5df2a2a392b78a82f96e6a0667c1c |
| src/onchainos/endpoints.ts | 23158bcd606d26a710723a55d18b5c4eddd8c2c5f1273b3de88182f4b73134b5 |
| src/okx-wallet/defi.ts | a00da33976075aaaa73b7f0b189f4d89540f31d6f646f32f81dc6eafc1fdb76e |
| scripts/okx-operator.ts | ed937480a59c21d94deab87769ac4ae68cf10b7bdaaa743898df7039c03f5784 |
| docs/research/OKX-RESOURCE-MATRIX-REFRESH-20261011.md | 9dcbc0c2ceac2a9d23346b4581dfdc903828dfc2baade9e61e90183b510aca7f |

Consulta delegada de recuperação: recibo `98c9e9ee-089f-4c1a-aa49-a725a3393ca6`, decisão recover_then_verify, modelo jev-1.13.0, confiança 0.82, uso 606/41 tokens; custo desconhecido. Conselho, não aprovação humana ou gate independente.
