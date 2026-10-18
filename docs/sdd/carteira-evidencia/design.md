# Carteira com evidência verificável: design

Parte da pasta SDD [carteira-evidencia](requirements.md). Este arquivo contém: a conferência do projeto, o mapa de trabalho concorrente, o **estado real** de cada área com a evidência por arquivo, o **contrato de evidência** (especificação, sem código) e a lista de defeitos comprovados. Convenções de estado: IMPLEMENTADO (existe e tem teste), PARCIAL, AUSENTE (não existe), SÓ ESPECIFICADO (há documento, não há código), BLOQUEADO (existe mas não pode operar, com o motivo).

Toda afirmação aponta para um arquivo de `main@14cbb7b`, com linha quando relevante. Contagens de testes são declarações `test(`, não resultados de execução: nenhum teste foi rodado para produzir este inventário. As exceções (trabalho não commitado de terceiros) são identificadas como tal.

## 1. Conferência do projeto

| Item | Resultado | Como foi verificado |
| --- | --- | --- |
| Raiz | `C:/Users/gabri/jev-trader` | `git rev-parse --show-toplevel` |
| Checkout homônimo errado | `Documents/GitHub/jeve-trader` existe e **não** foi usado | listagem de diretórios; nenhuma leitura de conteúdo |
| Remotos | `origin` = `https://github.com/ori-inonu/inonu-trader.git`, `upstream` = `https://github.com/jarrodwatts/jev-trader.git` | `git remote -v` |
| Checkout principal | branch `feature/jev-command-center` @ `055a637`, ancestral de `main`; 28 arquivos rastreados modificados, 1 removido e 76 não rastreados, de terceiros | `git status` |
| Baseline do inventário | `main` @ `14cbb7b` (worktree `jev-trader-main`, limpa); 138 à frente e 0 atrás de `origin/main` e de `upstream/main`; nada foi enviado | `git rev-list --left-right --count` |
| Instruções locais | `CLAUDE.md` (Bun; mensagem central do demo), `web/AGENTS.md` (Next.js 16 com mudanças incompatíveis; ler `node_modules/next/dist/docs` antes de código web), `CONTRIBUTING.md` (um branch por mudança, fixtures descritas como sintéticas, sem credenciais nem saldos pessoais no diff), `.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc` | leitura dos arquivos |
| Modelo desta sessão | `claude-sonnet-5-5`, esforço `xhigh`, modo de permissão `auto` | `get_session` da própria sessão, não por suposição |
| SDD existente | Não há `requirements.md`, `design.md` nem `tasks.md` em `main`. As especificações vivem em 54 arquivos de `docs/` e 13 pastas `docs/okx-*-v1`. Por isso esta pasta é criada. | `git ls-files` |

## 2. Trabalho concorrente e colisões

### 2.1 Sessões do Codex citadas (revalidadas em 2026-10-11 por volta das 21:03, horário -0300)

Método: horário da última escrita do arquivo de sessão em `~/.codex/sessions`, `cwd` do cabeçalho de cada sessão (único metadado lido; a conversa não foi lida), processos `codex.exe` e arquivos recentes por worktree. **A associação entre sessão e worktree é inferida de horários e caminhos e não foi confirmada.**

| Sessão | Tema declarado | Evidência | Estado | Zona provável |
| --- | --- | --- | --- | --- |
| `01a12b5f-ca2a-7ff1-a131-07933705d3e8` | relatório móvel offline | arquivo de sessão escrito segundos antes da medição; `src/mobile-decision-report/` e `docs/mobile-decision-report/` escritos 8 a 9 min antes, na worktree `okx-real-integration` | **ATIVA** | `src/mobile-decision-report/**`, `docs/mobile-decision-report/**` |
| `01a12971-f941-7e42-8a42-fab6d44d4eb5` | integração geral JEV/OKX | última escrita 20:55; o app-server do Codex foi reiniciado às 20:55:58 | sem escrita há cerca de 8 min; **não confirmada** (provavelmente interrompida pelo reinício) | worktree `okx-real-integration`, integração de `src/server.ts` e `web/src/app/page.tsx` |
| `01a121f0-093b-78e0-84f7-c9e0fde3a499` | catálogo OKX e replay/backtest | última escrita 20:55; `docs/research/R6-*` editado no checkout principal 31 min antes da medição | idem | `src/onchainos/**`, `docs/research/**`, descoberta de arquivos históricos (não rastreada) |
| `01a1216a-c46b-72f3-b3dc-24c79470308d` | evidências e alegações financeiras | última escrita 20:55; `web/src/components/Rail`, `SystemOne`, `app/layout.tsx` editados no checkout principal 17 min antes | idem | cópia financeira da UI, `src/okx-evidence/**` |

Tratamento: as quatro zonas ficam **reservadas**. Sessões do Claude existentes (`Gev interface redesign`, `Completar branches e objetivos SDD`, `GEV integração OKX Wallet`) estão ociosas desde 12:30Z, 11:44Z e 11:43Z.

### 2.2 Worktrees e o que cada uma contém (medido às 21:03)

| Worktree | HEAD | Alterações não commitadas | Última escrita | Conteúdo relevante |
| --- | --- | --- | --- | --- |
| `jev-trader` (principal) | `feature/jev-command-center` @ `055a637` | 29 rastreadas, 1 removido, 76 não rastreadas | 17 min | `src/okx-wallet/valuation-diagnostics.ts` e teste (233 + 339 linhas, parados desde 14:52), `docs/okx-portfolio-v1/*`, `src/onchainos/archive-discovery.ts`, cópia financeira de `web/src/components/*` |
| `okx-real-integration` | desanexado @ `055a637` | 21 rastreadas, 53 não rastreadas | 8 min | `src/real/**`, `src/mobile-decision-report/**`, `docs/real-integration/**`, `web/src/lib/wallet-store.ts`, `real-pipeline*.ts`, `useOkxWallet.ts` e `okx-wallet.ts` modificados |
| `inonu-jev-tape-data-f1-f4` | `codex/inonu-jev-tape-data-f1-f4` @ `14cbb7b` | 8 rastreadas (`src/jev-read/*`), 12 documentos | 10 min | edição concorrente do produtor do Jev (`feed`, `loop`, `state`, `types`) |
| `inonu-jev-read-safety-f5-f6` | `codex/inonu-jev-read-safety-f5-f6` @ `14cbb7b` | 16 documentos | cerca de 18:35 | pesquisa de autoridade da carteira, matriz de pagamentos, segurança do `jev-read` |
| `inonu-system-one-safety` | `codex/inonu-system-one-safety` @ `1f08e6e` (contida em `main`) | 98 documentos | 17:33 | revisões e checkpoints |
| `gev-wallet-pilot`, `gev-wallet-pilot-ui` | desanexadas @ `f626a30` | 9 e 5 itens (`src/pilot/**`, `scripts/gev-wallet-pilot*`) | 16:26 e 15:05 | piloto de carteira, com checkpoint final |
| `jev-trader-r8` | `feature/okx-operator-r8` @ `bd8f78a` | 16 rastreadas (`src/operator/**`, `scripts/okx-operator.ts`) | 08:43 | edições do operador sem dono identificado |
| `jev-trader-main` | `main` @ `14cbb7b` | nenhuma | n/a | fonte do inventário |
| `jev-trader-desk` | `docs/sdd-carteira-evidencia` (criada para esta pasta) | esta pasta | agora | trabalho deste objetivo |
| `jev-panel-integration`, `jev-trader-jev`, `.claude/worktrees/agent-*` (2) | contidas em `main` | nenhuma | ociosas | candidatas a remoção, sem ação aqui |

### 2.3 Verificação antes de editar (RQ-20)

Antes de qualquer edição fora de diretório novo, repetir:

```bash
git worktree list
for w in $(git worktree list --porcelain | sed -n 's/^worktree //p'); do
  (cd "$w" && echo "== $w" && git status --short -- <caminho-a-editar>)
done
```

Se algum caminho aparecer modificado em outra árvore, o arquivo é de outro responsável: criar arquivo novo ou pedir a integração.

### 2.4 Zonas reservadas e zonas livres

| Zona | Caminhos | Responsável atual | Regra |
| --- | --- | --- | --- |
| Z1 | `src/jev-read/**`, `scripts/jev-read.ts`, `src/server.ts` | worktrees `inonu-jev-tape-data-f1-f4` e `inonu-jev-read-safety-f5-f6` | não editar; copiar padrões por leitura |
| Z2 | `src/mobile-decision-report/**`, `docs/mobile-decision-report/**` | `01a12b5f` | não editar; integrar por adaptador depois da entrega |
| Z3 | `src/real/**`, `scripts/real-*.ts`, `docs/real-integration/**`, `web/src/lib/okx-wallet.ts`, `useOkxWallet.ts`, `wallet-store.ts`, `real-pipeline*.ts`, `web/src/app/page.tsx` | `okx-real-integration` (`01a12971`, provável) | não editar; ler só por tipos exportados |
| Z4 | `src/okx-wallet/valuation-diagnostics*`, `docs/okx-portfolio-v1/*` | sem dono confirmado (decisão D4) | só leitura; contrato estende o vocabulário |
| Z5 | `src/onchainos/**`, `docs/research/**` | `01a121f0` (provável) | não editar |
| Z6 | `web/src/components/{Rail,SystemOne,DecisionCenter,CommandCenter}`, `web/src/lib/presentation.ts`, `src/okx-evidence/**` | `01a1216a` (provável) | não editar; correções de cópia por tarefa dele |
| Z7 | `src/operator/**`, `scripts/okx-operator.ts` | `jev-trader-r8` (edições sem dono) | não editar |
| Z8 | `web/src/components/Desk/**`, `web/src/lib/mesa/**`, `web/src/lib/jev-read.ts` | esta sessão (entregues e integradas em `main`) | livre para correção (tarefa T-FIX-1) |
| **Livre** | `src/portfolio-evidence/**`, `src/portfolio-review/**`, `src/portfolio-report/**`, `web/src/lib/portfolio-evidence/**`, `docs/sdd/carteira-evidencia/**` | quem executar cada objetivo | diretórios novos, sem colisão |

