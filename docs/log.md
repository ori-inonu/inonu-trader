---
title: "Log da wiki documental"
created: 2026-10-13
updated: 2026-10-16
type: summary
tags: ["documentacao", "governanca"]
sources: ["docs/SCHEMA.md", "docs/_meta/source-manifest-20261013.json"]
confidence: medium
---

# Log da wiki documental

Registro append-only dos lotes desta wiki. Consulte [[manutencao-da-documentacao]] e [[governanca-e-historico]]. Nenhuma entrada conclui tarefa de produto ou autoriza ação financeira.

## [2026-10-13] create | Wiki documental e inventário inicial

- Domínio: documentação local do Inonu/Jev Trader. Baseline: 988 arquivos, 407 Markdown; 5 configurações ocultas excluídas da navegação.
- Estrutura in-place recomendada pelo Jev; recibo real em `_meta/navigation-decision.json`, aprovado por delegação técnica, não aprovação humana. Custo faturado desconhecido.
- Criados schema, entrada, índice, mapa, 36 catálogos paginados, manifesto de hashes e verificador offline. Fontes originais não foram editadas.
- Arquivos criados neste lote:
- `docs/README.md`
- `docs/SCHEMA.md`
- `docs/_meta/catalog.json`
- `docs/_meta/catalogs/carteira-e-patrimonio-artefatos-01.md`
- `docs/_meta/catalogs/carteira-e-patrimonio-documentos-01.md`
- `docs/_meta/catalogs/defi-e-oportunidades-artefatos-01.md`
- `docs/_meta/catalogs/defi-e-oportunidades-documentos-01.md`
- `docs/_meta/catalogs/fita-e-decisao-jev-artefatos-01.md`
- `docs/_meta/catalogs/fita-e-decisao-jev-documentos-01.md`
- `docs/_meta/catalogs/governanca-e-historico-artefatos-01.md`
- `docs/_meta/catalogs/governanca-e-historico-documentos-01.md`
- `docs/_meta/catalogs/grafico-e-analytics-artefatos-01.md`
- `docs/_meta/catalogs/grafico-e-analytics-documentos-01.md`
- `docs/_meta/catalogs/instalavel-e-inonu-artefatos-01.md`
- `docs/_meta/catalogs/instalavel-e-inonu-documentos-01.md`
- `docs/_meta/catalogs/integracao-real-e-piloto-artefatos-01.md`
- `docs/_meta/catalogs/integracao-real-e-piloto-artefatos-02.md`
- `docs/_meta/catalogs/integracao-real-e-piloto-documentos-01.md`
- `docs/_meta/catalogs/interface-e-central-artefatos-01.md`
- `docs/_meta/catalogs/interface-e-central-documentos-01.md`
- `docs/_meta/catalogs/laboratorio-e-paper-artefatos-01.md`
- `docs/_meta/catalogs/laboratorio-e-paper-documentos-01.md`
- `docs/_meta/catalogs/mercado-e-dados-artefatos-01.md`
- `docs/_meta/catalogs/mercado-e-dados-documentos-01.md`
- `docs/_meta/catalogs/onchainos-e-configuracoes-artefatos-01.md`
- `docs/_meta/catalogs/onchainos-e-configuracoes-artefatos-02.md`
- `docs/_meta/catalogs/onchainos-e-configuracoes-documentos-01.md`
- `docs/_meta/catalogs/operador-e-execucao-artefatos-01.md`
- `docs/_meta/catalogs/operador-e-execucao-documentos-01.md`
- `docs/_meta/catalogs/relatorios-e-evidencias-artefatos-01.md`
- `docs/_meta/catalogs/relatorios-e-evidencias-artefatos-02.md`
- `docs/_meta/catalogs/relatorios-e-evidencias-artefatos-03.md`
- `docs/_meta/catalogs/relatorios-e-evidencias-artefatos-04.md`
- `docs/_meta/catalogs/relatorios-e-evidencias-artefatos-05.md`
- `docs/_meta/catalogs/relatorios-e-evidencias-artefatos-06.md`
- `docs/_meta/catalogs/relatorios-e-evidencias-artefatos-07.md`
- `docs/_meta/catalogs/relatorios-e-evidencias-documentos-01.md`
- `docs/_meta/catalogs/seguranca-e-qualificacao-artefatos-01.md`
- `docs/_meta/catalogs/seguranca-e-qualificacao-documentos-01.md`
- `docs/_meta/navigation-decision.json`
- `docs/_meta/organization-spec.md`
- `docs/_meta/source-manifest-20261013.json`
- `docs/_meta/tools/verify.py`
- `docs/_meta/topic-map.md`
- `docs/index.md`
- `docs/raw/README.md`
- `docs/sdd/inonu-desktop-v1/spikes/T1.1.md`
- `docs/log.md`

