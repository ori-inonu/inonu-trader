# Central Jev: aceite da integração

Objetivo observado: consolidar as atualizações das branches e worktrees em main e entregar a central visual Jev com painéis dinâmicos funcionando. Retomada autorizada em 2026-10-11.

Baseline de integração: main bd8f78a; candidato inicial 51edcbc. A inspeção inicial encontrou somente feature/jev-command-center fora de main, com System One integrado. GrowthDeck e seus painéis já existem no candidato.

## Critérios imutáveis

- C1: inventariar branches e worktrees, preservar mudanças preexistentes e integrar os commits elegíveis em main sem perda de histórico.
- C2: a central apresenta Jev, System One, risco, limites e ecossistema; os controles de visualização respondem e as hipóteses financeiras permanecem explicitamente identificadas.
- C3: interface utilizável em desktop e mobile; movimento reduzido respeitado, sem dependência de animação para compreender informação.
- C4: testes, análise de tipos e build da versão final passam; falhas reais são corrigidas e verificadas.
- C5: revisão independente confronta o candidato com estes critérios; problemas impeditivos são resolvidos antes do merge.
- C6: a versão integrada é servida localmente e fica disponível para inspeção visual do usuário.

## Limites e verificação

Não autoriza ordens financeiras, alteração de credenciais, push ou implantação externa. Nenhuma projeção será apresentada como retorno garantido ou status de execução inventado. Verificação: inventário Git, suites Bun, TypeScript, build Next, navegador desktop/mobile e revisão independente. Se uma ferramenta visual ficar indisponível, registrar a limitação sem inventar evidência.
