# HTTP preview — revisão independente de implementação

**Veredito: PASS limitado de código; nenhum bloqueador material identificado. P6 integral permanece PENDENTE.** Este parecer vincula somente o candidato abaixo; não aprova rollout, integração posterior, merge, execução financeira nem conclusão do objetivo JEV/OKX.

Revisor observado: CODEX_THREAD_ID `01a12ada-91d7-7ce0-b6ea-e1556d234224`, distinto do implementador principal `01a12971-f941-7e42-8a42-fab6d44d4eb5`. Não implementei o candidato. GPT-6.1 Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos. Revisão na cópia ordinária exclusiva `http-preview-implementation-fixture-20261011`, sem sandbox OS somente leitura ou certificação de isolamento de rede. Nenhuma edição de candidato/SPEC; nenhum auxiliar, instalação, leitura de .env/credenciais ou chamada deliberada a provedor/Jev/fundos. Apenas este relatório foi escrito na raiz exclusiva.

Baseline fixo: `f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c`. O erro inicial de extração tar `6c3513` não foi tratado como preparação válida; a reparação `dbb96d` e os bytes atuais foram verificados. Nova confirmação de hashes: ferramenta `f3ff39`, exit 0.

| Arquivo na fixture | SHA-256 atual |
|---|---|
| src/server.ts | da2088d24d8b9b1c6a3de62555fe48072ef9eec03b83007f131ecdb5125c32d5 |
| scripts/http-preview.ts | 6b1b7839e23134e99312ec556eed2f0c5c9950922bed033769ea57b2b9732fce |
| scripts/http-preview.test.ts | be52d726afed756699a779720a972087eaa3f09a10e44e05fb3b5b858f77285b |
| package.json | 11dd45cd9942c0a20aeb1c1f65500e14814fa5147cc9d1a0b611739d9101a02e |
| docs/HTTP-PREVIEW-SPEC-20261011.md | e32244822c49fe6b248eccd15da9c9addff18a1fa6c8abd97004861de7a42d2c |
| docs/HTTP-PREVIEW-SCOPE-REVIEW-20261011.md | 43988f1db8c4888058364db62db56eb108b8f1d79c67bba70f949ade692b9c17 |

Diff examinado contra blobs do baseline, incluindo os dois arquivos novos; não comparação three-dot de HEAD. Normalização de CRLF/LF usada somente para comparação semântica, sem alterar bytes. Alterações limitadas a server, CLI, testes e alias `preview:http`. Doze dependências/gates/apresentação permanecem equivalentes ao baseline: index/config; operator HTTP/insights/executor/ledger; System One HTTP/public-view/types; CLI OKX; presentation/useFeed. CONTRIBUTING lido, SHA-256 `77e3d24d12c441f531b8c0311a2299edb1ff42a31460fe390153578586e6c7a1`. SPEC congelada preservada; seu status textual antigo “proposed” não foi reescrito nem usado para reabrir critérios aprovados.

## Findings e standards

Nenhuma violação documental ou defeito material novo encontrado. Imports de Market/trader são somente tipos; a cadeia runtime CLI → server → handlers públicos → fs/path/projeções não inicializa produtores, modelo, executor ou signer. `require("./config")` fica exclusivo do caminho normal (`src/server.ts:37`), preservando contrato síncrono; index/config/gates financeiros continuam no baseline.

- **Baixa, cobertura:** `scripts/http-preview.test.ts:50` não inclui `/operator/history` e `/operator/insights` na matriz subprocesso, nem segundo origin configurado. Dispatch comum (`src/server.ts:50–54`) e handlers existentes foram inspecionados; não identifiquei quebra. Não afirmar execução independente desses casos. Sinais SIGINT/SIGTERM da CLI (`scripts/http-preview.ts:19–21`) também não tiveram teste específico; fechamento público foi exercitado.
- **Baixa, julgamento de smell:** allowlist de ambiente/setup se repetem em `scripts/http-preview.test.ts:16–19,116–121,161–168`; helper privado poderia reduzir divergência futura. Não é violação de CONTRIBUTING nem razão para rejeitar este candidato.

Avaliei naming, duplicação, feature envy, data clumps, primitive obsession, repeated switches, shotgun surgery, divergent change, speculative generality, message chains, middle man e refused bequest como heurísticas; não há outro achado concreto que justifique refatoração. Checks de tooling não foram classificados como smells.

## Cobertura dos critérios imutáveis