## [2026-10-13] update | Ampliação para auditoria do projeto atual

- Pedido adicional do usuário: atualizar a wiki contra o código atual, com 15 subagentes em paralelo. SPEC ampliada em `_meta/organization-spec.md`.
- Snapshot do working tree em `_meta/project-state-20261013.json`: 1048 arquivos de primeira parte/configuração/testes/fixtures atribuídos; 984 fontes visíveis, das quais 408 Markdown. Atribuição não prova inspeção.
- **Correção do lote anterior:** `docs/sdd/inonu-desktop-v1/spikes/T1.1.md` foi criado por outra sessão, não por esta organização. Sua inclusão na lista automática anterior foi um erro de atribuição. A fonte foi preservada e registrada em `_meta/source-additions-20261013.json`; o manifesto inicial não foi sobrescrito.
- 15 subagentes realmente despachados em `deleg_6e7c6418`, conforme `_meta/delegation-dispatch.json`; no momento deste registro isso não comprova conclusão. Escrita exclusiva por página e recibo, contrato em `_meta/delegation-contract.md`.
- Catálogo e navegação atualizados para a fonte concorrente. Fontes originais e critérios congelados não foram editados.
- Verificador documental exercitado em fixtures sintéticas isoladas: `python -B docs/_meta/tools/verify.test.py`, 12 testes aprovados, saída 0. A primeira execução reproduziu uma falha no tratamento de fonte ausente; o verificador foi corrigido e a regressão passou. Isso não é verificação do produto.
- Arquivos criados: `_meta/project-state-20261013.json`, `_meta/source-additions-20261013.json`, `_meta/delegation-contract.md`, `_meta/delegation-dispatch.json`, `_meta/tools/verify.test.py`, `_meta/checkpoint.md`.
- Arquivos atualizados: `_meta/organization-spec.md`, `_meta/catalog.json`, `_meta/catalogs/instalavel-e-inonu-documentos-01.md`, `_meta/topic-map.md`, `_meta/tools/verify.py`, `index.md`, `log.md`.

## [2026-10-13] update | Verificação real do projeto e deriva concorrente

- `python -B docs/_meta/tools/verify.test.py`: 12 aprovados, 0 falhas.
- `bun --no-env-file run test`: 4420 aprovados, 2 ignorados, 0 falhas, 252 arquivos.
- `bun --no-env-file run build`: build de produção aprovado.
- `bun --no-env-file run typecheck:all`: raiz e web sem erro.
- `bun --no-env-file run --cwd web test`: 2260 aprovados, 0 falhas, 150 arquivos.
- Todos os comandos retornaram saída 0. Recibo com logs e hashes em `_meta/product-verification-20261013.json`. Boot do trader não executado; nenhuma execução financeira ou chamada real ao modelo foi qualificada.
- Deriva posterior ao snapshot observada em 44 arquivos de código/testes: `_meta/concurrent-source-drift-20261013.json`. Os quatro responsáveis afetados receberam steer de releitura. Isso não concede permissão de corrigir o código de outras sessões.
- Criados `_meta/product-verification-20261013.json` e `_meta/concurrent-source-drift-20261013.json`; atualizados `_meta/checkpoint.md` e `log.md`. Integração das 15 frentes e lint completo da wiki permanecem pendentes.

## [2026-10-15] update | Hierarquia por versão, fase e tarefa

