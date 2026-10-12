# Plano de implementação F1–F4

Status: preparação; sem implementação autorizada pelo gate de SPEC ainda. Objetivo integral da sessão permanece ativo e incompleto.

Baseline observado: 14cbb7bd2878eed0a930b324b0c50610be7cdab8. SPEC V2: docs/JEV-TAPE-DATA-F1-F4-SPEC-V2-20261011.md, SHA256 10cee5fe44e7dbde5a988d34822ee99061cb24b39341e2cefe77a4bae2439c97. Revisão independente de Turing pendente; timeouts de observação não são encerramento do agente.

## Seams confirmados pela delegação

approved_by=jev_delegated. Recibo df240b15-9cc4-412a-9ccc-31ed4ccd25c7, escolha public_chain_and_direct, confiança .98, modelo jev-1.13.0, uso 835 tokens de entrada/51 de saída, custo faturado desconhecido/null. Input digest 78779e96a89b3c1df2649ca94145a29a91bcafc273d79758256d2519f8b129c9. Recibo persistido pelo plugin; conselho técnico não aprova SPEC, merge ou transações.

Seams: OkxTapeFeed com fetch/socket/relógios falsos → snapshot → buildTapeState → runJevRead com contador de chamadas; builder direto para impedir bypass; readRound para composição após awaits. Não testar métodos privados, executar CLI ou chamar provedores/modelos reais. A alternativa round_only foi rejeitada por cobertura insuficiente dos requisitos de entrada direta.

## Entregas e verificação

Integrador exclusivo: codex-inonu-jev-tape-data-integrator. Arquivos de produção permitidos: src/jev-read/types.ts, feed.ts, state.ts, loop.ts. Testes correspondentes; read.test.ts somente migração de fixtures, sem alterar objetivos/asserts F5/F6. Nenhuma alteração de read.ts, decide.ts, clock.ts, scripts ou interfaces financeiras.

1. Gate inicial: ler parecer independente completo; resolver REVISE se houver; congelar requisitos e hashes. Nenhum teste novo ou produção antes desse gate.
2. F1: uma regressão de candle futuro no builder, RED real, correção mínima e controles idade zero/limite inclusivo. Introduzir contratos estruturados somente conforme cada teste exige; nunca relaxar aceitação para compatibilidade de fixtures legadas.
3. F2: slices de captura REST/WS e prova direta; idade de fonte e cache independentes, limites/fração, identidade, ordenação/duplicatas e snapshot imutável. Compor contador MODEL0 nas entradas inválidas e MODEL1 nos controles válidos.
4. F3: opção TTL rejeitada antes de efeitos; par SWAP completo, timestamp de fonte e normalização. Funding inválido deve ficar null com built.ok=true, outros dados válidos e MODEL1, sem mascarar a falha com clock_unknown ou outros gates.
5. F4: geração/ack e cobertura mínima; quietude válida; perda por cap e recuperação temporal sem mensagens; callbacks antigos; gaps e provas inválidas. Controle 500 trades deve preservar imbalance .2/CVD100; flood 6000 deve bloquear por trades_unavailable com demais dados válidos.
6. Composição: readRound recaptura clocks após awaits, reavalia ticker depois do refresh de book e valida tudo no instante final. Não alterar políticas de deadline/cancelamento do leitor.
7. Verificação: testes pertinentes, typecheck/build aplicáveis, probe original preservado e suíte F5/F6. Revisão independente contra baseline/SPEC e audit de integração antes de commit/merge local.

Cada entrega segue um teste → RED observado → implementação mínima → GREEN; a lista não autoriza testes em lote antecipados. O conteúdo integral da matriz da SPEC prevalece sobre este resumo.

## Evidência de recuperação

Em 2026-10-11, as leituras iniciais tentaram src/jev/*.test.ts e falharam por caminho inexistente; corrigido para src/jev-read/*.test.ts. Não houve mutação decorrente do erro. Leituras corretas confirmaram fixtures legadas de receipt wall, funding escalar e tradesLive booleano; a migração precisa conservar controles positivos e razões específicas.

Próximo passo: obter o parecer V2 no mesmo handle de Turing 01a12adc-473d-7381-b067-c83af7ccda31 e conferir hash/conteúdo antes de freeze. Não reiniciar por timeout. Integrações econômicas, avaliações shadow e preview visível localhost permanecem pendentes do objetivo integral.