## 3. Estado real por área

### 3.1 Carteira e portfólio

Há **apenas um instantâneo de saldo ativo**, em duas vias independentes (inventário do backend pela API de saldos e leitura direta por RPC no navegador). Não há histórico de operações, PnL, custo de aquisição, posições DeFi do usuário nem comparação entre total e soma.

| Módulo | Comportamento verificado | Estado | Testes |
| --- | --- | --- | --- |
| `src/okx-wallet/portfolio.ts` | Cliente assinado de saldos e `totalValue` (`:136-209`), validação de schema (`:99-128`), `normalizeInventory` (`:260-309`) e `syntheticInventory` (`:312`). Uso live só em `scripts/okx-operator.ts:167-171`, com credenciais. | IMPLEMENTADO para saldos; PARCIAL para dinheiro (`Number`, sem decimais) | `portfolio.test.ts` 8, `valuation.test.ts` 13 |
| `src/okx-wallet/chains.ts` | Registro de 13 redes (`:23-37`) e validação sintática de endereço por família (`:64-82`). | IMPLEMENTADO | só via `portfolio.test.ts` |
| `src/operator/cycle.ts`, `candidates.ts`, `risk-gate.ts` | `reconcileRealizedUsd` (`cycle.ts:104-145`); gates de inventário (`risk-gate.ts:42-50`). | IMPLEMENTADO, com os defeitos de §5 | `result.test.ts` 8, `operator.test.ts` 21 |
| `src/onchainos/values.ts` | Leitores estritos; `readDecimal` devolve `Number` (`:68-72`) e `DecimalText` é só alias (`:48`). Não é usado pelo inventário (`portfolio.ts:254` tem parser próprio). | IMPLEMENTADO, não reutilizável para valor exato | `values.test.ts` 16 |
| `src/paper-capital.ts` | Átomos BigInt; ativo = chain + token + decimals + venue (`:2-7`); rotulado `synthetic-paper` (`:83`). Padrão de aritmética exata, mas conta de papel. | IMPLEMENTADO | 27 |
| `web/src/lib/okx-wallet.ts`, `useOkxWallet.ts`, `components/WalletPanel` | Sessão EIP-1193; lê MON e USDC na Monad e OKB e 5 tokens na X Layer num mesmo bloco, com `formatUnits` em BigInt (`okx-wallet.ts:155-160`); contratos fixos no código (`:81-88`). | IMPLEMENTADO, cobertura limitada (declarada em `WalletPanel.tsx:147-150`) | `okx-wallet.test.ts` 34 |
| `web/src/lib/evm-multichain.ts`, `components/MultichainPanel` | 8 redes EVM, nativo e 1 a 4 stablecoins por RPC público; confere `chainId` (`:123`); falha vira "erro", nunca zero (`:61`, `:132-136`). | IMPLEMENTADO (lista fixa, sem descoberta de tokens) | 4 |
| `web/src/lib/okx-solana.ts` | SOL, USDC, USDT por RPC público; soma contas de token em BigInt (`:133-141`); rejeita decimais divergentes (`:139`); registra o slot (`:144`). | IMPLEMENTADO, limitado | 5 |
| `web/src/lib/wallet-freshness.ts` | fresh/stale/unknown com limite de 60 s (`:1`, `:26-39`); só o `WalletPanel` usa. | IMPLEMENTADO | 3 |
| `docs/okx-portfolio-v1/` | Pesquisa de documentação pública; `draft_comparison_not_approved` (`CONTRACT-COMPARISON.json:3`). Nenhum código lê histórico de transações nem posições DeFi do usuário. | SÓ ESPECIFICADO | nenhum |
| `src/okx-wallet/valuation-diagnostics.ts` (**não commitado**, checkout principal) | Diagnóstico de uma captura de saldos: identidade `chainIndex`+contrato, `unit` e `scale` desconhecidos, `coverage: partial_unverified`, `capturedAtMs` separado de `providerPriceAsOfMs`, `actualRiskFilter: unknown`, valores derivados sempre `null`, hash da captura. 233 linhas, 339 de teste, parado desde 14:52. Spec em `docs/okx-portfolio-v1/VALUATION-DIAGNOSTICS-SPEC.md` (também não commitado). | IMPLEMENTADO localmente, sem commit; fora de `main` | local |

**Contrato de evidência hoje, linha por linha** (cada item com a prova que o inventário encontrou):

| Conceito | Estado | Prova |
| --- | --- | --- |
| Identidade rede + contrato | PARCIAL | `InventoryAsset` tem `chainIndex` e `tokenContractAddress`, vazio para nativo (`portfolio.ts:213-218`, `:288`), guardado como recebido; a caixa só é normalizada em comparações (`src/operator/candidates.ts:101-103`, `risk-gate.ts:32-35`); duplicatas não são rejeitadas (`valuation.test.ts:54`, `:133` somam identidades iguais). A UI chaveia por nome de campo (`okx-wallet.ts:26-44`). |
| Quantidade exata | PARCIAL | `balanceText` preservado (`portfolio.ts:221`), mas o cálculo usa `Number` (`:254-258`, `:286`, `:296`, `:305`); `rawBalance` e decimais descartados (`:289-292`). |
| Dois tempos | PARCIAL | só captura local (`portfolio.ts:244`, `okx-operator.ts:171`); posição na origem como bloco ou slot nas leituras web (`okx-wallet.ts:490`, `okx-solana.ts:144`). Sem horário da fonte. |
| Fonte, versão, cobertura, filtros | PARCIAL | `source`, `queriedChains`, `riskTokensExcluded` registrados (`portfolio.ts:245-251`); sem versão de schema, sem endpoint, sem cobertura por rede. |
| Saldo, histórico, PnL, custo | PARCIAL | saldo implementado; histórico só especificado; custo ausente; PnL deliberadamente não afirmado (`operator/types.ts:153-154`, `src/operator/cycle.ts:187`); `totalValue()` sem chamador (`portfolio.ts:197`). |
| Estados explícitos | PARCIAL | ausente: `null` + `valueComplete=false` (`portfolio.ts:223`, `:295`); vencido só no `WalletPanel`; divergente só rede errada (`evm-multichain.ts:123`); `reconciliation_required` cobre resultado de execução, não inventário (`ledger.ts:25`, `:161`). |
| Aritmética segura | PARCIAL | `docs/WALLET-FINITE-VALUATION.md:21` admite que valores finitos não garantem decimais exatos. Exato: leitura web, delta de quantidade (`src/operator/cycle.ts:82-97`), `paper-capital`. Nenhum identificador de WIN, BRL ou WDO no código. |

**Casos de aceitação, com o que existe:** (a) omissão por filtro: só `result.test.ts:52`, e a UI mostra "cobertura completa" ignorando `riskTokensExcluded` (`DecisionCenter.tsx:184`); (b) quantidade histórica com valor zero: sem código nem teste, e o oposto é afirmado (`valuation.test.ts:82-90`); (c) PnL não somado: separado por construção, sem teste; (d) total contra soma: ausente; (e) duplicidade só na conciliação (`result.test.ts:63`, `:70`), rede errada testada (`evm-multichain.test.ts:31-35`, `portfolio.test.ts:55-60`), decimais distintos sem teste (o guard de `okx-solana.ts:139` nunca é exercitado), fora de ordem só em `reconcile` e corridas de sessão; (f) sintético: `source: "synthetic"` (`portfolio.ts:245`, `:318`), rótulo de UI em `DecisionCenter.tsx:77-78`, mas o endereço de teste `0xEd0C…4312` aparece sem rótulo em 3 arquivos e alguns testes marcam dado falso como `okx_balance_api` (`portfolio.test.ts:98`).

**Restrições de privacidade que o contrato herda:** `docs/OKX-SPEC.md:11` (O5): sem semente, chave ou credencial no cliente; endereço e saldos não persistidos nem enviados ao backend, analytics ou logs; valores de teste fictícios. `docs/WALLET-OPPORTUNITIES-SPEC.md:25` (W1) e `:31` (W7): sem persistência; conta não enviada ao Jev; saldo não ligado ao executor. As leituras por RPC público já enviam o endereço e o IP a terceiros (declarado em `MultichainPanel.tsx:41`), então "leitura local" não significa "sem rede".

### 3.2 Provedores de dados e captura

