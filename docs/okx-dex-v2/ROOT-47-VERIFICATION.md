# Verificacao de execucao da integracao DEX

## Escopo e limite da evidencia

Foi montado e exercitado um snapshot isolado em `C:\Users\gabri\.codex\tmp\jev-trader-01a1216a\okx-dex-root-integration-test\snapshot`. Ele representa a composicao enumerada neste relatorio; esta evidencia nao demonstra, por si, o estado posterior do checkout principal nem aprova a implementacao.

O runtime nao expos identidade efetiva de processo, modelo ou tier. Esses dados permanecem nao verificados. As verificacoes nao usaram rede externa ou API OKX; as variaveis OKX conhecidas foram removidas do ambiente filho sem leitura, e o Bun foi iniciado com `--no-env-file`.

## Composicao e guardas

- Manifesto do coordenador: `C:\Users\gabri\.codex\tmp\jev-trader-01a1216a\okx-ecosystem\docs\DEX-V2-ROOT-PREINTEGRATION-MANIFEST.json`, SHA-256 `3041A684C07BADDF57C39CBE52202A96E3B5BF6C65D610FDE2EE8F037413DB79`. Os 31 arquivos `src` do root conferiram com os hashes do manifesto na verificacao final; zero divergencias.
- Manifesto V4: `C:\Users\gabri\.codex\tmp\jev-trader-01a1216a\okx-dex-review-v4-recovery\REVIEW-MANIFEST.json`, SHA-256 `D609A9C6534E843CFAC52222C6DB52ACAA4FE12599152C569B1576DFA29DC36D`. As 53 entradas conferiram na verificacao final; zero divergencias.
- O snapshot final contem 47 arquivos: 31 arquivos src do root, sete acrescimos DEX e dois arquivos de configuracao V4, tres scripts do root com hashes correspondentes ao V4, o scripts/backtest.ts concorrente atual do root e tres fontes concorrentes preexistentes de evidencia de backtest copiadas do root.
- O `scripts/backtest.ts` concorrente foi preservado no snapshot com o SHA-256 atual do root `F5D928A623D9995E95AEEB5132FA479E90CA4216636AF13867794A73191441E8`. O hash era o mesmo antes da copia, depois da copia no root e no snapshot. O hash historico esperado pelo V4 e `22FB1282920FC7F43B4ACA16DFAA6DC2E8407ADE39E70A790AE1C9E08FDEFD0B`; o checkout V4 foi deixado intacto.
- `src/doctor.test.ts` preservado, SHA-256 `78B7654523C7BBB5E9378BE4529E455C4062383ACF3337BE64EF51472F4B212B`; seu timeout local continua em 15.000 ms.
- `node_modules` e uma junction para `C:\Users\gabri\jev-trader\node_modules`; dependencias nao foram copiadas. Arquivos de ambiente, exemplos de ambiente, recibos e caches foram excluidos.
- O manifesto final da composicao, `INTEGRATION-MANIFEST.json`, tem SHA-256 `D4D0AEB1722264E651FED37D7E64B94A309EEAF1ADB7BBD409D2FD00242615E6`.

## Testes e CLI

Os testes e o CLI abaixo foram capturados no estado de 43 arquivos, antes da inclusao do `scripts/backtest.ts` atual. O comando de testes visa `src`; a captura e identificada explicitamente como execucao no snapshot de 43 arquivos e nao foi repetida depois da inclusao do script. A execucao observou 105 aprovacoes e zero falhas; o caso doctor terminou em aproximadamente 2,09 s.

Comando dos testes: `C:\Users\gabri\.bun\bin\bun.exe --no-env-file test --parallel=1 src`  
Exit code: `0`  
Tempo de parede informado pelo executor: `6.7087523000000004` s; Bun reportou `[6.24s]`.

### stdout integral dos testes