| Critério | Evidência e conclusão limitada |
|---|---|
| P1 | PASS código/seam: CLI dedicada; bind 127.0.0.1 (`server:46`), imports auditados, config financeiro evitado. Subprocesso real respondeu mesmo com MODEL=jev, chave inválida e DRY_RUN=false sintéticos. Guard fetch suplementa auditoria; não certifica egress OS. |
| P2 | PASS código/casos executados: validação antes de bind (`server:19–25`); paths explicitamente derivados de stateDir, token null sem fallback (`27–34`); 11 entradas inválidas preservam listener ocupado. Estado ausente continua 404 e não é criado. Isolamento/proveniência do diretório absoluto são responsabilidade do rollout: não há contenção OS nem rejeição específica de links/diretórios privados. Não apontar para estado legado. |
| P3 | PASS código/seam: CLI `17–18`, root/history/SSE observados com model none, wallet null, read_only, fonte sem produtor e história vazia. Apresentação existente trata read_only como execução não verificada e mostra fonte; useFeed preserva metadados. Browser integrado e painéis indisponíveis ainda não observados nesta revisão. |
| P4 | PASS código e matriz executada: origins exatos; rejeição 403 sem ACAO, POST 405, OPTIONS permitido; root/history/events/operator/System One testados. Subrotas e segundo origin têm limite de cobertura acima. Token/projeções normais preservados; preview não herda token/paths. |
| P5 | PASS seam público: timer somente após bind (`server:68`); close idempotente encerra timer/SSE/listener (`75–81`); bind ocupado rejeita preservando dono; rebind e saída natural sem watchdog exercitados. Broadcasts e callers normais preservados por diff. Aceitação EOF ou somente ECONNRESET é compatível com force-close Windows, não relaxamento para erro arbitrário. |
| P6 | PASS porção de revisão de código/testes, com provenance abaixo; PENDENTE integral: ausência de execução integrada com browser limpo, identidade/ownership de processos, URL/port/baseline em runtime e rollback/replacement. Esta revisão não libera esses gates nem certifica objetivo amplo. |

## Execuções e limites de evidência

Execução independente válida, ferramenta `9a9a14`: Bun 1.3.14, `--no-env-file --no-addons --no-install --config=<bunfig temporário> test ./scripts/http-preview.test.ts --timeout 15000`, cwd fixture, ambiente allowlist. **Exit observado 0; 3 pass, 0 fail, 97 assertions, 1 arquivo, 3.30s.** Cobriu CLI/ambiente hostil, lifecycle público e 11 configs inválidas. Sem rerun de suíte global solicitado.

Métrica RTK exata: `C:/Users/gabri/.codex/http-preview-reviewer-01a12ada-focused-a27596bf3f8b4f7b8437cc2a3e515fcc.json`; stderr SHA-256 `fe1e4f1eb70decb74b48f86357d76a939415948b66e6f4fdbd8d1eca2af028a2`. RTK foi pass-through, archive_id null; métrica não contém exitcode, que foi observado no wrapper/tool.

Receipts do coordenador, não reruns independentes: RED `85f858` Invalid PRIVATE_KEY; GREEN `67a6d9`; final afetados `87e23b/1b990d`: 18 pass/256 assertions/exit0; typecheck `22b3c5`: exit0. Métricas focused/types `http-preview-{focused,types}-20261011-f.json` foram lidas, mas hashes/duração isolados não comprovam exits. Regressão lifecycle `04b328` e correção `d64402` distinguem EOF de ECONNRESET Windows.

**Incidente de tooling do revisor, sem evidência válida adicional:** a sondagem temporária suplementar foi invocada incorretamente e iniciou descoberta/execução de testes mais ampla que a autorizada; wrapper encerrou com **124** após 30s (`a0e0ff`), saída transport-truncated. Não é falha do candidato nem pass global. Causa precisa do dispatch não foi demonstrada. Métrica `http-preview-reviewer-01a12ada-matrix-0390d217f0d2427686d016f354a38962.json`: stdout SHA `2208c4e17313f4159e9e2efce419bc4514a850be7acd9416035baa4804b69c05`; stderr SHA `3c0469c661d7d2711baad4cfadfd6e3dd9e5e9c0f5ebb96582678b133083b85e`. Uma tentativa em cwd temporário terminou **1**, `error: Script not found "test"` (`21af80`), sem testes executados. Instrumentação fetch não prova isolamento de eventuais filhos incidentais; não certifico seu egress ou resultados. Scratch temporário removido; consulta delimitada não encontrou Bun remanescente com o caminho da fixture. Nenhum teste adicional foi usado para sustentar aprovação.

Parecer terminal: **PASS limitado do candidato exato para a etapa de código/revisão.** Nenhum bloqueador material identificado; limitações de testes declaradas. P3 browser/P6 rollout continuam pendentes. Não aprovo integração posterior, merge, operação live ou conclusão geral.