- Pedido desta conversa: evolução do segundo cérebro em `docs/`, sem retomar objetivos ou agentes de outra conversa. SPEC própria em `_meta/evolucao/SPEC.md`.
- Nova camada: 1.358 fontes visíveis (549 Markdown e 809 artefatos), 17 pacotes, 41 agrupamentos nativos/derivados explicitamente rotulados e 331 tarefas com namespace, ID original, fonte e linha. A lista exata das 452 páginas compiladas, do grafo e do recibo, com hashes, está em `_meta/evolucao/outputs.json`.
- v0.0.2 comprovada como declaração em manifests/candidato local, não publicação atual. v0.0.1 não comprovada nas refs/manifests consultados. Tarefas recentes sem release atribuída; nenhum número foi inventado para completar a árvore.
- Síntese do refactor e sete relações com escopo/fonte em `concepts/estado-atual-do-projeto.md`; conflito de relato sobre alavancagem continua aberto. Rótulos de conclusão das fontes não viraram prova de implementação.
- Auditorias independentes de história e atualidade recebidas em `deleg_93eb7540`; referências principais reconferidas pelo integrador. Custo de processamento desconhecido. Nenhuma chamada ao modelo/API do produto.
- Compilador offline exercitado: 19 testes aprovados; regressão de deriva primeiro falhou (`test_inventory_drift_is_not_certified`), foi corrigida e passou. Regressões das fatias E/F também reproduzidas antes da extensão. Compilação real com zero erros próprios. Revisão independente final em curso (`deleg_7894268e`).
- Seis controles preexistentes recebem integração limitada: `README.md`, `index.md`, `SCHEMA.md`, `_meta/currentness.md`, `log.md`, `_meta/generated-files.json`. Fontes, contratos canônicos, código de produto e `.obsidian` não são alvos de edição.
- Novos controles e ferramentas: `_meta/evolucao/{SPEC.md,checkpoint.md,RUNBOOK.md,compiler.py,test_compiler.py,curation.json,baseline-20261015.json,legacy-baseline-20261015.json,outputs.json}`. Recibos de aceitação/revisão serão registrados ao encerrar; as páginas materiais exatas estão no manifesto de saídas, sem duplicar o plano canônico.
- O harness antigo é preservado. Suas falhas anteriores estão em `legacy-baseline-20261015.json`, não corrigidas nem ocultadas para declarar verde global. Compilar documentação não executa produto nem qualifica funcionamento financeiro.

## [2026-10-15] review | Três achados bloqueadores e correção delimitada

- Revisão real `deleg_7894268e`, `passed=false`, preservada em `_meta/evolucao/review-1.json`. Não é aprovação humana nem resultado verde.
- Achados: traversal em evidence, propagação de metadados/hash legado da fonte sensível e exclusão irrestrita do prefixo de evolução com cobertura autorreferente.
- Fixer distinto, `deleg_0e1905a5`, recebe só compiler.py/test_compiler.py; correção com regressões e sem alteração de fontes/produto. Integração e reavaliação permanecem com o integrador.
- Aceitação adaptada para registros sensíveis contendo apenas caminho. A contagem de 1.358 fontes é o retrato anterior à inclusão explícita dos controles estáticos como inputs, não uma cobertura final reafirmada.
- Deriva de COORDENACAO registrada em `_meta/evolucao/observed-source-drift-20261015.json`, sem atribuição de autoria ou reversão. Fontes originais e baseline inicial não foram reescritas.

## [2026-10-15] update | Correções de segurança, cobertura e materialização

- Fixer distinto deleg_0e1905a5 corrigiu somente compiler.py/test_compiler.py. Recibo fix-1.json. Reportou regressões antes da implementação; integrador reexecutou 28 testes novos, 21 legados e a compilação/aceitação reais, tudo com saída 0.
- A referência sensível no inventário materializado contém apenas path. Leituras de curadoria recusam traversal, symlink externo e privados antes de abrir. A cobertura inclui seis inputs estáticos, exclui derivados por registro e é enumerada separadamente.
- Contagens corrigidas: 1.364 fontes (550 Markdown, 813 artefatos e uma referência sensível sem leitura), 17 pacotes, 41 agrupamentos, 331 tarefas, 454 páginas compiladas, 1.765 nós e 1.486 relações. Novo catálogo meta/fontes sensíveis registrado; outputs.json lista exatamente as saídas.
- Checagem real dos ponteiros: 309 IDs nativos conferidos contra suas linhas, zero divergências, e 22 itens sem ID original claramente rotulados. Não se atribuiu release recente nem verificação de implementação de produto.
- acceptance.json às 16:08 -03:00 registra materialização exata, rebuild idêntico, validação própria verde e nenhum novo erro atômico legado. A deriva original registrada continua visível como byte_preservation_ok=false; não foi ocultada nem revertida.
- README, índice, schema e RUNBOOK atualizados. Revisão2 delimitada deleg_e6a1a10c ainda pendente neste registro; não declarar aprovação antes do retorno real.

## [2026-10-15] verify | Entrega documental concluída

