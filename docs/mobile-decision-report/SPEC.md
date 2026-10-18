# Relatório móvel para decisão humana, offline v1

Objetivo separado e finito: entregar contrato, projeção e exportação HTML/JSON de um snapshot DEX existente, com exemplo sintético sanitizado, verificações locais e checkpoint de integração. Esta entrega não altera a meta nativa bloqueada G01–G17 nem certifica integração OKX/Wallet/JEV real. Solicitação recebida por delegação em 2026-10-11, da conversa 01a12d03-dfcf-768e-af96-9bc0106350f7; não representa autorização para responder a outra conversa ou modificar sua meta.

## Fontes e ownership

Checkout: C:/Users/gabri/.codex/worktrees/okx-real-integration/jev-trader. HEAD destacado 055a637f27f28cbf357cfb492534f7ed33d9b68f. Reutilizar parseDexReport e SYNTHETIC_DEX_REPORT de web/src/lib; não modificar essas fontes. O parser existente valida encadeamento dos montantes e delta por BigInt, preserva strings financeiras e não qualifica execução. Seus horários de requests não provam source_time de um dado onchain.

Integrador /root possui exclusivamente os arquivos novos em src/mobile-decision-report/ e docs/mobile-decision-report/. Outros escritores existem; alterações anteriores e documentos G01–G17 serão preservados. src/dashboard/reports-server.ts não existe neste checkout. Não copiar implementação de outra branch nem criar seam fictícia.

## Critérios congelados M01–M10

| ID | Resultado observável | Verificação |
| --- | --- | --- |
| M01 | Projeção reutiliza o parser DEX real; preserva todos os números/strings financeiros validados, unidades, nulidades e execução não qualificada. Não calcula lucro líquido, probabilidade ou recomendação. | Testes da projeção e regressão do parser existente. |
| M02 | source_time_ms e fetched_at_ms são campos distintos, explícitos e nullable. Idade/freshness da fonte jamais deriva de fetched_at. Ausência permanece desconhecida. | Casos normal, missing, stale, future e fronteira de TTL. |
| M03 | Contradições temporais, mudança de binding e contexto antigo produzem alertas/invalidação observáveis; input estrutural inválido falha com erro constante, sem ecoar conteúdo. | Casos contraditório, identity/revision change, invalidação e invalid input. |
| M04 | JEV ausente significa not_evaluated. Contexto importado é apenas provided_unverified, separado dos fatos, vinculado ao hash do snapshot e invalidado por mismatch, cronologia ou expiração. Nenhuma API é chamada. | Casos ausente, contexto fornecido, mismatch, futuro e antigo. |
| M05 | Custos de API/JEV reportados preservam strings USD; null nunca vira zero. Estimativas de trade/gas continuam separadas; cobertura total e quota permanecem desconhecidas. | Custos conhecidos, desconhecidos e alta precisão. |
| M06 | Identidade, revisão, versão, origem declarada, proveniência não verificada, fontes, hash e validade estão visíveis. HTML estático informa que validade precisa ser reavaliada no consumo e que decisão humana não autoriza execução. | Snapshot e HTML exportados, testes de validade. |
| M07 | JSON/HTML são construídos por allowlist. Extra fields não são exportados; strings viram texto escapado. Sem script, eventos inline, formulários submetíveis, conexão, links remotos, recursos externos ou leitura de ambiente/segredos. CSP restritiva. | Payload de injeção, propriedades extras/accessors, inspeção HTML e grafo de imports. |
| M08 | HTML único é legível em 360 e 390 px, com conteúdo longo quebrável, foco visível e espaço de decisão humana por teclado. Sem controle que sugira execução financeira ou salvamento automático. | Navegador nas duas larguras e teclado, quando disponível; registrar limitações reais. |
| M09 | Fixtures sintéticas sanitizadas e exemplo reproduzível incluem missing, stale, future, contradiction, invalid input e unknown costs. Toda saída sintética é identificada. | Fixtures e comando Bun --no-env-file, testes focados. |
| M10 | Verificação Bun, análise estática proporcional, revisão independente em cópia isolada, manifest de arquivos/hashes e checkpoint permitem integrar a entrega. Resultado completo offline mesmo com integração externa pendente. | Logs reais, revisão, preservação do baseline e guia de integração. |

