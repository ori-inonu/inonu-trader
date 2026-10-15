---
title: "Fita e decisão do Jev"
created: 2026-10-13
updated: 2026-10-13
type: concept
tags: ["jev", "dados", "risco"]
sources: ["src/jev-read/feed.ts", "src/jev-read/state.ts", "src/jev-read/read.ts", "src/jev-read/decide.ts", "src/jev-read/loop.ts", "src/jev-read/public-view.ts", "src/jev-read/analytics.ts", "scripts/jev-read.ts", "web/src/lib/jev-read.ts", "docs/JEV-TAPE-DATA-F1-F4-SPEC-V2-20261011.md", "docs/JEV-READ-MODEL-SAFETY-SPEC-V2-20261011.md", "docs/sdd/mesa-decisao-20261013/SPEC.md", "docs/sdd/mesa-decisao-20261013/REPORT.md", "src/inonu/portfolio.ts", "src/inonu/ask.ts", "src/inonu/http.ts", "web/src/lib/inonu/portfolio.ts", "web/src/components/Desk/Dock/PortfolioConsultation.tsx"]
confidence: medium
---

# Fita e decisão do Jev

## Definição e fronteira

`jev-read` monta uma leitura consultiva de um instrumento OKX e, quando os dados passam pelos gates, pede ao modelo uma escolha `buy`, `sell` ou `hold` para um horizonte de cinco minutos. Não é o laço de execução, não assina e não envia ordens. O tipo da leitura exige `advisory: true` e `execution: "never"`; o leitor grava esses valores e a projeção pública rejeita um registro que os contradiga. Referências: `src/jev-read/types.ts:168-182`, `src/jev-read/read.ts:29-44`, `src/jev-read/public-view.ts:88-116`.

Esta síntese descreve o working tree observado em `main`, HEAD `00a593bcabe25dbb6d83795268533551098f645b`, incluindo alterações locais. Os hashes dos módulos examinados coincidem com `docs/_meta/project-state-20261013.json`. É inspeção estática, não prova de processo ativo, disponibilidade da OKX, chamada de modelo ou funcionamento ao vivo.

O `jev-read` aqui descrito é um fluxo distinto do `POST /inonu/ask`. Este último também tem um modo de consulta manual de carteira: requer consentimento e clique, envia leitura parcial de 2 a 6 ativos sem endereço, passa escolhas por ativo ao Jev e valida identidade e saldo antes de aceitar a resposta. É consultivo e não é o executor do trader Jev/Kuru/Monad. Não muda o requisito do trader de preservar ordens a cada bloco de 300 ms nem o converte em decisão a cada N blocos. A existência do modo não prova chamada live nem conclusão do plano de carteira verificável. ^[docs/sdd/mesa-decisao-20261013/SPEC.md] ^[docs/sdd/mesa-decisao-20261013/REPORT.md] ^[src/inonu/portfolio.ts] ^[src/inonu/ask.ts] ^[src/inonu/http.ts] ^[web/src/lib/inonu/portfolio.ts] ^[web/src/components/Desk/Dock/PortfolioConsultation.tsx]

## Fluxo da leitura

1. `OkxTapeFeed` mantém livro, ticker, trades, candles e funding. A fita pública usa WebSocket `books5`, `trades` e `tickers`; REST atualiza candles e funding e fornece snapshots de livro/ticker para mercado quieto. Cada valor leva `ValueProof` com identidade, fonte, época/geração, timestamp do provedor e recibos. Referências: `src/jev-read/feed.ts:128-153`, `235-263`, `294-421`, `518-598`; `src/jev-read/types.ts:37-69`.
2. `readRound` atualiza livro/ticker quando a idade exige, lê analytics opcional, captura um snapshot e chama `runJevRead`. O builder revalida os dados no snapshot final, depois dos awaits de refresh. Referências: `src/jev-read/loop.ts:100-135`, `src/jev-read/state.ts:177-203`.
3. Se o builder falha, a leitura retorna `state: null`, razões `insufficient` e `decision: null`; o modelo não é chamado. No modo observação, há estado, mas não há decisão. Referências: `src/jev-read/read.ts:41-44`.
4. Leituras e um diário JSONL são persistidos; a API local expõe `GET /jev-read` por projeção explícita. A interface faz nova validação antes de mostrar o quadro. Referências: `src/jev-read/store.ts:22-69`, `src/jev-read/http.ts:34-62`, `src/jev-read/public-view.ts:88-129`, `web/src/lib/jev-read.ts:418-447`.

