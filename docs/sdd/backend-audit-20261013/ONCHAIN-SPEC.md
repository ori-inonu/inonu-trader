# Confiabilidade das leituras Onchain OS

Objetivo observado: corrigir falhas reais no backend de integração, preservando limites e a origem dos dados para a gestão de carteira. Este ciclo não ativa negociação, pagamentos, consultas autenticadas ou modelos reais.

## Fontes e ponto fixo

Achados reproduzidos OKX-01, OKX-02 e OKX-03 em `OKX-AUDIT.md`; contratos ONC-3/4/5 existentes em `src/onchain-read/{cache,budget,gateway,client}.ts` e SPEC de configuração Onchain. Proposta `NEXT-CYCLE.md` e decisões Jev reais `serial_gateway`/`refuse_at_dispatch`, recibo `0020a147-f0f4-4e66-8bd5-d7bb4ea59315`. Nenhuma decisão muda autorização externa ou histórico de consumo.

Hashes antes da implementação: client.ts `118b8e32651986e57a83876cf84f75da533b8a6425b7f5f05f3b69379adbd1ea`, gateway.ts `0b4ce61c93037d9319913ddbaaa92d5d5892ffe33bfe7317177cd16f7ea95d0d`, budget.ts `1dc6100a2bed1f0d8f5a5b5f5eece8ead23118dcd0f7bba23c1c4f408871879d`. Manifesto do snapshot separado fixa os testes preexistentes. Reconfirmar hashes antes de integrar.

## Aceitação imutável deste ciclo

- OR-01: com teto basic=1, três chaves concorrentes causam no máximo um envio. As outras recebem recusa fechada ou cache marcado stale. Chamada enviada que falha conta uma vez; recusa não enviada não conta; seguidores coalescidos contam uma vez. Revalidar teto dinâmico e mês UTC depois de aguardar admissão. O limite vale por instância do gateway, não entre processos que compartilhem a pasta.
- OR-02: HTTP 429 ou código 50011 abre cooldown global; HTTP 402 bloqueia apenas a camada correspondente. Pedidos já na fila revalidam estes gates imediatamente antes do envio, com `sent=false` se bloqueados. Credenciais são obtidas no despacho, após espera de intervalo; camadas não bloqueadas e chamadas após expiração continuam utilizáveis.
- OR-03: o timeout de cada operação enviada cobre fetch e consumo de corpo, incluindo 401/403 e transportes de teste que ignoram AbortSignal. O caller encerra com `provider_error`, `sent=true`, e a fila progride. Trabalho tardio não modifica status, cache ou resultado de sucesso; rejeições tardias são tratadas. O retry existente para clock skew compartilha o mesmo prazo.
- OR-04: preservar assinatura, normalização, retry limitado do relógio, intervalo global, cache stale, limites de usuário/background e histórico mensal. Na mesma chave, background recusado por pace_limited não bloqueia user elegível, mesmo se o líder background ficou bloqueado enquanto esperava e o user já era seguidor; ambos permitidos compartilham um envio, enquanto recusa background não envia nem conta. Executar regressões antes da correção, testes offline de cliente/gateway/HTTP e typecheck dos arquivos afetados; revisar independentemente requisitos e padrões em cópias isoladas; integrar por comparação de hashes. Erros globais de áreas concorrentes são registrados, sem declarar green global ou modificar áreas reservadas.

## Plano mínimo e arquivos exclusivos

1. Reproduzir orçamento concorrente, gates de fila e prazo do corpo em `client.test.ts` e `gateway.test.ts` (OR-01 a OR-03).
2. Preservar precheck por caller e serializar a admissão final e contabilização dos líderes após coalescing. Um user elegível tenta novamente uma vez quando compartilhou recusa de ritmo do líder background. Decisão Jev option_a, recibo 19f004c3-9bb5-4c76-9038-d07284897967, modelo jev-1.13.0, confiança 0.68, probabilidade 0.76, uso conhecido 524/55 tokens, custo cobrado desconhecido. A API e o ledger de budget permanecem iguais (OR-01/04).
3. Revalidar gates e credenciais no despacho; aplicar prazo total que aborta e encerra operação, isolando efeitos tardios (OR-02/03/04).
4. Verificar suites e tipos pertinentes, revisar cópias imutáveis e integrar os quatro arquivos por hash (OR-04).

O integrador é o único escritor de `src/onchain-read/client.ts`, `client.test.ts`, `gateway.ts`, `gateway.test.ts` e destes documentos. Os revisores não editam o candidato. Nenhum outro módulo de integração é alterado.

## Limites e riscos

Serialização pode aumentar espera do consumidor; mantém a fila e o intervalo já documentados e impede admissão além do teto local. Timeout limita a operação enviada; não é um prazo total da coleta. O tamanho do corpo continua validado depois de sua leitura, sem alegação de limite de alocação por stream. Não reescrever o ledger nem inferir custo cobrado.

OKX-04 (prazo total do coletor e cancelamento do transporte reservado), aprendizado `src/outcomes`, configuração, operador, web e `src/onchainos` permanecem dependências de seus donos. Nenhuma exclusão enfraquece a SPEC original. Sem .env, chaves, carteiras reais, chamadas autenticadas, modelo real pago, ordem, assinatura de transação, publicação, staging ou commit. Não certificar operação live, ganho financeiro ou autonomia ML por testes sintéticos.
