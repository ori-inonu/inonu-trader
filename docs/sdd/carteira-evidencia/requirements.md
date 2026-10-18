# Carteira com evidência verificável: requisitos

Pasta SDD única desta funcionalidade. Arquivos irmãos: [design.md](design.md) (estado real, contrato de evidência, colisões) e [tasks.md](tasks.md) (plano finito e verificável).

| Campo | Valor |
| --- | --- |
| Projeto | `C:\Users\gabri\jev-trader` (remoto `origin` = `https://github.com/ori-inonu/inonu-trader.git`). Não confundir com `Documents\GitHub\jeve-trader`, que é outro checkout e não foi usado como evidência. |
| Baseline do estado real | branch `main`, commit `14cbb7b` (clean, 138 commits à frente de `origin/main` e de `upstream/main`, nunca enviado). Alterações não commitadas de terceiros são tratadas à parte em [design.md](design.md#2-trabalho-concorrente-e-colisões). |
| Data | 2026-10-11 |
| Natureza deste documento | **Especificação.** Nenhum código novo foi escrito por este objetivo. Onde a coluna "Hoje" diz IMPLEMENTADO, o arquivo citado já existe em `main`; onde diz AUSENTE ou SÓ ESPECIFICADO, não existe. |

## 1. Missão

Apoiar a gestão **manual** de uma carteira de criptomoedas com dados verificáveis, análise pelo JEV e relatórios acionáveis, priorizando a qualidade das decisões e resultados **líquidos de custos**, sem prometer rentabilidade.

- Reaproveitar a interface, os módulos e as integrações existentes. Investir primeiro em coleta, reconciliação, avaliação e rastreabilidade.
- Não construir outra plataforma, não redesenhar a interface inteira, não acrescentar dependências sem necessidade demonstrada.
- Nesta etapa o sistema automatiza **coleta autorizada, validação, pesquisa, simulação e geração de análises**. A decisão e a execução de compras, vendas, transferências e assinaturas ficam com o usuário.

## 2. Invariantes (valem para todos os objetivos)

| ID | Invariante |
| --- | --- |
| P1 | Nenhum caminho deste trabalho assina, envia, aprova, transfere, compra ou vende. Um teste de pureza (varredura de imports e de tokens proibidos) deve provar isso por módulo novo. |
| P2 | Desconhecido nunca vira zero. Ausente, omitido por filtro, vencido e não reconciliado são estados, não quantidades. |
| P3 | A identidade de um ativo é **rede + endereço do contrato**. O símbolo serve só para apresentação. |
| P4 | Dado sintético é sempre identificado como tal, no dado e na tela. Nenhuma fixture é apresentada como captura real. |
| P5 | Valores financeiros usam aritmética exata (inteiros e texto decimal). Regras de WIN/BRL (futuros brasileiros) e do mandato Kuru MON/USDC não são reaproveitadas sem verificar unidades, taxas e modelo de mercado. |
| P6 | Dados da carteira ficam no navegador por padrão (contrato O5/W7 em `docs/OKX-SPEC.md` e `docs/WALLET-OPPORTUNITIES-SPEC.md`). Qualquer envio ao backend ou ao JEV exige um fluxo de consentimento próprio, com destinatário, campos e finalidade declarados (decisão D2). |
| P7 | Credenciais nunca entram no repositório, em logs, em prompts ou em relatórios. Chamadas pagas e autenticadas exigem autorização própria. |
| P8 | Documentos históricos são preservados e referenciados; esta pasta é a fonte canônica da funcionalidade e não duplica o conteúdo deles. |
| P9 | Convenções do projeto: Bun (`CLAUDE.md`), Next.js 16 com mudanças incompatíveis (`web/AGENTS.md`), texto exibido sem ponto médio, travessão ou meia-risca, nada que pisque ou pulse. |

## 3. Requisitos do contrato de evidência (Objetivo 1)

Cada linha tem critério de aceitação testável. "Hoje" refere-se a `main@14cbb7b` e a evidência por arquivo e linha está em [design.md §3](design.md#3-estado-real-por-área).

| ID | Requisito | Critério de aceitação | Hoje |
| --- | --- | --- | --- |
| RQ-01 | **Identidade**: rede + contrato, com chave canônica determinística. | Mesma chave para o mesmo ativo em qualquer grafia (EVM sem distinguir maiúsculas; Solana distinguindo); nativo com marcador explícito por rede; símbolo e nome só em `display`; duas linhas com a mesma chave são reportadas como duplicata, nunca somadas em silêncio. | PARCIAL. Backend guarda `chainIndex` + `tokenContractAddress` como recebidos e soma duplicatas; a UI web chaveia saldos por nome de campo. |
| RQ-02 | **Quantidade exata**: `atoms` (inteiro decimal em texto), `decimals`, unidade. | Nenhum `number` no caminho de valor. `decimals` desconhecido impede qualquer valor derivado e fica registrado como desconhecido. | PARCIAL. Backend computa em `Number` e descarta `rawBalance` e `decimals`; a leitura web usa BigInt, mas com decimais fixos no código. |
| RQ-03 | **Avaliação separada da quantidade**: preço em texto decimal, moeda de avaliação, instante do preço e fonte do preço. | Valor derivado só existe quando preço, decimais e unidade são conhecidos. Preço `"0"` sem evidência de que seja real não é "conhecido". Preço sem instante tem frescor desconhecido. | AUSENTE como contrato. Hoje saldo com preço `"0"` é "conhecido e completo" (`src/okx-wallet/valuation.test.ts:82`). |
| RQ-04 | **Dois tempos**: instante de captura e instante de origem, separados e anuláveis. | `capturedAtMs` e `sourceTimeMs` distintos; bloco ou slot registrados quando existirem; relógio local desviado é corrigido pelo da OKX quando o desvio é conhecido; frescor (`unknown`, `future`, `stale`, `fresh`) calculado na geração, nunca derivado do instante de captura. | PARCIAL. Só captura local; bloco/slot só nas leituras web. |
| RQ-05 | **Proveniência**: fonte, endpoint, versão do schema, cobertura, filtros, origem, hash. | Todo snapshot traz `schema`, `snapshotId`, `revision`, `origin`, `source`, cobertura por rede (pedida, observada, não reportada), filtros aplicados (inclusive filtro de tokens de risco) e `contentSha256`. | PARCIAL. Existe em módulo não commitado (`valuation-diagnostics.ts`, ver design §2). |
| RQ-06 | **Conceitos distintos**: saldo ativo, histórico de operações, PnL e custo de aquisição. | Quatro tipos separados. Patrimônio atual soma só saldos ativos avaliados. PnL histórico nunca entra no patrimônio. Custo de aquisição declara método e janela de cobertura. | Saldo ativo IMPLEMENTADO (parcial). Histórico SÓ ESPECIFICADO. Custo AUSENTE. PnL deliberadamente não afirmado (`realizedUsd: null`). |
| RQ-07 | **Estados explícitos** por dado e por posição. | Enumeração fechada: `ok`, `missing`, `omitted_by_filter`, `stale`, `future`, `divergent`, `unreconciled`, `unverified`, cada uma com código de motivo. Nenhum estado projeta quantidade ou valor. | PARCIAL. Há `valueComplete`, `null` e "indisponível" em partes isoladas; sem enumeração comum. |
| RQ-08 | **Conciliação** entre fontes e entre conceitos. | Ver §4 (AC-a a AC-f) e as regras de design §4.5. | AUSENTE. Existe só `reconcileRealizedUsd` do operador, que na fonte live nunca produz delta. |
| RQ-09 | **Sintético identificado.** | `origin = synthetic_fixture` em todo dado de teste; a UI e o relatório exibem o rótulo; um teste garante que uma fixture não passa por captura real. | PARCIAL. Rótulos existem em partes; a mesa mostra ciclo do System One como "ao vivo" sem checar fonte (design §5). |
| RQ-10 | **Aritmética segura e sem regras alheias.** | BigInt ou texto decimal; testes de grandes inteiros, 18 e 6 decimais, e arredondamento declarado; nenhum identificador de WIN/BRL, nenhuma suposição de MON/USDC no módulo novo. | PARCIAL. Exato só na leitura web, no delta de conciliação e em `paper-capital`. |

## 4. Casos de aceitação obrigatórios (do contrato de carteira)

| ID | Caso | Cobertura hoje |
| --- | --- | --- |
| AC-a | Um token omitido por filtro de risco **não** vira saldo zero. | PARCIAL. Token omitido não gera linha e o filtro é registrado, mas só um teste cobre (`src/operator/result.test.ts:52`); a UI mostra "cobertura completa" mesmo com filtro (`web/src/components/DecisionCenter/DecisionCenter.tsx:184`). |
| AC-b | Quantidade histórica com avaliação ativa zerada gera **pendência de reconciliação**. | SEM CÓDIGO E SEM TESTE. O comportamento atual é o oposto (saldo com preço `"0"` é completo). |
| AC-c | PnL histórico **não** é somado ao patrimônio atual. | Separado por construção hoje (`knownValueUsd` só soma inventário), sem teste que afirme a não soma. |
| AC-d | Divergência entre o total reportado e a soma das posições aparece com explicação ou como **não resolvida**. | AUSENTE. `totalValue()` existe sem consumidor e nunca é comparado com a soma. |
| AC-e | Identidade duplicada, rede errada, decimais distintos e dados fora de ordem têm testes. | PARCIAL. Rede errada tem testes; duplicidade só na conciliação do operador; decimais distintos e fora de ordem sem teste no inventário. |
| AC-f | Fixtures sintéticas identificadas; nenhum dado inventado apresentado como captura real. | PARCIAL (rótulos sem teste; endereço de teste não rotulado em 3 arquivos). |

## 5. Requisitos de coleta, análise, avaliação e relatório

| ID | Requisito | Critério de aceitação | Hoje |
| --- | --- | --- | --- |
| RQ-11 | **Coleta somente autorizada.** Fontes permitidas: carteira do navegador por gesto explícito, RPC público, importação local de arquivo, API Web3 da OKX com credenciais do projeto no servidor. | Nenhum adaptador lê credenciais fora do ponto único de configuração; o modo sem rede/credencial devolve estado explícito, não dado de exemplo. | PARCIAL. API de saldos exige credenciais `OKX_WEB3_API_*` que não existem no ambiente; leituras web existem com alcance limitado. |
| RQ-12 | **Cobertura honesta por rede e por família de API.** | Mercado, saldo, DEX, histórico e DeFi são capacidades distintas; suporte numa não implica suporte noutra; cobertura aparece no snapshot e na tela. | PARCIAL. |
| RQ-13 | **Rastreabilidade.** | Toda análise e todo relatório carregam `snapshotId`, hash do snapshot e versão do schema; journals com `schemaVersion`, escrita atômica e rotação; `correlationId` entre captura, análise e relatório. | PARCIAL. System One e jev-read versionam; o ciclo do operador não tem `schemaVersion`; não há id de correlação entre sistemas. |
| RQ-14 | **Análise do JEV de carteira, consultiva e validada.** | Entrada sanitizada derivada de snapshot (sem endereço completo, sem credenciais); pergunta de **revisão** (não "qual operação abrir"); resposta em enumeração fechada validada; resposta inválida, atrasada ou cancelada não decide; custos desconhecidos bloqueiam conclusões dependentes; registro vinculado ao hash do snapshot. | AUSENTE para carteira. O padrão existe em `src/jev-read`, `src/system-one` e `src/operator`. |
| RQ-15 | **Fronteira de execução.** | Módulo novo sem importação de signer, ethers ou executor; teste de pureza por varredura; saída marcada `advisory` e `execution: never`. | PARCIAL. Só o laboratório tem teste de pureza imposto. |
| RQ-16 | **Resultado líquido com taxonomia única**: `realized`, `projected`, `simulated`, `inventory_delta`. | Cada número exibido declara a classe; custo desconhecido nunca vira zero e bloqueia o líquido; `inventory_delta` não alimenta realizado nem reinvestimento. | AUSENTE como taxonomia. Hoje: `hypothetical`, `synthetic-paper`, `resultBasis: "inventory_only"`. |
| RQ-17 | **Reprodutibilidade.** | Seeds, hashes de entrada e versão de código registrados; relatório reconstruível só do journal. | PARCIAL (laboratório e replay têm; o resto não). |
| RQ-18 | **Relatório acionável offline** da carteira (JSON e HTML estático, legível em 360 e 390 px). | Alocação só de posições avaliadas; cobertura e estados visíveis; pendências de conciliação; custos conhecidos e desconhecidos; achados do JEV marcados "consultivo"; sem promessa de lucro; HTML sem script, formulário ou recurso externo. | AUSENTE para carteira. Existe visualizador do relatório DEX; o relatório móvel está em desenvolvimento em outra árvore. |
| RQ-19 | **Alegações financeiras corrigidas** na interface. | Lista do design §5 resolvida com teste de copy. | PARCIAL. |

## 6. Requisitos de governança

| ID | Requisito | Critério de aceitação |
| --- | --- | --- |
| RQ-20 | Sem colisão entre trabalhos. | Todo objetivo grava em diretórios novos; arquivos compartilhados só mudam pelo integrador designado, depois de revalidar `git worktree list` e `git status` de todas as árvores (comando em design §2.3). |
| RQ-21 | Cada tarefa termina com evidência verificável. | Teste vermelho antes do verde, `bun test` e `bun run typecheck` do escopo, revisão independente em cópia isolada, manifesto de arquivos e hashes. "Documentação produzida" nunca conclui uma tarefa de implementação. |

## 7. Fora de escopo

Execução, assinatura, aprovação, transferência, compra, venda; `merge`, `push`, `deploy`; chamadas pagas ou autenticadas sem autorização; configuração de credenciais; mudança de permissões; reinício ou edição de sessões de terceiros; promessa de rentabilidade; o trader Kuru por bloco.

## 8. Decisões que pertencem ao usuário

| ID | Decisão | Por que bloqueia | Opções |
| --- | --- | --- | --- |
| D1 | Objetivos 2 a 8 de [tasks.md](tasks.md): aceitar, reordenar ou substituir. | O texto original recebido só detalhava os Objetivos 0 e 1; os demais foram propostos aqui a partir da missão. | Aceitar como estão; substituir pela sua lista. |
| D2 | Como o JEV pode ver dados da carteira. | O contrato O5/W7 proíbe enviar conta e saldos ao backend ou ao JEV. | (A) JEV só recebe agregados sem endereço nem contrato, derivados no navegador; (B) fluxo de consentimento granular com destinatário, campos e finalidade. Sem escolha, o Objetivo 6 não inicia. |
| D3 | Fonte do histórico, do preço e do custo de aquisição. | A API Web3 exige credenciais inexistentes no ambiente. | (A) fornecer credenciais da OKX (`data/onchainos.env`, fora do git); (B) importação local de arquivo (CSV/JSON do usuário); (C) só RPC e eventos on-chain. |
| D4 | Dono e destino do `valuation-diagnostics` não commitado. | Contrato de evidência deve estendê-lo; ele vive só no checkout principal, sem commit. | Commitar como está; entregar ao Objetivo 1; descartar. |
| D5 | Moeda de avaliação e tolerância de conciliação. | A OKX avalia em USD; BRL exigiria fonte de câmbio que não existe no projeto. | USD apenas nesta etapa; ou definir fonte de câmbio. Tolerância sugerida: zero para quantidades, limite explícito para valores. |
