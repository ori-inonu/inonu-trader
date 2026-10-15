---
title: "Governança e histórico do projeto"
created: 2026-10-13
updated: 2026-10-13
type: concept
tags: ["documentacao", "governanca"]
sources: ["docs/_meta/delegation-contract.md", "docs/_meta/organization-spec.md", "docs/_meta/project-state-20261013.json", "docs/_meta/source-manifest-20261013.json", "docs/SCHEMA.md", "docs/index.md", "docs/log.md", "docs/README.md", "docs/GOAL-INONU-TRADER.md", "docs/CONSOLIDACAO-MAIN-20261011.md", "docs/CONSOLIDACAO-ESPECIFICACOES-20261012.md", "docs/PROXIMAS-ETAPAS-JEV-20261011-SPEC.md", "docs/RELEASE-v0.0.2.md", "README.md", "SPEC.md", "package.json", "src/server.ts", "src/portfolio-evidence/main.ts", "src/portfolio-evidence/cli.ts", "src/portfolio-evidence/collector.ts", "src/portfolio-evidence/report.ts", "src/portfolio-evidence/types.ts"]
confidence: medium
---

# Governança e histórico

Esta página organiza como ler registros do Jev Trader sem confundir requisitos, relatos de uma sessão e comportamento presente. É uma síntese navegacional, não uma SPEC, revisão de código completa, aprovação de entrega ou autorização operacional. Classificações ajudam a localizar fontes; não criam precedência por si mesmas. O schema exige separar contrato, registro datado e estado presente, e alerta que título ou data recente não prova conclusão. `docs/SCHEMA.md:66-85`; `docs/_meta/delegation-contract.md:13-35`. ^[docs/SCHEMA.md]

## Camadas de autoridade

### Contratos e critérios

- Para esta auditoria, o contrato de delegação limita a escrita à página deste tema e ao seu recibo, reservando índices, catálogos, schema e log ao integrador. Ele exige evidência observável e recibo com uma entrada por Markdown atribuído. `docs/_meta/delegation-contract.md:19-27,29-37,54-72`. ^[docs/_meta/delegation-contract.md]
- `PROXIMAS-ETAPAS-JEV-20261011-SPEC.md` congela PC1-PC6 para uma meta de planejamento de 11 de outubro de 2026. É um contrato daquela meta, não uma ordem para iniciar E0-E6 agora. `docs/PROXIMAS-ETAPAS-JEV-20261011-SPEC.md:6-21,32-39`; `docs/PROXIMAS-ETAPAS-JEV-20261011.md:100-112`. ^[docs/PROXIMAS-ETAPAS-JEV-20261011-SPEC.md]
- `SCHEMA.md` e `organization-spec.md` governam a organização e interpretação documental. Não substituem a SPEC de produto nem decidem se uma função está implementada. `docs/SCHEMA.md:19-25,66-91`; `docs/_meta/organization-spec.md:19-32,48-53`. ^[docs/SCHEMA.md]
- A SPEC de raiz descreve a narrativa original de trade por bloco. O próprio README posterior a chama de contexto histórico e remete a critérios congelados de readiness e lucro para o candidato documentado. Não usar isoladamente `SPEC.md` como estado atual. `SPEC.md:1-16,85-100`; `README.md:61`; `docs/RELEASE-v0.0.2.md:30-45`. ^[README.md]

### Evidência histórica

Inventários de branches/worktrees, consolidações, checkpoints, pareceres, verificações e pesquisas registram uma árvore, baseline ou janela de execução específicos. Um status como aprovado, concluído, pendente ou limpo só vale para o escopo e momento declarados no próprio documento. Não prova o estado presente, nem que uma verificação passada foi repetida. O schema explicita essa distinção. `docs/SCHEMA.md:66-77,81-91`; `docs/BRANCH-INVENTORY-20261011.md:1-3,29-34`; `docs/BRANCH-WORKTREE-INVENTORY-20261011.md:1-3,29-43`; `docs/PROXIMAS-ETAPAS-JEV-20261011-REVIEW.md:3-5,31-37`. ^[docs/SCHEMA.md]

