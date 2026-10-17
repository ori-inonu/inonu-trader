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
Este e um registro historico, substituido pelo [autoresearch real online](../autoresearch-real-online/status.md). O "pedido atual", as campanhas e os gates abaixo descrevem o trabalho anterior; nao autorizam executar novamente dados sinteticos, congeladores ou campanhas offline.


Harness qualificado no commit `cea16ce2ca95`; o segmento 2 partiu da baseline `f758ed0c9507` e concluiu as 12 execucoes pre-declaradas, runs globais 4 a 15, sem ampliar a busca. A melhor candidata retida e H5, commit `220304e2bd06`; a repeticao final confirmou os mesmos bytes e metricas, sem ser uma melhora adicional. A inicializacao prematura `94f632b29608`, anterior ao gate global verde, permanece no historico e nao vale como qualificacao.

Pedido atual: campanha offline concluida. A meta 10x/24h permanece hipotese nao demonstrada. Nenhuma execucao financeira, autorizacao, nova dependencia, migracao ou consulta paga faz parte deste trabalho. Qualificacoes existentes de H3/H5 nao equivalem a aprovacao financeira; qualquer gate adicional informado depois e registro separado.

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
- Execucao anterior aos reparos: `bun run test`, exit 1, 7.828 pass, 13 fail, 7.843 testes em 481 arquivos (263,38 s). Mesmas falhas identificadas antes do harness: 12 em `src/settings/store.test.ts` no roundtrip do loader de ambiente Bun e uma em `scripts/okx-defi.test.ts` por `spawnSync ETIMEDOUT`. Nenhuma falha nova do harness nessa execucao; o resultado vermelho nao dispensava o gate.
- Execucao anterior de `bun run test:lab`: exit 0, 647 pass, 0 fail, 838.136 expect calls, 16 arquivos (26,26 s). O gate final apos os reparos esta abaixo.
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
- Falhas globais conhecidas ficam no historico, mas nao dispensam o gate: uma nova baseline exige os tres comandos obrigatorios verdes, revisao e smoke reais. Nenhuma qualificacao live e concedida.
- `init_experiment` registra e comita a baseline do harness na branch autoresearch; nao equivale a executar ciclos de otimizacao nem a cumprir a meta financeira.

## Reparo do gate antes da nova baseline

