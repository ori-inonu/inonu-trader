---
title: "Laboratório, replay e paper: fronteiras de evidência"
created: 2026-10-13
updated: 2026-10-13
type: concept
tags: ["jev", "backtest", "risco", "evidencia"]
sources: ["docs/JEV-LABORATORIO-DE-DECISAO.md", "docs/JEV-LAB-JEV-REAL.md", "docs/BACKTEST-EVIDENCE.md", "docs/PAPER-CAPITAL.md", "docs/PAPER-SUPERVISOR.md", "docs/sdd/book-replay/README.md", "docs/sdd/book-replay/PLAN.md", "docs/sdd/book-replay/SPEC.md", "docs/sdd/book-replay/ACCEPTANCE.json", "docs/_meta/delegation-contract.md", "docs/SCHEMA.md", "src/lab/source.ts", "src/lab/outcomes.ts", "src/lab/candidates.ts", "src/lab/policies.ts", "src/lab/run.ts", "src/lab/stats.ts", "src/lab-jev/jev-chooser.ts", "scripts/jev-lab.ts", "scripts/jev-lab-real.ts", "src/backtest.ts", "src/backtest-evidence.ts", "src/paper-capital.ts", "src/paper-supervisor.ts", "src/paper-supervisor-store.ts", "src/paper-supervisor-runner.ts"]
confidence: medium
---

# Laboratório, replay e paper: fronteiras de evidência

## Definição e mapa

Este tema reúne quatro camadas que não devem ser fundidas: máquina estatística offline, mundos sintéticos, escolha real do Jev em sombra com autorização explícita para inferência paga, e vantagem de mercado ainda desconhecida. A leitura desta página confronta os guias atribuídos com o código do working tree observado em 2026-10-13; não reexecuta os resultados históricos nem verifica serviço ativo. ^[docs/JEV-LABORATORIO-DE-DECISAO.md] ^[docs/JEV-LAB-JEV-REAL.md] ^[docs/BACKTEST-EVIDENCE.md] ^[docs/PAPER-SUPERVISOR.md]

- **Maquinário estatístico:** transforma entradas e escolhas hipotéticas em retornos, testes, intervalos, risco e gates. Correção matemática ou teste sintético valida propriedades do cálculo, não vantagem negociável.
- **Mundo sintético:** gerador determinístico serve para exercitar o pipeline e medir falsos positivos/poder sob premissas definidas. Sinal plantado é conhecido pelo simulador, não observado no mercado.
- **Jev real em sombra:** `scripts/jev-lab-real.ts` pode consultar um modelo após `--allow-paid-inference`, chave e tetos. Isso autoriza apenas a consulta paga configurada; não autoriza operação financeira, ordem ou capital.
- **Vantagem real:** permanece desconhecida. Código, replay contábil, paper sintético e relato de sessões anteriores não estabelecem retorno futuro nem execução real.

## Laboratório e estatísticas

`ReplaySource` consome texto ou bytes de captura fornecidos ao processo; a fonte aplica corte point-in-time e separa a janela de decisão das leituras futuras do motor de outcomes. A API não autentica produtor, origem física ou validade histórica da captura. `src/lab/source.ts:5-16,59-70,220-238`. ^[docs/JEV-LABORATORIO-DE-DECISAO.md]

`SyntheticSource` usa PRNG com semente, preço geométrico sem drift por padrão, spreads e funding parametrizados; a vantagem plantada é opcional. O próprio módulo limita a interpretação a aritmética e máquina estatística, nunca lucro. `src/lab/source.ts:11-16,259-307`.

Candidatos usam dados disponíveis no corte, exigem cotação recente e ficam inelegíveis quando spread, custo fixo ou funding requerido é desconhecido. As regras e o Mock são locais e determinísticos; o Mock não é o Jev. `src/lab/candidates.ts:183-235,297-341`; `src/lab/policies.ts:5-15,72-89`; `scripts/jev-lab.ts:4-11,23-35`.