```text
bun test v1.3.14 (0d9b296a) 1x PARALLEL

src\backtest.test.ts:
(pass) replayJournal > replays funded spot fills and charges each recorded cost once [3.40ms]
(pass) replayJournal > tracks peak-to-trough drawdown from each recorded mark [0.15ms]
(pass) replayJournal > rejects empty, malformed, and unfunded journals [1.05ms]
(pass) replayJournal > does not charge unconfirmed sent gas and labels synthetic fills [0.27ms]
(pass) replayJournal > rejects header-only or malformed quote journals [0.22ms]
(pass) replayJournal > keeps delayed fills in journal arrival order even when their block is older [0.74ms]
(pass) replayJournal > rejects duplicate fill identities and fills that contradict session provenance [0.73ms]
(pass) replayJournal > charges a confirmed cancellation once when its transaction hash is shared with a receipt [0.49ms]
(pass) replayJournal > requires a transaction hash and finite nonnegative cancellation gas [0.53ms]
(pass) replayJournal > rejects conflicting gas values when a cancellation repeats a receipt transaction [0.33ms]

src\config.test.ts:
(pass) configuration is paper by default and credentials alone never enable live [0.39ms]
(pass) malformed financial inputs and modes fail closed [0.18ms]

src\doctor.test.ts:
(pass) read-only doctor redacts provider errors from a credential-bearing endpoint [2087.41ms]

src\economics.test.ts:
(pass) two-leg maker costs reject narrow spreads and invalid estimates [0.30ms]

src\model.test.ts:
(pass) hold is valid and malformed decisions fail closed [5.89ms]

src\okx-api.test.ts:
(pass) requires explicit credentials and never sends without them [0.36ms]
(pass) keeps live requests disabled unless explicitly enabled [1.04ms]
(pass) signs the exact fixed GET request path, including its query [1.64ms]
(pass) signs the exact serialized POST body used on the wire [0.62ms]
(pass) uses only the five read-only documented endpoints and validates their response shapes [2.01ms]
(pass) rejects invalid limits, stages, token identities, and batches before network access [0.54ms]
(pass) fails closed on HTTP, API, JSON, and shape errors without exposing response bodies [0.86ms]
(pass) reports timeout without exposing fetch errors [25.67ms]
(pass) does not retry a failed API call [0.68ms]

src\okx-opportunities.test.ts:
(pass) missing market and risk data remains unknown and never qualifies [0.55ms]
(pass) normalizes a matching token and admits only a fully screened research candidate [0.38ms]
(pass) scenario costs are explicit, break-even is reported, and equality with the minimum does not pass [0.26ms]
(pass) rejects invalid economic inputs instead of treating them as zero [0.08ms]
(pass) invalid screening thresholds fail before a scan can run [0.04ms]
(pass) empty tags and risk level zero remain unknown rather than becoming safe defaults [0.05ms]
(pass) OKX market tags do not prove honeypot safety without an explicit assessment [0.05ms]
(pass) an explicit positive honeypot assessment blocks research screening [0.13ms]
(pass) a documented honeypot token tag is a positive block even without a separate assessment [0.05ms]
(pass) per-pool screening honors the Jev-selected one-pool rule and blocks stale or unsafe evidence [0.45ms]

src\risk.test.ts:
(pass) spot inventory is funded and all costs reduce equity [0.55ms]
(pass) price changes mark inventory losses and drawdown [0.05ms]

src\trader.test.ts:
(pass) an overlapping newer block invalidates a delayed model result [13.46ms]
(pass) an overlapping block clears an existing paper order while inference is pending [11.53ms]
(pass) spending latch prevents new orders after the threshold [5.43ms]
(pass) hold never sends an order and mock incurs no Jev bill [1.49ms]
(pass) economically infeasible spread makes no inference or order call [1.59ms]
(pass) paper gas reduces P&L and interval suppresses another decision [1.85ms]

src\okx-market\dex-cli.test.ts:
(pass) DEX CLI defaults to synthetic paired quotes without fetch or credential dependencies [141.84ms]
(pass) live DEX scope and complete credentials are mandatory before any fetch [1743.28ms]

src\okx-market\okx-api.test.ts:
(pass) createOkxReadOnlyClient > discovers protocols with the fixed host and a signature over the exact GET path [2.69ms]
(pass) createOkxReadOnlyClient > requires an explicit stage and applies the local limit without sending pagination or wallet data [1.88ms]
(pass) createOkxReadOnlyClient > a fresh protocol discovery removes prior chain coverage before the next list request [0.84ms]
(pass) createOkxReadOnlyClient > validates positive numeric chain indexes for meme-pump listings before fetch [0.79ms]
(pass) createOkxReadOnlyClient > uses the positive numeric chain contract for all identity-based methods before fetch [3.68ms]
(pass) createOkxReadOnlyClient > prices send at most 30 identities with EVM lowercase and Solana case preserved [3.96ms]
(pass) createOkxReadOnlyClient > rejects invalid chain and token address text before fetch without imposing address format [0.66ms]
(pass) createOkxReadOnlyClient > advanced and pool lookups use the fixed paths and sign the exact identity query [1.47ms]
(pass) createOkxReadOnlyClient > rejects top-liquidity records that do not contain the requested token [1.55ms]
(pass) createOkxReadOnlyClient > treats advanced-info data as one object and rejects an array [1.53ms]
(pass) createOkxReadOnlyClient > advanced lookups distinguish valid identity mismatches and preserve Solana case [1.66ms]
(pass) createOkxReadOnlyClient > pools reject malformed identity-bearing asset entries as schema errors [1.04ms]
(pass) createOkxReadOnlyClient > Solana pool assets match case-sensitively while EVM asset casing is normalized [3.08ms]
(pass) createOkxReadOnlyClient > validates local limits before fetch and redacts HTTP, API, and transport failures [3.15ms]
(pass) createOkxReadOnlyClient > aborts a hung request after the finite timeout without retrying [21.12ms]
(pass) createOkxReadOnlyClient > times out a pending response body after fetch resolves without retrying or exposing body errors [10.23ms]

src\okx-market\okx-cli.test.ts:
(pass) CLI defaults to an explicitly synthetic finite scan with no environment or network dependency [195.71ms]
(pass) live mode rejects incomplete credentials and ambiguous or invalid scope before any network call [1373.74ms]

src\okx-market\okx-dex.test.ts:
(pass) OKX DEX read-only client > signs the exact supported-chain GET path and returns data [2.69ms]
(pass) OKX DEX read-only client > uses only the fixed exact-in quote query and lowercases EVM token addresses [1.39ms]
(pass) OKX DEX read-only client > preserves Solana token address case [0.52ms]
(pass) OKX DEX read-only client > validates chain, addresses, atomic amount and protection before fetch [0.62ms]
(pass) OKX DEX read-only client > rejects an invalid clock before fetch [0.68ms]
(pass) OKX DEX read-only client > rejects invalid credentials and timing bounds at construction [0.43ms]
(pass) OKX DEX read-only client > spaces concurrent request starts by the configured interval [0.85ms]
(pass) OKX DEX read-only client > applies the timeout across the JSON body and does not retry [18.57ms]
(pass) OKX DEX read-only client > sanitizes invalid JSON [4.15ms]
(pass) OKX DEX read-only client > sanitizes network and HTTP/API failures without retrying or exposing bodies [0.99ms]
(pass) OKX DEX read-only client > rejects malformed data arrays without exposing response content [0.58ms]
(pass) OKX DEX read-only client > requires a string message in the documented response envelope [1.05ms]

src\okx-market\okx-opportunities.test.ts:
(pass) opportunity identity and market facts > keeps unknown fields unknown and rejects price from another asset [0.65ms]
(pass) opportunity identity and market facts > normalizes public USD, percentage and timestamp units without adding pool liquidity [0.79ms]
(pass) opportunity identity and market facts > matches EVM case but preserves Solana case and invalid facts [0.28ms]
(pass) opportunity identity and market facts > rejects advanced and pool facts for another token and keeps absent membership unknown [0.46ms]
(pass) hypothetical two-leg economics > rejects every omitted scenario field instead of treating absence as zero [0.67ms]
(pass) hypothetical two-leg economics > subtracts both legs and fixed costs, reporting breakeven without execution authority [0.53ms]
(pass) hypothetical two-leg economics > charges all six proportional costs and a realized loss cannot pass [0.27ms]
(pass) research qualification, never execution qualification > distinguishes candidate, critical unknown and known blockers with explicit policy [1.87ms]
(pass) research qualification, never execution qualification > rejects incomplete policy and treats invalid discrete facts as unknown [0.55ms]

src\okx-market\okx-scan.test.ts:
(pass) scans finite public facts through discovered coverage without authorizing execution [1.83ms]
(pass) joins reordered prices by identity and rejects conflicts and unrequested assets [1.55ms]
(pass) checks gates before provider calls, rejects malformed listed identities, caps work and sanitizes failures [1.93ms]
(pass) does not choose arbitrarily among duplicate listing or advanced identities [1.25ms]
(pass) preserves explicit identity conflicts across the HTTP client and scanner [5.09ms]
(pass) missing HTTP advanced identity remains unknown and remote error text stays private [1.81ms]

src\okx-market\round-trip.test.ts:
(pass) paired public quotes preserve exact atomic amounts and expose only a gross quantity delta [3.07ms]
(pass) invalid caller scope and atomic units fail before any provider method [1.23ms]
(pass) missing or ambiguous network coverage suppresses dependent quotes without fabricating a delta [1.95ms]
(pass) malformed supported-chain metadata suppresses dependent quotes [0.90ms]
(pass) global quote identity, exact input and decimals gate every dependent amount [3.04ms]
(pass) honeypot and signed impact uncertainty prevent dependent quotes on either leg [3.55ms]
(pass) decimal impact above the policy cannot pass through binary rounding on either leg [0.94ms]
(pass) a decimal tax above one remains unknown instead of rounding into the valid interval [0.71ms]
(pass) exact decimal boundaries work when the numeric policy renders with an exponent [1.19ms]
(pass) missing taxes and network estimates remain unknown without deducting them twice [1.72ms]
(pass) local timing includes coverage and rejects stale or invalid clocks before dependent requests [2.71ms]
(pass) reports discard caller extras and never expose a provider error payload [0.94ms]
(pass) Solana preserves contract case and valid negative deltas remain gross quoted losses [0.74ms]
(pass) manual complete-cost hypotheses use exact integers and require net strictly above buffer [0.54ms]
(pass) manual economics rejects incomplete, negative or non-atomic hypotheses [1.08ms]
(pass) the real read-only adapter composes with the quote validator using an injected transport [3.02ms]

 105 pass
 0 fail
 1003 expect() calls
Ran 105 tests across 16 files. [6.24s]
```