### Instruções e referências atuais

As instruções vigentes do usuário, do ambiente e do contrato de delegação delimitam o trabalho. `GOAL-INONU-TRADER.md` apresenta a meta de engenharia indicada como vigente, mas condiciona conclusões a código exercitado e mantém autorização financeira separada. A meta não autoriza, sozinha, uma transação ou a execução de um plano antigo. `docs/GOAL-INONU-TRADER.md:1-13`; `docs/_meta/delegation-contract.md:68-72`. ^[docs/GOAL-INONU-TRADER.md]

Guias como `JEV-WINDOWS.md`, `OPERACAO-BRASIL.md` e `CONTRIBUICAO.md` são referências sujeitas a confirmação no contexto de uso. Esta auditoria não consultou credenciais, `.env`, contas, RPC, modelos, rede ou estado privado. Assim, não confirma configuração local, acesso atual, custo faturado, execução financeira, lucro ou disponibilidade externa. ^[docs/OPERACAO-BRASIL.md]

## Estrutura do repositório observada

O snapshot documental foi capturado em 13 de outubro de 2026 às 10:53:03 -03, na branch `main`, HEAD `00a593bcabe25dbb6d83795268533551098f645b`, incluindo arquivos modificados e não rastreados. Seu inventário lista 1048 arquivos de código/configuração/teste/fixture e 984 fontes documentais, das quais 408 Markdown. São contagens do snapshot, não uma afirmação de árvore limpa. `docs/_meta/project-state-20261013.json:2-8`; `docs/_meta/organization-spec.md:15-17`. ^[docs/_meta/project-state-20261013.json]

Os totais documentais têm escopos e horários distintos: o manifesto inicial lista 988 arquivos e exclui
cinco configurações de `.obsidian` da navegação; o log registra depois uma fonte concorrente, e o
snapshot do projeto conta 984 fontes visíveis, com 408 Markdown. Isso não indica quatro arquivos
perdidos. `docs/_meta/source-manifest-20261013.json:2-9`; `docs/log.md:15-19,70-76`;
`docs/_meta/organization-spec.md:15-17`. ^[docs/log.md]

Mapa observado, sem pretensão de descrever toda implementação:

- `src/` contém o servidor e módulos de domínio. `src/server.ts` conecta handlers de operador, System One, Jev read, configurações e leitura Onchain; expõe também rotas de estado, histórico e eventos. `src/server.ts:2-14,23-27,38-70,90-105`. ^[src/server.ts]
- `web/` contém a interface; o README descreve a Mesa e seus painéis. `package.json` registra o build web e scripts Bun para testes, analytics, operador, captura e outras ferramentas. `README.md:67-72,87-91`; `package.json:20-60`. ^[package.json]
- `scripts/` concentra entradas de execução e utilitários; `python/` contém a coleta e análise descrita para indicadores; `installer/` está presente na árvore, mas não foi auditado funcionalmente nesta tarefa. `package.json:20-60`; `README.md:87-91`. ^[package.json]
- `docs/` conserva fontes originais, contratos e registros, junto da wiki documental: `SCHEMA.md`, `index.md`, `log.md`, `concepts/`, `_meta/`, `research/` e `sdd/`. A política é manter fontes no caminho original e compilar navegação sem substituir seu conteúdo. `docs/SCHEMA.md:19-25`; `docs/README.md:11-13,32-41`; `docs/index.md:13-40`. ^[docs/SCHEMA.md]

## Código presente e divergência documental

