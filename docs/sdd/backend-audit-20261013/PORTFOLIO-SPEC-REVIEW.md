# Revisão independente de SPEC: relatório de capturas

## Avaliação (menos de 400 palavras)

**Decisão: approve, restrita ao eixo SPEC desta fatia e aos hashes abaixo.** Revisor `audit_intelligence`, thread `01a13629-d057-7821-a554-a42994564eb9`, sessão `01a1361d-519c-7a83-a461-fff1a29f0317`. Não escrevi o candidato nem a SPEC congelada. Comparei somente `baseline` e `review-spec`; não editei código.

Nenhum requisito ausente/parcial, comportamento incorreto ou escopo extra foi demonstrado na implementação examinada. A limitação de typecheck global é preexistente, fora dos arquivos desta fatia; não equivale a green global ou aprovação da árvore ativa.

| Critério congelado | Cobertura observada |
| --- | --- |
| BA-01, SPEC:9: “usa sempre barras de 900000 ms” | `captured-report.ts:7,58–66,82` fixa unidade e valida identidade, metadados/estrutura. Testes rejeitam intervalo errado e preservam escala/cobertura ao reordenar. Nenhuma conversão/interpolação. |
| BA-02, SPEC:10: “Os demais ativos continuam calculáveis” | `:43–70` audita cada captura, exclui ausentes/ilegíveis/vazias/<31; posições desconhecidas/zero não restringem grade. Prova CLI com BTC válido e ETH ilegível mantém risco, cobertura 0.75 e motivo explícito. |
| BA-03, SPEC:11: “interseção cronológica” | `:64,72–84` combina os sufixos confirmados/contíguos do auditor público. Testes cobrem interseção insuficiente e candles futuros; probes independentes confirmam 30 excluídos, 31 elegíveis e 31 comuns. Recibos informam quantidade, instante, grade/frescor na captura e intervalo da grade. |
| BA-04, SPEC:12: “mantém a análise, cenário de estresse e rótulos” | CLI `:57–89` consome o adaptador, isola erro de captura e informa recibos JSON/texto. Execuções independentes confirmaram stress -20%, rótulo informado/demo e texto sem alegação de atualidade live. |
| BA-05, SPEC:13: “Executar regressões, núcleo quantitativo pertinente e typecheck” | 184 testes passaram; typecheck focado passou. Global executado falha somente no `RequestInfo` já presente. 635 arquivos reservados coincidem com o manifest; somente o script difere entre os arquivos preexistentes. |

A aprovação não certifica integração live, carteira real, rentabilidade, aprendizagem ML ou ausência de alterações concorrentes posteriores. Antes da integração, o coordenador deve revalidar hashes/ownership e o typecheck na árvore escolhida, conforme SPEC:17.

## Anexo: baseline, hashes e comandos efetivos

Data: 2026-10-13. Raiz do candidato: `C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/review-spec`; baseline imutável: `C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/baseline`. SPEC: `docs/sdd/backend-audit-20261013/SPEC.md`, BA-01–05 nas linhas 9–13, exclusões na linha 21. Parecer apenas SPEC; o eixo Standards pertence ao outro revisor.

### SHA-256

| Arquivo | SHA-256 |
| --- | --- |
| baseline-manifest.json (diretório pai) | d0da59b3172bd5ab0556e43ec75297fcecb1b521e8bb0fc5e73ba9ab8f75009a |
| baseline/scripts/quant-portfolio.ts | d608fc5a00bf561eb62ee8e75a2e55536f7995f8228864f03940031a25f682a7 |
| review-spec/docs/sdd/backend-audit-20261013/SPEC.md | 354aba6ef3fbda4175e59a698c1304105610211fb5805df43e6b4d3dbacaffc1 |
| review-spec/scripts/quant-portfolio.ts | 0494e0edc91d9f8e3148109f0fb13b6c256dae45d03f605fc1c5935bfed42f90 |
| review-spec/src/portfolio-analytics/captured-report.ts | 395c08f89eb824c89f2cb95a248f946ed8d895e86f5ce8f1f442005255f0cead |
| review-spec/src/portfolio-analytics/captured-report.test.ts | a179c1bd91df6b9bf7e039682796ec9240bf84342be489e0bdf121893328fd49 |
| review-spec/scripts/quant-portfolio.test.ts | f36248d15013860ca5d2f4147aa731e263d162b362c56a3cb111a3bc945442cd |

Hashes obtidos com `Get-FileHash -LiteralPath <arquivo> -Algorithm SHA256`. Comparação por hash de todos os arquivos do manifest (ignorando node_modules) retornou apenas `{"path":"scripts/quant-portfolio.ts","kind":"modified"}`. Verificação das reservas `src/quant`, `src/settings`, `src/desktop`, `src/inonu`, `web` retornou `{"protectedCount":635,"drift":[]}`. Isso compara arquivos existentes no manifest, não certifica toda a árvore externa ao candidato.

