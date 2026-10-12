# DeFi discovery: integração de evidências na central JEV

Data: 2026-10-11. Status: proposta para revisão independente, não congelada, não implementada. Não substitui os critérios P1–P6 do ciclo HTTP preview ativo, nem encerra os achados F1–F6 e a missão completa.

## Objetivo e fronteira

Conectar o cliente amplo de descoberta existente à central e a uma entrada tipada de pesquisa JEV. Expor redes, protocolos, busca dos três grupos, detalhes e séries com identidade, unidades, parcialidade e proveniência observáveis. Não criar um cliente paralelo nem converter pesquisa em recomendação financeira executável.

Posições com endereço pessoal, prepare, calculator, enter, exit, claim, assinaturas e transmissão permanecem fora desta entrega. Sua implementação futura exige SPEC separada, revisão das exclusões existentes e autorização correspondente. A disponibilidade de documentação não prova acesso, gratuidade, credenciais, quota, elegibilidade pessoal ou atividade live.

Baseline fixo: commit 1f08e6edd589449a82eeb70638987a09572a3bd2, tree 15b1fe6b2ac58c5821b9ab77723610d0afe780aa. Nenhum comportamento de produção foi alterado para esta proposta.

## Fontes e evidências

- docs/WEB3-INTEGRATION-DELIVERY-SPEC.md: I1, I3–I7; SHA256 físico 4ae88b6726cd0ab742c334037fc098907af0af7298d368cf374cb5cc622407ee.
- docs/OKX-ONCHAINOS-DADOS-SPEC.md: D9, D16, D19, D23, D25 e exclusões; SHA256 físico 8a0755607de629b2e927413dbe7b61537c3d534ce7693c9f0c29aba3f184ef81.
- src/operator/candidates.ts: SHA256 físico 3955e44992bba1a2a36a6382f3ad29fe50c2248300deb2646519f3c54dbdd219. buildYieldCandidates atribui quoteAgeMs=0, tradingFeeUsd=0 e complete baseado apenas em subscribeFeeUsd; não compara identidade remota do produto. Isso é observação estática; reprodução independente pendente.
- src/operator/risk-gate.ts: SHA256 físico 7b916e9246c16e68cb6f007f687009f54e6237d54ae7297ce8c7a663daffbaa1. Bloqueia custos incompletos, net desconhecido, idade desconhecida/futura/stale e pesquisa.
- src/operator/plan.ts: SHA256 físico 488159912f83980e4e0a642aac9cf3342533fc76c1eac6df3a19c0f3b4d8d9f4. Somente dex_round_trip pode receber qualified_live; DeFi não recebe qualificação real. A existência de defi_subscribe não prova executor disponível.
- docs/research/OKX-DEFI-ENDPOINT-COVERAGE-20261011.md: SHA256 45f38a31dd56c021d5a837d2af0805fc3cf688ff73e2def9dfd0fd6315106b39. Pesquisa independente dos contratos exatos, sete adaptadores, campos/unidades desconhecidos e consumidor amplo não demonstrado.
- docs/research/OKX-DEFI-WIRING-INDEPENDENT-REVIEW-20261011.md: SHA256 542a1cc8dcc24a80cf2466d75232b9095d3d05c35b973e313526ca31a8a054c6. PASS limitado à precisão da pesquisa; testes terminais não reexecutados pelo revisor.

Fontes oficiais consultadas em 2026-10-11: [descoberta](https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/defi-product-introduction), [visão geral](https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/defi-api-overview). Contratos endpoint a endpoint estão no relatório independente; as páginas introdutórias não substituem esses contratos.

## Critérios propostos, cumulativos aos originais