Comando do CLI: `C:\Users\gabri\.bun\bin\bun.exe --no-env-file run okx:dex-quote`  
Exit code: `0`  
Tempo de parede informado pelo executor: `0.619704` s. O caminho sem argumentos foi sintetico, com `source: "synthetic"`, `netAtomic: null`, `liveQualified: false` e `execution: "not_qualified"`.

### stdout integral do CLI

```text
$ bun --no-env-file run scripts/okx-dex-quote.ts
{
  "source": "synthetic",
  "chainIndex": "1",
  "tokenA": {
    "address": "0x0000000000000000000000000000000000000001",
    "decimals": 6,
    "metadataSource": "synthetic-fixture-only"
  },
  "tokenB": {
    "address": "0x0000000000000000000000000000000000000002",
    "decimals": 6,
    "metadataSource": "synthetic-fixture-only"
  },
  "inputAtomic": "1000000",
  "outputAtomic": "995000",
  "quotedGrossDeltaAtomic": "-5000",
  "status": "quoted_gross_delta",
  "reasons": [
    "quoted_output_unit_inferred",
    "total_cost_coverage_unknown"
  ],
  "legs": [
    {
      "inputAtomic": "1000000",
      "outputAtomic": "1010000",
      "priceImpactPercent": -0.1,
      "fromTaxFraction": 0,
      "toTaxFraction": 0,
      "networkEstimates": {
        "tradeFeeUsd": null,
        "estimateGasFeeNativeAtomic": null
      },
      "requestedAt": 1791504000004,
      "receivedAt": 1791504000005
    },
    {
      "inputAtomic": "1010000",
      "outputAtomic": "995000",
      "priceImpactPercent": -0.1,
      "fromTaxFraction": 0,
      "toTaxFraction": 0,
      "networkEstimates": {
        "tradeFeeUsd": null,
        "estimateGasFeeNativeAtomic": null
      },
      "requestedAt": 1791504000006,
      "receivedAt": 1791504000007
    }
  ],
  "execution": "not_qualified",
  "liveQualified": false,
  "netAtomic": null,
  "netStatus": "net_not_evaluated",
  "costsCoverage": "unknown",
  "costUsd": null,
  "quotaRemaining": null,
  "policy": {
    "maxElapsedMs": 5000,
    "maxImpactMagnitudePercent": 1
  },
  "timing": {
    "startedAt": 1791504000001,
    "completedAt": 1791504000008,
    "elapsedMs": 7,
    "coverageRequestedAt": 1791504000002,
    "coverageReceivedAt": 1791504000003
  }
}
```

