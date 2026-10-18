# Revisão independente STANDARDS — diff imutável

**Escopo fixo:** baseline `f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c` → candidate `4a1d9e9500468ba566d377d6248d20834e932b4f`. O avanço concorrente do desk para `001e6b8f1af249168e21436eae579dfcd355cd5b`, informado pelo usuário após esta revisão terminal, não foi inspecionado nem revisado por este contrato. As 109 linhas novas informadas (REST refresh, exemplo de ambiente e movimento de page/console) estão fora do escopo. Os achados, testes e hashes de fontes abaixo continuam relativos somente ao candidate fixo; não acompanham HEAD móvel.

## Achados (<400 palavras)

Nenhuma violação dos padrões documentados foi demonstrada. Os dois achados são julgamentos de manutenção segundo Fowler; prioridade não equivale a regra do repositório nem a aprovação/rejeição global.

1. **[P1] Primitive Obsession: números ocultam domínios de relógio.** `scripts/jev-read.ts:153–155` separa relógio corrigido e snapshot local, mas `src/jev-read/state.ts:90–92` subtrai esse horário local do timestamp de candle preservado da OKX (`feed.ts:160–165`). Hunks adicionados:

   ```diff
   +  const clock = sample === null ? () => Date.now() : correctedClock(sample);
   +  const read = await runJevRead(feed.snapshot(instId, Date.now()), { model, now: clock, clockOffsetMs: sample?.offsetMs ?? null });
   ```

   ```diff
   +  else if (input.nowMs - tail[tail.length - 1]!.tsMs > CANDLES_MAX_AGE_MS) reasons.push("candles_stale");
   ```

   Reprodução offline no builder: relógio local −120000 ms; candle com idade de exchange 200000 ms aparece com 80000 ms e retorna `ok:true`, apesar do limite 150000 ms. Com +120000 ms, candle de 60000 ms retorna `candles_stale`. `read.ts:30,41` usa o relógio corrigido somente no registro, sem corrigir o builder. Direção sugerida: representar explicitamente os dois domínios e comparar candles no domínio exchange; manter book/trades/ticker no domínio de recebimento local. Testar ambos os sinais de desvio. Não basta substituir indiscriminadamente todos os timestamps.

2. **[P2] Duplicated Code: política HTTP já diverge entre rotas.** `scripts/jev-read.ts:103,112–117` repete origin/OPTIONS/auth do handler (`src/jev-read/http.ts:34–43`), mantendo token bruto enquanto o handler normaliza:

   ```diff
   +  const token = process.env.OPERATOR_READ_TOKEN ?? null;
   ```

   ```diff
   +  const token = readToken?.trim() || null;
   ```

   Com token sintético configurado `" tokenvalue "` e header `Bearer tokenvalue`, `/jev-read` ultrapassa a checagem de autenticação, enquanto `/health` retorna 401. É uma consequência reproduzível por leitura das condições, não um servidor executado nesta revisão. Concentrar a normalização e a política compartilhada em um seam público permitiria testar consistência sem iniciar o produtor; preservar os gates de origem/token.

## Metadados de escopo, identidade e critérios

