# Evidência TDD — cliente OKX somente leitura

Conversa `01a1216a-c46b-72f3-b3dc-24c79470308d`; workspace implementer isolado. Arquivos de produção/teste sob esta entrega: `src/okx-api.ts` e `src/okx-api.test.ts`. O único arquivo documental criado pela implementação é este registro de evidência.

## Fontes e baseline

- SPEC congelada E1–E8: `docs/OKX-ECOSYSTEM-V1-SPEC.md`, SHA-256 `13BA216CCA87B8FD139D95895CD84A30DF536788602FA4679201B8307AA856CB`.
- Baseline: `docs/OKX-ECOSYSTEM-V1-BASELINE.md`, SHA-256 `E7DB0940523893E7EC8510FC590FCCDA3E8A03A3E2CBED7214058DFF82018AA7`; informa 23 testes existentes e typecheck `tsc --noEmit` exit 0 antes do trabalho.
- Pesquisa oficial usada para corrigir a forma do endpoint e o vínculo dos pools: `C:/Users/gabri/.codex/tmp/jev-trader-01a1216a/okx-ecosystem-research/docs/OKX-INTEGRATION-RESEARCH-20261009.md`, SHA-256 `C83291232EA82F0A9505F647E0CAEFF14A4A494FCE44F11392159C5EB69FDFA0`, seções 3.4–3.5. Advanced-info transporta `data` como objeto e a API top-liquidity não repete identidade no nível superior; a implementação mantém a saída pública de advanced como lista de um objeto e valida associação de cada pool por `liquidityAmount[].tokenContractAddress` sem acrescentar identidade sintética.

## RED → GREEN

1. Depois de acrescentar casos para advanced-info e pools, `C:\Users\gabri\.bun\bin\bun.exe test ./src/okx-api.test.ts` terminou com exit 1: 5 passou, 3 falharam. Os casos novos encontraram os métodos ainda não implementados (`Not implemented.`) e ausência de rejeição de associação inválida.
2. Depois de acrescentar uma resposta de preço cuja identidade não pertencia ao lote, o mesmo comando terminou com exit 1: 7 passou, 1 falhou porque a resposta incompatível foi aceita.
3. Após a implementação mínima dos endpoints, da verificação de associação dos preços/pools, timeout/redaction e tipos de fetch, `C:\Users\gabri\.bun\bin\bun.exe test ./src/okx-api.test.ts` terminou com exit 0: 8 passou, 0 falhou, 35 assertions.
4. `C:\Users\gabri\.bun\bin\bun.exe run typecheck` terminou com exit 0 (`tsc --noEmit`). Uma execução intermediária do typecheck havia falhado porque `typeof fetch` do Bun exige a propriedade estática `preconnect` em mocks; a interface injetável foi estreitada para a assinatura de chamada de `fetch` sem essa propriedade e os testes mockam somente a fronteira de rede.

## Cobertura observável

- Host e caminhos fixos; stage explícito; limit local 1–30; ausência de `limit`, cursor e wallet na URL; lote de preço com máximo 30 validado antes de fetch.
- HMAC para GET e POST verificado por strings literais independentes, usando timestamp/método/path+query/body exatos: protocols `N87iGpscxUjBm8jur0x4PUjP/dh8rTS5hBuJUW5dPAQ=`, price-info `d3o5MSpp1AICsGJ41b8Sah88fu4ZIy3tMb4q2Pd/z9Q=`, advanced-info `NHYCekV67lXLjQpfzhGbWsQyG6BMxwhfSIlJJb/QNmQ=` e top-liquidity `/R2KyXrqj/UMHTHlRZiy57/5ycWkZxCti+pv9bZtzSg=`. Os valores esperados não chamam o helper de assinatura da implementação.
- EVM normalizado para minúsculas; identidade Solana preserva caixa; linha de preço incompatível falha. Advanced-info array em vez de objeto falha. Pool sem o contrato solicitado em `liquidityAmount` falha; campos opcionais vazios continuam vazios.
- Status HTTP, código API não-zero, erro de transporte, JSON/schema inesperado, limite inválido e timeout finito são exercitados; mensagens não repetem corpo, URL ou texto cru de transporte. Timeout aborta e não faz retry.

