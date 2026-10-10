# Revisão independente — OKX DEX V4 recovery

**Decisão: `approve` para este snapshot isolado V4.** Não encontrei defeito material reproduzível contra D1–D8. A decisão qualifica somente os bytes revisados abaixo. Ela não certifica integração no checkout principal, credenciais ou acesso live, cotações de mercado, custos, retorno, nem execução financeira.

- Revisor: Codex independente, tarefa `/root/okx_scanner_review`.
- Identidade desta conversa: `CODEX_THREAD_ID=01a1228f-d2cf-7a23-a22c-c00744fe4af5`; `CODEX_SESSION_ID=01a1216a-c46b-72f3-b3dc-24c79470308d`.
- Candidato: `C:/Users/gabri/.codex/tmp/jev-trader-01a1216a/okx-dex-review-v4-recovery`.
- SPEC D1–D8: `docs/OKX-DEX-V2-SPEC.md`, SHA-256 `B6CDB5629A1899E22D7D54F0461D75FA4D56FD4A16284CE872F271981D2F469B`.
- Manifesto V4: `REVIEW-MANIFEST.json`, SHA-256 `D609A9C6534E843CFAC52222C6DB52ACAA4FE12599152C569B1576DFA29DC36D`, 53 arquivos.
- Manifesto do baseline: `docs/DEX-V2-ROOT-BASELINE-MANIFEST.json`, SHA-256 `D29C36A52BA1CA9573E9D9CE5DF9BDF7BFDC6FA9F3A7976BA1038B6FAC3393CA`, 31 arquivos fonte.

## Cobertura dos critérios congelados

- **D1 — pass.** `src/okx-market/okx-dex.ts:3-5,64-87,212-312` fixa origem e duas rotas GET, assina timestamp + método + path/query com HMAC-SHA256, fixa `exactIn`/`singleRouteOnly`, recusa redirects e limita a operação incluindo a leitura JSON, sem retry. Os testes validam assinatura literal, query, spacing, timeout e validação antes do fetch. Neste V4, `okx-dex.ts:122-130` também exige envelope objeto com `code:string`, `msg:string`, `data` presente e array de registros; falhas de schema são sanitizadas. `okx-dex.test.ts:257-280` verifica dados malformados e `msg` ausente, numérico ou nulo.
- **D2 — pass.** `round-trip.ts:139-146` exige, antes de qualquer quote dependente, metadados válidos de cobertura (`chainIndex`, `chainName:string` e `dexTokenApproveAddress:string`), seleciona exatamente a rede solicitada e distingue cobertura ausente de ambígua/malformada. `round-trip.test.ts:80-108` confirma ausência/divergência de rede ou metadado malformado não produz delta e não solicita quotes adicionais; `round-trip.test.ts:111-120` verifica identidade divergente como blocked e identidade/schema inválido como unknown. O contrato fonte (`docs/OKX-DEX-QUOTE-CONTRACT-20261009.md:53-61`) documenta os campos; o endereço de aprovação pode ser string vazia, portanto o código exige tipo string sem inferir aprovação da carteira. A composição A→B→A e a segunda entrada igual à primeira saída continuam em `round-trip.ts:147-163`.
- **D3 — pass.** A análise V2 de decimal exato, relógio monotônico/fresco apenas localmente, impactos assinados e impostos desconhecidos permanece coberta pela fonte e testes inalterados neste snapshot. A suíte executada nesta revisão inclui regressões para impacto negativo, decimal acima do limite, limite em notação exponencial e imposto acima de 1; todas passaram. Isto não afirma frescor de mercado.
- **D4 — pass.** Cotações continuam produzindo apenas delta bruto; custo total e `netAtomic` reais permanecem desconhecidos (`round-trip.ts:125-127,162-164`). A função hipotética separada exige entradas/custos/buffer explícitos e limiar estrito; o guia `docs/OKX-DEX-V2-GUIDE.md:19-21` documenta que a completude de custos é hipótese, não observação ou PnL.
- **D5 — pass, caminho sintético exercitado.** `scripts/okx-dex-quote.ts` e `package.json:28` expõem a CLI com `--no-env-file`; sem flags live ela usa fixtures sintéticas. A CLI exige escopo e credenciais completas antes de qualquer fetch no caminho live, limitado às três chamadas documentadas. A execução real nesta revisão foi somente sintética; nenhum endpoint remoto foi chamado. A ausência de chamada live não qualifica conta, permissões, tier ou quota.
- **D6 — pass no snapshot.** Após a execução, os 53/53 hashes do manifesto V4 e 31/31 hashes do baseline conferiram, sem divergências. A cópia é isolada; esta conclusão não afirma que o checkout principal já recebeu a integração nem absorve mudanças concorrentes de lá.
- **D7 — pass para os testes DEX pertinentes, typecheck e CLI; suíte global limitada.** O TDD `docs/OKX-DEX-V2-TDD.md:32-40` registra os problemas posteriores de schema e regressões correspondentes; `docs/DEX-API-TDD.md` documenta contratos do cliente. O registro suplementar `C:/Users/gabri/.codex/tmp/jev-trader-01a1216a/okx-dex-schema-regression-evidence/docs/SCHEMA-REGRESSION-COMPARISON.md` tem SHA `815C94C0FBA92EC7D8B2422CC1AA1C1D6E0BD2DA71EE704D946AA68025B5AC61` e compara retrospectivamente implementação V2 com testes V4 (26 pass/2 fail) e implementação/testes V4 (28 pass/0 fail). Uso-o apenas como evidência suplementar: ele não prova autoria nem cronologia TDD. Minha execução independente atual retornou **30 pass, 0 fail, 573 expectativas, 3 arquivos**, typecheck exit 0 e CLI sintética exit 0. Não repeti a suíte completa; o histórico registra timeout preexistente em `doctor.test.ts`, portanto não certifico a suíte global.
- **D8 — pass.** `docs/OKX-DEX-V2-GUIDE.md:1-29` está em português, descreve limites de unidade/cobertura/custo, separa etapas futuras e declara que o relato de US$68→US$6.700 permanece não verificado. Não promete ganhos, venda garantida ou lucro.