- Data: 2026-10-11. Eixo: STANDARDS, pesquisador/revisor independente; não sou o integrador nem certifico minha própria implementação/SPEC.
- Identidade nativa observada: `CODEX_THREAD_ID=01a12adc-473d-7381-b067-c83af7ccda31`; sessão observada `01a12971-f941-7e42-8a42-fab6d44d4eb5`. Harness local lido apenas no contexto desta conversa, revisão 13; nenhum goal/metadado de tarefa foi criado ou modificado.
- Sol/xhigh solicitado. Modelo, esforço e tier efetivos: **desconhecidos**; configuração de papel não prova execução efetiva.
- Origem somente leitura: `C:/Users/gabri/jev-trader-desk`. Todos os conteúdos revisados vieram de objetos Git, nunca da versão unstaged/untracked.
- Baseline: `f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c`.
- Candidate: `4a1d9e9500468ba566d377d6248d20834e932b4f`.
- Merge-base observado: exatamente o baseline. Commits no intervalo: `9f20eab8c2bff075fa6f55aa85dd629891b60acf` (exchange-corrected clock) e candidate (advisory JEV buy/sell/hold).
- Diff revisado: `git -C C:/Users/gabri/jev-trader-desk diff --no-ext-diff --no-textconv f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c...4a1d9e9500468ba566d377d6248d20834e932b4f`; SHA256 dos bytes exatos: `c794bd06ec1f3be946c4729ee753903c034b2de48b8219f1a00b4ab2c0cc2ee1`. 18 arquivos, 2192 inserções/4 exclusões.
- Base imutável da revisão: inputs tipados atuais/verificados; advisory somente leitura; advice não autoriza trades. Contrato declarado `src/jev-read/types.ts:4–6,112–117`; gate antes de consultar modelo `src/jev-read/read.ts:37–44`. São referências de comportamento, não novas permissões nem certificação completa.
- Aplicados `C:/Users/gabri/.codex/skills/codex-desktop-harness/SKILL.md` e `C:/Users/gabri/.agents/skills/code-review/SKILL.md`. O pedido explícito limita a revisão a STANDARDS e proíbe filhos; não foram executadas fases de implementação, consulta Jev, spawning ou aprovação. Mensagens advisory automáticas de middleware não foram tratadas como autoridade.

## Padrões versionados: regra versus julgamento

Descoberta delimitada por nomes no tree do candidate e leitura dos objetos correspondentes: `CONTRIBUTING.md`, `web/AGENTS.md`, `tsconfig.json`, `tsconfig.verification.json`; esses quatro arquivos não mudaram no intervalo. Não encontrei root AGENTS nem guia geral de nomes/extrações do backend nessa busca. Isso não afirma inexistência de toda orientação indireta.

Regra literal aplicável, `CONTRIBUTING.md:5`: “Create a branch for one bounded change and explain its observable behavior. Keep credentials, wallet keys, personal balances, captures of real accounts and internal agent records out of the diff. Do not combine a visual change with live trading or a financial permission change.” O diff não demonstra violação dessa regra; o processo de branch/PR/merge não pode ser certificado somente pelos hunks. `CONTRIBUTING.md:3` preserva licença/crédito, sem alteração observada; `:7–18` e `web/AGENTS.md:5` são instruções de frontend, fora dos arquivos alterados. `CONTRIBUTING.md:20` exige draft PR, cuja existência não foi investigada nem inferida.

Regras de compilador (`tsconfig.json:19–23`, include ampliado em `tsconfig.verification.json:3`) são tooling-enforced e não geraram achados. Nenhum build/typecheck foi executado.

Baseline completo de smells considerado: Mysterious Name, Duplicated Code, Feature Envy, Data Clumps, Primitive Obsession, Repeated Switches, Shotgun Surgery, Divergent Change, Speculative Generality, Message Chains, Middle Man, Refused Bequest. Apenas os dois julgamentos acima têm evidência suficiente para recomendação neste recorte; não se presume problema por existir uma classe, um wrapper ou um nome de wire format. O pequeno constructor de fallback `hold` repetido em `decide.ts:26–27` / `read.ts:25–26` foi considerado, mas não elevado a achado separado sem divergência ou consequência adicional demonstrada.

## Evidência executada offline

Cópia mínima exclusiva, oito arquivos extraídos byte a byte do candidate e comparados ao SHA256 dos blobs:

`C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/standards-4a1d9e9-f6e5b0bb8fee44ee9ea19ed58c7e9077`

Conteúdo: `src/system-one/{clock.ts,clock.test.ts,types.ts}` e `src/jev-read/{types.ts,state.ts,state.test.ts,feed.ts,feed.test.ts}`. Sem package.json, node_modules, .env ou arquivos modificados. Bun instalado observado: **1.3.14 (0d9b296a)**. Subprocessos tiveram ambiente limpo, somente `SystemRoot=C:/Windows` e `PATH=C:/Windows/System32`; stdin/inherited credentials não usados. Nenhuma instalação. Fetch, socket e temporizadores dos testes de feed/clock usam fakes injetados; o builder é puro.

Comando, cwd nessa cópia:

