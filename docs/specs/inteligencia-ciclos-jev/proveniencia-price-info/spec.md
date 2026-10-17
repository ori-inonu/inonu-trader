# Spec: Proveniência do timestamp de price-info no Brief JEV

Status: aprovada pelo Main e implementada como extensão opcional compatível do Brief V1; não é migração nem autorização do dono para mudanças protegidas.
Dono: projeto JEV. Decisão de escopo pelo Main sob a SPEC pai aprovada.

## Contexto

A resposta oficial OKX OnchainOS [market-token-price-info](https://web3.okx.com/onchainos/dev-docs/market/market-token-price-info.md) descreve `time` como timestamp do último preço em Unix milliseconds e suporta latest price; a API não afirma que `time` seja relógio de fetch/cache nem uma validação independente de frescor. `src/onchain-read/catalog.ts` normaliza esse campo para `tsMs`; `src/agent/live.ts` usa o timestamp quando existente, mas reduz a evidência em `HoldingFacts.dataAgeMin` ao maior entre idade derivada do timestamp e idade do cache/gateway mais o tempo local. `src/agent/types.ts` não transporta a presença do timestamp; `src/agent/model.ts` projeta somente `ag` na posição e sua legenda descreve idade composta, não presença/validação do timestamp.

Reprodução throwaway com Bun real, sem modelo, provider externo ou rede: `createHoldingFactsReader` recebeu o mesmo livro/posição, mesma resposta de risco (`riskFlags` iguais), preço/mercado iguais, gateway `ageMs=120000` e `cachedAtMs=NOW-120000`, relógio fixo `2026-10-16T12:00:00.000Z`, mesmos planos e signal. A única diferença no DTO local `/onchain/price-info` foi `tsMs=NOW-120000` versus `tsMs=null`. Ambos os casos chamaram exatamente uma vez `/onchain/price-info` e uma vez `/onchain/token-risk`. Em ambos, `dataAgeMin=2` e `posicoes.<holding>.ag=2`; o Brief inteiro serializado permaneceu byte-idêntico (5.648 bytes). Assim, a projeção atual realmente perde a distinção disponível no produtor: timestamp numérico preservado pela normalização versus timestamp ausente/não normalizável, apesar da idade composta igual. Isso prova apenas presença na fonte normalizada, não validade do relógio, frescor ou correção do timestamp; nem que cache/local estejam ausentes.

## Metas

- Tornar visível, somente para fatos públicos de mercado efetivamente originados de uma resposta `price-info`, se um timestamp do provider sobreviveu à normalização.
- Manter a idade composta `ag` com a semântica atual; não inferir presença a partir de `atMs`, `seenAt`, cache age ou idade numérica.
- Preservar Brief exato no registro existente, hashes e consumidores históricos; manter ausência de chamada/API e de dado privado adicional.

## Proposta aprovada

- Adicionar metadado opcional em `HoldingFacts`, por exemplo `priceInfoTimestampReported?: boolean`. Para um objeto de resposta `price-info` presente, `true` significa que seu `tsMs` normalizado é um timestamp numérico disponível; `false` significa que o campo não ficou disponível na fonte normalizada. Não copiar timestamp bruto, horário local, cache age, URL ou dado de carteira.
- Na posição do Brief, emitir `pt: 1` para `true` e `pt: 0` para `false`, com legenda curta: timestamp do provider presente na fonte normalizada, não verificado independentemente. Se não houve objeto de observação `price-info` para aquele candidato (p.ex. fallback sintético/legacy), omitir `pt`; ausência significa desconhecido/legado, nunca converter para 0 ou 1. `pt=0` não significa que preço/candidato estejam inválidos; `pt=1` não significa frescor, autenticidade, relógio correto ou saldo saudável.
O tipo aberto não é, isoladamente, autorização. A base para esta extensão é a autorização expressa da SPEC pai aprovada: `docs/specs/inteligencia-ciclos-jev/spec.md:10,23` permite extensões calculadas opcionais compatíveis com consumidores sem o campo e distingue-as de migração de persistência, proibindo mudanças de schema/journal. A decisão técnica do Main confirma apenas que esta alteração específica, opcional e compatível satisfaz esse limite; não é autorização do dono para migrações reais nem para outros itens protegidos.

## Persistência e compatibilidade

`src/agent/wire.ts` serializa o `ConsultRecord` exato em `briefs.jsonl`; o loader consome JSON genérico, sem validador fechado de `posicoes`. `src/agent/model.ts` tipa cada item de `posicoes` como `Record<string, unknown>`, e `src/agent/cycle.ts` reutiliza esse tipo. `src/decision-review/audit.ts` reconstrói o fingerprint V1 com `posicoes` integral; `fullBriefHash` em `src/decision-review/evolution/agent-episode.ts` e `sourceConsultDigest`/capture-store também incorporam o payload integral.

Smoke isolado com Bun real e funções de produção (`auditConsult`, `sourceConsultDigest`), usando registros V1 sintéticos: o payload antigo validou `matched`; o mesmo Brief com `posicoes.abc.pt=1` e seu hash recalculado também validou `matched`; o payload novo usando o hash antigo validou `mismatched`; os digests completos old/new diferiram. Isso demonstra que a chave opcional participa dos hashes existentes sem alterar algoritmo/versão e que a integridade exata é mantida, não que o conteúdo seja verdade de mercado.

A aprovação cobre somente a inclusão opcional `pt` em novos Briefs, dentro do mapa existente V1, sem reescrita de registros antigos nem alteração de `briefVersion`, schema, serializador ou algoritmo de hash. `src/agent/analysis.ts` e `web/src/lib/hud/parse-cycle-review.ts` precisam preservar somente enum numérico `0|1`; consumidores sem `pt` devem continuar tratando o campo ausente como desconhecido. Review não deve promover `pt` a fonte de idade/frescor.

## Não metas

- Medir frescor independente, validar relógio/provider, testar saúde de saldo ou mudar a semântica de `ag`.
- Nova chamada, polling, API, dependência, campo privado, D2, operação ou alteração de autorização.
- Alterar o journal/retention, contornar o registro exato, introduzir cache/abstração ou editar helpers de investigação.

## Critérios de aceitação

- [x] Regressão determinística com clock fixo e pares idênticos exceto `tsMs`, Book, `riskFlags`, gateway e demais inputs mostrou `ag` igual e Briefs diferindo somente por `pt` (ou `pt` omitido quando a fonte está desconhecida), sem provider/model/network calls.
- [x] Campo e legenda dizem apenas presença de timestamp na fonte normalizada; legado/desconhecido permanece ausente; `ag` e seus cálculos não mudaram.
- [x] Brief completo observado abaixo de 12.000 bytes; contexto mantém limite all-or-nothing de 32 chaves; nenhuma consulta ou campo privado foi acrescentado.
- [x] Extensão usa Brief V1 e hashes genéricos existentes sem mudança de `audit.ts`/evolution, serialização ou versão; Briefs antigos ficam intactos.
- [x] Prova sintética backend→HUD preservou `pt` numérico `0|1`, omitiu legado/inválido e conservou outros fatos `ag`/cycle; não promove `pt` a fonte de idade. `ag` composto e idades `mo.ag`/`tm.ag` permanecem inalterados.
O estado atual do Brief, a prova de composição e os resultados focados constam em `status.md` e `../observations.md`. A consolidação dos gates globais permanece pendente; os critérios funcionais acima não devem ser lidos como aprovação dos follow-ups globais.

## Restrições

- Sem chamada paga, rede, wallet/CLI, credenciais, `.env`, journal operacional, live, execução ou novo serviço.
- `scripts/ask-jev.ts`, referenciado pelo skill/convenções como gate de SPEC, não foi localizado (leitura de `scripts/` e do próprio skill consultada). Registrar a lacuna; não substituir por pergunta paga ou design por API sem contrato/orçamento explícito.
- A autorização do Main cobre esta extensão opcional V1 apenas; ela não autoriza migrações reais, rewrites, D2, auth/credenciais, risco, dependências ou serviços pagos.
