# Decisões da rodada 3: o que ficou para o dono foi ao Jev (2026-10-17)

O dono mandou levar ao Jev as decisões que ficaram abertas, buscando sempre a melhor alternativa para o objetivo do projeto (decisões melhores do agente, retorno líquido composto por ciclo de 1 minuto, sempre como hipótese a medir e em sombra). Cinco especificações em `decisoes-jev/rc3-d*.json`, recibos em `decisoes-jev/recibos/`. Sem teto de chamadas: 50 chamadas ao Jev no total. Cada recibo é uma recomendação com recibo, não uma autorização.

| Decisão | Resultado do Jev | Média final | O que foi feito |
| --- | --- | --- | --- |
| `rc3-d1-prompts`: o que fazer com a extração de prompts do commit `0147547` | **consenso**: reconstruir o módulo | 0,84 | `src/generated/prompts.ts` montado por script direto dos literais originais; commit `0147547` reaplicado; igualdade provada e texto fixado por hash |
| `rc3-d2-proxima-fatia`: próxima fatia em sombra rumo ao objetivo | **sem consenso** (margem 0,17, abaixo do mínimo 0,20), mas o líder foi o mesmo nas 3 rodadas: markout de 1 e 5 minutos | 0,58 (contra 0,42 de classificar os fechamentos) | regra de menor risco: fatia aditiva e em sombra. Janelas de 1 e 5 minutos nos desfechos das compras; "classificar os fechamentos antes do Jev" fica como a próxima |
| `rc3-d3-captura-443`: WebSocket do `public-market-capture` | **consenso**: migrar o código e marcar recibos como pendentes | 0,74 | URL na porta 443 em `plan.ts`, testes e documentos; nenhuma captura nova |
| `rc3-d4-learning-evidence`: trabalho do Codex sem commit | **consenso**: reconciliar agora | 0,81 | módulo integrado como puro e não ligado ao ciclo; 15 testes passam |
| `rc3-d5-checkout-dono`: checkout principal em merge | **consenso**: preparar roteiro, sem executar | 0,98 | [roteiro-checkout-do-dono.md](roteiro-checkout-do-dono.md) |

## O que cada decisão mudou no sistema

- **Prompts (D1).** Os textos do Jev passam a morar em um módulo de constantes puras. A prova de que nada mudou: três peças comparadas byte a byte entre o código original e o reconstruído (textos do jev-read, payload completo do lab-chooser, `inputsText` do system-one com e sem quant); os testes da própria branch comparam o restante contra os literais originais; cada grupo de prompt tem o hash fixado em `src/generated/prompts.test.ts`, então mudar uma letra exige decisão registrada.
- **Markout de 1 e 5 minutos (D2).** O objetivo é retorno por ciclo de 1 minuto, mas o placar só olhava 15 minutos, 1 hora e 4 horas. Agora os desfechos das compras (compradas, puladas ou fechadas antes do Jev) também têm retorno bruto a 1 e 5 minutos, lido perto dos dois instantes (no máximo 2 minutos de distância, um ciclo). O que for lido mais longe fica **desconhecido** e nunca entra na média. É contrafactual, antes de custo e impacto, e não é resultado nem conselho. A medição só enche quando o produtor gravar `answers.jsonl` e `prices.jsonl` em ritmo de ciclo; o relatório é `bun scripts/answers-outcomes.ts`.
- **Captura (D3).** Recibos antigos (emitidos na porta 8443) passam a ser recusados na validação do plano; a reemissão é pendente. O prazo da OKX é 2026-10-31.
- **Learning-evidence (D4).** O construtor do dataset projeta fora nomes de feature fora da lista e conta como `features`, sem derrubar a exportação, o snapshot cujo único defeito é o vetor. Qualquer outro defeito do registro continua fatal.

## O que **não** foi ao Jev nem foi decidido por agente

Pela regra do projeto, estes itens vão para o dono como bloqueio, sem decisão:

- Atualizar a produção (`jev-trader-main`, portas 3020 e 3021), ligar o modo real ou o live, mexer em limites de risco, alavancagem ou no `Market.init()`.
- A dependência `fallow` e as alterações não commitadas da `goal1` (sessão ativa, dependência nova).
- Apagar branches ou worktrees do Codex e `git push`.
- Os defaults ligados por padrão do breaker do executor e do motor em sombra (`JEV_EXECUTOR_BREAKER`, `JEV_ENGINE_SHADOW`) ficam como o autor definiu; mudar isso é decisão de risco.
- Reconectar o servidor MCP `jev-consensus` em `/mcp` é ação sua na interface; enquanto isso o CLI `scripts/jev-consensus.ts` (sem teto) faz o mesmo trabalho.

## Próximas fatias (já deliberadas)

1. Classificar os fechamentos antes do Jev por causa (contador em memória), com o markout dos fechados contra os escolhidos: foi a segunda opção do Jev na D2 (0,42).
2. Ligar o carimbo de etapas (S1) em `cycle.ts` e `wire.ts`, refazer o contador de rotas (S2) e o teste de 2 h do canal quieto seguem no plano.