## Contrato e decisões locais

Entrada v1: schema mobile_decision_input_v1; snapshot_id e revision identificáveis; origin synthetic_fixture ou local_import; dex_report desconhecido validado pelo parser existente; source_time_ms/fetched_at_ms nullable; max_age_ms entre 1 e 3.600.000; api_cost_usd decimal string não negativa ou null; jev null ou recibo contextual explicitamente fornecido. now_ms é obrigatório no projector/exporter: nenhuma leitura implícita de relógio/ambiente. current_binding_sha256 opcional invalida uma identidade/revisão/conteúdo substituídos.

Contexto JEV fornecido: id/model/version, evaluated_at_ms, bound_facts_sha256, observations/limitations limitadas, input_tokens/output_tokens nullable e cost_usd string ou null. Sem campos de recomendação, probabilidade, ordem ou execução. Proveniência permanece não verificada. Binding SHA-256 cobre versão, snapshot_id, revision, origin, DEX normalizado, source_time_ms, fetched_at_ms, max_age_ms e api_cost_usd. Alterar qualquer um desses campos invalida contexto anterior. O SHA não autentica o produtor nem prova inferência real.

Funções públicas mínimas: projectMobileDecisionReport(input, options), exportMobileDecisionJson(input, options), exportMobileDecisionHtml(input, options). Exporters projetam novamente a entrada; nunca renderizam JSON projetado arbitrário como confiável. Sem I/O nos três métodos. Bun/Node crypto local calcula o binding; integração futura deve ocorrer no servidor ou usar adaptador explicitamente projetado, sem importar node:crypto no client Next.

Freshness é avaliada na geração: desconhecida quando não há source_time; future quando source_time > now_ms; stale quando now_ms - source_time > max_age_ms. Fronteira igual ao TTL ainda pertence ao snapshot; ultrapassá-la exige revalidação. Fonte posterior à coleta é contraditória. Horário final do relatório posterior à coleta também é contraditório. Relatório HTML estático não atualiza automaticamente: produtor/consumidor deve reprojetar ao mudar tempo, identidade, revisão ou conteúdo. Não persistir notas pessoais no JSON exportado; campos humanos são rascunho no navegador.

Estratégia local reversível, fundamentada na solicitação: módulo novo de projeção, sem alterar UI geral, bot, catálogo/replay, autenticação ou copy financeiro preexistente. Consulta JEV local anterior foi preview, não decisão executada nem aprovação; mode=evaluate pago está proibido nesta entrega. Não substituir ausência de API por inferência inventada.

## Plano proporcional

1. Congelar este contrato e hashes de fontes/baseline permitido; adicionar primeiro teste vermelho da seam de projeção (M01/M02).
2. Implementar verticalmente validação/projeção, clocks/alertas, contexto/custos e exportação segura (M01–M07); adicionar cada caso após a fatia anterior passar.
3. Fixtures e artefatos estáticos, checks focados, browser/teclado local quando disponível (M08–M09).
4. Congelar candidato e revisar independentemente em cópia isolada; resolver achados, verificar preservação e documentar a seam (M10).

## Limites

Proibidos: rede externa, APIs pagas/autenticadas, arquivos .env/segredos e fingerprints de credenciais, wallet connection, assinatura/trading/transferência, bypass regional, installs MCP, chaves globais e alterações de objetivos de outras sessões. Sem staging/commit/push/deploy. Não iniciar servidor financeiro. Um preview HTTP loopback que sirva exclusivamente o HTML sintético é permitido para verificação local, sem endpoints financeiros. Custos reais desta entrega permanecem desconhecidos; não afirmar gratuidade global de hooks/provedor. Nenhuma medição de ganho ou certificação WCAG integral.