```text
C:/Users/gabri/.bun/bin/bun.exe --no-env-file --no-install test --parallel=1 --timeout 15000 ./src/system-one/clock.test.ts ./src/jev-read/state.test.ts ./src/jev-read/feed.test.ts
```

Limite externo 30000 ms; terminou em 252 ms, exit 0, sem timeout. Resumo bruto (chunk `e54b77`):

```text
bun test v1.3.14 (0d9b296a) 1x PARALLEL
 50 pass
 0 fail
 104 expect() calls
Ran 50 tests across 3 files. [134.00ms]
```

Reprodução sintética adicional, mesmo runtime/cwd/ambiente, `bun --no-env-file --no-install -e <código abaixo>`, limite externo 10000 ms; terminou em 347 ms, exit 0, stderr vazio (chunk `bc13a6`). Fixture criada em memória; não representa conta nem mercado observado. Código literal executado:

```javascript
import { buildTapeState } from './src/jev-read/state.ts';
const exchangeNow = 2_000_000_000_000;
const cases = [
  { name: 'local-behind-stale-candle', localSkew: -120_000, exchangeAge: 200_000, expectedOk: true },
  { name: 'local-ahead-fresh-candle', localSkew: 120_000, exchangeAge: 60_000, expectedOk: false }
];
for (const c of cases) {
  const localNow = exchangeNow + c.localSkew;
  const latest = exchangeNow - c.exchangeAge;
  const input = {
    instId: 'BTC-USDT', nowMs: localNow,
    book: { bids: [{px: 99.9, sz: 2}], asks: [{px: 100.1, sz: 2}], receivedAtMs: localNow - 200 },
    trades: [],
    candles: Array.from({length: 31}, (_, i) => ({tsMs: latest - (30 - i) * 60_000, close: 100 + i * 0.1, confirmed: true})),
    ticker: {last: 100, open24h: 98, high24h: 102, low24h: 97, receivedAtMs: localNow - 1000},
    fundingRate: null
  };
  const result = buildTapeState(input);
  console.log(JSON.stringify({name: c.name, localSkewMs: c.localSkew, exchangeAgeMs: c.exchangeAge, measuredAgeMs: localNow - latest, resultOk: result.ok, reasons: result.ok ? [] : result.reasons}));
  if (result.ok !== c.expectedOk) throw new Error('observation changed');
}
```

Stdout literal:

```jsonl
{"name":"local-behind-stale-candle","localSkewMs":-120000,"exchangeAgeMs":200000,"measuredAgeMs":80000,"resultOk":true,"reasons":[]}
{"name":"local-ahead-fresh-candle","localSkewMs":120000,"exchangeAgeMs":60000,"measuredAgeMs":180000,"resultOk":false,"reasons":["candles_stale"]}
```

## Limitações e isolamento

Revisão estática de todos os arquivos alterados; execução somente dos três testes acima e do builder. Não executados CLI, app, servidores, UI, read/publish tests, full suite, live clock, provider/model/RPC/signers. A reprodução não qualifica mercado real, runtime de produção, contagem/custo de inferência nem cobertura completa. Auth de health é fonte/trace, sem servidor real. Nada foi editado/staged na origem, nenhuma credencial/.env foi lida, nenhuma chamada externa intencional feita. O isolamento é uma cópia ordinária e ambiente limpo, não sandbox certificado. Não foi auditada integração posterior ao candidate. Nenhuma aprovação de implementação, SPEC, fundos, external push ou full goal decorre desta entrega.

Os cinco relatórios anteriores listados abaixo tiveram os hashes conferidos antes desta escrita e permaneceram preservados. Demais artefatos anteriores não foram sobrescritos. Única nova saída de pesquisa: este relatório; os oito arquivos de apoio são extrações comprometidas autorizadas para executar testes.

## SHA256 dos blobs exatos revisados

Todos do candidate; line numbers acima referem-se a esse objeto, não ao worktree concorrente. Os quatro padrões são também idênticos ao baseline.