A inferência declarada usa Newey-West para a média com sobreposição, Holm para testes múltiplos e comparações pareadas de união-interseção. Bootstrap em blocos é usado para caminhos de patrimônio, não para o veredito. O gate só pode recomendar a fase já vigente, não conceder promoção ou autorização. `docs/JEV-LABORATORIO-DE-DECISAO.md:260-290`; `src/lab/stats.ts:1-13,43-57,565-629`. Os números de poder e falso positivo documentados derivam de testes/simulações sintéticos históricos; não foram executados nesta auditoria. ^[docs/JEV-LABORATORIO-DE-DECISAO.md]

## Custos e inferência

A tabela laboratorial é uma hipótese conservadora: taxas taker por lado, spread observado, slippage proxy, rendimento de caixa e custos fixos por modalidade. Modalidades sem modelo de custo fixo ficam desconhecidas/ineligíveis; os valores não são tarifas confirmadas de venue. `src/lab/outcomes.ts:34-72,86-105`; `src/lab/candidates.ts:183-235`.

O Jev real limita custo com preço de tokens de entrada, reserva conservadora antes da consulta e uso informado depois; consulta sem uso válido consome a reserva e deixa custo conhecido como nulo. A estimativa não é fatura nem custo total do provedor. `src/lab-jev/jev-chooser.ts:17-21,363-430,449-455`; `scripts/jev-lab-real.ts:333-399`; `docs/JEV-LAB-JEV-REAL.md`.

**Divergência documental e contábil:** o guia geral diz que custo nulo não é subtraído naquela época (`docs/JEV-LABORATORIO-DE-DECISAO.md:262-266`), enquanto o guia do Jev real diz que o custo de inferência só é subtraído quando todo custo é conhecido (`docs/JEV-LAB-JEV-REAL.md:115-117`). `src/lab/run.ts:395-420` implementa a segunda regra: com uma consulta desconhecida, também omite da série os custos conhecidos das demais. `src/lab/stats.ts:598-629` mantém o custo agregado desconhecido. O gate não qualifica o resultado, mas a média líquida descritiva pode ficar maior. Integrador deve fixar a semântica, alinhar os guias e adicionar regressão de custo misto; nenhum código foi alterado.

## Replay e backtest

O replay de journal existente reconcilia eventos e custos declarados no arquivo recebido. Sua análise de evidência se identifica como `accounting-replay-only`, mantém `strategyQualified: false` e `financiallyAuthorized: false`, e agrega limites sobre fills e procedência. Isso não prova que o journal veio de mercado real nem projeta lucro. `src/backtest.ts:1-25`; `src/backtest-evidence.ts:360-436`; `docs/BACKTEST-EVIDENCE.md`.

O perfil offline de replay v4 em `docs/sdd/book-replay/` é uma proposta futura não congelada: `ACCEPTANCE.json` está `proposed_unfrozen`, sem aprovador ou resposta humana, e todos os 14 critérios de implementação estão falsos. Não confundir a proposta v4 com `ReplaySource` do laboratório ou com o replay contábil atual. `docs/sdd/book-replay/README.md:1-7`; `docs/sdd/book-replay/SPEC.md:1-9,27-61`; `docs/sdd/book-replay/ACCEPTANCE.json:1-16,84-95`.

**Ponto de proveniência a esclarecer:** `docs/sdd/book-replay/README.md:3` diz que SPEC, PLAN e ACCEPTANCE nunca foram versionados. O checkout atual rastreia os quatro caminhos (`git ls-files`), e o histórico mostra que `b7b4c6b` em 2026-10-12 os adicionou nessa pasta. Isso não refuta por si só a hipótese de que os arquivos no antigo caminho `undefined` nunca foram rastreados; se a frase pretende dizer que esses conteúdos nunca foram versionados em caminho algum, conflita com o histórico. Esclarecer o referente e a cronologia, sem alterar a classificação do perfil como proposta não congelada.

## Classificação das fontes atribuídas

