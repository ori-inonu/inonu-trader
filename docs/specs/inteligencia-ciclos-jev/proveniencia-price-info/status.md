# Status: Proveniência do timestamp `price-info`

Fase: `pt` implementada; smoke backend→HUD, fixtures atuais e focused concluídos. Aggregate final sequencial de três comandos cobriu os cinco caminhos de verificação root/web, exit 0. Duas skips root de receipt-safety não são qualificação live. Nenhuma autorização de migração ou D2.

## Evidência observada

- Documento oficial OKX descreve `time` como timestamp do último preço em Unix milliseconds; não define frescor/cache/fetch nem validação independente.
- Reprodução pré-feature com Bun real e imports de produção mostrou Briefs byte-idênticos (5.648 B) apesar de `tsMs=NOW-120000` versus `null`; ambos `dataAgeMin=2`, `ag=2`, uma chamada mock por rota. Após implementação, o smoke pareado inclui `pt` opcional e passa a distinguir presença sem alterar `ag`.
- Implementação atual deriva `priceInfoTimestampReported` do `tsMs` normalizado em observação existente; `model.ts` mantém `ag` e projeta `pt`. O status anterior (perda de presença) foi resolvido.
- `AgentBrief.posicoes` e `ConsultRecord.brief.posicoes` são mapas de valores abertos (`Record<string, unknown>`), mas `AgentBrief.v=1` e o comentário de `ConsultRecord.briefVersion` definem layout v1. `src/agent/wire.ts` persiste Brief exato em `briefs.jsonl` com hash. `audit.ts` e `agent-episode.ts` reconstruem/hash integralmente o Brief; evolução só qualifica atualmente `briefVersion===1`. Captura de evolução aceita JSON genérico, mas inclui todos os campos em raw/digest.
- A pesquisa inicial observou allowlists explícitas que removiam `pt`; a implementação atual preserva apenas o enum numérico 0/1 em `src/agent/analysis.ts` e `web/src/lib/hud/parse-cycle-review.ts`. `event-evidence.ts` continua vinculando o hash completo e `pt` não é idade.

## Decisão e limites

- Proposta: campo opcional em `HoldingFacts` indicando timestamp normalizado disponível apenas quando existe observação `price-info`; `pt=1` presente, `pt=0` resposta observada sem timestamp normalizado; ausência significa legado/desconhecido/fonte não observada. Nenhum default; nunca inferir de `atMs`, relógio local ou cache. `ag` composto não muda.
- O Main autorizou explicitamente a extensão opcional pública V1. Implementação: `HoldingFacts.priceInfoTimestampReported?: boolean`, derivado somente de observação normalizada; `pt=1|0` em holding do Brief, ausente para desconhecido; allowlists backend/HUD restritas a número 0/1; HUD mostra semântica explícita sem badge de frescor. `ag`, versões, hashes, wire, histórico e chamadas existentes permanecem inalterados.
- Smoke reader → candidates → Brief/hash mediu a legenda anterior de 69 B: 5.688 B para timestamp presente/ausente e 5.680 B sem observação; hashes registrados naquele smoke pertencem àquela string e não são hashes do texto final. A legenda final tem 77 B; +8 B/Brief por aritmética (resultado esperado 5.696/5.688 B; não reexecutado). Sem novas chamadas de reader.
- Captura `onConsult` de `createCycleRunner` foi aceita por `auditConsult` (`briefFingerprint=matched`); registros V1 antigos continuam compatíveis. Suite auditoria 17 pass/0 fail/63 expects; guarda: estabilidade sem churn por idade e transição `pt=1→0` material; 1 pass/157 filtered/0 fail/7 expects.
- O bound derivado de 11.888 B (referência rica histórica 11.720 +150 B da extensão `pt` +18 B da 32ª chave) é anterior à legenda `ag` atual e a campos concorrentes; não o tratar como tamanho atual nem como execução de fixture rica. O orçamento 12.000 B é referência/teste, não guarda ou truncamento runtime.
- Smoke throwaway atual após reduzir `LEGEND.ag` de 241 para 156 bytes: fixture completa observada 11.989 B, com 8 holdings `pt=1`, 7 buys e 32 context keys; fixture mista observada 11.948 B com os mesmos limites, `holding.h=0.1`, `buy.h=5000`, e `pt=1/0/omit`. `LEGEND.pt` mantém 77 B; nenhuma legenda/fato foi truncado. `ag=0` não prova presença de timestamp nem frescor de todos os inputs, e não mede idade de saldo.
- Chromium com parser, componente e CSS reais confirmou 1/0 e legado/enum inválido desconhecido; screenshot `C:/Users/gabri/AppData/Local/Temp/omp-sshots-15a8b3feee22031c.webp`. O teste `cycle-review-render.test.tsx` removido cobria apenas três strings, sem invariante enum/transição/erro e seu footer não conta como verificação final.
- Prova throwaway backend→HUD com `buildAnalysis` real (que deriva evidência de `brief.posicoes`) seguido por `parseCycleReviews` real, usando seis consult records sintéticos isolados; helper em Temp removido após uso. `pt=1` e `pt=0` sobreviveram numericamente; legado sem chave, `2`, string `"0"` e boolean `false` foram omitidos no backend e seguiram omitidos no parser. Nos seis casos `ag=2`, `s="abc"`, item/ciclo foram preservados. Nenhum `.evidence.pt` foi fabricado para o parser; sem Chromium, rede, modelo, CLI ou executor. A prova cobre somente fronteira de enum e composição de funções reais.
- O campo continua estritamente de presença auto-reportada, não prova de horário/frescor/autenticidade/preço/saldo. Sem migração, alteração de proprietário, D2, rede, API ou mudança em `ag`.

## Aggregate global final

- Logs: `C:/Users/gabri/AppData/Local/Temp/jev-final-aggregate-xiGIrS`. `typecheck:all` exit 0 (14.287 s wall; root `tsc --noEmit -p tsconfig.verification.json` + web `tsc --noEmit`). `test:lab` exit 0 (647 pass/0 fail/838.136 expects; 647 tests/16 files; 41.11 s). `test:all` exit 0 (root 7.882 pass/2 skip/0 fail; 7.884 tests/479 files/984.082 expects; web 3.825 pass/0 fail/59.692 expects; 3.825 tests/252 files). Não são cinco comandos standalone: os três comandos executaram os cinco caminhos root/web requeridos.
- Os dois skips root são receipt-safety Market/Trader porque `RECEIPT_SAFETY_SOURCE` estava unset e o hardening não foi integrado; não qualificam live. Monitoramento fallback cobriu 46 paths conhecidos; SHA/mtime/size sem mudança durante o run e entre baseline/final. Isso não demonstra freeze global do checkout.

## Artefatos

- [spec.md](spec.md): problema, definição, prova, compatibilidade e critérios de aceitação registrados; limites de evidência permanecem.
- [plan.md](plan.md): implementação, smoke backend→HUD e aggregate final documentados.
- [tasks.md](tasks.md): G0–T5 concluídas; focused `model + analysis + wire`: 164 testes, 0 falhas, 941 expects em 3 arquivos; helpers temporários removidos.
