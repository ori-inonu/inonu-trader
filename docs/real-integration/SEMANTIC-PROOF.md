# Prova semântica local de proposta unsigned

Recorte delegado pelo coordenador em 11/10/2026. Apenas os arquivos novos `src/real/semantic-proof.ts`, `src/real/semantic-proof.test.ts` e este relatório pertencem a esta fatia. Não modifica a SPEC congelada, core, preflight ou contratos de integração. Não assina, transmite, define RPC, instala ABI ou fabrica allowlist. O coordenador integra e revisa separadamente.

## Critérios imutáveis da fatia

- S01 (G06/G08/G11): identidade, rede, revisão, correlação, hashes da proposta/transação, quote e build devem ser coerentes e válidos no momento da avaliação.
- S02 (G06/G08): decimals independentes, saldo raw e display quando presente, bloco e contratos devem coincidir. Inteiros e decimais são comparados exatamente; desconhecido não é zero.
- S03 (G11): deployment, codehash, fonte/ABI, selector e spender devem estar ligados; decoder explícito deve devolver reencodificação completa idêntica e nenhuma região opaca. Router/ABI/deployment desconhecidos bloqueiam.
- S04 (G08/G11): sender, receiver, tokens, amount, valor nativo, mínimo de saída e deadline decodificados devem coincidir com a proposta. Allowance ERC-20 deve cobrir o amount para o spender identificado.
- S05 (G06/G08/G11): gás, preço por gás, taxas adicionais e reserva devem ser explícitos; orçamento e saldo nativo devem cobrir o valor e o custo calculado exatamente. Nenhuma margem/reserva é inferida.
- S06 (G07/G11): porta que falha, provas incompletas, alteração, validade vencida ou conflito bloqueiam. Resultado persistível omite endereço, calldata, detalhes de erros e artefatos privados.
- S07 (G05/G11): o seam injetado nunca certifica transporte real. Todo resultado conserva `observation: unverified`, `exercisedReal: false`, `financiallyQualified: false`, `semanticChecksPassed: false`, `executionEnabled: false` e simulação não exercitada. `localChecksPassed` descreve apenas consistência das entradas fornecidas.

## Seam aprovado e fontes

Seam delegado explicitamente: portas read-only e avaliador público, com decoder através de porta explícita. Testes são fixtures de fronteira dessas portas e usam literais independentes para resultados. Um ciclo RED → GREEN por comportamento; nenhum fixture certifica G06/G08/G11 real.

Reutilização: `transactionDigest`, `preparedProposalDigest`, `minimumOutputRaw` e tipos unsigned do preflight/core; nenhum caminho de executor/signer é importado.

Fonte normativa local: `INSTRUCAO-DO-OBJETIVO.md` (G06/G08/G11), SHA-256 `cfa90cac735e9a838a0c4bc593276c83757905e7c5fedcd2414e499b1dad9e08`; `EXECUTION-SPEC.md`, SHA-256 `eeb6ab8d9e4adf990600a8806bceaeb7774a5eefe1ae3bbe7daba70e590290ef`.

Fontes primárias pesquisadas na etapa anterior:

- [ERC-20](https://eips.ethereum.org/EIPS/eip-20): `decimals` é opcional; `balanceOf` e `allowance` usam quantidades uint256. Ausência não permite assumir 18.
- [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/): `eth_call` fornece uma leitura no bloco selecionado; não comprova assinatura, envio ou execução financeira.
- [OKX quote](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote), [build](https://web3.okx.com/onchainos/dev-docs/trade/dex-swap), [approve](https://web3.okx.com/onchainos/dev-docs/trade/dex-approve-transaction) e [contratos](https://web3.okx.com/onchainos/dev-docs/trade/dex-smart-contract): montantes em unidade mínima, decimals de referência e spender próprio. Publicação de endereço/ABI não estabelece ligação com deployment atual.
- [ABI oficial fixada](https://raw.githubusercontent.com/okxlabs/Web3-DEX-Router-EVM-V1/1fc1508df3caeb18a8179dfc0ea4e956099ab481/DexRouterabi/DexRouter.json): há argumentos packed e rotas/adapters aninhados. Esta fatia não presume a semântica deles nem insere essa ABI como allowlist.
- [Gás Monad](https://docs.monad.xyz/developer-essentials/gas-pricing) e [reserva Monad](https://docs.monad.xyz/developer-essentials/reserve-balance): regras da rede precisam de prova própria; uma reserva fixa universal não é inferida.

## Contrato e evidência

API: `createSemanticProofEvaluator({ports, now}).evaluate({address, proposal, quote, build, expected})`. As portas públicas são `observe` e `decode`, somente leitura. Consentimento e credenciais são responsabilidades externas. `observe` deve fornecer saldo/decimals/codehash/deployment/allowance/custos associados a identidade, rede, revisão, correlação e bloco explícito; `decode` deve fornecer a interpretação específica da ABI e de toda região packed/nested, receiver, mínimo e deadline, com reencodificação byte a byte. Nenhuma implementação RPC ou allowlist acompanha esta fatia.

O avaliador confere a identidade SHA-256 de `chainIndex:address.toLowerCase()`, digests existentes, envelopes GET v6 do quote e build, TTL e coerência das quantidades. ERC-20 exige decimals independentes, codehash não vazio e allowance suficiente do spender no mesmo bloco; ativo nativo exige metadata explícita e cobertura do valor. Quantidades são uint256 canônicas. Display decimal, custo e orçamento USD usam multiplicação cruzada com BigInt, inclusive diferenças inferiores à precisão Number. Não há default de decimals, taxa adicional ou reserva.

O ABI JSON completo é uma entrada da porta: o avaliador verifica o hash dos bytes, existência e assinatura canônica do selector, hash de semântica, deployment/router/spender e reencodificação completa. **Isso prova consistência local do artefato fornecido, não sua autenticidade, completude frente ao bytecode ou atualidade onchain.** A porta ainda precisa demonstrar essas ligações, proxies e a semântica dos adapters/nested/packed antes de qualquer integração real. Uma assinatura apenas reconhecida ou calldata com região opaca bloqueia.

O custo suportado nesta fatia é o limite explicitamente fornecido `gasLimit × gasPrice + additionalFee`, limitado pelos orçamentos raw e USD e pelo saldo nativo após valor e reserva. Gás/preço precisam coincidir com o build; estimativa raw do quote precisa coincidir com `gasLimit × gasPrice`. `maxPriorityFeePerGas` presente bloqueia este modelo: precificação EIP-1559, regras específicas da rede e política econômica completa permanecem dependências. O cálculo é um limite local, não um recibo de custo realizado.

O resultado persistível contém apenas flags, hashes, horário e motivos fixos. Endereço, calldata, ABI, fonte privada e mensagem de exceção não são retornados. `checkedAtMs` é null se não existir relógio válido; hashes são strings vazias se uma entrada malformada impedir calculá-los. Alteração de qualquer entrada/prova e expiração durante o await descartam a avaliação. Mesmo com `localChecksPassed: true`, status permanece blocked, observação unverified, todas as flags de qualificação/execução permanecem false e simulação permanece not-exercised.

### Verificação executada

Treze ciclos comportamentais RED → GREEN, seguidos de uma regressão positiva que confirma que fixtures consistentes podem satisfazer apenas a consistência local. O comando exato de cada ciclo foi:

```powershell
& 'C:/Users/gabri/.bun/bin/bun.exe' --no-env-file test src/real/semantic-proof.test.ts
```

CWD de todos os comandos: `C:/Users/gabri/.codex/tmp/okx-real-core-01a12b5f`. Bun 1.3.14 (0d9b296a).

| Ciclo | RED exit/counts/chunk | GREEN exit/counts/chunk |
| --- | --- | --- |
| 1 | 1: 0 pass; 1 fail (55f93f) | 0: 1 pass; 0 fail; 5 expect() calls (2c3747) |
| 2 | 1: 1 pass; 1 fail; 6 expect() calls (519167) | 0: 2 pass; 0 fail; 7 expect() calls (e354df) |
| 3 | 1: 2 pass; 1 fail; 8 expect() calls (388377) | 0: 3 pass; 0 fail; 25 expect() calls (ac0a04) |
| 4 | 1: 3 pass; 1 fail; 26 expect() calls (621167) | 0: 4 pass; 0 fail; 41 expect() calls (bbd8d7) |
| 5 | 1: 4 pass; 1 fail; 42 expect() calls (44cbb8) | 0: 5 pass; 0 fail; 57 expect() calls (7a8964) |
| 6 | 1: 5 pass; 1 fail; 58 expect() calls (e35fe7) | 0: 6 pass; 0 fail; 75 expect() calls (004664) |
| 7 | 1: 6 pass; 1 fail; 76 expect() calls (8d78ae) | 0: 7 pass; 0 fail; 93 expect() calls (2e7fd4) |
| 8 | 1: 7 pass; 1 fail; 94 expect() calls (0f096b) | 0: 8 pass; 0 fail; 113 expect() calls (929637) |
| 9 | 1: 8 pass; 1 fail; 114 expect() calls (5ed684) | 0: 9 pass; 0 fail; 127 expect() calls (6c134b) |
| 10 | 1: 9 pass; 1 fail; 128 expect() calls (e93a90) | 0: 10 pass; 0 fail; 155 expect() calls (7c414c) |
| 11 | 1: 10 pass; 1 fail; 156 expect() calls (c034ff) | 0: 11 pass; 0 fail; 159 expect() calls (e516d3) |
| 12 | 1: 11 pass; 1 fail; 160 expect() calls (625a4e) | 0: 12 pass; 0 fail; 177 expect() calls (923984) |
| 13 | 1: 12 pass; 1 fail; 178 expect() calls (c27eb9) | 0: 13 pass; 0 fail; 185 expect() calls (39a1f6) |

Mapeamento: S01 nos ciclos 3–5 e 13; S02 nos ciclos 6 e 11; S03 no ciclo 7; S04 nos ciclos 8–9; S05 no ciclo 10; S06 nos ciclos 12–13; S07 nos ciclos 1–2 e na regressão positiva. RED 1 falhou pelo módulo ausente; os demais falharam na expectativa comportamental nova. Saídas exatas estão preservadas no JSON abaixo.

Verificação final através do adapter RTK + Headroom:
- Comando subjacente: `& 'C:/Users/gabri/.bun/bin/bun.exe' --no-env-file test src/real/semantic-proof.test.ts src/real/preflight.test.ts src/real/core.test.ts`.
- Resultado real: exit 0, **27 pass / 0 fail / 330 expects em 2 arquivos** (core e semantic-proof). Não existe arquivo independente preflight.test.ts nesta cópia; o padrão adicional não conta como teste exercitado.
- Typecheck subjacente: `& 'C:/Users/gabri/.bun/bin/bun.exe' --no-env-file run typecheck`, execução real de `tsc --noEmit -p tsconfig.verification.json`, exit 0.
- Adapter: `C:/Users/gabri/.codex/tools/rtk-headroom-20261010/adapter/adapter_cli.py run`, profiles test, timeout 120, CWD acima, RTK 0.51.0, Headroom 0.40.0. Os dois comandos foram pass-through `command_not_allowlisted`, archive_id null; não há alegação de compressão ou ganho.
- Métricas exatas: `C:/Users/gabri/.codex/rtk-headroom-run-semantic-proof-tests-final.json` e `C:/Users/gabri/.codex/rtk-headroom-run-semantic-proof-typecheck-final.json`. Recibos de execução final: chunks `74f4de` e `2a23f7`.
- SHA-256 fonte: `7460aedc2831ddf373b6a8b8c8c4888e9ce51f4311e3e53154b4426adc8a737f`.
- SHA-256 testes: `edd70a23c470935ad4e73c7498634e2413813cec38c32d86f612ccd42492255d`.

### Dependências residuais e integração

Sem acesso privado, esta fatia entrega tipos das portas, gates determinísticos, cálculo exato, rejeição temporal/mutações e testes. Ainda são engenharia independente: adaptador RPC autorizado com identidade/rede/bloco comprovados, vínculo autenticado do deployment/proxy/codehash com ABI/semântica completa, interpretação dos adapters e todas as regiões packed/nested, prova de política de preço de gás/reserva por rede, procedência de preço USD e política de risco/economia. A documentação pública fornece candidatos, nunca autoriza defaults/allowlists.

Dependem de respostas reais: quote/build autenticados da mesma sessão; decimals, balance, allowance, código/router/spender e taxas atuais no mesmo bloco; price/feed vigente; simulação remota ou eth_call coerente e validado. Os hashes/referências de fonte recebidos são apenas metadados consistentes neste módulo: não autenticam transporte nem observação real. Uma simulação não substitui os demais requisitos e não é exercitada aqui. Não foram realizadas chamadas externas por endereço, assinatura, transmissão ou execução financeira.

O coordenador integra separadamente e executa revisão independente contra os critérios congelados; esta entrega não aprova a própria implementação. Apenas os três arquivos exclusivos foram escritos. Não houve commit, adaptação do core/preflight, instalação de ABI ou mudança da SPEC.

<details><summary>Saídas exatas dos ciclos e da verificação final</summary>

```json
{
  "command": "& 'C:/Users/gabri/.bun/bin/bun.exe' --no-env-file test src/real/semantic-proof.test.ts",
  "cwd": "C:/Users/gabri/.codex/tmp/okx-real-core-01a12b5f",
  "runs": [
    {
      "cycle": 1,
      "phase": "RED",
      "chunk_id": "55f93f",
      "wall_time_seconds": 0.7842486,
      "exit_code": 1,
      "original_token_count": 90,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n\n# Unhandled error between tests\n-------------------------------\nerror: Cannot find module './semantic-proof.ts' from 'C:\\Users\\gabri\\.codex\\tmp\\okx-real-core-01a12b5f\\src\\real\\semantic-proof.test.ts'\n-------------------------------\n\n\n 0 pass\n 1 fail\n 1 error\nRan 1 test across 1 file. [204.00ms]\n"
    },
    {
      "cycle": 1,
      "phase": "GREEN",
      "chunk_id": "2c3747",
      "wall_time_seconds": 0.8560382,
      "exit_code": 0,
      "original_token_count": 59,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [8.53ms]\n\n 1 pass\n 0 fail\n 5 expect() calls\nRan 1 test across 1 file. [134.00ms]\n"
    },
    {
      "cycle": 2,
      "phase": "RED",
      "chunk_id": "519167",
      "wall_time_seconds": 1.0419037,
      "exit_code": 1,
      "original_token_count": 261,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [10.74ms]\n82 | test(\"unknown deployment cannot pass even when a decoder supplies apparently matching fields\", async () => {\n83 |   const state = { ...snapshot(), deployment: null };\n84 |   const result = await createSemanticProofEvaluator({ ports: { observe: async () => state, decode: async () => decoded() }, now: () => 2000 }).evaluate(input());\n85 |   expect(result.localChecksPassed).toBe(false);\n86 |   expect(result.localReasons).toContain(\"deployment-proof-unavailable\");\n87 | });\n                                        ^\nerror: expect(received).toBe(expected)\n\nExpected: false\nReceived: true\n\n      at <anonymous> (C:\\Users\\gabri\\.codex\\tmp\\okx-real-core-01a12b5f\\src\\real\\semantic-proof.test.ts:87:36)\n(fail) unknown deployment cannot pass even when a decoder supplies apparently matching fields [11.44ms]\n\n 1 pass\n 1 fail\n 6 expect() calls\nRan 2 tests across 1 file. [205.00ms]\n"
    },
    {
      "cycle": 2,
      "phase": "GREEN",
      "chunk_id": "e354df",
      "wall_time_seconds": 2.1054624,
      "exit_code": 0,
      "original_token_count": 85,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [41.27ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [1.38ms]\n\n 2 pass\n 0 fail\n 7 expect() calls\nRan 2 tests across 1 file. [549.00ms]\n"
    },
    {
      "cycle": 3,
      "phase": "RED",
      "chunk_id": "388377",
      "wall_time_seconds": 0.5447248,
      "exit_code": 1,
      "original_token_count": 277,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [3.19ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [0.38ms]\n 98 |     const candidate = input(); corrupt(candidate);\n 99 |     let reads = 0;\n100 |     const result = await createSemanticProofEvaluator({ ports: { observe: async () => { reads++; return snapshot(); }, decode: async () => decoded() }, now: () => 2000 }).evaluate(candidate);\n101 |     expect(result.localChecksPassed).toBe(false);\n102 |     expect(result.localReasons).toContain(\"proposal-binding-invalid\");\n103 |     expect(reads).toBe(0);\n                                           ^\nerror: expect(received).toBe(expected)\n\nExpected: false\nReceived: true\n\n      at <anonymous> (C:\\Users\\gabri\\.codex\\tmp\\okx-real-core-01a12b5f\\src\\real\\semantic-proof.test.ts:103:38)\n(fail) tampered or stale proposal is rejected before a wallet-bearing read is requested [2.33ms]\n\n 2 pass\n 1 fail\n 8 expect() calls\nRan 3 tests across 1 file. [92.00ms]\n"
    },
    {
      "cycle": 3,
      "phase": "GREEN",
      "chunk_id": "ac0a04",
      "wall_time_seconds": 9.985388,
      "exit_code": 0,
      "original_token_count": 110,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [107.62ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [30.48ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [268.54ms]\n\n 3 pass\n 0 fail\n 25 expect() calls\nRan 3 tests across 1 file. [3.03s]\n"
    },
    {
      "cycle": 4,
      "phase": "RED",
      "chunk_id": "621167",
      "wall_time_seconds": 7.5113646,
      "exit_code": 1,
      "original_token_count": 292,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [68.99ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [2.93ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [85.50ms]\n117 |   ]) {\n118 |     const candidate = input(); corrupt(candidate);\n119 |     const result = await createSemanticProofEvaluator({ ports: { observe: async () => snapshot(), decode: async () => decoded() }, now: () => 2000 }).evaluate(candidate);\n120 |     expect(result.localChecksPassed).toBe(false);\n121 |     expect(result.localReasons).toContain(\"quote-build-binding-invalid\");\n122 |   }\n                                           ^\nerror: expect(received).toBe(expected)\n\nExpected: false\nReceived: true\n\n      at <anonymous> (C:\\Users\\gabri\\.codex\\tmp\\okx-real-core-01a12b5f\\src\\real\\semantic-proof.test.ts:122:38)\n(fail) quote and build must bind to the same cycle, raw amounts, source contract and transaction [49.02ms]\n\n 3 pass\n 1 fail\n 26 expect() calls\nRan 4 tests across 1 file. [1273.00ms]\n"
    },
    {
      "cycle": 4,
      "phase": "GREEN",
      "chunk_id": "bbd8d7",
      "wall_time_seconds": 7.1454432,
      "exit_code": 0,
      "original_token_count": 136,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [125.53ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [2.72ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [107.52ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [4.04ms]\n\n 4 pass\n 0 fail\n 41 expect() calls\nRan 4 tests across 1 file. [2.43s]\n"
    },
    {
      "cycle": 5,
      "phase": "RED",
      "chunk_id": "44cbb8",
      "wall_time_seconds": 1.6004492,
      "exit_code": 1,
      "original_token_count": 314,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [20.99ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [1.48ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [6.63ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [4.58ms]\n135 |   ]) {\n136 |     const state = snapshot(); corrupt(state);\n137 |     const result = await createSemanticProofEvaluator({ ports: { observe: async () => state, decode: async () => decoded() }, now: () => 2000 }).evaluate(input());\n138 |     expect(result.localChecksPassed).toBe(false);\n139 |     expect(result.localReasons).toContain(\"read-only-context-invalid\");\n140 |   }\n                                           ^\nerror: expect(received).toBe(expected)\n\nExpected: false\nReceived: true\n\n      at <anonymous> (C:\\Users\\gabri\\.codex\\tmp\\okx-real-core-01a12b5f\\src\\real\\semantic-proof.test.ts:140:38)\n(fail) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [2.26ms]\n\n 4 pass\n 1 fail\n 42 expect() calls\nRan 5 tests across 1 file. [211.00ms]\n"
    },
    {
      "cycle": 5,
      "phase": "GREEN",
      "chunk_id": "7a8964",
      "wall_time_seconds": 2.3292674,
      "exit_code": 0,
      "original_token_count": 162,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [79.58ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [1.87ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [9.53ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [7.59ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [15.02ms]\n\n 5 pass\n 0 fail\n 57 expect() calls\nRan 5 tests across 1 file. [668.00ms]\n"
    },
    {
      "cycle": 6,
      "phase": "RED",
      "chunk_id": "e35fe7",
      "wall_time_seconds": 1.1629854,
      "exit_code": 1,
      "original_token_count": 341,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [9.64ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [2.18ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [4.99ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [4.83ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [8.23ms]\n155 |   ]) {\n156 |     const state = snapshot(); corrupt(state);\n157 |     const result = await createSemanticProofEvaluator({ ports: { observe: async () => state, decode: async () => decoded() }, now: () => 2000 }).evaluate(input());\n158 |     expect(result.localChecksPassed).toBe(false);\n159 |     expect(result.localReasons).toContain(\"token-inventory-proof-invalid\");\n160 |   }\n                                           ^\nerror: expect(received).toBe(expected)\n\nExpected: false\nReceived: true\n\n      at <anonymous> (C:\\Users\\gabri\\.codex\\tmp\\okx-real-core-01a12b5f\\src\\real\\semantic-proof.test.ts:160:38)\n(fail) independent decimals and exact same-block inventory must agree with quote and proposal [11.30ms]\n\n 5 pass\n 1 fail\n 58 expect() calls\nRan 6 tests across 1 file. [294.00ms]\n"
    },
    {
      "cycle": 6,
      "phase": "GREEN",
      "chunk_id": "004664",
      "wall_time_seconds": 0.6955305,
      "exit_code": 0,
      "original_token_count": 188,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [12.18ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [3.38ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [4.64ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [4.38ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [6.76ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [5.06ms]\n\n 6 pass\n 0 fail\n 75 expect() calls\nRan 6 tests across 1 file. [153.00ms]\n"
    },
    {
      "cycle": 7,
      "phase": "RED",
      "chunk_id": "8d78ae",
      "wall_time_seconds": 6.7300868000000005,
      "exit_code": 1,
      "original_token_count": 386,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [73.27ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [4.48ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [8.87ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [9.17ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [10.93ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [14.86ms]\n180 |   ]) {\n181 |     const state = snapshot(), decode = decoded(); corrupt(state, decode);\n182 |     const result = await createSemanticProofEvaluator({ ports: { observe: async () => state, decode: async () => decode }, now: () => 2000 }).evaluate(input());\n183 |     expect(result.localChecksPassed).toBe(false);\n184 |     expect(result.localReasons.some(reason => [\"deployment-proof-invalid\", \"calldata-proof-invalid\"].includes(reason))).toBe(true);\n185 |   }\n                                           ^\nerror: expect(received).toBe(expected)\n\nExpected: false\nReceived: true\n\n      at <anonymous> (C:\\Users\\gabri\\.codex\\tmp\\okx-real-core-01a12b5f\\src\\real\\semantic-proof.test.ts:185:38)\n(fail) deployment ABI and complete decoder must bind selector, code and every calldata byte [20.20ms]\n\n 6 pass\n 1 fail\n 76 expect() calls\nRan 7 tests across 1 file. [3.69s]\n"
    },
    {
      "cycle": 7,
      "phase": "GREEN",
      "chunk_id": "2e7fd4",
      "wall_time_seconds": 2.9928481,
      "exit_code": 0,
      "original_token_count": 214,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [11.78ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [35.58ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [105.07ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [10.98ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [41.42ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [83.25ms]\n(pass) deployment ABI and complete decoder must bind selector, code and every calldata byte [46.54ms]\n\n 7 pass\n 0 fail\n 93 expect() calls\nRan 7 tests across 1 file. [1.70s]\n"
    },
    {
      "cycle": 8,
      "phase": "RED",
      "chunk_id": "0f096b",
      "wall_time_seconds": 1.202282,
      "exit_code": 1,
      "original_token_count": 391,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [22.18ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [1.99ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [2.87ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [3.26ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [15.43ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [15.19ms]\n(pass) deployment ABI and complete decoder must bind selector, code and every calldata byte [15.91ms]\n200 |   ]) {\n201 |     const decode = decoded(); corrupt(decode);\n202 |     const result = await createSemanticProofEvaluator({ ports: { observe: async () => snapshot(), decode: async () => decode }, now: () => 2000 }).evaluate(input());\n203 |     expect(result.localChecksPassed).toBe(false);\n204 |     expect(result.localReasons).toContain(\"swap-semantics-invalid\");\n205 |   }\n                                           ^\nerror: expect(received).toBe(expected)\n\nExpected: false\nReceived: true\n\n      at <anonymous> (C:\\Users\\gabri\\.codex\\tmp\\okx-real-core-01a12b5f\\src\\real\\semantic-proof.test.ts:205:38)\n(fail) decoded swap binds sender, receiver, assets, exact amount, value, minimum and deadline [4.84ms]\n\n 7 pass\n 1 fail\n 94 expect() calls\nRan 8 tests across 1 file. [755.00ms]\n"
    },
    {
      "cycle": 8,
      "phase": "GREEN",
      "chunk_id": "929637",
      "wall_time_seconds": 1.0721351,
      "exit_code": 0,
      "original_token_count": 240,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [9.68ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [2.31ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [2.75ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [2.23ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [14.35ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [10.51ms]\n(pass) deployment ABI and complete decoder must bind selector, code and every calldata byte [10.17ms]\n(pass) decoded swap binds sender, receiver, assets, exact amount, value, minimum and deadline [14.21ms]\n\n 8 pass\n 0 fail\n 113 expect() calls\nRan 8 tests across 1 file. [625.00ms]\n"
    },
    {
      "cycle": 9,
      "phase": "RED",
      "chunk_id": "5ed684",
      "wall_time_seconds": 1.4718722,
      "exit_code": 1,
      "original_token_count": 417,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [9.38ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [1.98ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [2.17ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [3.05ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [13.40ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [11.30ms]\n(pass) deployment ABI and complete decoder must bind selector, code and every calldata byte [12.47ms]\n(pass) decoded swap binds sender, receiver, assets, exact amount, value, minimum and deadline [13.63ms]\n217 |   ]) {\n218 |     const state = snapshot(); corrupt(state);\n219 |     const result = await createSemanticProofEvaluator({ ports: { observe: async () => state, decode: async () => decoded() }, now: () => 2000 }).evaluate(input());\n220 |     expect(result.localChecksPassed).toBe(false);\n221 |     expect(result.localReasons).toContain(\"allowance-proof-invalid\");\n222 |   }\n                                           ^\nerror: expect(received).toBe(expected)\n\nExpected: false\nReceived: true\n\n      at <anonymous> (C:\\Users\\gabri\\.codex\\tmp\\okx-real-core-01a12b5f\\src\\real\\semantic-proof.test.ts:222:38)\n(fail) ERC20 allowance must cover the exact input for the evidenced spender at the same block [2.75ms]\n\n 8 pass\n 1 fail\n 114 expect() calls\nRan 9 tests across 1 file. [792.00ms]\n"
    },
    {
      "cycle": 9,
      "phase": "GREEN",
      "chunk_id": "6c134b",
      "wall_time_seconds": 1.2447094,
      "exit_code": 0,
      "original_token_count": 266,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [12.11ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [1.85ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [3.26ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [3.39ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [15.48ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [10.58ms]\n(pass) deployment ABI and complete decoder must bind selector, code and every calldata byte [12.27ms]\n(pass) decoded swap binds sender, receiver, assets, exact amount, value, minimum and deadline [12.75ms]\n(pass) ERC20 allowance must cover the exact input for the evidenced spender at the same block [7.39ms]\n\n 9 pass\n 0 fail\n 127 expect() calls\nRan 9 tests across 1 file. [538.00ms]\n"
    },
    {
      "cycle": 10,
      "phase": "RED",
      "chunk_id": "e93a90",
      "wall_time_seconds": 0.9310667,
      "exit_code": 1,
      "original_token_count": 443,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [11.04ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [2.02ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [2.95ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [2.94ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [16.55ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [17.85ms]\n(pass) deployment ABI and complete decoder must bind selector, code and every calldata byte [19.82ms]\n(pass) decoded swap binds sender, receiver, assets, exact amount, value, minimum and deadline [14.24ms]\n(pass) ERC20 allowance must cover the exact input for the evidenced spender at the same block [12.20ms]\n241 |   ]) {\n242 |     const state = snapshot(); corrupt(state);\n243 |     const result = await createSemanticProofEvaluator({ ports: { observe: async () => state, decode: async () => decoded() }, now: () => 2000 }).evaluate(input());\n244 |     expect(result.localChecksPassed).toBe(false);\n245 |     expect(result.localReasons).toContain(\"fee-coverage-proof-invalid\");\n246 |   }\n                                           ^\nerror: expect(received).toBe(expected)\n\nExpected: false\nReceived: true\n\n      at <anonymous> (C:\\Users\\gabri\\.codex\\tmp\\okx-real-core-01a12b5f\\src\\real\\semantic-proof.test.ts:246:38)\n(fail) explicit fee bound, USD budget, reserve and native coverage use exact arithmetic [3.17ms]\n\n 9 pass\n 1 fail\n 128 expect() calls\nRan 10 tests across 1 file. [584.00ms]\n"
    },
    {
      "cycle": 10,
      "phase": "GREEN",
      "chunk_id": "7c414c",
      "wall_time_seconds": 1.4995792,
      "exit_code": 0,
      "original_token_count": 291,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [15.28ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [3.98ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [3.45ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [6.57ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [30.00ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [20.12ms]\n(pass) deployment ABI and complete decoder must bind selector, code and every calldata byte [16.13ms]\n(pass) decoded swap binds sender, receiver, assets, exact amount, value, minimum and deadline [18.35ms]\n(pass) ERC20 allowance must cover the exact input for the evidenced spender at the same block [10.02ms]\n(pass) explicit fee bound, USD budget, reserve and native coverage use exact arithmetic [10.17ms]\n\n 10 pass\n 0 fail\n 155 expect() calls\nRan 10 tests across 1 file. [793.00ms]\n"
    },
    {
      "cycle": 11,
      "phase": "RED",
      "chunk_id": "c034ff",
      "wall_time_seconds": 2.1277754,
      "exit_code": 1,
      "original_token_count": 484,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [73.18ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [2.63ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [2.97ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [2.44ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [16.14ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [15.10ms]\n(pass) deployment ABI and complete decoder must bind selector, code and every calldata byte [15.81ms]\n(pass) decoded swap binds sender, receiver, assets, exact amount, value, minimum and deadline [15.82ms]\n(pass) ERC20 allowance must cover the exact input for the evidenced spender at the same block [9.69ms]\n(pass) explicit fee bound, USD budget, reserve and native coverage use exact arithmetic [16.72ms]\n250 |   for (const hash of [`0x${\"0\".repeat(64)}`, utils.keccak256(\"0x\")]) {\n251 |     const state = snapshot(); state.tokens[0]!.codeHash = hash;\n252 |     const result = await createSemanticProofEvaluator({ ports: { observe: async () => state, decode: async () => decoded() }, now: () => 2000 }).evaluate(input());\n253 |     expect(result.localChecksPassed).toBe(false);\n254 |     expect(result.localReasons).toContain(\"token-inventory-proof-invalid\");\n255 |   }\n                                           ^\nerror: expect(received).toBe(expected)\n\nExpected: false\nReceived: true\n\n      at <anonymous> (C:\\Users\\gabri\\.codex\\tmp\\okx-real-core-01a12b5f\\src\\real\\semantic-proof.test.ts:255:38)\n(fail) empty token bytecode cannot prove ERC20 balances or decimals [2.43ms]\n\n 10 pass\n 1 fail\n 156 expect() calls\nRan 11 tests across 1 file. [1420.00ms]\n"
    },
    {
      "cycle": 11,
      "phase": "GREEN",
      "chunk_id": "e516d3",
      "wall_time_seconds": 4.2101504,
      "exit_code": 0,
      "original_token_count": 310,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [9.97ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [54.87ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [6.56ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [4.32ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [43.28ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [20.80ms]\n(pass) deployment ABI and complete decoder must bind selector, code and every calldata byte [27.34ms]\n(pass) decoded swap binds sender, receiver, assets, exact amount, value, minimum and deadline [26.58ms]\n(pass) ERC20 allowance must cover the exact input for the evidenced spender at the same block [10.54ms]\n(pass) explicit fee bound, USD budget, reserve and native coverage use exact arithmetic [32.99ms]\n(pass) empty token bytecode cannot prove ERC20 balances or decimals [14.04ms]\n\n 11 pass\n 0 fail\n 159 expect() calls\nRan 11 tests across 1 file. [2.32s]\n"
    },
    {
      "cycle": 12,
      "phase": "RED",
      "chunk_id": "625a4e",
      "wall_time_seconds": 2.9231324,
      "exit_code": 1,
      "original_token_count": 478,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [54.93ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [7.67ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [3.57ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [12.09ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [28.00ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [18.26ms]\n(pass) deployment ABI and complete decoder must bind selector, code and every calldata byte [21.58ms]\n(pass) decoded swap binds sender, receiver, assets, exact amount, value, minimum and deadline [23.87ms]\n(pass) ERC20 allowance must cover the exact input for the evidenced spender at the same block [9.76ms]\n(pass) explicit fee bound, USD budget, reserve and native coverage use exact arithmetic [19.17ms]\n(pass) empty token bytecode cannot prove ERC20 balances or decimals [3.39ms]\n263 |   ]) {\n264 |     let result = null;\n265 |     try { result = await createSemanticProofEvaluator({ ports, now: () => 2000 }).evaluate(input()); } catch { /* Test fails below if boundary errors escape. */ }\n266 |     expect(result).not.toBeNull();\n267 |     expect(result!.localChecksPassed).toBe(false);\n268 |     expect(result!.localReasons).toContain(\"proof-boundary-failed\");\n                             ^\nerror: expect(received).not.toBeNull()\n\nReceived: null\n\n      at <anonymous> (C:\\Users\\gabri\\.codex\\tmp\\okx-real-core-01a12b5f\\src\\real\\semantic-proof.test.ts:268:24)\n(fail) failed or malformed read boundaries return a sanitized blocked result [3.27ms]\n\n 11 pass\n 1 fail\n 160 expect() calls\nRan 12 tests across 1 file. [1406.00ms]\n"
    },
    {
      "cycle": 12,
      "phase": "GREEN",
      "chunk_id": "923984",
      "wall_time_seconds": 2.0670289,
      "exit_code": 0,
      "original_token_count": 333,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [21.36ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [17.97ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [3.39ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [4.52ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [36.40ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [26.45ms]\n(pass) deployment ABI and complete decoder must bind selector, code and every calldata byte [26.58ms]\n(pass) decoded swap binds sender, receiver, assets, exact amount, value, minimum and deadline [46.87ms]\n(pass) ERC20 allowance must cover the exact input for the evidenced spender at the same block [21.80ms]\n(pass) explicit fee bound, USD budget, reserve and native coverage use exact arithmetic [20.51ms]\n(pass) empty token bytecode cannot prove ERC20 balances or decimals [3.89ms]\n(pass) failed or malformed read boundaries return a sanitized blocked result [23.11ms]\n\n 12 pass\n 0 fail\n 177 expect() calls\nRan 12 tests across 1 file. [1130.00ms]\n"
    },
    {
      "cycle": 13,
      "phase": "RED",
      "chunk_id": "c27eb9",
      "wall_time_seconds": 1.5111415,
      "exit_code": 1,
      "original_token_count": 529,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [18.06ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [5.71ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [4.62ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [6.11ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [25.77ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [19.70ms]\n(pass) deployment ABI and complete decoder must bind selector, code and every calldata byte [21.66ms]\n(pass) decoded swap binds sender, receiver, assets, exact amount, value, minimum and deadline [21.59ms]\n(pass) ERC20 allowance must cover the exact input for the evidenced spender at the same block [8.25ms]\n(pass) explicit fee bound, USD budget, reserve and native coverage use exact arithmetic [16.52ms]\n(pass) empty token bytecode cannot prove ERC20 balances or decimals [3.09ms]\n(pass) failed or malformed read boundaries return a sanitized blocked result [4.07ms]\n285 |     const candidate = input(), state = snapshot(); let clock = 2000;\n286 |     const result = await createSemanticProofEvaluator({ ports: { observe: async () => state,\n287 |       decode: async () => { corrupt(candidate, state, value => { clock = value; }); return decoded(); } }, now: () => clock }).evaluate(candidate);\n288 |     expect(result.localChecksPassed).toBe(false);\n289 |     expect(result.localReasons).toContain(\"proof-changed-or-expired\");\n290 |   }\n                                           ^\nerror: expect(received).toBe(expected)\n\nExpected: false\nReceived: true\n\n      at <anonymous> (C:\\Users\\gabri\\.codex\\tmp\\okx-real-core-01a12b5f\\src\\real\\semantic-proof.test.ts:290:38)\n(fail) proof that expires or changes while awaiting the decoder must be discarded [3.29ms]\n\n 12 pass\n 1 fail\n 178 expect() calls\nRan 13 tests across 1 file. [934.00ms]\n"
    },
    {
      "cycle": 13,
      "phase": "GREEN",
      "chunk_id": "39a1f6",
      "wall_time_seconds": 1.0283089,
      "exit_code": 0,
      "original_token_count": 354,
      "output": "bun test v1.3.14 (0d9b296a)\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [7.84ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [2.05ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [2.69ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [3.00ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [14.84ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [11.31ms]\n(pass) deployment ABI and complete decoder must bind selector, code and every calldata byte [12.73ms]\n(pass) decoded swap binds sender, receiver, assets, exact amount, value, minimum and deadline [13.11ms]\n(pass) ERC20 allowance must cover the exact input for the evidenced spender at the same block [4.82ms]\n(pass) explicit fee bound, USD budget, reserve and native coverage use exact arithmetic [8.68ms]\n(pass) empty token bytecode cannot prove ERC20 balances or decimals [2.02ms]\n(pass) failed or malformed read boundaries return a sanitized blocked result [2.16ms]\n(pass) proof that expires or changes while awaiting the decoder must be discarded [3.19ms]\n\n 13 pass\n 0 fail\n 185 expect() calls\nRan 13 tests across 1 file. [533.00ms]\n"
    }
  ],
  "finalTests": {
    "status": "fulfilled",
    "value": {
      "chunk_id": "74f4de",
      "wall_time_seconds": 2.8744635,
      "exit_code": 0,
      "original_token_count": 755,
      "output": "\nsrc\\real\\core.test.ts:\n(pass) missing Web3 credentials yield explicit blocked envelopes without network or wallet address [19.87ms]\n(pass) capability stages name optional dependencies without claiming real or financial qualification [15.50ms]\n(pass) capability availability follows independent family support and sanitized actual read failures [22.28ms]\n(pass) persistent sample removes unsigned build payload and calldata without mutating the ephemeral proposal [19.19ms]\n(pass) covered exact-in balance permits authenticated quote and unsigned build while semantic preflight remains blocked [8.85ms]\n(pass) unsigned build cannot silently replace the sampled quote outcome [7.16ms]\n(pass) proposal consumption rejects changes to sampled token, quantity, age and session parameters [7.42ms]\n(pass) market uses observed tokens, preserves exact unknown-currency prices, and excludes open candles [4.53ms]\n(pass) inventory preserves huge integers, partial unknowns and exact USD values through separate support reads [3.23ms]\n(pass) inventory rejects missing, malformed or wallet-address token identities instead of retaining provider metadata [4.88ms]\n(pass) quote preserves bounded token routes and exact protocol percentages while discarding route metadata [9.20ms]\n(pass) bounded market reads expose omitted observed tokens and cannot claim complete capability coverage [4.16ms]\n(pass) proposal consumption rejects unknown or non-finite clocks rather than extending validity [3.13ms]\n\nsrc\\real\\semantic-proof.test.ts:\n(pass) missing read-only proof stays blocked and cannot certify real or expose wallet data [39.00ms]\n(pass) unknown deployment cannot pass even when a decoder supplies apparently matching fields [3.52ms]\n(pass) tampered or stale proposal is rejected before a wallet-bearing read is requested [4.33ms]\n(pass) quote and build must bind to the same cycle, raw amounts, source contract and transaction [7.15ms]\n(pass) read-only snapshot must have the same identity, cycle, chain and a fresh explicit block [41.39ms]\n(pass) independent decimals and exact same-block inventory must agree with quote and proposal [30.43ms]\n(pass) deployment ABI and complete decoder must bind selector, code and every calldata byte [29.04ms]\n(pass) decoded swap binds sender, receiver, assets, exact amount, value, minimum and deadline [28.04ms]\n(pass) ERC20 allowance must cover the exact input for the evidenced spender at the same block [12.10ms]\n(pass) explicit fee bound, USD budget, reserve and native coverage use exact arithmetic [24.04ms]\n(pass) empty token bytecode cannot prove ERC20 balances or decimals [4.93ms]\n(pass) failed or malformed read boundaries return a sanitized blocked result [4.83ms]\n(pass) proof that expires or changes while awaiting the decoder must be discarded [9.01ms]\n(pass) consistent fictional inputs prove local consistency without certifying real or enabling execution [2.46ms]\n\n 27 pass\n 0 fail\n 330 expect() calls\nRan 27 tests across 2 files. [1329.00ms]\nbun test v1.3.14 (0d9b296a)\n"
    }
  },
  "finalTypecheck": {
    "status": "fulfilled",
    "value": {
      "chunk_id": "2a23f7",
      "wall_time_seconds": 4.6753994,
      "exit_code": 0,
      "original_token_count": 12,
      "output": "$ tsc --noEmit -p tsconfig.verification.json\n"
    }
  }
}
```

</details>