- **G1 — Cobertura real:** um seam público de projeção consome o cliente createDefiReadClient existente, com transporte injetado. Exercitar supportedChains, supportedPlatforms, search/searchPages, detail, rateChart, tvlChart e depthPriceChart. Mostrar SINGLE_EARN, DEX_POOL e LENDING. Não implementar apenas fixture estática desconectada da central.
- **G2 — Identidade:** separar solicitado, reportado e associação. ID/rede/token omitidos continuam desconhecidos; campos copiados do pedido nunca viram verified. Mismatch explícito impede associação/candidatura verificada. Comparar tokens segundo a família da rede; rede ausente não é inferida da requisição. Detalhe pode informar pesquisa sem provar associação ao saldo.
- **G3 — Tempo e proveniência:** expor endpoint, parâmetros canônicos sanitizados, origem synthetic/imported/provider-observed, hash reproduzível, metadados por página e tempos locais. Timestamp de série, recebimento HTTP e validade remota são distintos. Ausência de timestamp/TTL remoto permanece unknown; nunca quoteAgeMs=0 por ausência. Capturas futuras, stale ou relógios inválidos não passam a elegíveis.
- **G4 — Unidades e economia:** Search mantém taxa anunciada fracionária; Detail/chart mantém unidade desconhecida quando não documentada. Preservar texto decimal disponível antes de conversão. APY/APR anunciado, TVL, flags e taxas parciais não são lucro líquido nem liquidez de saída. Custos requerem componente, unidade/base, fonte e tempo; desconhecido não vira zero. Uma taxa de entrada isolada não torna custos completos; retorno líquido permanece null sem todos os custos pertinentes e dados verificados. Não somar taxa percentual a USD nem extrapolar unidades entre endpoints.
- **G5 — Paginação:** limites explícitos de páginas/linhas e parada. Duplicatas, total mutante e página curta contraditória devem conservar parcialidade e motivo, sem declarar inventário completo. Não apagar silenciosamente linhas para produzir falsa completude. Evidência por página deve permitir rastrear o conjunto projetado.
- **G6 — JEV e execução:** entrada pública tipada de pesquisa contém somente projeção validada, limites e incertezas; preservar hold quando faltam dados para decisão elegível. Nenhuma inferência real é necessária para os testes. Saída JEV/confiança não autoriza execução nem prova vantagem. Descoberta continua research/not_qualified; nenhum plano DeFi qualified_live ou saldo/ganho realizado fabricado. O caminho legado de candidatos deve respeitar G2–G4 antes de qualquer rótulo de elegibilidade; não basta rotular a UI enquanto a fronteira pública mantém evidência fabricada.
- **G7 — Interface integrada:** central renderiza capacidades implemented/registered/called/tested/live-qualified separadas e distingue ausência de dados, erro, parcialidade e unknown. Mostrar rede/protocolo/ativo, taxa anunciada e unidade, custos conhecidos/desconhecidos, idade local versus validade remota, limitações e ausência de qualificação. Dados sintéticos/importados não recebem status live. Não exibir oportunidades positivas ou posições inventadas no preview vazio.
- **G8 — Verificação e entrega:** obter RED pela fronteira pública para identidade, tempo, custo e paginação; GREEN com transporte/clock falsos, controles válidos e isolamento sem .env, wallet, signer, RPC, financeira ou inferência real. Executar suites pertinentes, tipos e build afetado; verificar fluxo UI visível integrado, estados vazio/erro/parcial e contratos HTTP. Revisão independente de hashes exatos e critérios originais antes de commit/merge local. Nenhuma aprovação própria ou check sintético certifica live/profit.

## Sequência e responsabilidade propostas

1. Integrador: contratos de evidência/candidatos e regressões públicas G2–G6; preservar consumidores existentes e limites readonly. Resultado verificável: unknown/mismatch não elegível, sem falsear fonte ou custo.
2. Escritor isolado, após posse explícita: projeção pública reutilizando cliente amplo, testes G1–G5. API concreta/arquivos serão fixados após revisão; nomes de seams são propostas, não autorização de escrita.
3. Integrador: entrada de pesquisa e conexão real à central G6–G7; outro escritor pode fazer UI isolada somente com arquivos exclusivos. Rede permanece desligada por padrão; preview vazio permanece verdadeiro.
4. Revisor distinto: G8, controles positivos/negativos, rastreabilidade e efeitos de compatibilidade. Merge apenas dos arquivos desta entrega aprovados; trabalho preexistente permanece preservado.

## Decisão e pendências

JEV consultado com alternativas sanitizadas discovery_projection, offline_report_first e legacy_label_only. Resultado real: discovery_projection, receipt 307a1c2e-54d6-4341-a858-36b29f35b5e3, modelo jev-1.13.0, input 856/output 61, custo desconhecido=null, inputDigest 9d0100e4dc796ed734d41497d2b767e8a1f18c94e7fc9c276844803188c270ca. approved_by=jev_delegated para a escolha técnica; conselho não aprova SPEC, fundos ou ações externas.

Antes de implementação: revisão independente desta proposta; recuperar reprodução DeFi pendente; concluir gates imutáveis do ciclo preview ou determinar separação elegível sem alterar seus critérios. F5/F6 já têm SPEC V2 revisada e continuam prioridade de segurança, junto dos demais achados. Não congelar esta proposta por conveniência nem reinterpretar entrega parcial como missão concluída.
