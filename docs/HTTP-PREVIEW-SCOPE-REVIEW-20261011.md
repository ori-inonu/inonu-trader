# Revisão independente de escopo HTTP preview

Resultado terminal: **PASS de escopo; approve / within_authorized_objective** para a proposta exata abaixo. Nenhum bloqueador material exige emenda. Não constitui aprovação de implementação, commit, integração, início/substituição de serviços, finanças ou conclusão do objetivo JEV/OKX.

Baseline confirmado na origem: `f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c`. Revisor: `CODEX_THREAD_ID=01a12ada-91d7-7ce0-b6ea-e1556d234224`, distinto de `codex-inonu-system-one-safety` e da thread principal `01a12971-f941-7e42-8a42-fab6d44d4eb5`. CODEX_SESSION_ID aponta para a thread principal; não usei sua identidade/contexto. Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos. Revisão na cópia exclusiva ordinária, sem sandbox OS read-only. Nenhuma implementação minha está sendo aprovada.

## P1–P6: adequação e gates pendentes

| Critério | Avaliação independente |
| --- | --- |
| P1, SPEC:13 | Específico e viável: entrada CLI separada, subprocesso real e HTTP/SSE. `src/index.ts:12–16,43–46` inicializa produtores; mock/dry-run não bastam. `server.ts:3–6,29` oferece seam leitor com imports financeiros apenas de tipos. Auditar dependências de runtime além do teste; instrumentação não certifica egress OS. |
| P2, SPEC:14,24 | Exige validação antes de bind, origens HTTP loopback exatas e diretório absoluto isolado; não aceita defaults legados nem estado privado. `server.ts:14–25` hoje captura handlers/env/defaults no import; opções da prévia precisam efetivamente evitar esse fallback. `/operator` entrega JSON inteiro (`operator/http.ts:69`), portanto isolamento é essencial. Observar 404 e ausência de arquivos escritos; cwd temporário sozinho é insuficiente. |
| P3, SPEC:15 | Contrato honesto: none/null/read_only, histórico vazio e fonte sem produtor. `useFeed.ts:178–189` preserva mode/dataSource; `presentation.ts:37–58` mostra “Execução não verificada” para read_only. Sem mode, dryRun=true aparentaria simulação. Não gerar decisões/fills/balanços; frontend fora do escopo salvo emenda revisada (SPEC:22). |
| P4, SPEC:16 | Testável por status/headers reais em todas as rotas, incluindo subrotas do operador. Não copiar CORS `*` genérico de `server.ts:10,44–52`. Preservar token/projeções no startup normal. OPTIONS existente difere: operador 204, System One 200; ambos são compatíveis. Testar origens negadas sem allow-origin permissivo e mutações 405. |
| P5, SPEC:17 | Trata a falha concreta: timer inicia antes do bind (`server.ts:35–38`) e retorno não fecha listener (`65–72`). Verificar bind ocupado/falha, fechamento com SSE aberto, timer, sinais e repetição de cleanup; manter os três broadcasters e callers existentes. Nunca encerrar outro processo apenas pela porta. |
| P6, SPEC:18,24,26 | RED novo pela CLI antes de implementação; GREEN, regressões HTTP/presentation, tipo, revisão independente e UI integrada são gates futuros. Reutilizar padrão público `scripts/okx-operator.test.ts:15–38`: ambiente allowlisted, no-env-file/no-install/no-addons/config isolada e cleanup restrito ao filho criado. Cliente teste deve usar apenas loopback; source audit complementa o subprocesso. Nenhuma cobertura desses gates foi executada nesta revisão. |

## Compatibilidade, runtime e autoridade

Diagnóstico `LOCALHOST-ORIGIN-DIAGNOSIS-20261011.md:7–14` registra 200 sem Origin e 403 com 3001/3002; o entry temporário aceita somente 3005 e aponta a estado legado. É evidência do coordenador, não observação minha, nem prova de bytes em memória. SPEC:9,26 corretamente proíbe alargar essa allowlist e condiciona replacement a ownership, identidade executável/source e rollback. O primeiro listener novo deverá usar porta livre. API URL/build/frontend precisam proveniência; Next carrega .env por conta própria e providers injetados podem ler contas automaticamente, conforme pesquisa anterior:49–53. Browser limpo é gate real, não “não clicar”.

Ownership proposto (SPEC:22) fica com o integrador: servidor, CLI/teste e package; nenhuma permissão financeira ou mudança de gates. Estado ausente é resultado aceitável e explícito, não qualificação live. Roundtrip e objetivo central continuam pendentes.

