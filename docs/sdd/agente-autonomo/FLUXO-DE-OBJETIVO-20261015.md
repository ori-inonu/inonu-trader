# Fluxo de objetivo com o Jev: decisoes sequenciais, wayfinder e ganchos (2026-10-15)

Pedido do dono no chat: adaptar o "sequential thinking" ao Jev, com decisoes sequenciais ate haver consenso antes de implementar; configurar os ganchos para a sessao nao parar sem rumo; usar o wayfinder para encontrar o caminho; e configurar o MELHOR fluxo de trabalho recomendado pela Anthropic (o do pedido era so um exemplo). Este documento diz o que foi configurado, em que fontes se apoia e como ligar, desligar e conferir. Nada aqui promete lucro nem altera o agente vivo.

## 1. Fontes (lidas em 2026-10-15)

- Claude Code, boas praticas (`code.claude.com/docs/en/best-practices`): dar ao Claude uma verificacao que passa ou falha e, para execucao sem supervisao, um gancho `Stop` como portao deterministico; explorar, planejar, implementar, registrar; spec em arquivo com o que fica fora de escopo e uma verificacao ponta a ponta; revisao adversarial por subagente em contexto novo, so para lacunas de corretude; CLAUDE.md curto e skills para fluxos sob demanda; ganchos para o que tem de acontecer sempre; se corrigir duas vezes o mesmo erro, recomecar com um prompt melhor.
- Claude Code, ganchos (`code.claude.com/docs/en/hooks`): o `Stop` recebe `stop_hook_active` e `last_assistant_message`, continua a sessao com `decision: "block"` e `reason`; o proprio Claude Code limita 8 continuacoes seguidas por gancho (o contador zera quando uma ferramenta e chamada; `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` o altera); `/goal` e um atalho para um gancho `Stop` de sessao avaliado por um modelo (por isso repetia a mesma resposta).
- Anthropic, arnes para agentes de longa duracao (`anthropic.com/engineering/effective-harnesses-for-long-running-agents`): lista de funcionalidades `feature_list.json` com `passes` que so muda depois do teste, `claude-progress.txt`, script de inicio, uma funcionalidade de cada vez, verificacao ponta a ponta, estado limpo no fim, rotina de "pegar o rumo" a cada sessao; falhas que evita: declarar vitoria cedo, deixar o ambiente quebrado, marcar como feito sem testar.
- Anthropic, agentes eficazes (`anthropic.com/research/building-effective-agents`): comecar simples; padroes encadeamento, roteamento, paralelizacao (secoes e votacao), orquestrador e trabalhadores, avaliador e otimizador; condicoes de parada, pontos de checagem humana, transparencia e teste isolado.

## 2. O que foi configurado

| Peca | Onde | O que faz |
| --- | --- | --- |
| Decisoes sequenciais com o Jev (avaliador e votacao) | `src/consensus/*`, `scripts/jev-consensus.ts` e o servidor MCP `scripts/jev-consensus-mcp.ts` (registrado em `.mcp.json`) | Pergunta ao Jev em rodadas e em tres molduras com as opcoes em ordens diferentes, mais uma pergunta por opcao contra os trilhos; so ha consenso quando o mesmo lider se mantem em duas rodadas seguidas com media, margem, concordancia e baixa chance de cruzar trilho; sem consenso o Jev diz que fato faltante mais mudaria a escolha e isso vai ao usuario. Recibo no fim; o recibo e recomendacao e nao autoriza nada |
| Fluxo e estado | `src/goal/loop.ts`, `scripts/hooks/goal.ts`, `.claude/goal/` | Etapas explorar, planejar, implementar, verificar, registrar; lista de funcionalidades com `passes` que so o comando de verificacao (exit 0) marca; arquivo de progresso; decisoes registradas com o hash do recibo |
| Ganchos | `.claude/settings.local.json` e `scripts/hooks/goal-*.ts` | `Stop`: portao que roda a verificacao do objetivo e responde com o PROXIMO passo ou com o passo wayfinder, nunca com o mesmo relatorio; `SessionStart` (startup, resume, compact): pega o rumo (objetivo, funcionalidades, decisoes, progresso, ultimos commits); `UserPromptSubmit`: lembrete curto e zera a espera do usuario; `PreToolUse`: trilhos |
| Skill | `.claude/skills/jev-wayfinder/SKILL.md` | O passo a passo, incluindo "nunca fechar um caminho dizendo que nao ha: nomear a restricao e o experimento mais proximo" |
| Subagente | `.claude/agents/jev-reviewer.md` | Revisao adversarial so leitura, so lacunas de corretude ou de requisito |