- Revisão2 real deleg_e6a1a10c: passed=true, REV1-S1/REV1-S2/REV1-L1 resolvidos, nenhuma preocupação de segurança ou erro de lógica remanescente no escopo revisado. Recibo `_meta/evolucao/review-2.json`; `_meta/evolucao/fix-1.json` atualizado. Integrador conferiu os hashes atuais contra início/fim do revisor, todos iguais.
- Aceitação final executada às 16:11 -03:00: saída 0, 28 testes próprios e 21 legados aprovados, páginas/manifesto byte-exatos e rebuild do grafo idêntico. Nenhum erro atômico novo no harness legado, que permanece com falhas anteriores.
- Entrega final: 1.364 fontes, 17 pacotes, 41 agrupamentos, 331 tarefas e 454 páginas compiladas. IDs nativos preservados, relações de substituição com escopo, versões desconhecidas não inventadas e fonte sensível apenas por caminho.
- Fontes canônicas não foram movidas, apagadas ou reescritas por esta tarefa; deriva externa observada fica registrada sem autoria inferida e sem reversão. Não há alegação de preservação global byte a byte.
- Checkpoint próprio encerrado. Não foram abertos novos objetivos, agendamentos, operações financeiras, publicação ou commits. Critérios/evidências exatos em `_meta/evolucao/SPEC.md`, `outputs.json`, `acceptance.json` e recibos das duas revisões. Atualização sob demanda documentada em RUNBOOK.




## [2026-10-16] update | Benchmark offline de decisoes para autoresearch

- Criados `autoresearch.sh`, workload deterministico, politica candidata isolada, inventario do painel e congelador read-only; especificacao, plano, tarefas e evidencias em `specs/autoresearch-decisoes/`.
- Snapshot seguro de 20 fontes e 1.110 medicoes a partir de capturas locais e do home real do runtime. A execucao canonica usa somente o fixture versionado, sem rede, credenciais, relogio atual, chamadas ao JEV ou ordens financeiras.
- Inventario executado com 1.318 campos: 634 disponiveis e 684 desconhecidos. Custos ausentes, fluxos nao conciliados, 303 linhas invalidas do scoreboard e falta de outcomes prospectivos maduros ficam visiveis, sem inventar zeros ou lucro.
- Primaria de desenvolvimento `synthetic_paired_net_return_bps=0` em 224 pares completos, paridade com a politica ancestral. Duas execucoes finais tiveram stdout identico; smoke separado confirmou sensibilidade a politica. Nao houve otimizacao nesta fase.
- Gate final verde: typecheck exit 0; global 7.841 pass, dois skips existentes e zero falhas em 481 arquivos; laboratorio 647 pass e zero falhas. Os cinco arquivos reparados tiveram 57 testes focados aprovados. Loader de settings isolado do ambiente herdado; quatro wrappers CLI usam supervisao assincrona para evitar o defeito reproduzido de relogio nativo do Bun 1.3.14 no Windows, sem alterar producao, asserts ou limites.
- Revisoes independentes e smokes reais concluidos; benchmark posterior com 70 metricas finitas e stdout identico byte a byte. Historico das falhas, reproducao antes/depois e saidas exatas em `specs/autoresearch-decisoes/status.md`. A inicializacao prematura anterior fica preservada; nova baseline somente apos esse gate. Alteracoes originais do usuario mantidas em stash separado.
- Escopo dos ciclos seguintes restrito a politica candidata, com avaliador e evidencias congelados. Meta de US$ 118 para US$ 1.180 em menos de 24h continua nao demonstrada; nenhuma autorizacao, limite de risco ou caminho live foi alterado.

## [2026-10-16] fix | Contrato JSON independente do checkout Windows

- O descarte de um experimento reidratou arquivos como CRLF por `core.autocrlf=true`, alterando hashes brutos do avaliador/evidencia sem mudanca semantica. A comparabilidade anterior foi invalidada explicitamente; nova baseline fica separada, sem editar fixture, avaliador ou configuracao Git.
- Removida comparacao incidental de bytes na guarda de fixture onchain. Preservadas igualdade estrutural completa e rotas exatas; smoke real confirmou as 11 rotas e a deteccao de mutacao semantica, com revisao independente sem achados.
- Gate verde no Bun 1.3.14: focado 1 pass; typecheck exit 0; global 7.841 pass, dois skips existentes, zero falhas; laboratorio 647 pass, zero falhas. Saidas, hashes e tentativas rejeitadas em `specs/autoresearch-decisoes/status.md`.
- Nenhuma melhora de politica foi retida ate aqui. A meta financeira 10x/24h continua nao demonstrada; nenhum caminho de dinheiro real foi alterado.

## [2026-10-16] update | Primeira melhora de politica offline qualificada