## Frescor, cobertura e composição

Livro e ticker exigem prova compatível com a identidade, feed e época atuais. A idade efetiva usa o maior entre idade da fonte no relógio corrigido da exchange e idade do cache monotônico: 5 s para livro e 15 s para ticker. Se o relógio da exchange for desconhecido, o cache não basta para liberar uma decisão: candles exigem relógio conhecido. Referências: `src/jev-read/state.ts:32-70`, `189-203`; `src/jev-read/feed.ts:266-292`; `src/jev-read/types.ts:192-200`.

O estado exige 31 candles de um minuto contíguos e a abertura da última barra não pode estar no futuro nem exceder 150 s. Funding é opcional: só entra com par perp correspondente, prova e idade de fonte e cache dentro da política configurada, cujo padrão local é 120 s. Funding inválido isolado vira `null`, sem inventar zero. Referências: `src/jev-read/state.ts:72-110`, `src/jev-read/feed.ts:375-420`.

Fluxo vazio só significa mercado quieto quando há trades verificados e prova de cobertura da assinatura atual: socket aberto, ACK, pelo menos 60 s contínuos e nenhuma perda ainda dentro da janela. A janela e a retenção usam recibo monotônico; lacunas relevantes reiniciam a continuidade. Referências: `src/jev-read/state.ts:113-148`, `151-175`, `200-203`; `src/jev-read/feed.ts:718-735`.

Os limites acima são políticas no código, não garantias do provedor. A SPEC F1-F4 explicita proveniência por valor, relógios separados e critérios de rejeição, mas seu cabeçalho ainda declara o texto como draft não aceito e não congelado: `docs/JEV-TAPE-DATA-F1-F4-SPEC-V2-20261011.md:1-3`.

## Cancelamento, resposta e hold

Antes de inferir, um sinal já cancelado produz hold/error. Durante a chamada, o sinal externo e o deadline são propagados ao modelo, a corrida encerra sem esperar modelo que não responde, o deadline rejeita resposta que retorna após o prazo, e timers/listeners próprios são removidos. Erro, timeout e resposta malformada tornam-se `hold`; a normalização recusa soma não finita ou peso escolhido que zera. Referências: `src/jev-read/read.ts:45-79`, `src/jev-read/decide.ts:27-64`, `src/jev-read/decide.ts:127-159`.

A saída não valida lucro nem calibração. Probabilidades são pesos de decisão, não taxa de acerto. A projeção backend exige status, ação, pesos, coerência e os marcadores consultivos; no navegador a leitura também exige schema 1, `advisory: true` e `execution: "never"`. Referências: `src/jev-read/types.ts:156-182`, `src/jev-read/public-view.ts:61-116`, `web/src/lib/jev-read.ts:400-433`.

## Produtor e analytics opcional

`scripts/jev-read.ts` exige escolher exatamente `--observe` ou `--jev`. O modo `--observe` não instancia modelo; `--jev` exige `TYPESAFE_AI_API_KEY`. A cadência padrão é 15 s, instrumentos são lidos em round-robin, e `--max-reads` limita decisões contadas no diário atual e seu único backup rotacionado. Isso não informa custo faturado. Referências: `scripts/jev-read.ts:47-83`, `91-92`, `173-194`; `src/jev-read/loop.ts:138-161`.

