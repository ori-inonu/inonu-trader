# Revisão independente — precisão da pesquisa DeFi

**Veredito: PASS limitado à precisão da pesquisa.** Nenhuma contradição material encontrada; não aprova implementação, integração financeira nem conclusão do objetivo geral.

Revisor: `01a12ada-91d7-7ce0-b6ea-e1556d234224`, distinto do implementador. Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos. Cópia exclusiva ordinária, sem sandbox RO/egress; origem e Git somente lidos. Nenhum teste, API financeira, inferência ou alteração de fontes executado.

Baseline: `1f08e6edd589449a82eeb70638987a09572a3bd2`; tree verificada: `15b1fe6b2ac58c5821b9ab77723610d0afe780aa`. Cinco fontes locais correspondem ao commit após normalização CRLF/LF; não são bytes idênticos aos blobs.

| Artefato | SHA256 verificado |
|---|---|
| Addendum | 97baf4273253a84f125528e5c92b0472cd224433de0fe2712a7f9fd52ede810b |
| src/onchainos/defi-read.ts | 23b50cc9ba14b28932601b4b6ce17e2d5731c20728db681ed598d607f5af6432 |
| src/onchainos/defi-read.test.ts | 7e7a5f7e684621513164382cc9ca740395e5df2a2a392b78a82f96e6a0667c1c |
| src/onchainos/endpoints.ts | 23158bcd606d26a710723a55d18b5c4eddd8c2c5f1273b3de88182f4b73134b5 |
| src/okx-wallet/defi.ts | a00da33976075aaaa73b7f0b189f4d89540f31d6f646f32f81dc6eafc1fdb76e |
| scripts/okx-operator.ts | ed937480a59c21d94deab87769ac4ae68cf10b7bdaaa743898df7039c03f5784 |
| Matriz referenciada | 9dcbc0c2ceac2a9d23346b4581dfdc903828dfc2baade9e61e90183b510aca7f |
| Métricas RTK citadas | bfdd9810bf355f2a8ac630786a2d0672c3a62b7fbcca02a9e0e4abb1520f7d40 |

**Evidências e ressalvas**

- Addendum:9–20 correto: endpoints.ts:61–67 registra sete endpoints; defi-read.ts:386–398 pagina o mesmo search. Busca textual no commit fixo, src/scripts/web excluindo testes, encontrou somente a definição do cliente completo; operador:12,175 usa o cliente simples. Não prova ausência de chamadas dinâmicas.
- Addendum:26–28 delimita corretamente identidade/custo: defi.ts:26–35 atribui endereço solicitado sem comprovar ativo retornado e mantém subscribeFeeUsd=null. candidates.ts:272–277 deixa custo incompleto/netUsd=null.
- As 19 definições de teste sustentam parsing, paginação e erros descritos. Limites: defi-read.test.ts:97–112 exercita esgotamento/maxPages, não maxRows; :147–153 verifica identidade ecoada/ausente, não identidade onchain. Transporte e relógio são falsos (fakes.ts:140–153).
- Addendum:32–34 atribui 19/0/110 ao integrador. Métricas confirmam command_not_allowlisted/archive_id=null, mas não contêm exit code nem streams brutos: resultado terminal não verificado independentemente.
- [Visão geral oficial](https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/defi-api-overview) e [introdução oficial](https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/defi-product-introduction) sustentam descoberta/operações/posições introdutórias. Addendum:24 corretamente não as apresenta como prova dos contratos exatos.

CONTRIBUTING respeitado. Nenhuma correção obrigatória identificada; contratos completos, identidade real, integração JEV/UI, autorização financeira e desempenho permanecem sem certificação.