**Nenhuma chamada autenticada à OnchainOS jamais foi feita** (`docs/OKX-ONCHAINOS-DADOS-SPEC.md:375`). As credenciais Web3 estavam ausentes em todos os escopos do Windows em 2026-10-09 (`docs/okx-market-v1/OKX-CONFIGURATION-READINESS.md:10`) e nesta conferência não existe `data/onchainos.env` nem variável `OKX_*` em nenhum `.env` do projeto (verificado só por nome). Todo módulo assinado está, portanto, BLOQUEADO para uso real.

| Módulo | Família de API e credencial | Comportamento verificado e estado | Proveniência e limite de taxa |
| --- | --- | --- | --- |
| `src/onchainos/http.ts`, `errors.ts`, `read.ts`, `paging.ts` | OnchainOS v6, assinada por HMAC (`http.ts:119`) | IMPLEMENTADO. Offline sem credencial e sem `allowNetwork` (`:382`, `:524`); só repete em 429 e 5xx. 50 testes. | `ReadMeta` com fonte, endpoint, tier, status, tentativas, `requestedAtMs`, `receivedAtMs` (`:55-66`). Padrão de 1 req/s, máximo 10 (`:142`, `:483`); contadores de cota por tier. |
| `src/onchainos/endpoints.ts` | registro | 44 entradas (preço, token, sinais, social, gateway, DeFi, public-okx). `limitPer2s` e `maxItems` são só documentação. **Nenhuma entrada de saldo, portfólio, histórico ou PnL**, e `isolation.test.ts:38-41` proíbe `/dex/balance`, `/dex/market/portfolio`, `/address-tracker`, `/post-transaction` e `/defi/user` dentro de `src/onchainos`. | tier `unknown` para social, gateway e DeFi, então o custo de cota é desconhecido |
| `market-price.ts` | v6 assinada | IMPLEMENTADO. É a única família ligada a uma CLI (`scripts/onchainos-capture.ts:157`); nunca rodou ao vivo. | moeda de preço não declarada (`:99`, `:112-115`) |
| `market-token.ts`, `signals.ts`, `social.ts`, `gateway.ts`, `defi-read.ts` | v6 assinada | IMPLEMENTADOS só como biblioteca e testes; nenhum chamador de produção. Forma do corpo de sinais não verificada (`signals.ts:5-8`). | unidades são aliases de tipo apagados em execução (`values.ts:21-48`) |
| `src/onchainos/public-okx.ts` | Exchange v5 pública, sem chave | IMPLEMENTADO. Lista de caminhos permitidos (`:42`), máximo 5 req/s (`:44`); usado pela CLI de captura e pelo System One (`scripts/system-one.ts:92`). | texto decimal exato; horário de origem nas linhas (`tsMs`); tier `public` |
| `src/onchainos/capture.ts`, `src/onchainos/capture-sources.ts`, `src/onchainos/capture-types.ts` | gravador sobre as duas fontes | IMPLEMENTADO: épocas atômicas e retomáveis (`src/onchainos/capture.ts:18-21`); fontes só `public-okx` e `onchainos`. | `t` é o recebimento local; o manifesto tem schema, fonte e configuração (`:265-274`); os registros são `{t,kind,inst,data}` como números JS e **não carregam fonte, unidade nem horário de origem** (`src/lab/capture-format.ts:13`, `:29-45`) |
| `fixtures.ts`, `fakes.ts` | só teste | `provenance` doc-example, live-keyless ou synthetic (`fixtures.ts:14`); corpos live-keyless são dados reais de 2026-10-11. **Risco de engano:** o manifesto grava só `source.id`, então uma captura feita sobre `fetch` falso é indistinguível de uma real. | relógio de teste 1,7e12 e credenciais canário (`fakes.ts:18`, `:128-131`) |
| `src/okx-api.ts`, `src/okx-market/{okx-api,okx-dex}.ts`, `src/okx-signals/client.ts` | v6 assinada, **clientes duplicados escritos à mão** | IMPLEMENTADOS, nunca ao vivo; `fetch` global; porta `allowLiveRequests` só em `src/okx-api.ts` (`:230-233`); limitador só em `okx-dex` (`:8`). | `okx-scan` deriva a fonte da marca do cliente (`okx-scan.ts:69-70`), mas `okx-signals/report.ts:87,97` copia um `source` informado pelo chamador, então uma fixture pode ser rotulada `okx_authenticated` |
| `src/okx-defi`, `src/okx-derivatives` | avaliadores offline sobre JSON importado | IMPLEMENTADOS, sem rede. | `sourceClaim` autodeclarado (`okx-defi/report.ts:67`, `okx-derivatives/types.ts:8`); `providerTimestampMs:null` no DeFi (`:130`); fixtures inventadas (`okx-defi/fixture.ts:1`) |
| `src/public-market-capture` | WS e REST públicos | **BLOQUEADO**: a evidência do adaptador é "unknown" e ele sempre lança (`node-adapter.ts:11-15`). | o envelope mais rico do projeto: hash bruto, recibo, intervalo de obtenção, horário do evento, segmento, validade do recibo de acesso |
| `src/jev-read/feed.ts`, `web/src/lib/desk` | WS e REST públicos, sem chave | IMPLEMENTADOS. REST da mesa espaçado em 300 ms com resfriamento de 429 (`okx-rest.ts:121-162`). Os ids de feed "okx-wallet" e "onchainos" estão declarados (`types.ts:17-18`), mas **não existe cliente de navegador para `web3.okx.com`**. | selos de recebimento local; desvio de relógio por ponto médio |
| `web/src/lib/evm-multichain.ts`, `okx-solana.ts` | RPC público | saldos por JSON-RPC no navegador; erro continua erro, nunca zero (`evm-multichain.ts:5`, `:61`). | carrega bloco e `observedAtMs` (`:58-72`); decimais de token e de nativo fixos (`:25+`, `:139`) |

**Conceitos do contrato de evidência já carregados por alguma camada de dados:**

| Conceito | O que existe | O que falta |
| --- | --- | --- |
| Identidade rede + contrato | `TokenRef` e `tokenKey` (`values.ts:225-239`); linhas de preço devem casar com o pedido (`market-price.ts:199-203`); erro tipado de divergência (`okx-market/okx-api.ts:22-41`). O inventário guarda cadeia, contrato e "" para nativo, mas mantém o endereço literal (`portfolio.ts:291`). | no formato de captura a identidade vive só no manifesto (`capture-sources.ts:385`) |
| Decimais e unidade | o ativo bruto tem `balance` e `rawBalance` sem decimais (`portfolio.ts:56-66`); só as linhas de metadados de token carregam `decimals` (`market-token.ts:134`, `:148`); campos de unidade em execução só no relatório DeFi (`:25-26`) e em `outputUnit` (`round-trip.ts:40`) | nada confere `balance` contra `rawBalance` ou `decimals` |
| Captura contra origem | `ReadMeta` (`http.ts:63-65`) de um lado; horário de origem só dentro de valores de linha (`public-okx.ts`, `tsMs`); sinais comparam `triggeredAtMs` com `observedAtMs` (`okx-signals/report.ts:107-109`) | o inventário só tem `observedAtMs` (`portfolio.ts:244`) |
| Fonte, versão, cobertura, filtros | `ReadMeta.source`, manifesto, strings de schema nos relatórios; `queriedChains`, `missing`, `truncated`, `partial_unverified`; `riskTokensExcluded` | versão de schema em `ReadMeta` e no inventário; a query é descartada de propósito do meta e dos erros |
| Vencido, ausente, divergente | frescor em `okx-signals/report.ts:108`, `okx-defi/report.ts:129`, `okx-derivatives/freshness.ts:7`, `wallet-freshness.ts:4`; convenção `null` (`values.ts:6-9`) | o inventário do backend não tem frescor; **não existe estado entre fontes** (saldo OKX contra RPC) |

**Barreiras de unidade.** Dura: `outputUnit:'unknown'` na ida e volta da DEX (`round-trip.ts:40,110`), parada incondicional (`:161-162`), motivo `provider_output_unit_unverified`, sem bypass (`docs/okx-dex-v2/OKX-DEX-V2-GUIDE.md`). O que impede levantá-la: a página da OKX não declara a unidade de `toTokenAmount` e o SDK só repassa (`docs/okx-dex-sdk-units-v1/RESEARCH.md:27`); exige declaração oficial ou conversão verificada e uma observação autenticada autorizada à parte, e as credenciais não existem. Brecha suave que contradiz a barreira: `OPERATOR_TRUST_QUOTE_UNITS` e `OPERATOR_TRUST_BRIDGE_API`, padrão `false` (`operator/config.ts:166-167`). Para saldos: `balance` não tem unidade declarada e `rawBalance` pode vir vazio (`docs/research/R6-onchain-os-catalogo.json:3058`).

**Endpoints de saldo, portfólio, histórico e PnL:** nenhum está no registro. O catálogo R6 lista `balance.*` (`:3005-3071`), `history.*` (`:3091-3111`), `market.portfolio.*` (`:4024-4104`) e `defi.user.*` (`:3395`). Só `balance.total-value` e `balance.all-token-balances` têm cliente (`src/okx-wallet/portfolio.ts:18-19`); `allTokenBalances` é chamado uma vez, em `scripts/okx-operator.ts:169`, e `totalValue()` não tem chamador fora de teste. Token-balances-by-address, transactions-by-address, transaction-detail, portfolio PnL e address-tracker não são chamados em lugar nenhum.