- `src/settings/store.test.ts`: o subprocesso do loader Bun passa a receber somente variaveis de sistema allowlist, como no teste existente de isolamento de ambiente. Nao altera o ambiente do pai, o store, o resolvedor de credenciais ou qualquer arquivo de ambiente real.
- Smoke com fixture e valor herdado ambos falsos: a variavel herdada prevaleceu sobre a fixture e continuou presente apos remover a entrada; com ambiente isolado, o loader leu a fixture e depois retornou null. Isso confirma a falha de isolamento, sem ler credenciais reais.
- `scripts/okx-defi.test.ts`: todos os subprocessos do CLI usam `Bun.spawn` assincrono, conforme padrao existente, com stdout/stderr drenados, espera por exit, kill e erro de timeout explicitos e limpeza do timer. Mantidos 45.000 ms por filho, 60.000 ms por teste, comandos reais e asserts.
- A causa exata do ETIMEDOUT rapido anterior nao foi comprovada. Duas sondas isoladas apos `Bun.spawnSync`, inclusive com um filho morto por timeout, nao reproduziram a falha; nenhum mock de child_process foi encontrado na investigacao. A migracao elimina essa dependencia sincrona do teste sem ampliar prazos, suprimir falhas ou alterar o CLI.
- O CLI real offline retornou exit 0, schema `okx_defi_report_v1`, modo `synthetic`. Typecheck e os dois arquivos de testes alterados passaram juntos: 41 pass, 0 fail, 385 expect calls.
- Revisao semantica final de `ReviewSettingsGate` e `ReviewDefiGate`: sem achados e com preservacao dos asserts, fixtures, comandos e limites. Um normalizador externo ao patch mudou a indentacao dos testes e foi reportado ao QA das ferramentas. A restauracao cosmetica foi interrompida; escapes transitoriamente danificados nessa tentativa foram corrigidos antes da execucao seguinte. O ruido de whitespace remanescente e aceito, sem mudanca de configuracao de formatacao.
- Reexecucao do gate apos esses reparos: typecheck exit 0; teste global 7.840 pass, uma falha, 7.843 testes em 481 arquivos (266,26 s). As 13 falhas anteriores nao reapareceram; surgiu `spawnSync ETIMEDOUT` no teste default de `scripts/okx-derivatives.test.ts` em cerca de 39 ms. A causa exata permanece nao comprovada. O laboratorio nao foi alcancado pelo encadeamento nessa tentativa.
- GD implementado e revisado por `ReviewDerivGate`, sem achados: subprocessos de derivativos usam o mesmo padrao assincrono, mantendo 45.000 ms por filho e 120.000 ms por teste. `bun run typecheck` passou; os tres arquivos reparados passaram juntos com 52 pass, 0 fail, 653 expect calls (13,83 s). O CLI real retornou schema `okx_derivatives_report_v1`, modo synthetic, sem acesso externo, qualificacao ou autorizacao financeira.
- Nessa tentativa, o global terminou com 7.840 pass e uma falha em 7.843 testes/481 arquivos (258,74 s), agora na primeira execucao de `scripts/okx-evidence.test.ts`. Esse helper usa `Bun.spawnSync` nativo e retornou exit null em aproximadamente 136 ms; como descarta os outros metadados, nao se atribui ETIMEDOUT a esse caso. O laboratorio nao foi alcancado.
- A investigacao de estado compartilhado encontrou um precedente documentado no proprio repo e um candidato de timeout nativo deliberado em `src/goal/io.test.ts`. Causa nao comprovada: o par goal/io e okx-evidence passou (17 testes, 93 asserts, 3,59 s). Uma sonda temporaria no runner real matou filhos por deadline de 300 ms, confirmou o marcador de inicio e esperou 16 s tanto de forma assincrona como bloqueante; os consumidores nativo e Node posteriores passaram nos dois casos. Sonda removida apos execucao.
- A tentativa de isolar esses tres testes reais de `runShell` em filhos Bun foi revisada sem achados, mas nao resolveu a falha global: typecheck passou e os cinco arquivos focados tiveram 69 pass, 0 fail, 747 asserts (17,19 s); o global manteve 7.840 pass e uma falha, 7.843 testes/481 arquivos (261,58 s), no mesmo okx-evidence com exit null em cerca de 102 ms. A alteracao foi removida por nao resolver o problema; implementacao, API e callers de producao continuam intactos.
- O diagnostico valido usou `bun test --no-env-file --preload ./timeout-diagnostic-preload.ts --parallel=1 --timeout 15000 ./src ./scripts`. A primeira tentativa, com preload antes do subcomando, apenas acionou o script do package e nao instrumentou a execucao. O preload temporario registrou apenas caller relativo, duracao, exit code, sinal, sucesso e contagens de bytes, nunca argumentos, ambiente ou conteudo de streams; foi removido.
- Resultado instrumentado: 7.840 pass, uma falha, 7.843 testes/481 arquivos (266,55 s). A ultima chamada sync anterior terminou em uptime 136 s, em settings; a primeira de okx-evidence ocorreu em 211 s, apos aproximadamente 75 s sem sync. Apesar do limite de 45.000 ms, foi morta por SIGTERM em 12 ms, com exit null e streams vazios. A chamada seguinte saiu 0 em 89 ms.
- Causa reproduzida no Bun 1.3.14 local: primeiro um spawnSync sem timeout inicializa o loop; depois de 2.000 ms sem sync, um filho com timeout de 1.500 ms foi morto em 11 ms (espera assincrona) e 8 ms (espera bloqueante). Os dois retornaram exit null, SIGTERM e streams vazios. O controle com mesmo comando, intervalo e limite, mas Bun.spawn assincrono com timer/kill, saiu 0 em 202 ms, com marcador esperado e sem timeout.
- A reproducao e a assinatura no global correspondem ao defeito Windows documentado em [Bun #33932](https://github.com/oven-sh/bun/issues/33932) e corrigido upstream em [#33935](https://github.com/oven-sh/bun/pull/33935): o relogio em cache do loop libuv privado de spawnSync fica obsoleto entre chamadas. Nao e necessario um timeout anterior disparar. As sondas anteriores com intervalo de 16 s eram menores que o deadline consumidor de 45 s; a sonda de 50 s sem sync inicial tampouco exercitava a precondicao de loop previamente usado.
- Reparo implementado nos wrappers offline de okx-evidence e okx-signals, preservando comandos, ambiente, asserts e limites: 34 subprocessos agora supervisionados assincronamente. `ReviewOfflineCutover` revisou os dois diffs completos sem achados. Sem atualizar runtime/dependencias, sem warm-up, retries ou aumento de timeout, e sem alterar producao. Nenhuma nova baseline sera registrada enquanto os tres comandos obrigatorios nao passarem.
- Smoke dos CLIs reais apos o corte: evidence saiu 0, stderr vazio, schema `okx_evidence_offline_v1`; signals saiu 0, stderr vazio, schema `okx_signals_observations_v1`. Ambos reportaram somente `execution: not_qualified`; ambiente do subprocesso allowlist e proxies locais de recusa, sem credenciais reais.
- Smoke canonico posterior: `bash autoresearch.sh` saiu 0, primaria 0 bps em 224 pares. Nova captura foi identica byte a byte a baseline verificada: 1.218.080 bytes, SHA-256 `091df267ae7637896f36fea1d3ec91c41ac64315d9908c7bed0f6bd7b23d9f3d`, 70 metricas unicas e finitas. Nenhuma otimizacao nem alteracao do avaliador ou fixture durante o reparo do gate.

## Gate final apos os reparos

- Encadeamento final saiu 0: `bun run typecheck`, cinco arquivos focados, `bun run test` e `bun run test:lab`, no Bun 1.3.14.
- `bun run typecheck`: `$ tsc --noEmit -p tsconfig.verification.json`, exit 0.
- Focados: `src/settings/store.test.ts`, `scripts/okx-defi.test.ts`, `scripts/okx-derivatives.test.ts`, `scripts/okx-evidence.test.ts` e `scripts/okx-signals.test.ts`: 57 pass, 0 fail, 762 expect calls, cinco arquivos (16,95 s).
- `bun run test`: 7.841 pass, dois skips existentes, 0 fail, 983.943 expect calls; 7.843 testes em 481 arquivos (265,95 s). Nenhum teste foi removido ou pulado pelos reparos.
- `bun run test:lab`: 647 pass, 0 fail, 838.136 expect calls; 16 arquivos (26,39 s).
- Benchmark canonico e smokes reais estao registrados acima; o stdout permaneceu identico e as revisoes estaticas dos cinco arquivos reparados nao tiveram achados. Sondas temporarias e o isolamento de shell sem beneficio foram removidos.
- As 208 alteracoes anteriores do usuario permanecem preservadas no stash `11609a10402f41cabff342965ee92f9127c1b92b`, fora da baseline de pesquisa. A nova baseline nao dispensa o mesmo gate antes dos commits futuros.


## Requalificacao apos checkout CRLF

- A continuacao executou tres runs no primeiro segmento: baseline 0 bps, custos direcionais -0,1879266929903146 bps (descartado) e funding adverso +2,4292302252795377 bps (rejeitado por `checks_failed`). O terceiro selecionava uma ordem no empate de score zero com hold; nenhuma melhora foi retida.
- O descarte pelo autoresearch reidratou os arquivos com CRLF por `core.autocrlf=true`, mesmo com Git limpo. Os hashes fisicos mudaram: avaliador de `1a9d7e82926878c89c78e6c87ad85b76b9d621919c24bee582ed41a5089ad814` para `9e328cf327bf310d7fde35ecc3f6f792b9671a0c728617ad848748fc94904220`; evidencia de `7c95543c0aeabae02c363e5d77b82eda79d76f24bde3f7ffd989e8e75b6960c9` para `bca25e564de172ee8c0bec7d00d312afb0b0fe494b2899266095321142d88f5e`. O run 3 nao e comparavel a baseline antiga.
- Smoke canonico com os bytes CRLF atuais: 0 bps em 224 pares completos, candidata ancestral `ae294311d701c1af11ad1de03593bfca6e5cd44968a834a81b71289d512c5838`, painel 634/1.318 campos disponiveis e 684 desconhecidos. Nenhum avaliador, fixture, atributo de checkout ou configuracao Git foi editado para mascarar a deriva.
- Esse checkout tambem revelou um assert incidental de bytes em `src/onchain-read/web-fixture-drift.test.ts`. A guarda agora compara todo o JSON estrutural e o conjunto exato de rotas, sem alterar gerador, fixture ou producao. Smoke Bun 1.3.14 confirmou CRLF real, 11 rotas iguais e rejeicao de mutacao semantica. Revisao independente sem achados.
- Gate pos-reparo saiu 0: focado 1 pass, 0 fail, 2 expect calls (208 ms); `bun run typecheck` exit 0; `bun run test` 7.841 pass, dois skips existentes, 0 fail, 983.943 expect calls, 481 arquivos (224,99 s); `bun run test:lab` 647 pass, 0 fail, 838.136 expect calls, 16 arquivos (21,41 s).
- Proximo segmento: baseline CRLF separada e campanha pre-declarada de 12 execucoes incluindo baseline e repeticao final. Somente a candidata pode mudar o comportamento; status/log registram evidencias. O reparo de contrato acima integra a baseline e fica congelado depois. Sem inferencia JEV, holdout, qualificacao financeira ou alteracao de risco.

## Campanha do segmento 2

Baseline `f758ed0c9507`; avaliador e evidencia CRLF congelados conforme secao anterior. As 12 execucoes pre-declaradas foram runs 4 a 15: baseline, dez hipoteses e repeticao final dos melhores bytes retidos. Nao e holdout nem avaliacao do JEV.

| Run | Hipotese | Delta sintetico pareado (bps) | Resultado |
| --- | --- | ---: | --- |
| 4 | Baseline ancestral | 0 | Registrada |
| 5 | H2 momentum menos custos | -0.1879266929903146 | Descartada |
| 6 | H3 custos e funding adverso anunciado | 2.4292302252795377 | Retida |
| 7 | H4 H3 dividido por volatilidade | -2.2337483869892063 | Descartada |
| 8 | H5 H3 menos volatilidade historica do horizonte | 3.1695535508414894 | Retida, melhor |
| 9 | H6 perpetuo H3 vs spot liquido | 2.275691072403917 | Descartada |
| 10 | H7 somente regra carry | -15.083458600486491 | Descartada |
| 11 | H8 somente spot long | -55.97450860696703 | Descartada |
| 12 | H9 net/capital multimodal | 2.275691072403917 | Descartada |
| 13 | H10 reversao a media | -58.0748036701646 | Descartada |
| 14 | H11 confirmacao spot | 2.4292302252795377 | Descartada |
| 15 | Repeticao dos bytes H5 retidos | 3.1695535508414894 | Repeticao identica; sem nova melhora |

- Runs 4-15 foram comparados com seus indicadores numericos e painel completos. Os ciclos emitiram 54, 65 ou 70 metricas numericas, conforme as metricas aplicaveis aos denominadores e campos; nao se presume que todos emitam 70. H5 e run 15 coincidem em bytes, 70 metricas, painel e hashes congelados. O run 15 confirma determinismo; repeticao flat nao e uma nova melhora nem outro vencedor.
- H3 do run 6 foi retida anteriormente, mas H5 do run 8 e a melhor candidata atual. Na retencao H5: 224 pares completos, 101 trades e 123 holds; holds permanecem no denominador, cobertura de custo 1 e exclusoes 0. Media liquida candidata de 18.253012151327965 bps por epoca contra 15.083458600486491 da ancestral; drawdown 1x 9.329601331584831% contra 12.194002098794696%. Delta pareado sintetico +3.1695535508414894 bps nao e retorno financeiro.
- O contrafactual frozen de H5 a 10x ainda perde capital: multiplicador final 0.6318694338042523, drawdown 80.38860551835474%, 3 liquidacoes em 101 trades (2.97029702970297%), taxa pior que as 6 em 224 trades da ancestral (2.6785714285714284%). Contagens absolutas menores nao significam taxa menor. O resultado nao valida margem real OKX, carteira executada ou meta 10x.
- Run 13, H10: drawdown 10x de 114.74170280664448% no modelo frozen e multiplicador final 0.0016097101708001907; e contrafactual, nao validacao de margem real OKX.
- Catalogo congelado: 634 campos conhecidos/disponiveis, 684 desconhecidos, de 1.318; 48.1% e disponibilidade, nao qualidade financeira. Snapshot seguro reuniu 1.110 medicoes de 20 fontes. Stress wallet fixo nao mede a alocacao da candidata.
- Fraquezas abertas: PnL reconciliado em USD, FX contemporaneo e custos completos; zero outcomes prospectivos maduros; Choice/pBuy sem calibracao; scoreboard com 303 linhas que falham schema e resumos dependentes indisponiveis. Nao ha holdout nem evidencia de desempenho fora do workload. Necessidades futuras nao sao entregas desta campanha.

- Gate final da campanha informado pelo integrador: `bun run typecheck && bun run test && bun run test:lab`, Bun 1.3.14, PASS; typecheck exit 0, global 7.841 pass, 2 skips, 0 falhas (7.843 testes/481 arquivos), laboratorio 647 pass, 0 falhas (16 arquivos). A revisao documental independente nao teve achados. A repeticao final H5 completou 12 smokes e confirmou os mesmos bytes, hashes e metricas; isso confirma determinismo, nao nova melhora ou qualificacao financeira.
- Limite do avaliador congelado: feature de settlements exclui evento exatamente na saida, enquanto o outcome pode inclui-lo. Funding anunciado multiplicado pela contagem e proxy point-in-time, nao garantia de custo futuro. Nao houve mudanca oportunista do avaliador ou credito por funding futuro.