## Typecheck historico no snapshot de 44 arquivos

Comando: `C:\Users\gabri\.bun\bin\bun.exe --no-env-file run typecheck`  
Exit code: `1`  
Tempo de parede informado pelo executor: `0.792548` s.

stdout observado:

```text
$ tsc --noEmit
scripts/backtest.ts(3,38): error TS2307: Cannot find module '../src/backtest-evidence.ts' or its corresponding type declarations.
error: script "typecheck" exited with code 1
```

O erro e especifico deste snapshot: o `scripts/backtest.ts` incluido importa `../src/backtest-evidence.ts`; esse arquivo existe no checkout root, mas nao esta entre as 31 fontes enumeradas e nao foi copiado para este snapshot de 44 arquivos. Esse resultado permanece como evidencia historica do snapshot44; o snapshot47 posterior tem uma verificacao separada abaixo.

## Verificacao complementar no snapshot de 47 arquivos

Depois do erro de import no typecheck do snapshot44, foram adicionados ao snapshot, sem editar as fontes, somente tres arquivos atuais do root que estavam fora do manifesto baseline. Eles foram classificados como concorrentes preexistentes preservados. Os hashes foram medidos antes da copia, depois da copia no root e no snapshot:

| Fonte | SHA-256 antes no root | SHA-256 depois no root | SHA-256 no snapshot |
|---|---|---|---|
| src/backtest-evidence.ts | 4A21F47A26EC57EEE68AB721A17DE1C702F9C32474A43A859D99048280D7153E | 4A21F47A26EC57EEE68AB721A17DE1C702F9C32474A43A859D99048280D7153E | 4A21F47A26EC57EEE68AB721A17DE1C702F9C32474A43A859D99048280D7153E |
| src/backtest-evidence.test.ts | A2ECCF72DB3F10E392A1AEAA04C1A45F4B10F0AA3989171E0F1AD9403F5455D1 | A2ECCF72DB3F10E392A1AEAA04C1A45F4B10F0AA3989171E0F1AD9403F5455D1 | A2ECCF72DB3F10E392A1AEAA04C1A45F4B10F0AA3989171E0F1AD9403F5455D1 |
| src/backtest-evidence-cli.test.ts | 94B273BDEC5BC1E3C2357225A3ACCA03B93665DC15C46A83F75B9AF445A0F8FC | 94B273BDEC5BC1E3C2357225A3ACCA03B93665DC15C46A83F75B9AF445A0F8FC | 94B273BDEC5BC1E3C2357225A3ACCA03B93665DC15C46A83F75B9AF445A0F8FC |

