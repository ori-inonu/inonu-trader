# TASKS: inteligência de decisão do Inonu

Estados: `feito` (com evidência), `em andamento`, `não iniciado`, `bloqueado` (com o motivo). Todo código: teste primeiro (falha guardada), implementação, verde, varredura de pureza. Requisitos e aceitação em [SPEC.md](SPEC.md). Coordenação em [README.md](README.md).

## C1: Gravador e Veredito

| ID | Req | Tarefa | Arquivos | Estado |
| --- | --- | --- | --- | --- |
| INT-0.1 | todos | SDD | `docs/sdd/inteligencia-decisao/` | feito |
| INT-0.2 | AC-INT-10 | Baseline: `src/intel src/inonu src/lab src/desktop` 1385 passam, 0 falham (46 s) | `evidence/` | feito |
| INT-0.3 | REC-1, REC-4 | Porte de indicadores e SMC para o backend, com paridade de vetores | `src/intel/ta/{indicators,smc}.ts` | feito: paridade com `chart-vectors` e `smc-vectors` do Python, ADX/Donchian/estatísticas com vetor gerado pelo Python, teste de deriva contra a cópia do web (47 testes) |
| INT-0.4 | REC-1, REC-4, REC-5 | FeatureVector v1 | `src/intel/features/` | feito: 72 atributos, nulo com motivo, sem olhar o futuro (mutação de `closedBars` derruba 2 testes), adaptador do `Analysis` (17 testes) |
| INT-0.5 | REC-3 | Barras multi-escala com `confirm` e volume (REST, 20 req por 2 s) | `src/outcomes/okx-bars.ts` | feito: barras, histórico paginado, cotação com spread, espaçamento de 150 ms, erros constantes (9 testes) |
| INT-0.6 | REC-3, REC-4, REC-5 | Rotulador puro | `src/outcomes/labeler.ts` | feito: líquido de custo nos dois lados, triple barrier com a parada ganhando no mesmo candle, reação da zona, incompleto com motivo (20 testes) |
| INT-0.7 | REC-2 | Armazenamento append-only | `src/outcomes/store.ts` | feito: JSONL por dia UTC, linha ruim contada, pasta sem escrita devolve false, teto com rotação só de arquivos próprios (9 testes) |
| INT-0.8 | REC-1, REC-5 | Gravador e ligação aditiva | `src/outcomes/{recorder,wire}.ts`, `src/desktop/handlers.ts`, `src/inonu/source.ts` (método `analysis`) | feito: foto a cada 5 min, rotulagem em passe próprio, `INONU_RECORDER=off` lido a cada passe, só com o feed ao vivo (12 + 9 testes); ao vivo: ver `evidence/C1-ao-vivo.md` |
| INT-0.9 | JEV-4 | Registro de cada decisão do Inonu | `src/outcomes/decision-log.ts` (envolve o `asker`, sem editar `ask.ts`) | feito: foto no clique antes do modelo, uma linha por resposta, reaproveitada marcada (17 testes) |
| INT-0.10 | REC-6 | Placar e `GET /inonu/placar` | `src/outcomes/scoreboard.ts`, `src/inonu/http.ts` | feito: sem número abaixo de 30, Wilson e Newey-West do lab, linha de base de qualquer momento, resposta reaproveitada fora (10 testes) |
| INT-1.1 | VER-4 | Plano de risco | `src/verdict/{risk-plan,targets}.ts` | feito: faixa, invalidação, alvo, ganho sobre risco líquido, tamanho limitado ao capital, já invalidada vira espera (15 + 4 testes) |
| INT-1.2 | VER-5, VER-6 | Motivos em palavras simples | `src/verdict/reasons.ts` | feito: dicionário fator para frase, até 3 a favor e 1 contra (10 testes) |
| INT-1.3 | VER-1 a VER-3 | Composição do Veredito | `src/verdict/compose.ts` | feito: 12 cenários, ordem dos portões, propriedade de 4000 entradas aleatórias (a ação é sempre a do modelo), contrato com o leitor do web em 3000 entradas (47 + 4 testes) |
| INT-1.4 | VER-1 | Resposta com `veredito` | `src/outcomes/decision-log.ts` | feito **sem editar `ask.ts`**: o envoltório compõe o Veredito a partir da foto do clique e o anexa à resposta. **Adiado para C2:** o Brief do Jev com `contexto` (precisa de `jev-model.ts`, da outra sessão) |
| INT-1.5 | VER-1 | `VereditoBody` e ligação | `web/src/components/Veredito/`, `web/src/lib/veredito/`, 3 linhas em `lib/inonu/client.ts`, 1 bloco em `InonuAsk.tsx` | feito: leitor estrito, selo em palavra, plano em porcentagem, formulário do perfil e linha do Placar (63 testes novos); ligação feita depois de conferir que os dois arquivos estavam quietos há mais de 35 min |
| INT-1.6 | UX-2 | Glossário | `web/src/lib/glossario/` | feito para o Veredito: 20 termos, `annotate` acha as palavras em qualquer texto e o cartão explica ao lado da palavra; **falta** aplicar nos rótulos do dock e do gráfico (C5) |
| INT-1.7 | VER-4, UX-4 | Perfil de risco | `src/verdict/profile-store.ts`, rota `/inonu/perfil`, `PerfilInline` no cartão | feito no cartão e no servidor (arquivo `data/inonu/perfil.json`); **não** montado em Configurações porque `SettingsView.tsx` está sendo editado por outra sessão |
| INT-1.8 | UX-1 | Renomear a leitura de 5 min do `jev-read` | `web/src/lib/mesa/*`, `JevStage.tsx` | adiado: o instalável não inicia o `jev-read`, então os dois "Inonu decide" não aparecem juntos; arquivos quentes |
| INT-1.9 | UX-4 | Estado do Gravador à vista | `web/src/components/Veredito/MedicaoPanel.tsx`, 1 linha em `DockInonu.tsx` | reformulado e feito: o Doctor tem exatamente oito itens (WIN-8, congelado), então o estado vai na aba Inonu ("Medicao") |