- `docs/JEV-LABORATORIO-DE-DECISAO.md`: `current_reference` para arquitetura, custos assumidos e critérios estatísticos; valores de simulações antigas continuam evidência histórica não reexecutada.
- `docs/JEV-LAB-JEV-REAL.md`: `current_reference` para o caminho de consulta em sombra, limites de custo e pré-voo, confrontado com o script e o chooser atuais.
- `docs/BACKTEST-EVIDENCE.md`: `current_reference` para replay contábil limitado, compatível com a análise atual que nunca qualifica estratégia ou autorização.
- `docs/PAPER-CAPITAL.md` e `docs/PAPER-SUPERVISOR.md`: `current_reference` para ledger e ciclo de supervisão sintéticos, confrontados com as implementações.
- `docs/sdd/book-replay/PLAN.md` e `docs/sdd/book-replay/SPEC.md`: `proposal`; ambos declaram perfil futuro proposto, não congelado e sujeito a dependências de decisão e revisão.
- `docs/sdd/book-replay/README.md`: `needs_review` quanto à proveniência; não está claro se “nunca foram versionados” se refere ao caminho anterior `undefined` ou aos conteúdos em qualquer caminho. O status do perfil como proposta permanece coerente.
- `docs/sdd/book-replay/ACCEPTANCE.json`: artefato de proposta inspecionado separadamente, não contado como Markdown classificado; status e critérios de implementação permanecem pendentes.

Essa classificação orienta a navegação, não cria precedência nem aprovação. Guias atuais podem descrever o desenho sem provar execução; propostas não são contratos implementados; evidências históricas conservam a data e o escopo originais. `docs/_meta/delegation-contract.md:29-35,54-64`; `docs/SCHEMA.md:66-85`.

## Paper e supervisor

`PaperCapital` registra valores inteiros em átomos, reservas, liquidações, custos completos e paradas por custo desconhecido ou limites. Os checkpoints declaram `mode: synthetic-paper`, `strategyQualified: false` e `financiallyAuthorized: false`. `src/paper-capital.ts:45-81,281-392`; `docs/PAPER-CAPITAL.md`.

O supervisor persiste reserva e intenção antes de chamar o adapter, reconcilia tentativas pendentes e só liquida recibo validado. O runner fornecido usa fixtures locais, ativo e venue sintéticos; a persistência SQLite e o ciclo de recuperação não são integração com exchange. `src/paper-supervisor.ts:686-767,778-855`; `src/paper-supervisor-store.ts:1-4,322-340`; `src/paper-supervisor-runner.ts:20-63`; `docs/PAPER-SUPERVISOR.md`.

## Escada de evidência

1. Replay aceito significa consistência contábil do journal fornecido, não autenticidade do produtor.
2. Gate estatístico calculado significa diagnóstico sob premissas e dados daquele relatório, não promoção automática.
3. Consulta paga ao Jev real significa inferência de modelo em sombra, não ordem nem recomendação autorizada.
4. Ledger e supervisor paper significam estado sintético local, não conexão com mercado ou prova de fills.
5. Vantagem, custo de execução real e permissão financeira exigem evidência e autoridade externas a estes módulos.

## Verificação, limites e relações

Escopo desta revisão: leitura estática dos oito Markdown atribuídos, do artefato ACCEPTANCE e dos módulos citados no recibo. `tests_run` é vazio. Não foram executados testes, simulações, chamadas ao modelo, comandos de produto ou consultas externas. Integridade de capturas reais, custos faturados, funcionamento ao vivo, execução de ordens, rentabilidade e vantagem permanecem sem verificação.

Próximos passos sugeridos ao integrador, sem mudança de código nesta frente:

- Decidir se o relatório deve subtrair cada custo de inferência conhecido mesmo quando outra consulta fica sem preço; adicionar regressão para custo misto antes de alterar a série.
- Corrigir a frase de versionamento no README do perfil v4 e manter explícito que o aceite e a implementação continuam pendentes.
- Manter separados custos proxy, custo de inferência observável, custo faturado e custo total de uma futura execução.
- Não converter resultados sintéticos, shadow, replay contábil ou paper em afirmação de vantagem ou permissão financeira.

Leia os guias canônicos de [decisão do laboratório](../JEV-LABORATORIO-DE-DECISAO.md), [Jev real](../JEV-LAB-JEV-REAL.md), [evidência de backtest](../BACKTEST-EVIDENCE.md), [capital paper](../PAPER-CAPITAL.md) e [supervisor](../PAPER-SUPERVISOR.md). Para a interpretação geral de relatórios, veja [[relatorios-e-evidencias]]; para atualizar a wiki sem alterar fontes reservadas, veja [[manutencao-da-documentacao]]. ^[docs/_meta/delegation-contract.md] ^[docs/SCHEMA.md]