Há uma divergência concreta a corrigir pelo integrador, sem editar o README nesta frente: `README.md:56` chama carteira com evidência de "spec only" e diz que nada está implementado. No working tree observado existem CLI e coletor reais em `src/portfolio-evidence/`: a CLI separa demo offline, plano sem rede e refresh somente de leitura atrás de três flags explícitas; o coletor descreve uma atualização sob demanda, sem agendamento ou polling, com orçamento de chamadas e deadline. `src/portfolio-evidence/cli.ts:1-10,149-160,186-245`; `src/portfolio-evidence/main.ts:1-10,18-28`; `src/portfolio-evidence/collector.ts:1-10,88-90,225-246`. ^[src/portfolio-evidence/cli.ts]

Os tipos declaram `wallet_evidence_v2`, estados fechados e que desconhecido não é zero; o relatório distingue patrimônio de histórico e PnL. Isso comprova implementação estática desses componentes, não execução nesta auditoria. `src/portfolio-evidence/types.ts:4-11,19-30,450-463`; `src/portfolio-evidence/report.ts:21-33`. ^[src/portfolio-evidence/types.ts]

A cronologia resolve uma aparente divergência: a consolidação de 11 de outubro registra o módulo como trabalho em andamento e aguardando outra sessão; a consolidação de 12 de outubro relata O1 e partes de O2/O4 implementadas e registra os testes daquele baseline. Esses relatos não são evidência de testes executados hoje. `docs/CONSOLIDACAO-MAIN-20261011.md:46-50,79-85`; `docs/CONSOLIDACAO-ESPECIFICACOES-20261012.md:40-55`. ^[docs/CONSOLIDACAO-MAIN-20261011.md]

Na comparação de hashes feita em 13 de outubro às 11:27:32 -03 contra o snapshot das 10:53:03, 45 de 1048 arquivos de código/configuração/teste/fixture e 4 de 984 fontes documentais divergiam; nenhum arquivo do inventário estava ausente. Os quatro documentos divergentes ficam em `docs/sdd/inonu-desktop-v1/`, fora desta atribuição. Todos os 18 arquivos-fonte e os 30 Markdown atribuídos a esta frente coincidiam com o snapshot naquele horário. Isso registra deriva concorrente, não a aprova nem a incorpora. O recibo tem os caminhos e contagens. `docs/_meta/project-state-20261013.json:2-8,7346-7355,15220-15286`. ^[docs/_meta/project-state-20261013.json]

## Leitura recomendada e manutenção

1. Comece por `docs/SCHEMA.md`, `docs/index.md` e as entradas recentes de `docs/log.md` para entender convenções, navegação e histórico da própria wiki. `docs/SCHEMA.md:13-17`; `docs/index.md:11-16`; `docs/log.md:11-17,70-90`. ^[docs/SCHEMA.md]
2. Use `docs/_meta/source-manifest-20261013.json` e `docs/_meta/project-state-20261013.json` como baselines datados. Se hashes divergirem, registre a deriva e peça releitura ao owner; não restaure nem substitua trabalho alheio. `docs/_meta/source-manifest-20261013.json:2-9`; `docs/_meta/organization-spec.md:48-53`. ^[docs/_meta/source-manifest-20261013.json]
3. Corrija afirmações desatualizadas em documento apropriado após revisão do integrador. Não reescreva checkpoints, resultados de teste, recibos, contratos congelados ou histórico para fazê-los parecer atuais. `docs/_meta/delegation-contract.md:19-27,31-37`; `docs/SCHEMA.md:79-91`. ^[docs/_meta/delegation-contract.md]
4. O verificador `python docs/_meta/tools/verify.py` é documental, conforme o schema; não executá-lo nesta frente, pois a delegação proíbe testes. A validação da página e do recibo desta entrega não é teste de produto. `docs/SCHEMA.md:87-91`; `docs/_meta/delegation-contract.md:68-72`. ^[docs/SCHEMA.md]

Para manutenção da wiki, veja [[manutencao-da-documentacao]]. Para a relação com evidências operacionais, veja [[relatorios-e-evidencias]]; para outro mapa temático, [[defi-e-oportunidades]]. O índice e o log são de responsabilidade do integrador, não desta escrita delegada.