**Discrepâncias entre documento e código nesta área** (entram em DF-11): `docs/OKX-HISTORICAL-ARCHIVES.md` não existe em `main`; a alegação de "sem env e sem fetch global" (`OKX-ONCHAINOS-DADOS-SPEC.md:10`) vale só para `src/onchainos` (cinco outros clientes usam `fetch` global); `:392-401` chama de "sugeridos" os scripts que já estão em `package.json:29-30`; `okx-market-v1/OKX-WEB3-INTEGRATION.md` diz que sinais e portfólio não estão implementados, mas existem; limites por endpoint listados e nunca impostos; dois clientes OnchainOS duplicados e dois scanners; `balance.*` cobertos por `portfolio.ts` em 2 de 5 ids.

### 3.3 JEV e módulos de decisão

| Módulo | Pergunta e entrada sanitizada | O que pode virar ação | Real contra mock | Estado | Testes |
| --- | --- | --- | --- | --- | --- |
| `src/model.ts`, `src/trader.ts` (mandato Kuru) | "Postar compra, venda ou manter?" (`model.ts:56`); livro, profundidade, retornos, negócios, `allowed` (`model.ts:9-27`) | `validateDecision` (`model.ts:43`), depois confiança mínima e risco; prazo perdido para o trader (`trader.ts:229-264`) | `JevModel` real (`:76`); `MockModel` chama-se "mock" (`:92`), rótulo na sessão (`trader.ts:148`) | IMPLEMENTADO em papel; live BLOQUEADO (`market.ts:104`) | 30 |
| Operador (`src/operator/*`) | "Qual candidato, ou manter?" (`jev-selector.ts:154`); resumo do inventário e só candidatos aprovados no gate (`jev-selector.ts:13-29`, `src/operator/cycle.ts:169-170`) | chaves exatas: manter mais ids elegíveis, pesos 0..1 somando 1±0,02 (`jev-selector.ts:74-96`); falha deixa decisão nula e execução bloqueada | `JevOperatorModel` (`:161`); mock rotulado (`:167`); o executor recusa "mock" (`executor.ts:131`) | PARCIAL: simulação pronta, só `dex_round_trip` pode ir live (`src/operator/plan.ts:16`), cotações de ida e volta são pesquisa até `OPERATOR_TRUST_QUOTE_UNITS` | 95 |
| System One (`src/system-one/*`) | "Qual alavancagem, ou manter?" (`src/system-one/decide.ts:185`); capital, valor conhecido, completo, aberto e limites, sem endereço nem horário (`src/system-one/decide.ts:16-89`) | tudo fora da lista vira manter com status (`src/system-one/decide.ts:109-148`); termina só `dry_run` ou `blocked` (`src/system-one/cycle.ts:86`) | `JevSystemOneModel` (`:194`); mock rotulado (`:204`) | **BLOQUEADO por evidência de carteira**: a carteira `--public` é `configuredWallet` com `valueComplete=false` (`readings.ts:151-160`), o que dá `inventory_value_incomplete` (`brief.ts:88`) e o Jev nem é perguntado. Nenhum código mapeia `InventorySnapshot` para `WalletReading`; `"okx_balance_api"` existe só como tipo (`src/system-one/types.ts:51`). | 67 |
| `src/jev-read` | Comprar, vender ou manter em 5 min num par à vista, só números da fita (`src/jev-read/types.ts:62-88`, `src/jev-read/decide.ts:70`, `:106`); sem carteira | só as três ações, senão manter com status (`src/jev-read/decide.ts:30-63`); sem modelo em dado velho (`state.ts:82-103`); registro fixo `advisory:true, execution:"never"` | `JevTapeModel` real; sem mock de produção; `--observe` sem modelo | IMPLEMENTADO, consultivo. **Zona Z1: em edição concorrente.** | 106 |
| Laboratório (`src/lab/*`) | escolher candidato ou manter por época, chaves opacas (`policies.ts:160-173`) | `validateChooserAnswer` (`policies.ts:205-239`); ler o futuro lança `LeakError` | a CLI usa sempre `MockJevChooser`; saída traz `MOCK_WARNING` | IMPLEMENTADO em sintético e mock; replay BLOQUEADO por falta de dado (≥ 90 dias, `stats.ts:47`) | cerca de 332 |
| `src/policy/envelope.ts` | sem chamada ao Jev; calculadora determinística de limites por fase, nunca promove sozinha (`:1-22`, `:401`) | alimenta a elegibilidade (`brief.ts:14`) | n/a | IMPLEMENTADO | 92 |

**O que o JEV recebe hoje sobre a carteira, e o que falta para uma revisão de carteira.** O operador recebe `knownValueUsd` (2 casas), um único `valueComplete` global, `observedAtMs` e, por rede, nome, valor, saldo nativo e **contagem** de ativos (`jev-selector.ts:36-43`); o System One recebe capital, valor conhecido, completo e posição aberta (`src/system-one/decide.ts:61-67`); jev-read e laboratório não recebem carteira. Falta, e existe em `InventoryAsset` mas é descartado antes do prompt: símbolo, quantidade, preço, valor e peso por ativo; `valueComplete` por rede; redes consultadas contra redes vazias; origem sintética ou live; sinalização de token de risco; contratos; posições DeFi e de staking (`docs/OKX-OPERADOR-JEV.md:12`); custo de aquisição, PnL e histórico de valor; estado do ledger; alocação alvo, mandato, tolerância a risco, necessidade de liquidez, concentração, taxas e impostos; decisões anteriores. A pergunta atual também não é uma revisão: pergunta qual candidato receber capital (`jev-selector.ts:155`).

**Persistência e rastreabilidade das decisões.** Kuru: `data/session.jsonl` e `data/events.jsonl` sem versão (`trader.ts:612-616`, `:642`), o estado enviado não é registrado. Operador: `data/operator/latest.json` (arquivo temporário e renomeação) e `cycles.jsonl` (`src/operator/cycle.ts:219-227`); `OperatorCycle` não tem `schemaVersion` (`src/operator/types.ts:161-177`); `cycleId` é o início de um sha256 sobre início, endereço e ids (`src/operator/cycle.ts:163`), não um hash de conteúdo; `quoteHash`, `idempotencyKey`/`planId` e `txHash` encadeiam cotação, plano e perna (`src/operator/candidates.ts:121`, `src/operator/plan.ts:46-58`, `executor.ts:214`); sem prompt, versão de código, id de requisição nem modelo fixado (`jev-latest` é alias, `src/operator/config.ts:53`). System One: `schemaVersion` 1 (`src/system-one/types.ts:13`), brief completo guardado, `cycleId` aleatório (`src/system-one/cycle.ts:28`). jev-read: `schemaVersion` 1, `readId` com uuid (`src/jev-read/read.ts:33`), rotação a 20 MB (`src/jev-read/store.ts:58-65`). Laboratório: a melhor rastreabilidade (`jev-lab-journal-v1`, manifesto, sha256 da captura, `journal.ts:60,91`), mas só sintético. **Não existe id de correlação entre sistemas.**

**Fronteira entre uma resposta do Jev e a assinatura.** O único caminho capaz de assinar é o executor do operador, atrás de nove camadas em ordem: gate de candidatos antes de perguntar ao Jev (`risk-gate.ts:37-83`); resposta tem de ser um id existente (`jev-selector.ts:74`); plano exige `OPERATOR_EXECUTE`, `OPERATOR_LIVE_ACK`, modelo real, signer e tipo executável (`src/operator/plan.ts:50-51`); `executePlan` revalida e recusa "mock" (`executor.ts:117-140`); só `dex_round_trip` EVM (`:147`, `:157-158`); ledger com idempotência, tetos diários, resfriamento e chave de parada (`ledger.ts:146-164`); listas de roteador, spender e seletor (`executor.ts:94-109`); chave de parada e validade reconferidas antes de cada envio, com simulação `eth_call` (`:196-204`, `:227`, `:259`); signer só existe com portão live e ledger prontos (`scripts/okx-operator.ts:190`). Nenhum import de operador, signer ou ethers em `system-one`, `jev-read`, `lab` ou `policy`; só o laboratório tem teste que impõe isso (`purity.test.ts`), a afirmação de `docs/SYSTEM-ONE.md:34` não é imposta por teste.

### 3.4 Risco, política, ledger e portões de execução

