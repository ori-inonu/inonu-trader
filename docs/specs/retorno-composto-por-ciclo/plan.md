# Plano: retorno líquido composto por ciclo, em sombra primeiro

Data: 2026-10-17. Plano consolidado do ciclo 1 (pesquisa) e do ciclo 2 (Wayfinder), com as decisões do Jev aplicadas ([wayfinder.md](wayfinder.md), seção 3). **Nada aqui autoriza operação, live, mudança de risco ou produção.** Cada fase passa pelo Jev (decisão de design), pelo `sdd-feature` (spec, plan, tasks, implement) e pelos comandos do `AGENTS.md` (`bun run typecheck`, `bun run test`, `bun run test:lab`), sempre comparando com a base em worktree limpo da `main` (este checkout tem merge em andamento e módulos ausentes).

Princípios: medir antes de mudar; tudo em sombra e reversível; o Jev decide e o código só valida e executa; o código nunca converte `skip` em compra; mudanças aditivas (arquivos novos) em vez de migração de journals; um integrador por vez nos arquivos quentes; zona do Codex (`src/decision-review/**`) intocada.

## Decisão do Jev que organiza tudo

Primeira etapa: **medir primeiro em sombra** (consenso, média 0,95). As 12 decisões seguintes do ciclo 2 mantêm a linha: conciliar, medir, calibrar e não mudar nada vivo.

## F0. Base conciliada e merge limpo (pré-requisito de todas as outras)

Tickets T01, T07, T16. Decisões: D1 (`medir-sem-base`), D7 (`medir-sem-mudar-codigo`), D10 (`adiar-so-medir`).

- Resolver o merge em andamento do checkout principal, que é decisão e trabalho do dono (o ensaio de resolução e a análise estão no workflow `revisao-branches-worktrees`); `wire.ts` e `cycle.ts` precisam carregar.
- Snapshot agregado por perna em 3 horários fixos por 3 dias, com a fração de ciclos com `valueComplete` verdadeiro; não fixar capital-base (100, 118, 121, 126; o 155 é fixture sintética).
- Reconciliar as ordens com taxa gravada com o ledger e reproduzir (ou corrigir) a mediana de 85.427 lamports; reconciliar 25 contra 26 preenchimentos.
- Contar, por semana, ordens enviando ou incertas sem recibo, com idade mediana e máxima, sem mudar tela nem fluxo.

Saída: base de medição em agregados verificáveis; código carregável. Bloqueios do dono: base de dimensionamento e limites de risco; reescrita de histórico.

## F1. Instrumentação de sombra

Tickets T13, T14, T17, T18, T20. Decisões: D8 (`campo-relatorio-memoria`), D11 (`medir-codigos-sombra`), D12 (`teste-2h-canal-quieto`).

- Carimbo de tempo por etapa do ciclo como campo opcional do `CycleReport` em memória (fatia S1 já escrita; integração em `cycle.ts` e `wire.ts` só depois da F0).
- Teste de 2 h em canal quieto do WebSocket da bolsa para saber se o pong renova o prazo de 30 s; medir idade por canal com relógio corrigido (`/api/v5/public/time`) por 24 h.
- Relatório diário de status dos eventos já emitidos do cliente OnchainOS; `apiCode` só com aprovação.
- **Migração do feed vivo para a porta 443 (feita no código)**; migrar `public-market-capture` antes de 2026-10-31 com novos recibos (dono).

Saída: 1000 ciclos com p50, p95 e p99 por etapa; 24 h de idade por canal; teste de 2 h concluído; 7 dias de status. Bloqueios do dono: aceite do risco de termos da OKX para o feed público em escala; mudar `intervalMin`, `TIMEOUTS` ou cota do Jev.

## F2. Medição de edge, custo e funil

Tickets T02, T04, T06, T07, T09, T10, T11, T12, T19. Decisões: D3 (sem consenso; placar existente por regra), D4 (`contador-em-memoria`), D5 (`adiar-identidade`), D6 (sem consenso; `medir-sem-limiar` por regra), D7.

- Classificar os 411 fechamentos antes do Jev por causa, com contador em memória (sem campo novo no journal); markout dos fechados contra os escolhidos (fatia S4 não executada).
- Markout pelo placar existente (15 min, 1 h, 4 h e 24 h) com n e N efetivo; a lacuna de 1 e 5 minutos é conhecida.
- Atrito por classe de liquidez e custo por tamanho a partir do que já está gravado e de cotação sintética em lote (fatia S3 aprovada com ressalvas); decompor 20 transações finalizadas por RPC público.
- Identidade por endereço adiada: nesta fase mede-se só dado da bolsa.

Saída: causas classificadas ou "desconhecido"; distribuições de markout e atrito por classe com n; universo marcado como proxy. Bloqueios do dono: estender journals; cotação acima da cota Basic; ordens reais de calibração.

## F3. Calibração e congelamento da regra E1

Tickets T03, T11. Decisão: D2 (`calibrar-antes`).

- Log de sombra de 48 h para medir sigma, rho e cadência; só então fixar H, N mínimo (recalculado com rho medido), tipo de intervalo, fração de holdout, correção de multiplicidade para E1 a E5 e critério numérico de falha de amostra.
- A regra é gravada em commit antes da coleta final. A contagem de variantes vai em arquivo novo (journal é bloqueio do dono).

## F4. Coleta de sombra e veredito

Tickets T03, T06, T11. N efetivo no mínimo fixado em F3; pelo menos 3 janelas de mercado distintas e nenhuma acima de 50% das unidades; holdout avaliado uma vez; veredito **PASSA, REPROVA ou INCONCLUSIVO**, com custo real decomposto, sem liberar dinheiro. Decisão D9: cadência do Jev na sombra mantém o relógio de 2 minutos (sem consenso; status quo por regra).

## F5. Decisão do dono sobre capital e saída da sombra

Fora do Jev: evidências de F0 a F4 entregues ao dono para decidir capital-base, risco e live (portão G4). Nada nas fases anteriores autoriza operação. A prontidão para live é apenas informativa (ver o plano do workflow `revisao-branches-worktrees`).

## Portões

G0 a G4 de [validacao-e-baseline.md](validacao-e-baseline.md) valem para toda promoção. A escada de metas de [matematica-da-meta.md](matematica-da-meta.md) define os critérios de saída por degrau.

## Riscos do plano

1. **Porta 8443**: corte em 2026-10-31; feed vivo migrado no código, `public-market-capture` pendente.
2. Merge em andamento e módulos ausentes (`src/generated/prompts`): a verificação do checkout principal é parcial; validar em worktree limpo.
3. Amostra pequena de custo (6 pares de um ativo): a viabilidade pode mudar muito com outros tokens.
4. Arquivos brutos fora do repositório: reconstituir antes de confiar nos números.
5. Cota Basic projeta acima do teto; o relatório de códigos de erro mede sem consumir mais.
6. Fatias escritas sobre base antiga: só valem depois de validadas na `main`.
7. Servidor MCP `jev-consensus` ainda com o módulo antigo na memória até ser reconectado em `/mcp`; o teto diário já foi removido no código.