Todos os testes usam somente `fetch`/relógio injetados ou `Response` locais. Não houve chamada a endpoint real, leitura de `.env`/`PRIVATE_KEY`, instalação, ordem, assinatura de transação, commit ou push. Mocks não qualificam acesso live, limites/quota, frescor dos dados ou funcionamento da API autenticada.

## Regressões posteriores — RED → GREEN

1. Adicionei testes pela API pública para: descoberta nova que remove uma chain antiga, rejeição pré-fetch de chain não numérica e endereço com espaço/vírgula/CRLF, e timeout quando `fetch` resolve mas `response.json()` fica pendente. A execução RED de `C:\Users\gabri\.bun\bin\bun.exe test ./src/okx-api.test.ts` terminou com exit 1: 8 passou, 3 falharam e 38 expectativas. O cache antigo permitiu o terceiro fetch e produziu erro de schema em vez da rejeição local esperada; identidades inválidas foram aceitas; o corpo pendente ainda estava `still pending` após a janela de observação.
2. A correção mantém o mesmo timer/AbortSignal durante a leitura do JSON e usa um marcador interno de timeout, sem retransmitir detalhe da rejeição. Uma descoberta de protocolos só troca o cache depois de validar o payload inteiro e substitui toda a cobertura anterior. Identidades exigem chainIndex composto por dígitos e endereço não vazio sem whitespace ou vírgula; não é imposto formato completo de contrato.
3. A execução GREEN de `C:\Users\gabri\.bun\bin\bun.exe test ./src/okx-api.test.ts` terminou com exit 0: 11 testes passaram, 0 falharam, 47 expectativas. `C:\Users\gabri\.bun\bin\bun.exe run typecheck` terminou com exit 0 (`tsc --noEmit`). A cobertura do corpo pendente confirma mensagem exata `OKX request timed out.`, AbortSignal marcado como abortado, uma única chamada e ausência de erro bruto na mensagem pública.

## Chain index positivo — RED → GREEN

1. Com o source/test hash anterior F69BF6630B97ACCF73985E52692D3BB89679C1A998306D8F9B6CBDDD85486C7A / A00416B78ED259E9F07AEF66DF18376ADFAA17C1794FB727C3C417CC711601FB, acrescentei testes públicos que exigem fetchCount === 0 para listMemePump com chain inválida e para prices, advanced e pools com chain zero, negativa, zero à esquerda, texto ou whitespace. A execução RED C:\Users\gabri\.bun\bin\bun.exe --no-env-file test ./src/okx-api.test.ts terminou com exit 1: 11 testes passaram, 2 falharam, 49 expectativas; listMemePump fez 5 chamadas para seis entradas inválidas e os métodos de identidade fizeram 6 chamadas para chains "0"/"01".
2. A implementação usa o contrato scanner ^[1-9]\d*$ num validador compartilhado: listMemePump retorna erro Invalid chainIndex. e as operações de identidade retornam Invalid token identity. antes de construir/fazer o request. O restante da identidade e o seam permanecem iguais.
3. A execução GREEN C:\Users\gabri\.bun\bin\bun.exe --no-env-file test ./src/okx-api.test.ts terminou com exit 0: 13 testes passaram, 0 falharam, 51 expectativas. C:\Users\gabri\.bun\bin\bun.exe --no-env-file run typecheck terminou com exit 0 (tsc --noEmit).

## Hashes dos arquivos após implementação

- `src/okx-api.ts`: `C60D35824BA4F95E9A6130CA9304DD7B7C66B91F01BE72B59DAFCA9E68C81055`.
- `src/okx-api.test.ts`: `B5ACD151D755ECBDB9208A86D32EA98DE3C1100083EFAF02B03CDF2E49446AFD`.
- `docs/OKX-API-TDD-EVIDENCE.md` SHA-256: calculado após a gravação final e incluído no relatório de entrega; não autorreferenciado neste arquivo.
- SPEC, baseline e pesquisa mantêm os hashes registrados acima.
