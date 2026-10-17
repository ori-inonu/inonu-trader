---
name: sdd-feature
description: Guia uma feature não trivial pelo fluxo Spec, Plan, Tasks e Implement, com gates. Use quando o escopo passar de uma correção de um arquivo.
---

# SDD para feature

Pipeline: spec, plan, tasks, implement, verify. Artefatos em `docs/specs/<feature-slug>/`. Modelo em `docs/specs/_template.md`.

## Passos

1. Crie `docs/specs/<feature-slug>/spec.md` a partir do template. Preencha contexto, metas, não metas e critérios testáveis.
2. Leve as perguntas em aberto ao Jev como decisão estruturada (ver AGENTS.md, "Sem perguntas ao dono"). Nunca pare para perguntar ao dono; o que for de dinheiro, segredos, migrações ou autorizações vira bloqueio e a sessão segue com o resto.
3. Crie `plan.md`: abordagem, arquivos tocados, trade-offs e riscos.
4. Crie `tasks.md`: lista numerada e pequena. Cada task tem critério de done e comando de verify.
5. Crie `status.md` com a fase atual.
6. Implemente uma task por vez. Depois de cada task, rode o comando de verify dela.
7. No fim, rode o comando de done do AGENTS.md e cole a saída no resumo.
8. Registre a iteração no cérebro: `bun --no-env-file run scripts/brain.ts add iteracao <id> "<o que mudou>" --link segue:<anterior>`. Decisões e fatos viram nós `decisao`/`fato`; o que ficou obsoleto vira `retract`. Spec e plan são o detalhe; o nó é o ponteiro e a memória.

## Gates

- Não implemente antes da spec e do plan estarem aprovados, em mudanças grandes.
- Feature trivial (typo, rename local, correção de um arquivo) pode pular o SDD, mas ainda roda a verificação.

## Retry

Até 2 ou 3 ciclos por task. Depois disso, leve a decisão ao Jev e, se ele não decidir, registre o bloqueio e siga com outra tarefa.
