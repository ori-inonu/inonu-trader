---
title: "Autoresearch de decisoes: estado e verificacao"
created: 2026-10-16
updated: 2026-10-16
type: summary
tags: ["pesquisa", "evidencia", "backtest"]
sources: ["docs/specs/autoresearch-decisoes/spec.md", "docs/specs/autoresearch-decisoes/plan.md"]
confidence: medium
---

# Estado

Navegacao: [[inteligencia-e-resultados]] e [[laboratorio-e-paper]]. [Especificacao](spec.md), [plano](plan.md) e [tarefas](tasks.md).

Fase 1: harness implementado e verificacoes registradas, com falhas globais preexistentes explicitamente preservadas. Ainda nao houve otimizacao da politica candidata.

Pedido: preparar o benchmark canonico e iniciar o autoresearch, sem otimizar antes da baseline. A meta 10x/24h esta registrada como hipotese nao demonstrada. Nenhuma execucao financeira, autorizacao, nova dependencia, migracao ou consulta paga e parte deste trabalho.

Inventarios de codigo/evidencia realizados por agentes somente leitura. A evidencia local agregada distingue historico de mercado de resultado liquido da carteira. `HarnessSpecReview` aprovou tecnicamente especificacao e plano sem achados antes da implementacao. Nao representa aprovacao do usuario/JEV nem lucro observado.

Revisao estatica por `WorkloadFinancialReview`: sem achados remanescentes no workload e entrypoint, apos corrigir a proveniencia da politica candidata. Verificou pareamento, separacao temporal e contas do stress; nao executou testes nem qualifica retorno financeiro. `PanelSemanticsReview` confirmou a unidade de hitRate como razao 0-1, sem achados remanescentes no escopo revisado. `EvidencePrivacyReview` concluiu sem achados estaticos remanescentes no congelador e fixture revisados. `StatusCoverageReview` revisou as projecoes complementares: os achados de validacao antes do parser, privacidade de reason e independencia do diagnostico de scoreboard foram corrigidos e encerrados, sem achados remanescentes nos passes delimitados.

O home de runtime configurado pelo watchdog Windows fica fora do checkout. Foram congeladas 20 fontes e 1.110 medicoes seguras, com `capturedAtMs=1792127753268`, usando apenas projecoes agregadas dos journals, mercado e uso. Nenhum arquivo de runtime foi escrito. Identificadores, enderecos, configuracao bruta, respostas e caminhos pessoais nao integram o fixture. A existencia dos arquivos nao comprova que o processo esteja ativo.

O snapshot nao e uma transacao atomica entre arquivos. Os periodos de uso sao relativos ao ultimo timestamp da fonte, nao ao relogio atual. Hashes identificam os bytes lidos, nao autenticam a origem nem reconciliam a carteira. Duas invocacoes anteriores do congelador foram reportadas sem `--no-env-file`; podem ter autocarregado ambiente no startup do Bun, sem evidencia de divulgacao ou uso pelo coletor. A materializacao final e o benchmark canonico usaram `--no-env-file`; isso nao apaga a ressalva historica.

## Evidencia de execucao

