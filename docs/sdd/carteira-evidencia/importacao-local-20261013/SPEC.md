# Importação local de evidência de carteira

Continuação solicitada pelo usuário em 2026-10-13 na conversa 01a135ff-362e-7cf0-ac4f-ef678d322188. Implementa T2.4 de [tasks.md](../tasks.md), com RQ-01 a RQ-09, RQ-11, RQ-20 e RQ-21 de [requirements.md](../requirements.md). O inventário original permanece histórico. O backend atual possui `wallet_evidence_v2`; a importação local estrita está ausente.

## Escopo e limites

Nova função pública `importLocalWalletEvidence(text, { nowMs, maxAgeMs })`, resultado discriminado com evidência ou erro fechado. Novo comando Bun offline para ler um arquivo e emitir a evidência JSON. Reutiliza identidade, aritmética, estados e hash do backend por imports somente leitura. Não altera UI, coletores, servidor, bot ou instruções. Não há rede, credencial, modelo, assinatura, transação, persistência automática nem alegação de lucro. A captura real e a integração visual são etapas posteriores, não certificadas por fixtures.

Arquivos exclusivos: `src/portfolio-evidence/adapters/local-import.ts`, respectivo teste, `scripts/import-wallet-evidence.ts`, respectivo teste, fixture sintética nesta pasta. Documentos desta pasta são do integrador; os pareceres são escritos pelo revisor independente.

## Contrato de entrada

JSON `local_wallet_balances_v1`. Campos obrigatórios e únicos: `schema`, `origin` (`local_import` ou `synthetic_fixture`), `account`, `requestedChains`, `capturedAtMs`, `sourceTimeMs`, `rows`. Até 20 redes conhecidas únicas e compatíveis com a conta; até 1000 linhas; até 1 MiB UTF-8. Relógios em inteiros seguros não negativos, `sourceTimeMs` também permite null. Cada linha contém exclusivamente `chainIndex`, `tokenContractAddress` (vazio para moeda nativa), `symbol` (texto curto seguro ou null), `atoms` (texto inteiro sem sinal, até 80 dígitos) e `decimals` (inteiro 0 a 36). Não se aceitam quantidades Number, preço, PnL, instruções, URLs, segredo, campos extras ou chaves repetidas em objetos JSON. Duas linhas da mesma identidade canônica são rejeitadas, inclusive com capitalização EVM diferente; a mesma moeda em redes diferentes é distinta.

Os decimais são declarados pelo arquivo: consistência matemática não é confirmação on-chain. Todas as quantidades e avaliações importadas permanecem não verificadas; valor USD, custo, histórico e PnL são desconhecidos. A fonte fixa `local:json` e a origem não podem ser escolhidas pelo arquivo. O campo method do contrato legado é POST para ingestão lógica; nenhum HTTP é executado. Cobertura é parcial de uma lista de ativos, filtros desconhecidos. `realData` distingue declaração local de fixture, não certifica captura real.

## Aceitação imutável

- LI-1: entrada válida produz `wallet_evidence_v2` com hash verificável, identidade rede/contrato e átomos exatos para 6 e 18 decimais, inclusive acima de Number.MAX_SAFE_INTEGER. Resultado depende apenas da entrada e dos relógios explícitos.
- LI-2: JSON malformado, chaves repetidas, campos extras, conta/rede inválida, linha fora da seleção, duplicata de identidade, decimal nativo contraditório, quantidades numéricas, limites e opções inválidas retornam somente código fechado, sem eco de entrada nem lançamento de exceção.
- LI-3: entrada vazia ou saldo ausente não vira zero; USD, custo e histórico são null/ausentes; cobertura parcial e origem não verificada são explícitas. Fixture continua sintética. Relógios de captura e fonte permanecem distintos; dados antigos/futuros preservam seu estado.
- LI-4: saída nunca contém conta em claro; fonte/endpoint são fixos. Parser não tem efeitos de rede, ambiente, arquivos, timers, carteira ou modelo. CLI lê somente o arquivo solicitado, aplica limite antes de carregar, não sobrescreve nem envia dados; erro não ecoa caminho/conteúdo e retorna exit 1.
- LI-5: regressão RED antes de GREEN pela seam pública, testes Bun offline, TypeScript afetado e suíte de evidência preexistente; revisão independente executa casos em cópia isolada ou contexto explicitamente somente leitura. Mudanças preexistentes são preservadas.

## Plano mínimo

1. Congelar baseline de fontes e critérios, obter revisão independente da direção e registrar a consulta Jev.
2. Um teste público de precisão e proveniência que falhe; implementação mínima. Acrescentar regressões de validação, origem, relógios e privacidade em ciclos curtos.
3. CLI offline, exemplo sintético claramente marcado e verificação ponta a ponta sem .env.
4. Revisão independente, hashes atuais, evidência e checkpoint nesta pasta.

## Decisão técnica

Jev Workflows receipt `bbf6cbc0-7069-4971-8b73-5da0ba58599e`, modelo `jev-1.13.0`: seam `parser_and_cli` recomendada (approved_by=jev_delegated; human_response=false). Prioridade teve abstenção por baixa confiança. Fallback local reversível fundamentado em T2.4 já autorizado e na preservação das zonas reservadas, não em aprovação humana inventada. Uso conhecido 675 tokens de entrada, 112 de saída; custo faturado desconhecido (null). Nenhum dado de carteira foi enviado na consulta.
