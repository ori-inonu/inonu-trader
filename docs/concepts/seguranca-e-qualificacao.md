---
title: "Segurança e qualificação sem abrir gates"
created: 2026-10-13
updated: 2026-10-13
type: concept
tags: ["seguranca", "risco", "jev", "integracao"]
sources: [
  "docs/LIVE-QUALIFICATION.md",
  "docs/READINESS-SPEC.md",
  "docs/PROFIT-SPEC.md",
  "docs/POLITICA-DE-LIMITES.md",
  "docs/SYSTEM-ONE.md",
  "docs/SYSTEM-ONE-EXPOSURE-SPEC.md",
  "docs/HTTP-PREVIEW-SPEC-20261011.md",
  "docs/HTTP-PREVIEW-SCOPE-REVIEW-20261011.md",
  "docs/HTTP-PREVIEW-IMPLEMENTATION-CHECKPOINT-20261011.md",
  "docs/HTTP-PREVIEW-INTEGRATED-RUNTIME-CHECKPOINT-20261011.md",
  "docs/LOCALHOST-ORIGIN-DIAGNOSIS-20261011.md",
  "docs/OKX-DERIVATIVES-SPEC.md",
  "docs/JEV-OKX-SDD-THREAT-MODEL-20261009.md",
  "docs/WALLET-TRANSACTION-PREFLIGHT.md",
  "src/index.ts",
  "src/config.ts",
  "src/market.ts",
  "src/trader.ts",
  "src/book.ts",
  "src/chain.ts",
  "src/model.ts",
  "src/trades.ts",
  "src/risk.ts",
  "src/economics.ts",
  "src/policy/envelope.ts",
  "src/live-qualification.ts",
  "scripts/qualify-live.ts",
  "scripts/doctor.ts",
  "scripts/policy-envelope.ts",
  "scripts/system-one.ts",
  "scripts/http-preview.ts",
  "src/server.ts",
  "src/operator/http.ts",
  "src/jev-read/http.ts",
  "src/system-one/brief.ts",
  "src/system-one/cycle.ts",
  "src/system-one/decide.ts",
  "src/system-one/readings.ts",
  "src/system-one/public-view.ts",
  "src/system-one/http.ts",
  "src/system-one/clock.ts",
  "src/system-one/types.ts",
  "src/system-one/volatility.ts",
  "web/src/lib/system-one.ts",
  "scripts/okx-derivatives.ts",
  "src/okx-derivatives/adapter.ts",
  "src/okx-derivatives/gate.ts",
  "src/okx-derivatives/carry.ts",
  "src/okx-derivatives/directional.ts",
  "src/okx-derivatives/local-file.ts",
  "src/okx-derivatives/report.ts",
  "src/okx-derivatives/snapshot.ts",
  "src/onchainos/public-okx.ts",
  "src/lab/outcomes.ts"
]
confidence: medium
---

# Segurança e qualificação

## Definição

Esta página mapeia a diferença entre cálculo, bloqueio, decisão e execução no working tree observado. Relatório, checklist, `eligible`, CORS permitido ou ausência de erro não são autorização para operar. A única decisão de abrir qualquer gate continua pertencendo ao dono, em revisão separada.

## A meta Kuru/Monad de 300 ms permanece central

O requisito continua sendo medir p95 de latência de decisão em até 300 ms no perfil `every-block`; a própria qualificação registra que cotar em cada bloco ainda não foi provado. O perfil `gated` tem outro limite documental, p95 até 1500 ms. A configuração padrão atual é `quoteIntervalBlocks=100`, `economicGate=true` e `maxDecisionMs=1500`; isso descreve o modo padrão, não substitui nem reduz a meta central de Kuru/Monad a cada bloco de 300 ms. Não trate nenhum desses limites como latência medida. `docs/LIVE-QUALIFICATION.md:92,285`; `src/live-qualification.ts:65-70,484-485`; `src/config.ts:58-62`. ^[docs/LIVE-QUALIFICATION.md] ^[docs/READINESS-SPEC.md] ^[docs/PROFIT-SPEC.md] ^[docs/POLITICA-DE-LIMITES.md]

## Core Kuru: caminho e travas

`src/index.ts` recusa reutilizar o journal, cria `Market`, chama `market.init()` antes de montar `Trader` e iniciar a fita de blocos. `src/config.ts` mantém paper e mock como defaults. Se `DRY_RUN=false`, a configuração exige chave, modelo Jev, credencial de modelo e confirmação explícita; isso só satisfaz validação de configuração, não autoriza execução. `src/index.ts:10-16,22-46`; `src/config.ts:14-24,58-64`.