- `bash autoresearch.sh` reproduziu uma colisao de ID no catalogo (`panel_hud_system_in_flight_count`, exit 1). A entrada duplicada foi unificada nas duas superficies. O mesmo comando depois terminou com exit 0 e `METRIC synthetic_paired_net_return_bps=0`, usando ainda o snapshot inicial sem os journals de runtime.
- Smoke real de sensibilidade, sem alterar o arquivo candidato: `runWorkload()` comparado com `runWorkloadWithCandidate(holdPolicy())`, processo Bun offline, exit 0. Ambos tiveram 224 pares completos; primaria inicial 0 bps e politica esperar -15.083458600486491 bps contra a mesma ancestral. A metrica responde a politica, mas nao demonstra retorno de carteira, melhoria do modelo ou vantagem fora desse workload.
- Snapshot final: `bash autoresearch.sh`, exit 0, 70 linhas `METRIC` finitas e uma unica primaria. Duas execucoes independentes produziram stdout byte-identico (SHA-256 `091df267ae7637896f36fea1d3ec91c41ac64315d9908c7bed0f6bd7b23d9f3d`); avaliador `1a9d7e82926878c89c78e6c87ad85b76b9d621919c24bee582ed41a5089ad814`.
- Primaria `synthetic_paired_net_return_bps=0`, com 224 pares completos e cobertura de custo sintetico 1. Isso e paridade inicial com a politica ancestral, nao melhoria do JEV nem lucro de carteira.
- SHA-256 do fixture: `7c95543c0aeabae02c363e5d77b82eda79d76f24bde3f7ffd989e8e75b6960c9`.
- `bun run typecheck`: exit 0. `bun --no-env-file test scripts/autoresearch/workload.test.ts scripts/autoresearch/panel-metrics.test.ts scripts/autoresearch/freeze-evidence.test.ts`: 12 pass, 0 fail, 70 expect calls.
- `bun run test`: exit 1, 7.828 pass, 13 fail, 7.843 testes em 481 arquivos (263,38 s). Mesmas falhas identificadas antes do harness: 12 em `src/settings/store.test.ts` no roundtrip do loader de ambiente Bun e uma em `scripts/okx-defi.test.ts` por `spawnSync ETIMEDOUT`. Nenhuma falha nova do harness nessa execucao; isso nao e verde global e nao foi ocultado alterando credenciais ou testes alheios.
- `bun run test:lab`: exit 0, 647 pass, 0 fail, 838.136 expect calls, 16 arquivos (26,26 s).
- Inventario executado: 1.318 campos, 634 disponiveis e 684 desconhecidos (48,1% de disponibilidade, nao de qualidade financeira). Inclui a serie numerica de equity do status, com 160 pontos anonimos; texto e nomes privados continuam suprimidos.

## Pontos fracos evidenciados

- Auditoria congelada: 116 ordens, 21 fills exatos e sete round trips, mas zero ordens e zero round trips com resultado net USD conhecido. Custos nativos sem cambio contemporaneo nao sao zero.
- Evidencia prospectiva: 840 experiencias pendentes e zero outcomes maduros. Ainda nao existe suporte para promocao por vantagem financeira.
- Fluxos externos e saldos nao estao integralmente conciliados. Historico de equity, TWR inferido e deltas brutos em USDC nao equivalem a retorno liquido reconciliado em USD.
- Preferencias Choice/pBuy nao sao probabilidades calibradas de lucro. Brier/logloss permanecem indisponiveis, sem inventar eventos e horizontes.
- O scoreboard capturado contem 303 linhas que falham a validacao de schema. Resumos dependentes de scoreboard/evidence/record permanecem desconhecidos; nao se usa o subconjunto permissivamente aceito pelo parser nem se fabrica settlement/preco. A serie de equity valida e independente dessa falha.
- Smoke final do relatorio confirmou simultaneamente: diagnostico de scoreboard indisponivel com proveniencia `agent_scoreboard` e serie independente de equity disponivel com 160 pontos. Disponibilidade em uma fonte nao esconde falha em outra.
- Metricas sinteticas, observadas e ausentes ficam separadas no `REPORT`. Maior cobertura, mais ordens ou mais caixa ocupado nao significam maior retorno.
- Na integracao, um caso de scoreboard invalido foi apontado pela revisao estatica e exercitado depois da correcao: `processAgentAnalysis` retornou null/unknown com a causa de schema invalido, exit 0. Nao se alega captura de falha anterior nesse caso. Um vazamento de texto arbitrario em `reason` foi reproduzido antes (exit 1, `leaked=true`) e confirmado corrigido depois (exit 0, `leaked=false`, valor ainda null/unknown); somente codigo de causa explicitamente permitido pode sair no relatorio.


## Contrato para iniciar os ciclos

- Entrada canonica: `bash autoresearch.sh`. O relatorio analisa o snapshot congelado, nao uma leitura live do dashboard.
- Unico caminho de desenvolvimento: `scripts/autoresearch/candidate.ts`. Avaliador, politica ancestral, fixtures, custos, seed e contratos ficam congelados; mudar dados exige nova baseline.
- A metrica primaria e um delta sintetico de desenvolvimento. Promocao financeira continua dependendo de custos completos, conciliacao e evidencia prospectiva/holdout, sem converter preferencia em probabilidade.
- As 13 falhas globais anteriores ficam registradas como restricao da baseline; o benchmark independente e os testes pertinentes passam. Nenhuma qualificacao live e concedida.
- `init_experiment` registra e comita a baseline do harness na branch autoresearch; nao equivale a executar ciclos de otimizacao nem a cumprir a meta financeira.