| Módulo | Regra imposta (verificada) | Estado | Testes |
| --- | --- | --- | --- |
| `src/risk.ts`, `src/economics.ts` | livro-razão spot MON e filtro de custo de duas pernas de maker (`risk.ts:14-34`, `economics.ts:2-7`) | IMPLEMENTADO, específico de MON | 3 |
| `src/policy/envelope.ts` | tabela de fases congelada; ausente é desconhecido; `ok` não é permissão (`:11-13`, `:69-124`, `:401`); teto por ativo min(25%, DLL/2σ) e paradas em USD (`:443-463`) | IMPLEMENTADO como calculadora; não impõe nada | 92 |
| `src/operator/risk-gate.ts` | tamanho, fração de capital, custos completos, líquido, impacto, idade de cotação, reserva de gás; desconhecido bloqueia (`:37-81`). **Pula todas as checagens para `kuru_spot_maker`** (`:62`). | IMPLEMENTADO | `operator.test.ts:201-224` |
| `src/operator/ledger.ts` | chave de parada, idempotência, teto diário, resfriamento, paradas de perda e drawdown (`:146-164`); escrita atômica recusando symlink (`:237-268`); trava exclusiva (`:272`) | PARCIAL: as paradas de perda dependem de `recordRealized` (`:183`), que só testes chamam | 13 |
| `src/operator/executor.ts` | cadeia de portões acima | EVM de ida e volta IMPLEMENTADO; Solana BLOQUEADO (`:21`, `:157`) | cerca de 55 |
| `src/live-qualification.ts` | lista de evidências pura; `readyForOwnerReview` não é permissão (`:7-13`, `:261-265`) | IMPLEMENTADO | cerca de 95 |
| `src/paper-capital.ts`, `src/paper-supervisor*.ts` | átomos BigInt, parada por custo desconhecido (`:366-369`), `financiallyAuthorized:false` (`:46-49`); supervisor SQLite offline (`paper-supervisor-runner.ts:48-61`) | IMPLEMENTADO offline; 24 h e queda de energia não qualificados | cerca de 70 |
| `src/okx-derivatives/*` | taxa nula é desconhecida; margem isolada; execução BLOQUEADA (`adapter.ts:38`) | IMPLEMENTADO offline | cerca de 90 |
| `web/src/lib/central/*` | níveis de permissão T0 a T2 só como especificação (`permission-tiers.ts:12-16`); matemática de alavancagem de exibição | SÓ ESPECIFICADO (UI) | cerca de 110 |

Capacidades de assinar ou enviar, e portões: **operador EVM** (único live), condicionado por `--live`, credenciais, `OPERATOR_EXECUTE`, `OPERATOR_LIVE_ACK` exato, `OPERATOR_PRIVATE_KEY`, modelo real, ledger inicializado e trava de processo, mais as camadas acima; **Kuru `Market`**: com carteira e `DRY_RUN=false`, `init()` sempre lança (`market.ts:104`), então assinatura, depósito e aprovação (`market.ts:159,225,327,348`) são inalcançáveis; **signer Solana** sem chamador fora de teste; scripts de chaves descartáveis (`dry-encode.ts` assina sem enviar; `trace-rpc.ts:94` e `probe-book2.ts:12` postam transações brutas, só manuais); **web**: sem código de assinatura.

**Para uma carteira gerida à mão, o que é reutilizável e o que não é.** Funções puras reutilizáveis: teto por ativo e paradas do envelope (`envelope.ts:443-463`), `normalizeInventory` (que marca ativo sem preço como incompleto, `portfolio.ts:295`), `walkDepth` e `slippagePpm` (`okx-derivatives/book.ts:16,40`), `reconcileRealizedUsd` (`src/operator/cycle.ts:104`), drawdown (`src/backtest.ts:161-186`), filtros de liquidez e de token de risco (`okx-market/okx-opportunities.ts:61,75-78`). Acopladas à execução: paradas do ledger, `risk-gate`, `SpotLedger`, `PaperCapital` (ativo único). **Ausentes**: concentração de portfólio (só concentração de detentores de um token, `src/okx-opportunities.ts:239` (arquivo legado) e `src/okx-market/okx-opportunities.ts:77`), parada por posição, correlação; `checkSettings` testa notional diário, não posições (`envelope.ts:633-642`).

**Suposições de outros mercados que não devem ser reaproveitadas às cegas:** nada de WIN/BRL no código (só uma amostra "R$ 400", `envelope.test.ts:483`, e o texto de Pix em `README.md:38`). Mandato Kuru MON/USDC: `risk.ts:3,10`, `economics.ts:2-7`, `config.ts:31-37,62-64` (tamanhos em MON), `market.ts:107`, `risk-gate.ts:62`, `src/operator/candidates.ts:236-253`, `live-qualification.ts:23-45`, `web/src/lib/central/phases.ts:52-57` (σ do MON). Ida e volta de stable para nativo: `src/operator/candidates.ts:26-36` e `:134-140` (dimensionamento a 90%), banda de preço 0,97 a 1,03 que rejeita base não estável (`risk-gate.ts:62-65`), pontes avaliadas a US$ 1 (`src/operator/candidates.ts:211`), tokens de risco excluídos e ativos sem preço saindo do denominador da fração de capital (`okx-operator.ts:170-171`, `risk-gate.ts:69`). Alavancagem e perpétuos: `envelope.ts:24-124,254-325`, `okx-derivatives/margin.ts:16` (125x), `carry.ts:14`. Inconsistência interna: teto por ordem de 1%/2% (`envelope.ts:94,112`) contra 10%/5% (`web/src/lib/central/phases.ts:30`) contra 5% do perfil micro (`operator/config.ts:14`).

**Custos: onde são conhecidos, desconhecidos ou zero em silêncio.** Kuru: gás em MON (`market.ts:218,384`), taxa de maker padrão 0 conferida on-chain (`src/config.ts:64`), gás de recibo desconhecido vira `null` e para a execução (`trader.ts:452,479`). Operador, desconhecido que bloqueia: taxa de rede `null` torna o candidato incompleto (`src/operator/candidates.ts:161-162`, `risk-gate.ts:72-73`). Operador, **zero em silêncio**: `tradingFeeUsd` fixo em 0 para trocas e pontes (`src/operator/candidates.ts:162,212`), impacto de preço da ponte 0 (`:218`), e o executor soma gás nulo de recibo como 0 (`executor.ts:209`). Slippage fixo de 0,5% (`okx-operator.ts:193`) aplicado por `minReceive`. Spread: negócio de taker é modelado, maker é precificado no meio (`okx-derivatives/legs.ts:7-10`); DEX só tem impacto. Funding: modelado só em `okx-derivatives/funding.ts` (cenários, inclusive "zero", `:9`); o do operador só anualiza, com custo nulo (`operator/funding.ts:66,83`).

### 3.5 Avaliação, replay e evidência

| Módulo | Marcador real contra sintético; custos; estatística | Estado | Testes | Reprodutibilidade |
| --- | --- | --- | --- | --- |
| `src/backtest.ts`, `backtest-evidence.ts` | cabeçalho `dataSource` real-market-paper, synthetic ou live; `fill.simulated` deve casar (`src/backtest.ts:349`); saída `accounting-replay-only`, `strategyQualified:false` (`backtest-evidence.ts:16-18`); líquida de taxa de maker, gás estimado ou observado, custo do Jev; custo desconhecido lança (`:447`); só drawdown máximo | IMPLEMENTADO; manifesto de baselines e cenários só declara hashes e nunca executa (`backtest-evidence.ts:263-352`): PARCIAL | 43 | sha256 do journal e do motor (`scripts/backtest.ts:14-15`) |
| `scripts/capture.ts`, `trader.ts` | o trader grava `real-market-paper` sempre que não há carteira, mesmo com modelo mock (`trader.ts:148`); fills de papel são otimistas (`:522-535`); marcador de gás (`market.ts:26,272-285`) | PARCIAL; verificação estrita de recibo não integrada (`market.receipt.test.ts:3-9`) | 16 (+15 pulados) | resumo sem hash dos dados (`capture.ts:30`) |
| Laboratório | `SyntheticSource` ou `ReplaySource`; critério `dados-reais` reprova sintético e nunca passa (`stats.ts:736`); líquido de funding, taxa, spread, slippage e rendimento de caixa (`outcomes.ts:360-365`); custo desconhecido torna candidato inelegível (`:90`); Newey-West, t de Student, Holm, bootstrap em blocos (`stats.ts:181-807`) | IMPLEMENTADO em sintético; replay BLOQUEADO por dado (≥ 90 dias mais 3 de aquecimento, nenhuma captura no repositório); rendimento, DEX e Kuru sem geradores (`outcomes.ts:60-65`) | cerca de 332 | manifesto `jev-lab-manifest-v1`, runId por hash, semente fixa (`stats.ts:53`), relatório reconstruído só do journal |
| `src/okx-evidence/*` | junção por chain+contrato; toda linha `provenance:'unverified'` (`src/okx-evidence/report.ts:15-16`); sem líquido (`netReturnUsd:null`, `:17`, `:101`) | IMPLEMENTADO como junção. **Só `EvidenceError` e `joinEvidence` são exportados; todo tipo é local ao arquivo** | 11 | schema `okx_evidence_offline_v1` (`src/okx-evidence/report.ts:101`); hashes de entrada não registrados |
| Ida e volta DEX (`okx-market/round-trip.ts`, `synthetic-round-trip.ts`) | caminho real termina sempre `unknown`, líquido nulo, `net_not_evaluated` (`round-trip.ts:134,162`); só a fixture chega a `quoted_gross_delta`, com `source:'synthetic'` | PARCIAL; unidade de saída da DEX desconhecida | 24 | só determinismo |
| `src/okx-derivatives/report.ts`, `carry.ts` | `sourceClaim` synthetic ou operator_claimed; `externalAccessObserved:false`, `liveQualified:false` (`report.ts:243-246`); líquido exato em BigInt (`carry.ts:241`) | IMPLEMENTADO offline | 73 | `inputSha256` de JSON canônico (`report.ts:248`); schemas `okx_derivatives_input_v1`, `okx_derivatives_report_v1` |
| `src/paper-capital.ts`, `paper-supervisor*.ts` | sempre `synthetic-paper`; custo desconhecido trava a parada (`:366`); sem estatística | IMPLEMENTADO, não ligado ao trader nem ao operador | cerca de 70 | checkpoint sha256 e replay (`:394-420`), SQLite selado |
| `src/public-market-capture/*` | bytes públicos brutos; o adaptador recusa antes de qualquer saída (`node-adapter.ts:12-15,43`); `profitEvidence:false` | BLOQUEADO (runtime não qualificado) | 73 | sha256 por registro e segmento, manifesto v1 (`src/public-market-capture/store.ts:6,83`) |