Os ganchos so agem para a SESSAO a que o objetivo pertence (`--session`); qualquer outra sessao na mesma pasta nunca e segurada nem recusada.

## 3. Como ligar

1. Na sessao: `/jev-wayfinder <objetivo>` (a skill roda o `goal.ts set` com o id da sessao) ou, na mao: `bun scripts/hooks/goal.ts set --session <id> --goal "<texto>" --check "<comando que imprime ATINGIDO ou NAO ATINGIDO, ou sai 0 quando atingido>" --smoke "bun test src/goal src/consensus" --until 23:59`.
2. O Claude Code vai pedir a aprovacao do servidor MCP do projeto (`jev-consensus`). Os ganchos de `.claude/settings.local.json` sao lidos pelo observador de arquivos; conferir com `/hooks`.
3. O `/goal` nativo continua separado; para nao ter dois lacos, encerrar o `/goal` ao usar este.

## 4. Limites que o laco respeita (nao podem ser contornados por ele)

- Uma parada sem artefato novo conta como ociosa: duas levam ao passo wayfinder. Desde 2026-10-17 nao ha mais pergunta ao usuario nem teto por hora: as duvidas viram decisao estruturada ao Jev; sem Jev, a sessao escolhe a opcao mais reversivel e registra com `decide` (receipt `sem-jev`). Itens de dinheiro, segredos, migracoes, historico, dependencias de producao e billing viram bloqueio e a sessao segue com o resto. Somente objetivo atingido, pausado, vencido ou encerrado (`clear`) deixa a sessao parar.
- A consulta paga ao Jev exige so a chave no ambiente e nao tem teto de chamadas (decisao do dono, 2026-10-17: ele paga o Jev e nao quer controle de gasto); o plano e gratis. O gancho nunca gasta fora de uma decisao que o laco pediu.
- Trilhos de `PreToolUse` (recusa, com motivo; ler nunca e recusado): parar processo por nome, iniciar ou parar o core, mexer nas tarefas agendadas do Inonu ou do Jev, escrever nos dados ou no release do agente vivo, chamadas que MUDAM o core (POST, PUT, PATCH, DELETE em /agent ou /inonu), git que publica, descarta ou grava (push, reset --hard, clean, checkout --, restore, stash drop, branch -D, rebase, commit).
- A permissao do plano e do `goal.ts` esta liberada; a da consulta paga NAO: ela segue o modo de permissao da sessao (no modo auto, o classificador decide).
## 4b. Roteamento de decisoes (2026-10-17)

Decisao do dono (chat, 2026-10-17): o Jev decide as escolhas de design reversiveis do projeto, sem o dono acompanhar. Primeiro `consensus_plan` (gratis: 13 chamadas, 12.402 tokens estimados). Depois `consensus_run`, autorizado pelo dono sem teto: a ferramenta exigiu `max_calls: 13` (o numero do plano) e `allow_paid_inference: true`. Recibo `specHash cad78fa4c67bf1d18bc5c71c1265324320f5c4f13697ce3ebdaa14172a4f45f5`: status consenso, lider A, media 0,97, margem 0,94, concordancia 1,0, chance de cruzar trilho 0,00 para A. Consumo: 9 chamadas, 8.531 tokens de entrada, nenhuma falha.