No caminho principal atual, `Market.wallet` é nula em dry run e `Market.init()` lança erro se uma carteira live existir. Portanto, o entrypoint comum para antes do trader quando live é pedido. Ainda assim, `Market.send()` contém o ramo de assinatura e broadcast e `Trader` chama esse método quando há lado elegível. Preserve o bloqueio de `Market.init()`; não infira que as primitivas de envio desapareceram nem o contorne. `src/market.ts:82-113,153-162,235-250`; `src/trader.ts:160-198`.

No trader, bloco atrasado não gera nova decisão; `riskStop` bloqueia parada de perda ou gasto e recibos pendentes; quote interval, portão econômico, prazo, confiança, posição, limite de capital, ledger e margem condicionam a cotação. O ledger é spot financiado. O cálculo econômico é um teste hipotético de duas execuções no mesmo livro, não previsão de lucro. `src/trader.ts:126-170,219-226,548-556`; `src/risk.ts:1-33`; `src/economics.ts:1-8`.

O envelope por fase é uma biblioteca pura: fase 0 começa com exposição zero e `checkSettings().ok` significa apenas que os campos informados cabem na fase; campos necessários ausentes ficam desconhecidos. Ela declara que não envia, assina ou libera o gate. O core `Trader` importa `risk.ts`, `economics.ts`, `config.ts` e `market.ts`, não `policy/envelope.ts`; System One e ferramentas de laboratório consomem o envelope separadamente. Logo, não o apresente como gate já integrado ao caminho Kuru. `src/policy/envelope.ts:8-15,68-87,555-594,737-741`; `src/trader.ts:1-8`; `src/system-one/brief.ts:14-16`.

## Qualificação live e doctor

`evaluateLiveQualification` produz itens, blockers, `readyForOwnerReview` e `grantsPermission: false`; a nota mantém o gate de código separado e inalterado. O CLI de qualificação declara leitura local sem RPC/rede, não altera `Market.init()` e retorna código zero para qualquer relatório completo, inclusive com blockers. Código zero não é aprovação. `src/live-qualification.ts:261-270,1213-1254`; `scripts/qualify-live.ts:1-7,230-255,260-279,287-315`.

`doctor.ts` é diferente: se executado, consulta apenas métodos RPC de leitura e fixa `investmentReady=false`. Ele informa presença de credenciais como booleanos, não demonstra disponibilidade atual, rentabilidade ou prontidão live. Nesta auditoria o doctor não foi executado e nenhum RPC foi chamado. `scripts/doctor.ts:1-15,44-57`.

## System One

O brief só torna candidato elegível quando os limites de fase, liquidação, volatilidade conhecida, frescor, funding, margem, inventário completo e lado existente passam. A fase 0 observa; a fase 1 exige spot; o módulo avalia perpétuos na fase 2. O ciclo chama o modelo somente se houver candidato e termina sempre em `dry_run` ou `blocked`, com razão `system_one_never_executes`. Escolha não envia ordem. `src/system-one/brief.ts:5-12,75-113`; `src/system-one/cycle.ts:32-86`; `src/system-one/decide.ts:108-147`.

`--public` lê mark, funding e candles públicos da OKX se o script for executado. A carteira desse modo é capital configurado, não saldo; `configuredWallet` marca valor incompleto, que impede elegibilidade. `--jev` seleciona o modelo real; sem essa flag o script anuncia o mock. O script grava estado e journal, por isso não foi iniciado nesta tarefa. `src/system-one/readings.ts:119-160`; `scripts/system-one.ts:4-13,81-125`. ^[docs/SYSTEM-ONE.md] ^[docs/SYSTEM-ONE-EXPOSURE-SPEC.md] ^[docs/research/R9-system-one-alavancagem-onchainos.md]

A rota System One publica uma projeção explícita e valida estados `blocked` ou `dry_run`; a lista de origem é restrita, mas CORS continua não sendo autenticação. A leitura pública de mercado, o relógio corrigido, o modelo e a persistência são fronteiras distintas, não prova de execução ou de saldo. `src/system-one/public-view.ts:21-50`; `src/system-one/http.ts:1-4,15-27`; `src/system-one/clock.ts:15-20,66-90,101-106`.

## Derivativos OKX

O avaliador de derivativos é offline: adaptador só de fixture ou snapshot importado, sem rede, credencial, assinador ou método de ordem. O snapshot é normalizado pelo operador, validado estritamente e lido de arquivo local limitado a 1 MiB. Campos desconhecidos ficam `null`; stale, skew, profundidade e limites podem tornar o resultado indisponível ou inelegível. `eligible` significa somente passar pelo filtro aritmético, nunca autorização. `scripts/okx-derivatives.ts:7-16,50-60`; `src/okx-derivatives/adapter.ts:6-18,40-63`; `src/okx-derivatives/local-file.ts:4-10,35-70`; `src/okx-derivatives/snapshot.ts:11-29`; `src/okx-derivatives/gate.ts:3-26`.