- Hipotese de custos isolados descartada (-0,1879266929903146 bps). Politica candidata com custos e penalidade de funding adverso anunciado aprovada para retencao: delta sintetico pareado +2,4292302252795377 bps em 224 pares completos, cobertura de custos 100%, sem exclusoes ou outcomes de custo desconhecido.
- Selecao exige score finito estritamente positivo; empate zero mantem hold, inclusive antes lexicograficamente. Funding desconhecido nao vira zero, e recebimentos nao recebem credito. Oito cenarios reais de smoke passaram com inputs imutaveis; revisao estatica independente sem achados.
- Gate Bun 1.3.14 verde: typecheck exit 0, global 7.841 pass/dois skips existentes/zero falhas, laboratorio 647 pass/zero falhas. Evidencias completas em `specs/autoresearch-decisoes/status.md`.
- Drawdown da candidata segue 12,194002098794696%; 10x sintetico ainda tem seis liquidacoes. Os 1.318 campos do painel congelado permanecem integralmente iguais; o stresswallet fixo nao mede a candidata. Isso nao e melhoria demonstrada do JEV, retorno real, holdout ou qualificacao financeira.

## [2026-10-16] update | Penalidade historica de volatilidade no ciclo offline

- Normalizacao do score por volatilidade descartada por regressao (-2,2337483869892063 bps). Subtrair uma volatilidade historica do horizonte, sem calibracao de limiar, melhorou o delta sintetico pareado para +3,1695535508414894 bps contra a ancestral fixa; drawdown 1x caiu de 12,194002098794696% para 9,329601331584831%.
- A candidata opera em 101 de 224 epocas e escolhe hold nas outras 123; os holds permanecem no denominador pareado. Custos conhecidos em 100% dos trades e nenhuma exclusao. Volatilidade desconhecida/invalida nao permite operar.
- Doze cenarios reais de smoke e revisao independente aprovados. Gate Bun 1.3.14 verde: typecheck exit 0, global 7.841 pass/dois skips existentes/zero falhas, laboratorio 647 pass/zero falhas.
- Catalogo congelado de 1.318 campos integralmente inalterado. Contrafactual 10x ainda tem tres liquidacoes e multiplicador final 0,6318694338042523, com maior taxa de liquidacao por trade que a ancestral. A melhora e sintetica, reutiliza o mesmo conjunto e nao demonstra retorno real, inferencia JEV melhor, holdout ou autorizacao financeira.


## [2026-10-16] update | Campanha offline segmento 2 concluida

- Concluidas as 12 execucoes pre-declaradas, runs globais 4-15, partindo da baseline `f758ed0c9507`. Resultado completo, valores, hashes e limites em `specs/autoresearch-decisoes/status.md`.
- Runs 9-14: H6 +2.275691072403917 bps, H7 -15.083458600486491, H8 -55.97450860696703, H9 +2.275691072403917, H10 -58.0748036701646 e H11 +2.4292302252795377; todos descartados frente a H5. Run 15 repetiu H5 sem alteracao: 70 metricas, painel e hashes congelados identicos, sem classificar a repeticao flat como melhora.
- Melhor candidata mantida: H5, commit `220304e2bd06`, +3.1695535508414894 bps sinteticos pareados; 224 pares, 101 trades/123 holds, media 18.253012151327965 bps por epoca contra 15.083458600486491 ancestral, drawdown 1x 9.329601331584831% contra 12.194002098794696%, cobertura 1 e exclusoes 0.
- A 10x sintetico, H5 ainda perde capital (multiplicador 0.6318694338042523), drawdown 80.38860551835474% e 3 liquidacoes/101 trades, taxa maior que ancestral (6/224). O stress wallet fixo nao mede alocacao candidata; H10 teve drawdown contrafactual 10x de 114.74170280664448%, sem validar margem real OKX.
- Catalogo: 634 conhecidos, 684 desconhecidos em 1.318; 48.1% significa disponibilidade, nao qualidade. Snapshot: 1.110 medicoes/20 fontes. Continuam ausentes PnL reconciliado, FX e custos completos, outcomes maduros, calibracao Choice/pBuy, scoreboard valido e avaliacao OOS. Nenhuma dessas necessidades foi entregue; sem retorno real, holdout, qualificacao financeira ou demonstracao de 10x/24h. Gate final reportado pelo integrador: typecheck exit 0; testes globais 7.841 pass, 2 skips, 0 falhas em 481 arquivos; laboratorio 647 pass, 0 falhas em 16 arquivos (Bun 1.3.14); revisao documental independente sem achados.