**Taxonomia de resultado: não existe uma unificada.** Simulado: `fill.simulated` com `dataSource` (`src/backtest.ts:349`), `synthetic-paper`, `sourceClaim`. Projetado: só `hypothetical:true` (`round-trip.ts:12`); o identificador `projected` aparece só em documentos. Delta de inventário: `observedBalanceDeltaUsd` com `resultBasis:'inventory_only'` (`operator/types.ts:149-156`). Realizado: o operador força `realizedUsd:null` (`src/operator/cycle.ts:187`); `ledger.recordRealized` não tem chamador de produção (`ledger.ts:183`) e o replay lista `realized-gains-not-reconciled` (`backtest-evidence.ts:46`). `reconciliation` é só estado de perna do ledger (`ledger.ts:25`) e itens de `live-qualification.ts:1104-1130`. **Não existe replay de carteira** (posições ao longo do tempo): só replay de mercado (laboratório) e de um único livro caixa mais MON (`src/backtest.ts:179`); a história de carteira é uma série de `knownValueUsd` por ciclo (`insights.ts:109`) e um antes/depois de um plano (`src/operator/cycle.ts:104`).

**Vocabulário reaproveitável de `okx-evidence`** (hoje local ao arquivo, precisaria ser exportado): `Source`, `Freshness` e `freshness()`, `Identity`, `provenance:'unverified'`, `execution:'not_qualified'`, a lista de evidência pendente e números nulos como desconhecidos (`src/okx-evidence/report.ts:10-17,26`). É centrado em token, sem estado realizado/projetado, sem hashes e sem registro de versões. Vocabulário relacionado: `Provenance` e `CriterionStatus` do laboratório (`lab/types.ts:46,318`), `grantsPermission:false` (`:334`), `MetadataStatus` (`backtest-evidence.ts:4`), `JournalDataSource` (`src/backtest.ts:1`). Versões de schema em uso: `okx_evidence_offline_v1`, `jev-lab-*-v1`, `PaperCheckpoint` v1, `onchainos-capture-manifest-v1` (`onchainos/capture.ts:267`).

### 3.6 Relatórios e interface

Todos os relatórios são offline, e a única exportação é JSON em saída padrão ou arquivo de entrada. **Não há impressão, PDF, download nem compartilhamento** em `web/src`.

| Módulo | Evidência | Desconhecido, vencido ou fixture | Estado | Testes |
| --- | --- | --- | --- | --- |
| Visualizador do relatório DEX (único com UI) | `web/src/lib/dex-report.ts:168-248`, `dex-report-import.ts:32,97,141-162`, `DexReportPanel.tsx:70-90,139-143,215-217` | desconhecido mostra "Desconhecido"; líquido "Não avaliado"; arquivo limitado a 64 KiB; a idade é desde a importação, não da cotação; exemplo marcado (`dex-report-import.ts:117`); só em `app/console/page.tsx:169`, não na mesa | IMPLEMENTADO | 24 |
| `okx-defi`, `okx-signals`, `okx-evidence`, `okx-derivatives` | `*/report.ts`, scripts de CLI | nulos mais problema; frescor `unknown/future/fresh_local_capture/stale`; sempre "unverified" | IMPLEMENTADOS, só CLI | cerca de 70 |
| `operator/insights.ts` | `:14,42,77-85,142`; `DecisionCenter.tsx:284-294` | linhas malformadas puladas; não reconciliado contado como desconhecido; **sem filtro de fonte**: execuções sintéticas e live escrevem o mesmo journal (`scripts/okx-operator.ts:217`) | PARCIAL: médias sintéticas e live se misturam | 3 |
| Projeções públicas (`system-one/public-view.ts`, `jev-read/public-view.ts`) | allowlist; devolvem `null` se inconsistente; jev-read exige `advisory:true` e `execution:"never"` | modelo "mock" passa em System One | IMPLEMENTADAS | cerca de 50 |
| Mesa `/` | `web/src/components/Desk/MesaView.tsx`, `web/src/lib/mesa/mesa-model.ts` | "Indisponivel" ou "idade desconhecida" em vez de supor; abas em 820 px ou menos | IMPLEMENTADA | 89 |
| `/console`, `WalletPanel`, `MultichainPanel`, `GrowthDeck` | `web/src/app/console/page.tsx:121,159-169`, `web/src/components/WalletPanel/WalletPanel.tsx:61-73,147-150`, `web/src/components/MultichainPanel/MultichainPanel.tsx:29,41,61-64` | rótulos MOCK, sintético e "capital configurado, saldo não consultado"; saldos brutos por token, sem USD, alocação nem PnL; `GrowthDeck` é aritmética com "edge" definido pelo usuário, não relatório | IMPLEMENTADOS | cerca de 100 |
| Rota `/central` e construtor de registro de autorização | `docs/ARQUITETURA-CENTRAL-DE-OPERACOES.md:30,102`, `lib/central/authorization-record.ts` | não existe rota; nenhuma UI importa o construtor | SÓ ESPECIFICADO (UI) | só lib |

Respostas diretas: **não existe relatório de carteira** (posições, alocação, PnL, concentração): há relatórios de mercado e de decisão, saldos brutos e um inventário do operador com subtotal parcial em USD por rede (`DecisionCenter.tsx:184,271-279`). **Não há relatório móvel nem offline em `main`**: só o layout responsivo da mesa e o visualizador local do DEX; o relatório móvel está em desenvolvimento na worktree `okx-real-integration` (Z2).

**Política HTTP.** `/`, `/history` e `/events` usam CORS `*` sem token fora do preview (`src/server.ts:12,61-70`). `/operator`, `/system-one` e `/jev-read` usam allowlist de origem mais token opcional, só GET e OPTIONS, com leitura limitada a 2 MB. `/operator` serve o estado redigido sem projeção (`operator/http.ts:69`) e aceita requisição sem cabeçalho Origin (`:42`), enquanto `system-one` e `jev-read` devolvem 403 nesse caso. **O cliente web nunca envia `Authorization`** (`web/src/lib/jev-read.ts`, `system-one.ts`, `operator-center.ts`), então definir `OPERATOR_READ_TOKEN` quebra a interface, embora `docs/MESA-DE-OPERACOES.md:56` anuncie o token. O modo preview aceita só origens de loopback exatas e recusa métodos não GET.

### 3.7 Persistência (`data/` inteiro é ignorado pelo git, `.gitignore:3`)

| Dado | Escritor | Atômico | Versionado | Rotacionado |
| --- | --- | --- | --- | --- |
| `ledger.json` do operador | `operator/ledger.ts:237-269` | temporário e renomeação, retentativa no Windows, recusa symlink; sem fsync; trava (`:272`) | sim, `version:1` (`:74`) | não; só `executedKeys` limitado a 5000 (`:170`) |
| `latest.json` e `cycles.jsonl` do operador | `operator/cycle.ts:224-226` | estado sim, anexo não | não (`src/operator/types.ts:161`) | não; a API devolve 413 acima de 8 MB (`operator/http.ts:49`) |
| `latest.json` e `cycles.jsonl` do System One | `scripts/system-one.ts:121-125` | estado sim, anexo não | `schemaVersion` 1 | não |
| `latest.json` e `reads.jsonl` do jev-read | `jev-read/store.ts:47-65` | estado sim, anexo não | `schemaVersion` 1 | sim, um backup `.1` a 20 MB; o teto de chamadas pagas conta os dois arquivos (`loop.ts:125`) |
| `session.jsonl` e `events.jsonl` do trader | `trader.ts:115`, `:642` | não | não | não; `events.jsonl` depende do diretório corrente, mistura sessões e ninguém o lê |
| journal do laboratório | `lab/journal.ts:511-512,566-634` | snapshot sim; anexo apenas | sim (cabeçalho) | não |
| captura OnchainOS | `onchainos/capture.ts:69-74` | manifesto atômico; truncamento de linha rasgada | parcial | não |
| SQLite do supervisor de papel | `paper-supervisor-store.ts:135-142` | `synchronous=FULL` | `user_version=1` | não |

### 3.8 Especificações existentes e precedência (referenciadas, não duplicadas)