Analytics é digest opcional e descritivo. O parser limita tamanho e instrumentos, valida seções por allowlist, descarta chaves com vocabulário de decisão e ignora pacote ausente, inválido ou com mais de 120 s. Sem seção válida, não há bloco `analysis`. Referências: `src/jev-read/analytics.ts:19-20`, `323-368`, `374-406`; `src/jev-read/loop.ts:112-119`. O runner inspecionado apenas constrói um comando Python sem shell; o produtor Python não foi inspecionado: `src/jev-read/analytics-runner.ts:1-40`.

## O que os registros antigos significam

Relatórios de 10 e 12 de outubro documentam defeitos reproduzidos em candidatos e hashes anteriores, incluindo timestamps futuros promovidos, cancelamento tardio, overflow de pesos e bloqueio permanente após mais de 256 observações pendentes. No código deste snapshot, o builder usa relógio corrigido e rejeita candle futuro; o leitor implementa cancelamento/deadline; o validador rejeita overflow; e o feed reconcilia observações futuras e mantém envelope de perda para recuperação por evidência estritamente mais nova. Isso é correspondência estática de implementação, não replay dos probes nem aceite independente. `^[docs/JEV-READ-INDEPENDENT-SPEC-REVIEW-4a1d9e9.md] ^[docs/research/codex-tape-review-20261012/REPORT-SPEC-P1-P2.md] ^[docs/research/codex-tape-review-20261012/REPORT-STANDARDS-P1-P2.md] ^[docs/JEV-TAPE-LOSS-RECOVERY-CHECKPOINT-20261012.md]`

O checkpoint de recuperação relata que o hash atual de `feed.ts` foi verificado, mas também que a revisão independente da composição atual estava pendente e envelopes mistos podem ficar conservadoramente bloqueados. Preserve essa limitação; o checkpoint não é uma aprovação do objetivo total: `docs/JEV-TAPE-LOSS-RECOVERY-CHECKPOINT-20261012.md:15-17`, `26-36`.

Os contratos de segurança de modelo também se identificam como propostos, com freeze pendente, apesar de os comportamentos M1-M4 estarem visíveis no código atual. Implementação observável não altera o status documental nem equivale a aprovação: `docs/JEV-READ-MODEL-SAFETY-SPEC-V2-20261011.md:1-3`, `13-18`.

## Limites e pontos para revisão

- O comentário de módulo em `feed.ts:8-10` generaliza que falhas REST preservam a observação; `refreshFunding` limpa funding em falha, sem atualizar `lastError`: `src/jev-read/feed.ts:375-420`.
- `refreshCandles` cria `captureId`, mas após o await só confere `feedEpoch` antes de substituir a série. Respostas concorrentes fora de ordem não têm guarda de captura equivalente à de funding/livro/ticker: `src/jev-read/feed.ts:344-373`. Risco estático, não exercitado nesta tarefa.
- Se a gravação do diário falhar após uma chamada ao modelo, o processo atual conta a decisão em memória, mas uma reinicialização reconstrói o limite a partir do diário: `src/jev-read/loop.ts:130-161`, `src/jev-read/store.ts:42-69`. A recuperação desse cenário não foi exercitada.
- Não foram lidos os oito arquivos de teste atribuídos nem o fixture analytics; nenhum teste foi executado. Também não houve leitura do produtor Python, provider, rede, modelo, `.env`, credenciais, custo ou processo ao vivo.

Leitura recomendada: [SPEC de dados F1-F4](../JEV-TAPE-DATA-F1-F4-SPEC-V2-20261011.md), [SPEC de cancelamento e resposta](../JEV-READ-MODEL-SAFETY-SPEC-V2-20261011.md), [checkpoint de recuperação](../JEV-TAPE-LOSS-RECOVERY-CHECKPOINT-20261012.md) e [catálogo de documentos atribuídos](../_meta/catalogs/fita-e-decisao-jev-documentos-01.md). A síntese não substitui nenhum deles.

## Relações

- [[grafico-e-analytics]]
- [[inteligencia-e-resultados]]
- [[carteira-e-patrimonio]]
- [[relatorios-e-evidencias]]
- [[manutencao-da-documentacao]]
- [[governanca-e-historico]]