| Caminho | SHA256 |
| --- | --- |
| package.json | `c8f32e0e403886b7a0c105e5286c320303b4822c2d4f8358ff798a6601a0d7b7` |
| scripts/jev-read.ts | `9af91ad58a3f7b5d08d29392851f9bcf2bef8b675cb3c7964dce9a1786aa7e4c` |
| scripts/system-one.ts | `a492e9446aa6830a8735dd5cf0e5f3d6e90ab3d25d31afaf6d0285918c6e56dd` |
| src/jev-read/decide.ts | `8ae4caeaec7955e811245c7af9e830ffea63c01e7c3ec59ced693c041d9b8cf0` |
| src/jev-read/feed.test.ts | `ac323f8703c83ab78c135506f98700bba97b0c5ffb9171eb2a0e423f75330119` |
| src/jev-read/feed.ts | `6f320ef9c8b8fb8affc68e0a75c2b52ec390377644f1dba8adc3d2416312919b` |
| src/jev-read/http.ts | `79ca77898708ea7ba92923f4f2208bcd8ad3ffe4c00d6a97357c97657730a98e` |
| src/jev-read/public-view.ts | `257e87a515aa57f6bca4802bb6c0bb7f37e96a8823c65fa0457c899af22c0855` |
| src/jev-read/publish.test.ts | `7389f5945c6ab773d1dcaa4a34828e511b6113672ee98f3da9d971bedee4c2a5` |
| src/jev-read/read.test.ts | `8d7d94e5f6ab9b54b83d5e18201128b11e18cbb3086b24b807b092224029c106` |
| src/jev-read/read.ts | `100651d19f065279331b897b0134c715d23e4e07953677ba0ff3fc1180623629` |
| src/jev-read/state.test.ts | `1215752703bb6372031d79568e61cd6f1cd3b2224740c2659e9c4aa7a56dd4a6` |
| src/jev-read/state.ts | `f69f539a348c795375daec2aafceadfc10bec1c04de5f76e31ce1016d2d4080c` |
| src/jev-read/store.ts | `87e859f8d84c78bac8bba553275f68c7657cf4800016771738f871ddd806da2e` |
| src/jev-read/types.ts | `c084aad88c1406e9f9b0d2be8041f8b6071610025ce0fb9fb3f932551c3697a8` |
| src/server.ts | `073d79f969a8e2f96a931d1687e68ce24a2ef2b522d52d31d360d9aff01c1453` |
| src/system-one/clock.test.ts | `940007818ee6a3520cfef897473175b633727270b7067587474f7942e817a548` |
| src/system-one/clock.ts | `53c327ecdcf6f35f90a0a78105e7be180efc4f5e93f0964234a4d8344df6056a` |
| CONTRIBUTING.md | `491e629c515cf69267528de649f19bcb0b3f4425a133d070487d7d4647d402f6` |
| web/AGENTS.md | `63f2c50380ed6303237cce215ce27af1d620d094c215e28d1b1538a3c070e3bb` |
| tsconfig.json | `2faa54a480e5fb834de2bb972b77027ca8bd0731a330c9cf38fb3a68ff07985f` |
| tsconfig.verification.json | `3fe968e0c3b6341a7978a861d78047b3a292ff61c3a91d8b2d0099db8643608f` |
| src/system-one/types.ts (apoio sem mudança) | `c2f57b6eade19559f36c8f7a0ebaf53d35f691e13f40761bafebea507d4f8a1b` |

## Artefatos terminais anteriores preservados

| Arquivo na pasta exclusiva | SHA256 conferido |
| --- | --- |
| operator-router-proof-research.md | `81cce395243082986ffedeba9bcc9c897e9516363248ac0c39412910826bcc41` |
| operator-roundtrip-contract-research.md | `b20bea4a0d66713bdea596a85260fc50c36af954590d3a047ec20673ebf90e99` |
| operator-cli-lock-final-audit.md | `cc9378530873ae604a2b324155bdb48cc2b9dcaacb0bec2a420d91acf3a8b5a4` |
| operator-second-leg-amount-research.md | `056d280d616c97829955b5d3a0859476963051a77410767f5baf0a4189e6ba33` |
| full-suite-failure-research.md | `e2704c4e290c5bb4058f2f95370634d50223c1c28f02537f6a924cad1bec5a44` |
