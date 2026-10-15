# Parecer de revisão independente 1 (somente leitura)

Data: 2026-10-13. Revisor: agente distinto do autor (perfil somente leitura: busca, glob e leitura, sem execução e sem escrita), executado depois de `freeze.ts --check` (ok: revision r2 matches 13 files) e de `tools/verify.ts --strict` (ok) terem saído com 0. Escopo: os seis documentos desta pasta, `evidence/` e a SPEC do instalável como referência. Este registro é a transcrição condensada, feita pelo autor, da resposta do revisor; a resposta completa passou do limite de saída da ferramenta, por isso os trechos abaixo são resumo fiel e não cópia literal.

## Bloqueadores

Nenhum. O revisor não achou violação das fronteiras (nada assina, paga, transmite ou habilita Agentic Wallet; o código só descreve e o modelo decide; texto de terceiros não vai ao modelo; dado sintético ou vencido não é rotulado como ao vivo).

## Achados menores e disposição

| # | Achado do revisor | Disposição |
| --- | --- | --- |
| B1 | `RECONCILIACAO.md` dizia `T4.1` elegível, mas o TASKS do instalável diz "parcial": a sessão dona já separa 404 e 403 no cliente web com `backend_stale` e `origin_denied`, nomes diferentes dos `backend_sem_rota` e `origem_negada` de `API-12` | **Aceito.** `SRC-1`, `SRC-3`, `API-12`, `T4.1` e `T3.5` atualizados em `RECONCILIACAO.md`; nota de nomes em `D3-02` (propõe manter os nomes do cliente e tirar os dois nomes de `API-12`); novo achado A-27 |
| B2 | `(5 - nivel) / 5` daria 1,0 para nível 0 (indefinido) | **Tratado.** A tabela 4.1 já excluía o nível 0; a regra foi repetida em `F2-DIG-1` para ficar visível. O revisor citou `F2-DIG-3` e `M6`, que não são o lugar da regra |
| B3 | O tempo mínimo por pedido é (n-1) x 1,1 s, não n x 1,1 s | **Aceito.** Corrigido para 13,2 s (modo token) e 14,3 s (modo descoberta), mais a latência |
| B4 | A diferença frente ao `ADR-6` (13ª chamada) não estava registrada | **Aceito.** Parágrafo de diferença acrescentado após a tabela 4.2 |
| B5 | A-18 impreciso: o rótulo é ignorado e o fallback de `top10` é usado; o adaptador deve normalizar também a escala | **Aceito.** A-18 reformulado e `F2-DIG-2` passou a exigir normalização de escala por campo. O revisor chamou o adaptador de `F2-OCX-6`; no pacote ele é de `F2-DIG-2` (`F2-OCX-6` é `token/basic-info`) |
| B6 | D3-13 poderia dizer "verificado" com base em relatório de terceiros | **Parcial.** A tabela usa estados de evidência, não a palavra "verificado"; foram acrescentados os qualificadores (testes executados pelo lead; build isolado por relatório do implementador) |
| B7 | `RECONCILIACAO.md` seção 3 dava "Premium" para a família smart money, mas `signal-chains` e `leaderboard-chains` são Free | **Aceito.** Camada por rota anotada |
| B8 | `T-F2-D8` em "elegível" depois de o verificador ter rodado | **Aceito.** Estados de `TASKS.md` atualizados |
| B9 | O SPEC introduziria uma família de candidato `on-<rede>-<contrato>` que o validador de decisão não aceita | **Rejeitado.** O pacote não define essa família: usa `tokenCandidate` (`src/intel/candidates.ts:39`, id `token:<chainIndex>:<address>`, `tipo: "token"`), que já existe e já é aceito por `validateDecision`. O id citado pelo revisor não aparece em nenhum arquivo da pasta |
| B10 | Tensão de logos continua aberta até a rev-3 | **Sem ação.** Já explícita em A-24, `D3-07` e `RECONCILIACAO.md` |
| B11 | `trades` sem `tagFilter` confirmado | **Sem ação.** Confirma A-20 e `F2-OCX-13` |

## O que o revisor reproduziu como correto

124 chamadas arquivadas com 118 de código 0 e 6 de outro código (`50014` duas vezes, `81411`, `51000` duas vezes, `50038`); 115 endpoints únicos sondados (124 menos 9 repetições), 174 endpoints na lista do portal e 59 não sondados; 112 dos 115 respondendo OK (`toplist` e `gas-limit` acertaram na nova tentativa; `orders`, `intent/order-list` e `xlayer/tz/block-list` nunca); 22 rotas no catálogo; `maxBytes` de 2.000.000 e espaçamento de 1.100 ms no cliente; 2.408 linhas e 2.837 ativos nas formas do arquivo; Brief de exemplo com 1.124 bytes e rótulo sintético; pesos e nomes das nove componentes e o mapa `CLUSTER_SCORE` conferem com `flow-engine.md` e `src/intel/trail.ts`; os "Texto atual" de `D3-01` e `D3-02` são citações exatas da SPEC; alvos `API-5`, `ICO-2`, `ASK-10`, `DOC-3` e `DOC-4` existem; citações do achado A-23 e A-22 batem; nenhuma ocorrência de ponto médio, travessão, meia-risca ou valor de credencial; o arquivo da sonda só tem os campos permitidos.

## O que o revisor não conseguiu verificar

A contagem aproximada de 330 chamadas e as 134 chamadas da sessão de interface (relatórios de outra sessão, rotulados como estimativa); 181 testes do gateway, 1.776 do web e `typecheck` limpo (o revisor não executa testes; **o autor reexecutou em 2026-10-13 às 08:00**: gateway e configurações 181 aprovados, igual; web 1863 aprovados mais 1 erro de módulo ausente em `web/src/lib/desk/chart/inonu-layer.test.ts`, teste escrito antes do módulo pela sessão do instalável, e o total do web subiu de 1776 para 1864 porque essa sessão acrescentou testes; `typecheck` da raiz limpo e do web com um único erro TS2307 no mesmo arquivo); compatibilidade fina de `D3-01` com o texto integral de `AC-API-3`; tiers `Basic*` (suposição rotulada, não medida); ausência de ciclo em `TASKS.md` (inspeção visual; o verificador confere que toda dependência é uma tarefa definida, mas não prova ausência de ciclo).

## Recomendação do revisor

Nada impede a aprovação do adendo depois das correções B1 a B8, que foram aplicadas.