Recibo de seam fornecido pelo usuário: `0f49b121-c0b0-494c-8c01-711669482be4`, cli_http, confiança .98/probabilidade .99, jev1.13.0, 728 input/47 output, custo desconhecido. Corrobora CLI + HTTP/SSE + audit; não consultei Jev, não verifiquei ledger privado do recibo e não o trato como aprovação humana.

Template: mantidos versão/kind/id, implementer_id e três bindings. Recalculei o digest canônico da proposta por JSON compacto conforme `sdd-boundary.mjs:14–15,33`; coincide com o template. Objetivo/constraints são digests opacos fornecidos: não recuperei estado privado de outra conversa nem recomputei esses dois hashes. A avaliação semântica se fundamenta na autorização explícita do usuário e SPEC; o coordenador ainda deve validar freshness/CAS do próprio estado. Nenhum begin_cycle foi executado.

## Verificação realizada e limites

Leituras locais, hashes, excerpt da referência e comparação de oito fontes entre origem/cópias. HEAD exato e diff dos caminhos examinados contra baseline vazio. Próprio contexto harness recuperado em revision 0, idle/research, sem mutação. Nenhum teste, aplicativo/serviço, HTTP/API/Jev, .env/credencial, provider, signer, fundo, rede ou auxiliar. Escritas somente nos dois outputs desta atribuição; pesquisa/prior reports preservados.

Erros de navegação preservados, sem atribuição ao candidato: uma leitura PowerShell retornou exit1 sem saída e foi refeita com sucesso; rg de paths presumidos informou os error 2/123 (src/lib.mjs, src/*.mjs, Rail.tsx fora da subpasta Rail). Git na cópia ordinária informou `fatal: not a git repository (or any of the parent directories): .git`; baseline foi verificado na origem. Nenhum desses erros é resultado de teste do produto.

## SHA-256 medidos

Origem apenas leitura: `C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader`. Outputs exclusivos: `C:/Users/gabri/.codex/worktrees/inonu-system-one-review-standards-20261011`.

| Entrada | SHA-256 |
| --- | --- |
| docs/HTTP-PREVIEW-SPEC-20261011.md | e32244822c49fe6b248eccd15da9c9addff18a1fa6c8abd97004861de7a42d2c |
| docs/HTTP-PREVIEW-CYCLE-PROPOSAL-20261011.json (bytes) | 7ffd90c61a8455701692ef07780e27ba339f5ebc2f2ce2a25cf308cde3a1d0a9 |
| Proposta canônica / proposal_sha256 | 33c260e124e6693d2a61db6fbbf41a42a618cc73136ee168f5d472861bfa4f65 |
| docs/HTTP-PREVIEW-CYCLE-REVIEW-INPUT-20261011.json | 091a43a996fca65d6c141aa383bd27ef46a6709e500aaca8f03643ca8c45a706 |
| objective_sha256 (template, não recomputado) | 9e54db028141cdfdfefa10537fb31183c43691863cf1bab7fbcceff3573e9650 |
| constraints_sha256 (template, não recomputado) | 67701b75b742abc9b809bdc93134cab091f98d87fece9cef09715ed7b5b6ae21 |
| docs/LOCALHOST-ORIGIN-DIAGNOSIS-20261011.md | 90c3b2270307c7175125ae75d6db7e703c690bbb8a1159e59a8d69c49eac3b1f |
| localhost-main-startup-research.md e cópia docs/LOCALHOST-MAIN-STARTUP-RESEARCH-20261011.md | 67d75e81ba30d80693da8d557306cd547986767520b018ea8c5911dcbe40cb61 |
| CONTRIBUTING.md | 77e3d24d12c441f531b8c0311a2299edb1ff42a31460fe390153578586e6c7a1 |
| src/server.ts | 0fb67e5b65f58ad6ebcad5157d1b8daa75df59a794dfa458f77ae2d375f0678d |
| src/index.ts | 7275a80b361e5d9a9700a4196518cc3d64d2244bfa7e23b25052a3e73336ecfa |
| src/config.ts | 8383abb4a2e6a3bf913dcd12b809c1ad5ad2e5e765b97de78f2aba09242154d5 |
| src/operator/http.ts | d392a77915fc48448d76ccc608ba4f57d7069fc0ba67c0820feaba3ed55d6cd1 |
| src/system-one/http.ts | 2dd44642babda63e0a41d935d329afdb07ed5d1578a0f68688291ef150cc5e85 |
| scripts/okx-operator.test.ts | aae504a1b3219b0e8fe1a61cdf80990d9dadb3ad28c374a29e7692eef8590a2d |
| web/src/lib/useFeed.ts | 7a71639374b68f4192a9b31bb58e3164bbe12f051299bd00695bdd779d465328 |
| web/src/lib/presentation.ts | 1560d361d0af3b3e092a33cf1d238adc07b5ad91d288a6d9df760ed7a926b339 |