Hierarquia declarada em `README.md` ("Evidence and Brazil funding"): `SPEC.md` é histórico; `docs/READINESS-SPEC.md` (R1 a R8) e `docs/PROFIT-SPEC.md` (P1 a P3) governam a qualificação; `docs/WEB3-INTEGRATION-DELIVERY-SPEC.md` (I1 a I7) governa a integração Web3; `docs/CENTRAL-JEV-ACCEPTANCE.md` (C1 a C6) a central; `docs/OKX-SPEC.md` (O) e `docs/WALLET-OPPORTUNITIES-SPEC.md` (W) a carteira; `docs/OKX-ONCHAINOS-DADOS-SPEC.md` a camada de dados; `docs/LIVE-QUALIFICATION.md` o portão live. Esta pasta **não substitui** nenhum deles: ela os consome e acrescenta o contrato de evidência de carteira. Em conflito, prevalece o requisito mais restritivo.

## 4. Contrato de evidência de carteira v1 (especificação, sem código)

Natureza: contrato de dados puro, sem E/S, para ser implementado no Objetivo 1 em `src/portfolio-evidence/**`. Estende o vocabulário do `valuation-diagnostics` e do relatório móvel em vez de criar outro: nomes de campos e de estados foram escolhidos para coincidir com eles.

### 4.1 Princípios do contrato

1. **Nada derivado sem entrada conhecida.** Quantidade sem `decimals` não gera valor; preço sem moeda não gera valor; o campo derivado fica `null` com o motivo no estado.
2. **Tempos separados.** `capturedAtMs` e `sourceTimeMs` nunca se substituem; o frescor usa `sourceTimeMs`, e sem ele é `unknown`.
3. **Estado, não valor, para o que falta.** Omitido por filtro e ausente nunca viram quantidade.
4. **Hash e versão em tudo.** Cada snapshot e cada relatório carregam `schema` e `contentSha256`.
5. **Conceitos que não se somam.** Patrimônio (saldos ativos avaliados), histórico, custo de aquisição e PnL são tipos separados; a soma entre eles não é uma operação do contrato.

### 4.2 Tipos (notação ilustrativa; a forma exata é decidida e testada no Objetivo 1)

```ts
type Origin = "synthetic_fixture" | "local_import" | "browser_wallet" | "public_rpc" | "okx_web3_api";

type EvidenceState =
  | { kind: "ok" }
  | { kind: "missing"; code: string }
  | { kind: "omitted_by_filter"; code: string }
  | { kind: "stale"; ageMs: number }
  | { kind: "future"; aheadMs: number }
  | { kind: "divergent"; code: string }
  | { kind: "unreconciled"; code: string }
  | { kind: "unverified"; code: string };

// Identidade: rede + contrato. Alinhada a CandidateIdentity do valuation-diagnostics.
interface AssetIdentity {
  chainIndex: string;                               // chainIndex da OKX, ex.: "196"
  family: "evm" | "solana";
  asset: { kind: "native_marker" } | { kind: "contract"; address: string };
  key: string;                                      // determinística: `${chainIndex}:${native|endereço canônico}`
}
interface AssetDisplay { symbol: string | null; name: string | null }   // só apresentação, fora da chave

interface Quantity {
  atoms: string | null;                             // inteiro decimal em texto, nunca number
  decimals: number | null;
  decimalsSource: "provider" | "onchain_call" | "registry_pinned" | "unknown";
  displayText: string | null;                       // texto decimal do provedor, para auditoria
  state: EvidenceState;
}

interface Valuation {
  currency: "USD" | null;
  priceText: string | null;                         // texto decimal exatamente como recebido
  priceSource: string | null;
  priceAsOfMs: number | null;                       // horário do preço no provedor; null se o provedor não informa
  valueText: string | null;                         // calculado em BigInt escalado; null sem preço, decimais e moeda
  rounding: { mode: "floor" | "half_even"; places: number } | null;
  state: EvidenceState;                             // preço "0" sem corroboração é unverified, não ok
}

interface BalancePosition {                         // SALDO ATIVO
  identity: AssetIdentity; display: AssetDisplay;
  quantity: Quantity; valuation: Valuation;
  riskFlag: boolean | null;
  membership: "selected" | "outside_selection" | "unknown";
  state: EvidenceState;
}

interface EvidenceSnapshot {
  schema: "portfolio_evidence_snapshot_v1";
  snapshotId: string; revision: number;
  origin: Origin;                                   // synthetic_fixture nunca vira captura real
  source: { id: string; endpoint: string | null; apiVersion: string | null; adapterVersion: string };
  accountRef: { sha256: string };                   // o endereço completo não faz parte do snapshot
  capturedAtMs: number | null; sourceTimeMs: number | null;
  clockOffsetMs: number | null;                     // desvio medido contra a OKX, quando conhecido
  blockOrSlot: { chainIndex: string; number: string }[];
  maxAgeMs: number;
  freshness: "unknown" | "future" | "fresh" | "stale";
  coverage: {
    requested: string[]; observed: string[]; notReported: string[];
    tokenDiscovery: "provider_all" | "allowlist" | "unknown";
    status: "complete_claimed" | "partial" | "unknown";
  };
  filters: { riskToken: "applied" | "not_applied" | "unknown"; other: string[] };
  positions: BalancePosition[];
  reportedTotal: { currency: "USD" | null; valueText: string | null; scope: "all" | "tokens" | "defi" | "unknown"; sourceTimeMs: number | null } | null;
  contentSha256: string;                            // hash do JSON canônico sem este campo
}

// Conceitos DISTINTOS do saldo ativo. Nenhum entra na soma do patrimônio.
interface HistoryEntry { entryId: string; identity: AssetIdentity; kind: "transfer_in" | "transfer_out" | "swap_in" | "swap_out" | "fee" | "unknown";
                         quantity: Quantity; tx: { chainIndex: string; hash: string } | null; blockTimeMs: number | null;
                         priceAtTime: { priceText: string; source: string } | null; state: EvidenceState }
interface HistoryWindow  { fromMs: number | null; toMs: number | null; complete: boolean | "unknown"; source: string; entries: HistoryEntry[] }
interface CostBasis      { identity: AssetIdentity; method: "fifo" | "average" | "unknown"; window: HistoryWindow | null;
                           basisText: string | null; coverage: "full_history" | "partial_window"; state: EvidenceState }
interface PnlStatement   { class: "realized" | "projected" | "simulated" | "inventory_delta"; currency: "USD" | null;
                           valueText: string | null; costsKnown: boolean | "unknown"; basisRef: string | null; state: EvidenceState }
```

Patrimônio atual = soma de `valueText` das `positions` com `state.kind === "ok"` e `valuation.state.kind === "ok"`, acompanhada do número de posições sem valor e da cobertura. `HistoryEntry`, `CostBasis` e `PnlStatement` nunca participam dessa soma (AC-c).

### 4.3 Alinhamento com o que já existe

| Contrato | Vem de | Observação |
| --- | --- | --- |
| `AssetIdentity.key`, `asset.kind` | `CandidateIdentity` em `valuation-diagnostics.ts` (Z4) | mesmo formato de chave e de marcador nativo |
| `Quantity.state`, `unit/scale desconhecidos` | `FieldDescriptor` (`unit?: "unknown"`, `scale?: "unknown"`) | `decimals` só é conhecido por fonte declarada |
| `coverage`, `filters.riskToken` | `coverage: "partial_unverified"`, `filterClaim`, `actualRiskFilter: "unknown"` | o contrato adiciona `requested/observed/notReported` |
| `capturedAtMs` e `sourceTimeMs` | `capturedAtMs` e `providerPriceAsOfMs` do diagnóstico; `source_time_ms` e `fetched_at_ms` do relatório móvel (M02) | mesma regra: frescor nunca deriva da captura |
| `origin`, `snapshotId`, `revision`, `contentSha256` | relatório móvel (M06, binding SHA-256) | reutilizar o cálculo de hash sobre JSON canônico (`okx-derivatives/report.ts:248`) |
| `clockOffsetMs` | `src/system-one/clock.ts` e `web/src/lib/desk/clock-skew.ts` | desvio medido na OKX, não suposto |
| Validação de endereço por rede | `src/okx-wallet/chains.ts:64-82` | reutilizar; não duplicar |

### 4.4 Privacidade e consentimento (P6)

`accountRef` guarda só o hash do endereço; o endereço completo não entra em snapshot, relatório, log nem prompt. Todo construtor de snapshot a partir de dado do navegador roda **no navegador** (cópia pura do módulo em `web/src/lib/portfolio-evidence/`, validada pelos mesmos vetores de teste, porque `web/` é pacote separado e não importa de `../src`). O que sai do navegador, para onde e com qual finalidade é decisão D2.

### 4.5 Regras de conciliação (RQ-08)