Regra aplicada: o Jev decide design interno e reversivel (codigo, testes, documentacao). Continuam com o dono: dinheiro real, ordens, assinaturas e transferencias; limites de risco; segredos e autenticacao; migracao de dados ou de schema; reescrita de historico; dependencias de producao. A recomendacao do Jev nao autoriza nenhuma dessas coisas.

Limite: o grafo do cerebro nao existe neste checkout. `scripts/cerebro.ts` e `docs/_meta/cerebro/events.jsonl` aparecem so no historico git (commits `d98c9d8`, `4479a56`, `785494d`, `c67b39e` em diante) e no branch `feat/cerebro-grafo-v2`, worktree `C:/Users/gabri/.codex/worktrees/jev-executable-delivery-20261016/jev-trader`. O `AGENTS.md` cita `scripts/brain.ts`, nome que nao existe no historico. Nao escrevi evento la: o `events.jsonl` dessa worktree e fonte append-only de outra sessao, e gravar nele sem ordem do dono criaria autoridade dividida. Esta decisao fica registrada aqui ate o dono indicar o destino.


## 5. Como desligar

`bun scripts/hooks/goal.ts pause` (a sessao pode parar) ou `clear` (encerra); apagar o bloco `hooks` de `.claude/settings.local.json` desliga os ganchos; remover o servidor com `claude mcp remove jev-consensus`.

## 6. Evidencia

116 testes novos (laco, trilhos, estado, consenso, adaptador do Jev, MCP e os scripts de gancho rodando como processos reais) e a suite do agente (1353) passam; `bun run typecheck` sem erro fora de `src/local-host`. Uma rodada REAL do Jev sobre o exemplo `scripts/jev-consensus.example.json` (9 perguntas, 8760 tokens de entrada, nenhuma falha) deu consenso em duas rodadas no lider `record` (publicar a gravacao do produtor e o avaliador de resultado), media 0,52 a 0,53, margem 0,20, concordancia 1,0 e chance de cruzar trilho de 0,01; o segundo foi `joint` (0,30 a 0,32) e o terceiro `pulse` (0,13 a 0,15); a opcao `force` foi removida pelo codigo antes de perguntar. E uma recomendacao: o release continua sendo da Codex e do dono. Estados: valido como codigo e configuracao; carregado na proxima leitura dos ganchos e na aprovacao do MCP; ao vivo e ganho medido: nenhum.

## 4c. Decisoes levadas ao Jev (2026-10-17, dono pediu que o Jev decidisse)

Forma: juiz `createJevJudge` direto, 3 enquadramentos com a ordem das opcoes trocada, media. O CLI `scripts/jev-consensus.ts` estava fora do ar pelo modulo `src/generated/prompts` ausente, entao a rodada nao usou o motor de consenso completo. Specs em `.scratch/` (git-ignored).

| Decisao | Resultado | Acao |
| --- | --- | --- |
| Motor do Jev (`engine.ts` nao commitado) | A, restaurar do HEAD (media 0,89, margem 0,78) | Aplicada. Copias da versao nao commitada em `.scratch/engine.ts.uncommitted-20261017` e `.scratch/engine.test.ts.uncommitted-20261017`, patch em `.scratch/engine-uncommitted-20261017.patch`. Testes de consenso: 47 passam. |
| Codex: politica de aprovacao | A, `approval never` com sandbox `workspace-write` (margem 1,0) | Recomendacao registrada, NAO aplicada: e configuracao de seguranca e o dono aplica. |
| Limites do laboratorio Jev (2000 chamadas, US$ 5) | Sem consenso: rodada 1 A 0,517 / C 0,483; rodada 2 C 0,503 / A 0,497 | Regra do projeto: opcao mais reversivel, que e manter sem alterar. Nada mudou. |
| Ferramenta `ask` do OMP sem dono presente | A, extensao que responde `ask` com o Jev (margem 0,95) | Nao construida ainda: a API de `tool_call` do OMP precisa ser verificada antes. Proximo passo. |