Carry usa funding observado no cenário conservador com basis adverso e mantém stress de liquidação; o modelo é explicitamente simplificado. A estratégia direcional é somente risco e seu veredito nunca é `eligible`. O relatório fixa `liveQualified=false`, `financiallyAuthorized=false` e `execution=not_qualified`. As funções de derivativos não são chamadas pelo entrypoint Kuru; há helpers puros compartilhados com o leitor público OKX e o laboratório. `src/okx-derivatives/carry.ts:112-119,247-253,265-318`; `src/okx-derivatives/directional.ts:14-18,159-203`; `src/okx-derivatives/report.ts:14-27,226-264`; `src/index.ts:1-7`; `src/onchainos/public-okx.ts:17-18`; `src/lab/outcomes.ts:16`.

## HTTP preview: somente leitura não significa autenticação

O CLI exige porta, diretório de estado e origem explícitos; inicia modo `read_only` sem produtor e o servidor de preview faz bind em `127.0.0.1`, restringe métodos a GET/OPTIONS e desativa handlers de settings e onchain. Não foi iniciado nesta auditoria. `scripts/http-preview.ts:3-23`; `src/server.ts:27-47,70-93`.

O preview passa `token=null`. A rota de operador aceita requisição sem `Origin` e, sem token, serve estado e journal locais; System One e Jev Read exigem origem allowlist, mas também têm token opcional. CORS limita leitura por navegador, não autentica processo local. Mantenha o bind loopback e trate o conteúdo do diretório de estado como dado a proteger. A implementação também expõe `/jev-read`, ausente da lista explícita de rotas de aceite P4 da SPEC; confirmar esse escopo é pendência, não autorização para ampliá-lo. `src/server.ts:36-47,79-93`; `src/operator/http.ts:51-87`; `src/system-one/http.ts:1-27`; `src/jev-read/http.ts:17-43`; `docs/HTTP-PREVIEW-SPEC-20261011.md:13-18`. ^[docs/HTTP-PREVIEW-SPEC-20261011.md] ^[docs/HTTP-PREVIEW-SCOPE-REVIEW-20261011.md] ^[docs/HTTP-PREVIEW-IMPLEMENTATION-CHECKPOINT-20261011.md]

## Leitura documental e limites

A tabela de estágio 0 em `LIVE-QUALIFICATION.md` identifica o commit antigo `62b6453`; checkpoints de branch, HTTP, localhost, exposição e OKX registram sessões datadas. Preserve-os como evidência histórica, não como estado do processo atual. A SPEC HTTP de 11 de outubro ainda se declara proposta e diz que não havia mudanças de produção; no snapshot de 13 de outubro os fontes do CLI e servidor já contêm implementação. Isso atualiza a leitura da wiki, não prova que um servidor esteja rodando. A threat model OKX também se declara design-only e não auditoria de código. `docs/LIVE-QUALIFICATION.md:23-25`; `docs/HTTP-PREVIEW-SPEC-20261011.md:1-18`; `docs/JEV-OKX-SDD-THREAT-MODEL-20261009.md:3-5,38-47`. ^[docs/HTTP-PREVIEW-INTEGRATED-RUNTIME-CHECKPOINT-20261011.md] ^[docs/LOCALHOST-ORIGIN-DIAGNOSIS-20261011.md] ^[docs/BRANCH-READINESS-REVIEW.md]

Leitura recomendada: [LIVE-QUALIFICATION](../LIVE-QUALIFICATION.md), [READINESS-SPEC](../READINESS-SPEC.md), [POLITICA-DE-LIMITES](../POLITICA-DE-LIMITES.md), [SYSTEM-ONE](../SYSTEM-ONE.md), [HTTP-PREVIEW-SPEC](../HTTP-PREVIEW-SPEC-20261011.md), [OKX-DERIVATIVES-SPEC](../OKX-DERIVATIVES-SPEC.md) e [WALLET-TRANSACTION-PREFLIGHT](../WALLET-TRANSACTION-PREFLIGHT.md).

## Verificação desta síntese

Escopo estático em working tree: HEAD e snapshot `00a593bcabe25dbb6d83795268533551098f645b`, branch `main`, snapshot capturado em 2026-10-13T10:53:03-03:00. Os 107 caminhos de código e 35 documentos atribuídos conferem por SHA-256 com o snapshot. Havia 182 caminhos com alterações locais contra HEAD antes desta escrita; o snapshot já as incluía. Não alterei fontes, índice ou log.

Não rodei testes, build, doctor, servidor, modelo, RPC ou operação de carteira; não li `.env` nem arquivos privados de dados. Runtime, credenciais em sessão, processo/porta, estado de conta, latência real e rentabilidade permanecem desconhecidos. `docs/_meta/audits/seguranca-e-qualificacao.json` registra as verificações e a cobertura documental.

## Relações

- [[defi-e-oportunidades]]
- [[manutencao-da-documentacao]]
- [[relatorios-e-evidencias]]