| Regra | Entrada | Resultado |
| --- | --- | --- |
| RC1 total contra soma | `reportedTotal` e soma dos valores `ok` | igual dentro da tolerância: `ok`. Diferente: lista de explicações candidatas (`unvalued_positions`, `omitted_by_filter`, `scope_mismatch`, `defi_overlap`, `rounding`) com a parte explicada, ou `unresolved` com o delta exato. Nunca arredondar para fechar. |
| RC2 histórico contra ativo | quantidade líquida do histórico (em janela completa) contra `atoms` ativos | divergência: `unreconciled`. Quantidade positiva (histórica ou ativa) com valor zero ou preço `unverified`: `unreconciled` com código `valuation_zero_with_quantity` (AC-b). |
| RC3 identidade | chaves das posições | chave repetida: duplicata reportada, nunca somada; mesmo símbolo com chaves diferentes: aviso; mesma chave com `decimals` diferentes: `divergent`. |
| RC4 rede | `chainIndex` da linha, redes pedidas, `chainId` retornado pelo RPC | linha de rede não pedida ou `chainId` divergente: `divergent` com código `network_mismatch`. |
| RC5 ordem | séries de snapshots por fonte | `sourceTimeMs` (ou `capturedAtMs` na falta) decrescente: `stale` ou `unreconciled`; uma revisão atrasada nunca sobrescreve uma mais nova. |
| RC6 filtro | `filters.riskToken` e `coverage` | com filtro `applied` ou `unknown`, o conjunto é `partial`; o que falta é `omitted_by_filter`, nunca saldo zero (AC-a). |

### 4.6 Como cada objetivo consome o contrato

Coleta (O2) produz `EvidenceSnapshot`; histórico e custo (O3) produzem `HistoryWindow` e `CostBasis`; a conciliação (O4) aplica RC1 a RC6 e persiste snapshots; avaliação (O5) lê `PnlStatement` por classe; a análise do JEV (O6) recebe uma projeção sanitizada do snapshot e o hash dele; o relatório (O7) projeta snapshot, conciliação e achados. Detalhes e dependências em [tasks.md](tasks.md).

## 5. Defeitos e discrepâncias comprovados (viram tarefas)

| ID | Defeito ou discrepância | Evidência | Zona | Tarefa |
| --- | --- | --- | --- | --- |
| DF-01 | A mesa mostra um ciclo `dry_run` do System One como "ao vivo" e o chip do operador diz "operador ativo", sem conhecer fonte nem modelo (sintético ou mock aparecem como vivos). **Defeito da minha entrega anterior.** | `web/src/lib/mesa/mesa-model.ts:272`; teste único em `mesa-model.test.ts:195` | Z8 | T-FIX-1 |
| DF-02 | O cliente web não envia `Authorization`; `OPERATOR_READ_TOKEN` quebraria a UI, e a minha documentação o anuncia. | `web/src/lib/jev-read.ts`, `system-one.ts`, `operator-center.ts` (nenhuma ocorrência); `docs/MESA-DE-OPERACOES.md:56` | Z8 e docs | T-FIX-2 |
| DF-03 | `DecisionCenter` mostra "cobertura completa" sempre que `valueComplete` é verdadeiro, ignorando `riskTokensExcluded`. | `web/src/components/DecisionCenter/DecisionCenter.tsx:184` | Z6 | repassada a `01a1216a` |
| DF-04 | Saldo com preço `"0"` é "conhecido e completo". | `src/okx-wallet/valuation.test.ts:82-90`; `docs/WALLET-FINITE-VALUATION.md:9` | Z4/Z5 | coberto por RQ-03 e AC-b |
| DF-05 | `normalizeInventory` soma identidades duplicadas e descarta `rawBalance`, decimais, endereço por item e preço textual. | `src/okx-wallet/portfolio.ts:276-297`, `:289-292` | núcleo, sem dono | coberto por RQ-01/02 |
| DF-06 | A fonte live passa `riskTokensExcluded: true` e a conciliação exige `false`, então a conciliação live nunca produz delta. | `scripts/okx-operator.ts:171`, `src/operator/cycle.ts:106` | Z7 | O4 |
| DF-07 | `ledger.recordRealized` não tem chamador de produção: as paradas de perda e de drawdown não disparam sozinhas. | `src/operator/ledger.ts:131`, `:183`; `cycle.ts:185-188` | Z7 | O5 |
| DF-08 | Médias de insights misturam execuções sintéticas e live. | `src/operator/insights.ts`, `scripts/okx-operator.ts:217` | Z7 | O5 |
| DF-09 | Custo desconhecido vira zero em silêncio: taxa de negociação fixa 0, impacto de ponte 0, gás nulo somado como 0. | `src/operator/candidates.ts:162,212,218`, `executor.ts:209` | Z7 | O5 |
| DF-10 | Cópia: `order-state.ts:18` chama "Execucao real" qualquer fill não simulado sem exigir `txHash`; `DecisionCenter.tsx:241,294` rotula "Retorno" a média de líquido estimado; `MultichainPanel.tsx:29` diz "Patrimônio" sem avaliação; `FlowChart.tsx:438` mostra "PnL informado" ao lado de fills possivelmente simulados. | arquivos citados | Z6 | repassada a `01a1216a` |
| DF-11 | Documentos que afirmam o que o código não faz: `docs/OKX-OPERADOR-JEV.md:51,55,60,105`, `docs/AUDITORIA-OBJETIVOS.md:10`, `docs/ARQUITETURA-CENTRAL-DE-OPERACOES.md` §9, `docs/OPPORTUNITY-ARCHITECTURE.md:91` (cita `src/opportunities`, que não existe), `docs/JEV-LABORATORIO-DE-DECISAO.md` (§7.6 e §10), `docs/okx-evidence-v1/VERIFICACAO.md` (cita arquivos não publicados). `docs/OKX-HISTORICAL-ARCHIVES.md` **não existe em `main`**, só na árvore não commitada. | verificado com `git ls-files` e `ls` | docs | T-DOC-1 |
| DF-12 | **Suspeito, não verificado:** os overrides `NEXT_PUBLIC_EVM_RPC_*` provavelmente não funcionam no navegador, porque `process.env` é passado inteiro (`MultichainPanel.tsx:128`) e lido por chave dinâmica (`evm-multichain.ts:105`). | leitura de código | Z8/Z6 | T-VERIFY-1 (reproduzir antes de afirmar) |
| DF-13 | Teto por ordem inconsistente entre `envelope.ts:94,112` (1% e 2%), `web/src/lib/central/phases.ts:30` (10% e 5%) e `operator/config.ts:14` (5%). | arquivos citados | vários | O5 |
| DF-14 | O System One não consome inventário: nenhum código mapeia `InventorySnapshot` para `WalletReading`. | `src/system-one/types.ts:51` (só tipo) | System One | O6 |

## 6. Decisões de arquitetura

| ID | Decisão | Alternativas descartadas | Motivo |
| --- | --- | --- | --- |
| A1 | Núcleo puro e sem E/S em diretório novo (`src/portfolio-evidence/**`), com cópia pura validada por vetores compartilhados para o navegador. | Estender `src/okx-wallet/portfolio.ts`; criar pacote novo. | `portfolio.ts` está acoplado a `Number` e ao operador e fica numa zona sem dono; um pacote novo seria outra plataforma. |
| A2 | Estender o vocabulário do `valuation-diagnostics` e do relatório móvel, sem editar nenhum dos dois. | Refazer o contrato; editar os arquivos de outros. | Evita colisão (Z2, Z4) e retrabalho. |
| A3 | Estados em enumeração fechada com código de motivo, e nunca um valor de substituição. | Usar `null` e `0` conforme o caso. | É o que quebra os casos AC-a e AC-b hoje. |
| A4 | Hash por JSON canônico e `snapshotId` mais `revision` para toda saída. | `cycleId` aleatório ou truncado. | Rastreabilidade (RQ-13); o padrão de `okx-derivatives/report.ts:248` já existe. |
| A5 | O JEV recebe projeção sanitizada vinculada ao hash, com pergunta de revisão. | Reaproveitar a pergunta do operador. | A pergunta atual decide para onde alocar capital, não revisa a carteira. |
| A6 | Importação local de arquivo como fonte de primeira classe do histórico. | Depender só da API autenticada. | As credenciais não existem no ambiente (D3). |

## 7. Bloqueios

| Bloqueio | Efeito | Desbloqueio |
| --- | --- | --- |
| Credenciais `OKX_WEB3_API_KEY/SECRET/PASSPHRASE` ausentes (`data/onchainos.env` não existe; nenhum `.env` do projeto tem `OKX_*`, verificado só por nome) | sem saldo, preço, histórico e DEX por API | D3 |
| Consentimento para enviar dado de carteira ao backend ou ao JEV (P6, D2) | O6 não inicia | D2 |
| Dono do `valuation-diagnostics` (D4) | risco de contrato divergente | D4 |
| Sessões do Codex ativas ou não confirmadas | colisão em Z1 a Z7 | seção 2 |
| Replay do laboratório sem captura de ≥ 90 dias | avaliação real impossível; só sintética | captura forward-only já iniciada em outro trabalho; ver O5 |
| Runtime de captura pública não qualificado | `public-market-capture` recusa antes de qualquer saída | fora desta pasta |

## 8. Verificação deste documento

Os caminhos e as faixas de linha citados nesta pasta foram conferidos contra `main@14cbb7b` por `verify-citations.ts` (somente leitura): 509 referências, 0 problemas. O comando, as classes, os erros que a verificação pegou e os limites estão em [tasks.md, "Verificação do SDD"](tasks.md#verificação-do-sdd-t-doc-verify). Este documento ainda não passou por revisão independente (T-REVIEW-0).