## C2: Jev em perguntas pequenas

| ID | Req | Tarefa | Arquivos | Estado |
| --- | --- | --- | --- | --- |
| INT-2.1 | JEV-1, JEV-3 | Segunda pergunta de ordem invertida, no mesmo `evaluate` | `src/verdict/judge.ts` (novo, puro) | feito o construtor (`orderCheckQuestion`) e o leitor (`readInsight`); **a ligação em `createJevInonuModel` está bloqueada por posse** (ver "Pedido de ligação" abaixo) |
| INT-2.2 | JEV-2 | Composição: confiança, desacordo | `src/verdict/judge.ts`, `src/verdict/compose.ts` | feito: consistência = (n x pico - 1) / (n - 1), a menor das duas ordens; desacordo de ordem; os dois só rebaixam a resposta para esperar (11 + 3 testes); o tubo até o cartão (`InsightBox` e `decision-log`) está pronto e esperando só o gancho |
| INT-2.3 | JEV-4 | Persistir probabilidades por pergunta | `src/outcomes/store.ts` | campo `probabilidades` já existe no registro da decisão (hoje nulo); preenche quando o gancho entrar |
| INT-2.4 | JEV-1 | Perguntas do modo token on-chain | `src/inonu/jev-judge.ts` | não iniciado (token fica sem Veredito de plano por enquanto) |
| INT-2.5 | JEV-3 | Manter `validateDecision` | `src/intel/candidates.ts` (sem edição) | não iniciado |
| INT-2.6 | AC-INT-4 | Script de medição de tokens e latência, só com `--allow-paid-inference` e tetos; escrito e testado com falso, **não executado** | `scripts/jev-judge-measure.ts` | não iniciado |

## C3: Aprendiz local

| ID | Req | Tarefa | Arquivos | Estado |
| --- | --- | --- | --- | --- |
| INT-3.1 a INT-3.7 | ML-1 a ML-4 | Dataset, logística, árvores, calibração, walk-forward, artefato, controle de falso positivo | `src/intel/ml/` | feito: IRLS com L2, árvores por histograma (8x mais rápidas depois de colunar), isotônica, preparo só no treino, walk-forward com purga e embargo, portão com Holm sobre todos os modelos e lados, artefato em JSON com explicação por ablação (51 testes); controle em dado sintético (prova a máquina, não o mercado): em 12 mundos de ruído puro, 0 promovidos; com borda plantada de correlação 0,7 e depois 0,9, 12 de 12 promovidos em cada; nos testes, 0 de 5 em ruído e pelo menos 2 de 3 com borda |
| INT-3.8 | ML-5, ML-6 | Treino, deriva e Doctor | `scripts/ml-train.ts` | não iniciado |
| INT-3.9 | REC-3 | Backfill de velas (Nível A) | `src/outcomes/backfill.ts`, `scripts/ml-research.ts` | feito: puro e sem olhar o futuro (12 testes), origem `historico`, spread assumido dito; a pesquisa roda com dado real, ver `evidence/C3-pesquisa-*.md` |
| INT-3.10 | UX-4 | Visão Oportunidades e alertas "cenário se formando" | `web/src/lib/rastreador/` | não iniciado |

## C4: Smart Money v2

| ID | Req | Tarefa | Estado |
| --- | --- | --- | --- |
| INT-4.1 a INT-4.6 | SMV-1 a SMV-6 | Zonas em 15 min e 1 h com E1, fluxo na zona, regime E7 desligado, qualidade de carteira v2, chip "Dinheiro grande", T6.6 medido | não iniciado |

## C5: UX em todas as páginas e fechamento

| ID | Req | Tarefa | Estado |
| --- | --- | --- | --- |
| INT-5.1 a INT-5.7 | UX-1 a UX-5 | Modo simples e avançado, Mesa, Rastreador, Configurações, Dock, matriz de navegador, varreduras | não iniciado |
| INT-5.8 | AC-INT-10 | Revisão independente (pede autorização antes de delegar), suítes completas, `build:desktop` e `desktop:smoke`, atualizar README, CHECKPOINT, OWNERSHIP e T6.6 | não iniciado |

## Pedido de ligação (bloqueado por posse, para a sessão dona de `src/inonu/jev-model.ts` e `src/desktop/handlers.ts`)

O tubo está pronto do lado de cá. Falta uma ligação de poucas linhas, que não faço porque `jev-model.ts` está em edição por outra sessão:

1. Em `createJevInonuModel`, no ramo que não é carteira, trocar `questions` por `{ decision, [ORDER_CHECK_ID]: orderCheckQuestion(decision) }`
   (importando de `../verdict/judge`), e depois de `evaluate` chamar `options.insights?.put(input.brief.hash, readInsight(result.answers, Object.keys(criteria).length))`.
2. Em `JevModelOptions`, um campo opcional `insights?: InsightBox`; em `handlers.ts`, passar `insights: outcomes.insights`.

Custo: a segunda pergunta repete as instruções e os critérios (o estado, que é o maior, vai uma vez só), algo como 250 a 350 tokens a mais por clique.
**Isso aumenta o custo de cada pedido; precisa da autorização do usuário e de uma medição com o teto de chamadas, que eu não faço sem ela.**
Sem o gancho, o cartão diz "Consistencia das respostas do modelo: nao informada" e nenhum portao de confianca ou de ordem dispara, que é o comportamento seguro.