### Diff

```text
git diff --no-index -- C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/baseline/scripts/quant-portfolio.ts scripts/quant-portfolio.ts
exit 1: diff encontrado, esperado no modo --no-index
```

O diff remove o cast/grade do script e usa `analyzeCapturedPortfolio`; preserva `scenarioLoss` e os rótulos. Não há commits nossos nem Git na cópia. Git exibiu avisos LF/CRLF; o comando não alterou os arquivos.

### Regressões

```text
bun --no-env-file test ./src/quant ./src/portfolio-analytics ./scripts/quant-portfolio.test.ts
bun test v1.3.14 (0d9b296a)
184 pass
0 fail
873 expect() calls
Ran 184 tests across 13 files. [9.91s]
exit 0
```

### Typecheck

```text
bun --no-env-file run typecheck
$ tsc --noEmit -p tsconfig.verification.json
src/outcomes/okx-bars.test.ts(10,28): error TS2552: Cannot find name 'RequestInfo'. Did you mean 'RequestInit'?
error: script "typecheck" exited with code 1
exit 1
```

O TS2769 do script baseline não reaparece. A correção do `RequestInfo` pelo outro dono na árvore ativa foi informada pelo coordenador; não a certifiquei nesta cópia.

Primeira tentativa de typecheck focado sem `--ignoreConfig`: exit 1, `TS5112: tsconfig.json is present but will not be loaded if files are specified on commandline. Use '--ignoreConfig' to skip this error.` Tentativa corrigida:

```text
bun --no-env-file node_modules/typescript/lib/tsc.js --ignoreConfig --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --noImplicitOverride --noFallthroughCasesInSwitch --verbatimModuleSyntax --allowImportingTsExtensions --moduleResolution bundler --module preserve --moduleDetection force --target ESNext --lib ESNext --types bun src/portfolio-analytics/captured-report.ts src/portfolio-analytics/captured-report.test.ts scripts/quant-portfolio.ts scripts/quant-portfolio.test.ts
stdout/stderr vazios
exit 0
```

### Probes independentes públicos e CLI

Executados por `@'<TypeScript inline>'@ | bun --no-env-file -`, exit 0. O programa importou `analyzeCapturedPortfolio`, usou candles sintéticos (`barMs=900000`, close=`100*exp(.004*sin(i+offset))`, high=close*1.01, low=close*.99, volume=null, confirmed=true) e substituiu fetch global por erro `review forbids network`. Cada captura terminou em `(count+offset)*900000`; posições e JSON defeituoso foram escritos apenas em diretório temporário exclusivo, removido após validar seu caminho absoluto sob tmpdir.

```json
{"case":"threshold30","risk":"unavailable","capture":"excluded","common":0,"observations":null}
{"case":"threshold31","risk":"ok","capture":"eligible","common":31,"observations":30}
{"case":"common31","common":31,"risk":"ok"}
{"case":"unreadable-json","exit":0,"stderr":"","label":"user supplied positions","risk":"ok","coverage":0.75,"captures":[{"key":"BTC","reason":null},{"key":"ETH","reason":"unreadable_capture"}],"stress":{"lossFraction":0.2,"lossUsd":20,"unshocked":[],"excluded":[]}}
{"case":"demo","exit":0,"stderr":"","label":"hypothetical positions on real captured prices","risk":"ok","coverage":0.5,"captures":[{"key":"BTC","reason":null},{"key":"ETH","reason":"unreadable_capture"},{"key":"SOL","reason":"missing_capture"},{"key":"MON","reason":"missing_capture"}],"stress":{"lossFraction":0.2,"lossUsd":2000,"unshocked":[],"excluded":[]}}
```

`common31`: BTC 80 candles desde índice0 e ETH80 desde índice49. CLI: BTC80 válido, ETH arquivo `{invalid`, posições BTC75/ETH25; invocações `bun --no-env-file scripts/quant-portfolio.ts --dir <temp> --positions <temp>/positions.json [--json]` e `--demo --json`. A execução textual terminou exit0, stderr vazio; trechos literais:

```text
Carteira informada pelo usuario
grade comum: 80 candles de 900000 ms; arquivos historicos, atualidade live nao verificada
captura BTC: eligible; instante 72000000; 80 candles; qualidade A; recente na captura sim
captura ETH: excluded (unreadable_capture); instante n/d; 0 candles; qualidade n/d; recente na captura n/d
risco sobre 79 barras (1 dias), cobre 75.0% do valor; fora: ETH:no_returns
cenario todos -20%: perda 20.00% (US$ 20.00)
```

Sem leitura de .env/credenciais/dados de mercado, rede, modelos pagos, assinatura, ordens, servidores, publicação, staging ou commit. O único artefato persistente escrito por este revisor é este relatório; nenhuma fonte foi corrigida pelo revisor.