## Comandos executados e resultados

Diretório de trabalho: `C:/Users/gabri/.codex/tmp/jev-trader-01a1216a/okx-dex-review-v4-recovery`.

```text
C:/Users/gabri/.bun/bin/bun.exe --no-env-file test --timeout=30000 src/okx-market/okx-dex.test.ts src/okx-market/round-trip.test.ts src/okx-market/dex-cli.test.ts
exit 0 — 30 pass, 0 fail, 573 expect() calls, 3 arquivos.

C:/Users/gabri/.bun/bin/bun.exe --no-env-file run typecheck
exit 0 — tsc --noEmit.

C:/Users/gabri/.bun/bin/bun.exe --no-env-file run scripts/okx-dex-quote.ts
exit 0 — source=synthetic; outputAtomic=995000; quotedGrossDeltaAtomic=-5000; netAtomic=null; execution=not_qualified; liveQualified=false.
```

## Achados e limites

**Achados materiais: nenhum.** Os reparos V4 de schema são consistentes com os tipos congelados: envelope exige `msg:string`, e cada entrada de cobertura exige os dois campos string documentados, preservando `dexTokenApproveAddress:""` válido. Erro de schema não vira igualdade de identidade nem delta utilizável; quotes dependentes são suprimidas quando a cobertura não pode ser interpretada.

Revisão e testes ocorreram somente nesta cópia isolada, com fetch injetado/fixtures e credenciais fictícias onde os testes as exigem. Não li `.env`, segredo ou chave privada e não usei API, carteira, ordem, assinatura, transferência ou rede financeira. O parecer não avalia a integração no checkout principal e não afirma estado live ou benefício financeiro.