A composicao final ficou com 47 arquivos. A validacao final encontrou 31/31 arquivos root, 53/53 arquivos V4 e 47/47 arquivos do snapshot sem divergencias; os tres arquivos concorrentes tambem conferiram nos tres pontos.

Comando exato da suite, com as variaveis OKX conhecidas removidas do processo filho, Bun iniciado com no-env-file e timeout padrao:

~~~powershell
Remove-Item Env:OKX_WEB3_API_KEY,Env:OKX_WEB3_API_SECRET,Env:OKX_WEB3_API_PASSPHRASE -ErrorAction SilentlyContinue; & 'C:\Users\gabri\.bun\bin\bun.exe' --no-env-file test --parallel=1 src
~~~

Exit code: 0. O executor registrou 7.0454474 s de tempo de parede. O Bun reportou 129 pass, 0 fail, 1120 expect() calls e 129 testes em 18 arquivos em 6.60 s. O stdout integral foi salvo em docs/ROOT-INTEGRATION-47-TEST-STDOUT.txt, SHA-256 7EEDE9BDB296AFEE19934EA0358B9040995F82435898D6296EEE404A4053493F.

Comando exato do typecheck, tambem sem variaveis OKX conhecidas e com no-env-file:

~~~powershell
Remove-Item Env:OKX_WEB3_API_KEY,Env:OKX_WEB3_API_SECRET,Env:OKX_WEB3_API_PASSPHRASE -ErrorAction SilentlyContinue; & 'C:\Users\gabri\.bun\bin\bun.exe' --no-env-file run typecheck
~~~

Exit code: 0; tempo de parede do executor 0.7522812 s; stdout observado literalmente: $ tsc --noEmit. Este resultado de 47 fontes e separado do erro TS2307 historico do snapshot44.
## Guardas finais

Resultado observado: root src 31/31 sem divergencias; recuperacao V4 53/53 sem divergencias; fontes do snapshot final 47/47 sem divergencias. Os tres arquivos concorrentes preservados conferiram com os hashes antes/depois no root e no snapshot. Para scripts/backtest.ts, SHA-256 antes da copia, depois da copia no root e no snapshot foram identicos: F5D928A623D9995E95AEEB5132FA479E90CA4216636AF13867794A73191441E8.

Esta evidencia descreve somente o snapshot e os comandos efetivamente executados. A suite original 105/0 e o CLI sintetico foram capturados em 43 arquivos. O typecheck historico em 44 arquivos falhou pelo import ausente descrito acima. Depois da inclusao controlada de tres arquivos root, o snapshot47 passou 129 testes e typecheck. Isso nao certifica integracao no root, aprovacao independente ou execucao com credenciais.