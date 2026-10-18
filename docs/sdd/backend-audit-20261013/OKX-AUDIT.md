# Auditoria delimitada do backend OKX Web3 e Onchain OS

Data: 2026-10-13. Investigador: `/root/audit_okx`. Conversa nativa própria: `01a13629-5b7c-7bf0-82c5-38d1b3b67c07`; sessão recebida: `01a1361d-519c-7a83-a461-fff1a29f0317`.

## Resultado e limites

Quatro falhas foram reproduzidas offline no snapshot imutável `C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/baseline`: admissão concorrente ultrapassa o teto mensal, requisições já enfileiradas ignoram bloqueios novos de 429/402, o timeout do cliente termina antes da leitura do corpo e a última chamada do coletor pode ultrapassar o prazo total sem registrar `deadline`.

Este relatório prepara requisitos e critérios de regressão para implementação e revisão independentes. Não altera fonte e não certifica a própria especificação. Não houve leitura de `.env`, servidor, chamada autenticada, inferência Jev, assinatura de transação, negociação, staging, commit ou publicação. O HMAC dos fakes usa somente credenciais sintéticas. Os downloads externos limitaram-se à documentação pública oficial.

O plano histórico em `docs/sdd/carteira-evidencia/tasks.md` foi lido primeiro. Seus itens antigos não constituem inventário atual: o snapshot já contém cliente, adaptadores, coletor, armazenamento e CLI de evidência. Não se conclui ausência de implementação a partir de um checkbox antigo. Nenhum conteúdo privado foi enviado a serviço consultivo.

Não objetivos: mudar o Jev que decide buy/sell pelo feed, o loop de ordens reais Kuru/Monad por bloco de 300 ms, carteira de execução, assinatura, pagamentos, Agentic Wallet, conexão automática, UI ou módulos reservados de settings/vault, `src/inonu`, `src/quant` e web. Correções de backend aqui são de leitura e evidência. Não alegam ganho financeiro, execução live ou economia de cobrança.

## Estado observado

| Superfície | Implementado no snapshot | Ligação observada por leitura | Exercício nesta auditoria | Qualificação live |
| --- | --- | --- | --- | --- |
| `src/onchain-read` | Catálogo fechado, assinatura, fila, cache e contador persistente | `src/server.ts:50` cria o gateway no modo normal; handler em `:69`, despacho em `:87` | Fakes do cliente e do gateway reproduzem os achados 1 a 3 | Não observada |
| HTTP local onchain | Valida IP/Host/Origin locais, GET e intenção; rotas desconhecidas rejeitadas | `src/onchain-read/http.ts:49`, `:65`, `:67`, `:73` | Somente leitura; não foi aberto servidor | Não observada |
| `src/onchainos` | Cliente injetado, erros tipados, timeout do corpo e paginação limitada | Usado pelo coletor/CLI; catálogo de mercado separado do de carteira | Fake do cliente real usado no achado 4 | Não observada |
| `src/portfolio-evidence` | Adaptadores de carteira, coletor, contratos, store e CLI | CLI live exige opções explícitas em `cli.ts:211`; não foi qualificada uma rota HTTP de carteira neste recorte | Evidência `synthetic_fixture`, `realData=false` | Não observada |
| Legado `src/okx-api.ts`, `src/okx-market`, `src/okx-wallet` | Clientes e diagnósticos de valuation existem | Inspeção delimitada das interfaces, sem varredura integral | Não exercitado aqui | Não observada |

Leitura positiva, sem nova certificação: cache mantém `cachedAtMs` original e marca stale; formas interna/pública têm chaves distintas (`gateway.ts:81`); o adapter de carteira preserva `rawBalance` vazio como desconhecido (`adapters/okx-read.ts:105`), separa filtros de total/saldo e não inventa source timestamp. A paginação em `src/onchainos/paging.ts:46` limita páginas/linhas, repetição de cursor e ausência de progresso. Isso reduz a prioridade de reescrever esses mecanismos sem reprodução de defeito.

Testes existentes foram lidos, mas a suíte e o typecheck não foram executados nesta auditoria. `node_modules` não existe no snapshot. Bun observado: `1.3.14 (Windows x64)`. Os quatro cenários abaixo foram executados por stdin com `bun --no-env-file -`; nenhum arquivo de teste foi adicionado. Um mock inicial de `node:fs` não isolou os imports nativos no Bun/Windows, e foi detectado o artefato `baseline/synthetic-only/`. Ele foi preservado e comunicado ao coordenador, sem remoção nem edição. O achado de concorrência foi então reconfirmado com portas de FS explicitamente em memória, sem depender desse artefato. Relógios sintéticos e timers do processo não são medição de desempenho do Desktop ou do provedor.

## Contratos que permanecem congelados

- `docs/sdd/config-onchain-smartmoney/spec.md:22`, D-c: “Toda chamada ao OnchainOS passa por um gateway local com cache por endpoint, fila de 1 requisição por segundo, contador mensal persistente por camada e teto configurável”. O mesmo requisito proíbe pagar e exige cache antigo marcado ao atingir o teto.
- `spec.md:45`, ONC-4: contador mensal UTC por camada, teto configurado, acima dele somente stale; chamadas do usuário não eliminam o teto mensal.
- `docs/sdd/config-onchain-smartmoney/onchainos-gateway.md:85`: HTTP 402 encerra acesso à camada, sem pagamento, com stale quando disponível. `src/onchain-read/client.ts:4`: “A 402 answer blocks that fee tier in memory for one hour” e `:5` estabelece cooldown global para 429/50011.
- `docs/portfolio-evidence-v1/SPEC.md:39`, PE-11: “Limites explícitos: timeout por chamada, teto de chamadas por atualização, teto de páginas, prazo total. Atualização sob demanda; sem agendador.”
- `docs/sdd/carteira-evidencia/requirements.md:25`, P-2, e `:42`, RQ-03: desconhecido não é zero; preço zero/vazio, unidade ou decimals ausentes não qualificam patrimônio. `:43`, RQ-04: source time e fetched time são separados. Histórico/PnL não são patrimônio (`:45`, RQ-06).

## Achado OKX-01: teto mensal ultrapassado por admissão concorrente

Prioridade: alta. Caminho causal: `src/onchain-read/budget.ts:155` verifica `used(tier)` e retorna sucesso em `:162`, sem reservar uma posição em voo. `src/onchain-read/gateway.ts:91` faz essa verificação antes do coalescing; a contagem só aumenta em `:98`, depois de aguardar o cliente. Pedidos distintos simultâneos veem o mesmo saldo livre. A fila do cliente serializa envio, mas não revalida esse teto.

Requisito exato: D-c e ONC-4 acima. Cenário: cap basic=1, uso inicial=0, três `/onchain/price` com contratos distintos, cliente sintético que mantém os três pedidos em voo antes de responder. A camada basic admite os três.

Resultado literal executado:

```json
{"case":"gateway_cap_1_concurrent_distinct_keys_confirmed","sends":3,"used":3,"cap":1,"results":[{"ok":false,"error":"provider_error"},{"ok":false,"error":"provider_error"},{"ok":false,"error":"provider_error"}],"filesystem":"explicit_in_memory_ports_transpiled_unchanged_logic","memoryFileCount":1}
```

Nesta confirmação, a fonte exata de budget foi lida e transpilada localmente, com somente seus imports de FS/path substituídos por portas explícitas. A lógica de reserva e contagem não foi alterada; o gateway foi importado diretamente. Todos os writes do contador e `require` de FS ficaram na Map em memória. Não demonstra cobrança externa; demonstra que o teto local pode falhar precisamente antes da chamada cobrável. O mock inicial não deve ser reutilizado como evidência de isolamento de filesystem.

Seam mínimo: `gateway.test.ts` com cliente bloqueado por promises e três chaves distintas; fake de budget ou `createBudget` com FS em memória. Critérios independentes: cap=1 deve admitir no máximo um envio; recusados devolvem `budget_exhausted` ou stale marcado; a mesma chave coalescida conta uma vez; chamada enviada que falha conta; chamada não enviada não conta; liberação da reserva e troca de mês não deixam consumo fantasma nem restauram uso já enviado. Não resetar o ledger histórico.

Alternativas reais: (A) ticket de reserva atômica, confirmado somente quando houve envio e liberado no caminho não enviado; torna explícita a concorrência, mas altera a interface budget/gateway. (B) serializar admissão e contabilização no ponto comum de despacho; evita tickets, mas exige preservar coalescing e verificar cap/settings no instante correto. Escolha de desenho fica com o coordenador sob a delegação vigente, sem enfraquecer a aceitação.

Responsabilidade provável: proprietário exclusivo de `src/onchain-read/budget.ts`, `budget.test.ts`, `gateway.ts`, `gateway.test.ts`; interface compartilhada somente pelo integrador. Verificação proposta: `bun --no-env-file test src/onchain-read/budget.test.ts src/onchain-read/gateway.test.ts --parallel=1`, seguida das verificações do cliente/HTTP e do typecheck já exigido pelo projeto quando suas dependências estiverem disponíveis.

## Achado OKX-02: fila ignora bloqueio criado por chamada anterior

Prioridade: alta. Caminho causal: `src/onchain-read/client.ts:190` e `:192` verificam 402/cooldown antes de entrar em `queue.then` (`:193`). Dentro da fila, o código aguarda intervalo (`:197`) e envia (`:199`) sem reavaliar os gates. A primeira resposta cria cooldown (`:155`, `:181`) ou bloqueio da camada (`:200`), enquanto seguidores já admitidos continuam a enviar.

Requisito exato: bloqueio de 402 e cooldown do contrato do cliente; D-c proíbe pagamento e o gateway deve poder servir stale. Cenário: três `call(REQ, "basic")` simultâneos, intervalo zero somente para o fake, primeiro resultado 429 ou 402. Esperado: primeiro `sent=true`; seguidores `sent=false` com erro fechado. Observado: todos foram enviados.

```json
{"case":"queued_429","sends":3,"results":[{"ok":false,"error":"rate_limited","sent":true},{"ok":false,"error":"rate_limited","sent":true},{"ok":false,"error":"rate_limited","sent":true}]}
{"case":"queued_402","sends":3,"results":[{"ok":false,"error":"provider_payment_required","sent":true},{"ok":false,"error":"provider_payment_required","sent":true},{"ok":false,"error":"provider_payment_required","sent":true}]}
```

Seam mínimo: `client.test.ts`, fake fetch com contador e primeira resposta 429, body code 50011 e 402. Critérios independentes: gates aplicados imediatamente antes de enviar, inclusive após espera da fila; cooldown global e bloqueio 402 por camada; seguidores não enviados; erro fechado; nenhuma tentativa de pagamento; stale não recebe timestamp novo. Preservar recuperação posterior ao prazo e comportamento do clock skew.

Alternativas reais: (A) recusar seguidores ao despachar com o erro existente, permitindo stale imediato; menor alteração compatível com o contrato. (B) reter até o fim do cooldown; muda latência e interage com prazo total, portanto exige decisão explícita e continua proibido enviar durante o bloqueio. Não usar retry automático como substituto do gate.

Responsabilidade provável: `src/onchain-read/client.ts` e `client.test.ts`, no mesmo proprietário dos ajustes de timeout para evitar colisão. Verificação proposta: `bun --no-env-file test src/onchain-read/client.test.ts src/onchain-read/gateway.test.ts --parallel=1`.

## Achado OKX-03: timeout cobre headers, não o corpo

Prioridade: alta. Caminho causal: `src/onchain-read/client.ts:98` abre timer; `:120` o limpa logo após `fetch` devolver headers. `res.text()` em `:142` e `:161` ocorre fora desse prazo. Uma resposta com headers imediatos e corpo lento/interminável mantém a chamada e a fila global pendentes. O limite de bytes (`:165`) só é examinado depois de materializar o corpo completo.

Requisito exato: `timeoutMs` é a configuração de timeout do cliente (`client.ts:32`, default em `:62`) e o plano de aceitação A-ONC exige testes de timeout; o coletor também exige timeout por chamada em PE-11. O teste existente em `client.test.ts:80` cobre fetch que ainda não retornou, não o corpo após headers.

Cenário executado: timeout de 25 ms, Response 200 imediata, `text()` fake espera 90 ms. Aos 50 ms, o sinal ainda não havia sido abortado. A chamada acabou como sucesso depois do limite.

```json
{"case":"body_timeout_at_50ms","signalAborted":false,"configuredTimeoutMs":25}
{"case":"body_timeout_completed","elapsedMs":339,"result":{"ok":true,"data":[],"sent":true}}
```

`elapsedMs=339` é apenas o tempo observado nesse processo, incluindo atraso de execução do timer; não é benchmark. O fato verificável é timeout=25, não abortado aos 50 e sucesso tardio. Uma tentativa de reconstruir o script usou `secretKey` onde esta interface exige `secret`, produzindo `ERR_INVALID_ARG_TYPE`; foi corrigida antes desta reprodução. Esse erro de fixture não foi classificado como defeito do projeto.

Seam mínimo: `client.test.ts`, fetch resolve headers e `text()` fica pendente; repetir com 401/403, abort respeitado e ignorado. Critérios independentes: o prazo abrange a leitura completa; o caller termina com erro fechado `sent=true`; o próximo slot da fila progride; corpo tardio não vira sucesso/cache novo; não surge promise rejeitada sem tratamento. Se o limite de bytes for endurecido na mesma entrega, leitor deve cancelar antes de armazenar conteúdo ilimitado. Não declarar esse último requisito já verificado pelo cenário temporal.

Alternativas reais: (A) manter abort e corrida de deadline por toda a operação, inclusive body; necessário terminar mesmo com fetch injetado que ignore abort. (B) reutilizar o padrão já presente em `src/onchainos/http.ts:334` a `:367`, onde a corrida engloba body, eventualmente extraindo um leitor limitado. B amplia acoplamento; nenhuma exige reescrever os catálogos.

Responsabilidade provável: `src/onchain-read/client.ts` e `client.test.ts`. Verificação proposta: `bun --no-env-file test src/onchain-read/client.test.ts --parallel=1` e regressões do gateway. Não converter uma demora do body em saldo zero.

## Achado OKX-04: prazo total não limita a última chamada do coletor

Prioridade: alta para o ciclo de carteira. Caminho causal: `src/portfolio-evidence/collector.ts:257` verifica deadline apenas antes de cada chamada. `:270` e `:274` passam a chamada ao transporte sem prazo remanescente. `attempt` retorna diretamente após `await` (`:285`); não há verificação após a última resposta. `:543` pode registrar `stoppedBy=null` quando a captura já excedeu o prazo. O teste atual `collector.test.ts:192` exige uma próxima chamada para observar a parada.

Requisito exato: PE-11, prazo total explícito; configurações `deadlineMs` em `collector.ts:78`, default=60000 e teto=300000 em `:88`. Cenário: somente balances, market e total desabilitados, deadline=1000; o fake avança o relógio injetado em 2000 durante o único retorno.

```json
{"case":"collector_last_call_crosses_deadline","elapsedLogicalMs":2000,"deadlineMs":1000,"calls":1,"stoppedBy":null,"origin":"synthetic_fixture","realData":false,"status":"incomplete"}
```

Esse resultado não diz que o status virou `valid`; ele já era `incomplete`. O defeito é o prazo violado sem recibo de parada. O relógio lógico isola o contrato, não prova latência real. O transporte tem timeout próprio, mas não recebe o prazo restante da atualização; fila/retries também podem consumir esse prazo, inferência que a implementação precisa testar.

Seam mínimo: `collector.test.ts` com o último retorno avançando o relógio, além de body que excede prazo real controlado. Critérios independentes: deadline cumprido no caller; `stoppedBy="deadline"` quando aplicável; nenhuma nova chamada após seu vencimento; dados parciais e cobertura honestos; resposta tardia não promove sucesso limpo nem captura/cache fresco; cancelamento ou descarte seguro; sem polling/agendador. Deadline global deve incluir espera de fila e retries. Critérios financeiros existentes permanecem congelados.

Alternativas reais: (A) propagar orçamento de tempo restante/sinal ao transporte por operação, incluindo fila/retries; interface maior e controle efetivo. (B) corrida total no coletor com descarte de resposta tardia e recibo explícito, combinada com cancelamento suportado pelo transporte; interface menor, mas não basta devolver enquanto chamadas órfãs continuam consumindo. A escolha não autoriza rede nem custo externo.

Responsabilidade provável: `src/portfolio-evidence/collector.ts`, `collector.test.ts`; eventual seam de tempo em `src/onchainos/http.ts` e testes precisa de responsabilidade exclusiva acordada com o integrador. Verificação proposta: `bun --no-env-file test src/portfolio-evidence/collector.test.ts src/onchainos/http.test.ts --parallel=1`. Revisão deve usar baseline e SPEC congelados, com execução em cópia independente.

## Reproduções mínimas para o implementador

Executar na cópia de baseline, por stdin ou teste temporário fora do repositório, com `bun --no-env-file -`. Todos os URLs abaixo são interceptados pelo fake. Não substituir por fetch real ou credenciais reais.

### Gates de fila e corpo tardio

```js
import { createOnchainClient } from './src/onchain-read/client.ts';
const credentials = () => ({ apiKey: 'synthetic', secret: 'synthetic', passphrase: 'synthetic' });
const req = { method: 'GET', path: '/api/v6/dex/market/supported/chain' };
for (const status of [429, 402]) {
  let sends = 0;
  const c = createOnchainClient({ credentials, now: Date.now, minIntervalMs: 0,
    fetch: async () => { sends++; return new Response('', { status }); } });
  const results = await Promise.all([c.call(req, 'basic'), c.call(req, 'basic'), c.call(req, 'basic')]);
  console.log(JSON.stringify({ case: `queued_${status}`, sends, results }));
}
let signal;
const start = Date.now();
const c = createOnchainClient({ credentials, now: Date.now, minIntervalMs: 0, timeoutMs: 25,
  fetch: async (_url, init) => {
    signal = init.signal;
    const r = new Response('{"code":"0","data":[]}');
    r.text = async () => { await new Promise(r => setTimeout(r, 90)); return '{"code":"0","data":[]}'; };
    return r;
  } });
const pending = c.call(req, 'basic');
await new Promise(r => setTimeout(r, 50));
console.log(JSON.stringify({ case: 'body_timeout_at_50ms', signalAborted: signal?.aborted, configuredTimeoutMs: 25 }));
const result = await pending;
console.log(JSON.stringify({ case: 'body_timeout_completed', elapsedMs: Date.now() - start, result }));
```

### Teto concorrente sem FS real

```js
import { join } from 'node:path';
const { createOnchainCache } = await import('./src/onchain-read/cache.ts');
const { createOnchainGateway } = await import('./src/onchain-read/gateway.ts');
const source = await Bun.file('./src/onchain-read/budget.ts').text();
let javascript = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
javascript = javascript.replace(/import\s*\{[^}]+\}\s*from\s*["']node:fs["'];?/, 'const { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } = taskFs;');
javascript = javascript.replace(/import\s*\{\s*join\s*\}\s*from\s*["']node:path["'];?/, 'const join = taskJoin;');
javascript = javascript.replace(/export\s+function\s+createBudget/, 'function createBudget');
if (/\bimport\s/.test(javascript) || /\bexport\s/.test(javascript)) throw Error('instrumentation refused remaining import/export');
const files = new Map();
const taskFs = { existsSync: p => files.has(p), mkdirSync: () => {}, readFileSync: p => files.get(p),
  writeFileSync: (p, value) => files.set(p, value),
  renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); },
  statSync: () => ({ isFile: () => true }), chmodSync: () => {} };
const createBudget = new Function('taskFs', 'taskJoin', 'require', javascript + '\nreturn createBudget;')(taskFs, join, () => taskFs);
const now = () => Date.UTC(2026, 9, 13);
const budget = createBudget({ dir: 'in-memory-only-no-disk', now, caps: () => ({ basic: 1, premium: 1 }) });
let sends = 0;
let release;
const hold = new Promise(r => { release = r; });
const client = { call: async () => { sends++; await hold; return { ok: false, error: 'provider_error', sent: true }; },
  status: () => ({ lastCallMs: null, lastCode: null, cooldownUntilMs: null, clockOffsetMs: null }) };
const gateway = createOnchainGateway({ client, budget, cache: createOnchainCache(now), now, credentialsState: () => 'complete' });
const pending = ['0xab', '0xac', '0xad'].map(token => gateway.call('/onchain/price', { chainIndex: '1', token }, 'user'));
await Promise.resolve(); await Promise.resolve(); release();
const results = await Promise.all(pending);
budget.flush();
console.log(JSON.stringify({ sends, used: budget.snapshot().tiers.basic.used, cap: budget.snapshot().tiers.basic.cap, results }));
```

### Último retorno após deadline

```js
import { envelope, makeStack } from './src/onchainos/fakes.ts';
import { collectWalletEvidence } from './src/portfolio-evidence/collector.ts';
import { FIXTURE_ACCOUNT, FIXTURE_TOKEN_A } from './src/portfolio-evidence/fixtures.ts';
let injectedClock;
const { http, fake, clock } = makeStack(() => {
  injectedClock.advance(2000);
  return { body: envelope([{ tokenAssets: [{ chainIndex: '1', tokenContractAddress: FIXTURE_TOKEN_A,
    address: FIXTURE_ACCOUNT, symbol: 'FIXA', balance: '2.5', rawBalance: '2500000', tokenPrice: '4', isRiskToken: false }] }]) };
});
injectedClock = clock;
const start = clock.now();
const { evidence } = await collectWalletEvidence({ http, now: clock.now },
  { address: FIXTURE_ACCOUNT, chains: ['1'], excludeRiskToken: '1', totalValue: false, market: false },
  { origin: 'synthetic_fixture', maxAgeMs: 600000, deadlineMs: 1000 });
console.log(JSON.stringify({ elapsedLogicalMs: clock.now() - start, deadlineMs: 1000, calls: fake.calls.length,
  stoppedBy: evidence.collection.stoppedBy, origin: evidence.origin, realData: evidence.realData, status: evidence.status }));
```

## Fontes primárias públicas atuais

Documentação consultada em 2026-10-13. Hashes abaixo são SHA-256 dos bytes HTML recebidos em download público sem autenticação; são hashes da representação naquele instante, não de um commit do provedor nem do texto extraído pelo navegador. O HTML pode mudar sem mudar o contrato. Nenhum corpo de mercado foi baixado.

| Documento oficial e evidência literal delimitada | SHA-256 do HTML | Bytes / UTC da captura |
| --- | --- | --- |
| [API access and usage](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage): “The timestamp must not differ from the server time by more than 30 seconds.” HMAC-SHA256, Base64 e requestPath/body documentados. | `729A879CC90C0C41C510F46EDD7CFEF6935B07BDFC437BB5DFD65C1740F422FE` | 103603 / 16:59:59.9725630Z |
| [Market API fee](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee): quotas mensais e camadas Free/Basic/Premium; balance e total constam na camada Free. | `ED79EF8C16D6480CCD61DF76F27F5591E8CA1F9A56F8D7253E6AF956DE2D5016` | 79263 / 17:00:00.7565585Z |
| [All token balances by address](https://web3.okx.com/onchainos/dev-docs/market/balance-total-token-balances): rawBalance “For unsupported chains, this field is empty.” Até 50 chains; filtro de risco string 0/1. | `77CF52D03AB000DF6143B2DBCE5E2FE30A429BAC9CE50F0EF4480741100F1660` | 126673 / 17:00:01.3021266Z |
| [Total value by address](https://web3.okx.com/onchainos/dev-docs/market/balance-total-value): “Total asset balance based on the query type, returned in USD”; assetType e filtro booleano próprios. | `ECACCD013D4A9117802356F74DEBCC765E939B9BAB1DB3291EAB2C60B57077DC` | 68553 / 17:00:01.7911337Z |
| [Portfolio DEX history](https://web3.okx.com/onchainos/dev-docs/market/market-portfolio-dex-history): “Limit: 1000 records, up to 100 per request”; begin/end em ms, cursor e ordem inversa. | `C25C0B678C9AC3D538FD48E74B853D3CB9D26227249B05B7560E4D0F9B67DCA4` | 72383 / 17:00:02.2728557Z |

A tabela de preços oficial informa a classificação pública, não o plano, a quota restante ou a fatura desta conta. Esses fatos permanecem desconhecidos. A classificação conservadora de endpoint sem custo conhecido no adaptador não foi promovida a defeito sem um cenário que altere comportamento. A documentação pública não autoriza chamadas pagas ou real wallet.

## Hashes exatos das fontes locais

Todos os caminhos relativos abaixo pertencem ao snapshot citado, nunca à árvore compartilhada. SHA-256 dos bytes de arquivo. Esses hashes fixam o baseline da investigação; uma revisão de implementação precisa receber os novos hashes exatos e seu baseline de comparação.

| Caminho | SHA-256 |
| --- | --- |
| `AGENTS.md` | `17C63EA3C3328FBBD5CF0CF3934AF0DD6EE142B9E4BF6E3B5B58724277DFDC34` |
| `docs/sdd/carteira-evidencia/tasks.md` | `3DA5A970B7C85549C02EA33E2787BAC978AFA72732A55CDC0AA4C6D9E6BEF0C6` |
| `docs/sdd/carteira-evidencia/requirements.md` | `2274ABDB91408FD24715780DDE2D20B97997CEE913D2168793D274D71314908C` |
| `docs/sdd/carteira-evidencia/design.md` | `BEBD9C954D0C3B260655C919125EE12C1034BDA6B48EBCFEED5715806D5AA8DC` |
| `docs/portfolio-evidence-v1/SPEC.md` | `D9F5CE2BE6F6308B1E87953B754043E88D280905F48CEAE14215EF014CF54DFD` |
| `docs/sdd/config-onchain-smartmoney/spec.md` | `B4660C1D16EE297AC4C4D964B5336FD52A0D8606AC71411BD81E7D6CA4890B2B` |
| `docs/sdd/config-onchain-smartmoney/onchainos-gateway.md` | `B346C0F959DF4E7536AA8EEFEEF852A446E67DE892AD52F0E2E2653E894E90A1` |
| `src/onchain-read/client.ts` | `118B8E32651986E57A83876CF84F75DA533B8A6425B7F5F05F3B69379ADBD1EA` |
| `src/onchain-read/client.test.ts` | `C1C5CEE59E4498268EF6788E1F7B75CDDAE73D84C04EC42344EE7F80C66434E6` |
| `src/onchain-read/budget.ts` | `1DC6100A2BED1F0D8F5A5B5F5EECE8EAD23118DCD0F7BBA23C1C4F408871879D` |
| `src/onchain-read/budget.test.ts` | `46A399B09DB9A6DA67B21BD913B5B1B3C2262BC3A8C22B09EAA0780B885241A0` |
| `src/onchain-read/gateway.ts` | `0B4CE61C93037D9319913DDBAAA92D5D5892FFE33BFE7317177CD16F7EA95D0D` |
| `src/onchain-read/gateway.test.ts` | `AEF810C529C376C58C36BF4D6938CE722BC567D656C97FF5CED74076BB3C3374` |
| `src/onchain-read/catalog.ts` | `49819C3CEDD833948AB409FB6ECF83DFC83CCD2165E275AD046B7417A7298A18` |
| `src/onchain-read/http.ts` | `C21F3973D52803DB84C7D60A244A2F630AB3FCA76E6DFD387E0313A65710EBAF` |
| `src/onchain-read/cache.ts` | `CB08989F26FF4F1EE9D4EB8CD29C556BC8E680AF3ED205775F95823A5FD0B6D0` |
| `src/onchainos/http.ts` | `24CEB40932010EDAF189A228313FECA214AFAC3FAAE13FFD2D435A3B0E23B3F4` |
| `src/onchainos/paging.ts` | `F9B317D723F2EA52CC44CEB4C843FF7A03EAF4E849BAC1FCE90A9A0428591075` |
| `src/portfolio-evidence/collector.ts` | `8DB7FFFE861B29992FEFF5FBED9C69BA959101CDFFE83D56905FB76173A4CCAB` |
| `src/portfolio-evidence/collector.test.ts` | `A4C3820BF1067E316F5F0DF53258F391D93803A026F7BD6A2E9A204B42642E26` |
| `src/portfolio-evidence/adapters/okx-read.ts` | `A6EB2C7E09D6A688F4B276A876FA6AE50E2AAB2C618AE74D4CCA913AD8CABCDC` |
| `src/portfolio-evidence/adapters/okx-endpoints.ts` | `4AE9B3A0BD3F06E1AF3F8D708A76461A17160C45E294FAD3AAA69A8B036E6642` |
| `src/portfolio-evidence/cli.ts` | `9724559F68CCF09414A9A68600D42FD39901CE6359E80A9F32A7270D66EAAA9A` |
| `src/server.ts` | `83025CBD897F5FC54842AB055F9E7AE1D60E93268C6CAC51A0031A517D66BCF4` |

Instruções externas locais lidas, sem copiar estado privado para o repositório: `C:/Users/gabri/.codex/skills/codex-desktop-harness/SKILL.md`, SHA-256 `4D438885FE9C0646725BC82652CEC4309BAED5A1A570BE73C0ED2B7141399B11`; `C:/Users/gabri/.agents/sdd-multiagent/PLAYBOOK.md`, SHA-256 `86F7B8F22E4EB2AA352FF8D021D5D8DFAD1B4BA6A56156252807BCE528D5C258`. Contexto da conversa própria recuperado somente em modo leitura: revisão SDD=0, fase research, status idle; metadata é evidência, não autorização.

## Dependências e recomendação de prioridade

Implementação offline e revisão independente podem avançar dentro do objetivo autorizado. Para qualificação live ainda faltam fatos e autorização próprios sobre credenciais/acesso, redes/endpoints servidos, quota/camada/custo e permissão de egress dos dados de conta. Não inventar esses fatos, não solicitá-los ao Jev e não transformar fixtures em live. Nenhuma permissão de leitura implica pagamento, assinatura ou operação de carteira.

Prioridade recomendada: uma entrega isolada em `src/onchain-read` fecha primeiro o teto atômico e os gates no despacho, depois o timeout do corpo no mesmo proprietário. São falhas reproduzidas no gateway já ligado ao servidor. Para o ciclo de evidência de carteira, fechar o prazo total do coletor antes de ampliar cobertura ou habilitar coleta live. O coordenador pode aplicar essa sequência à disponibilidade de donos; os critérios acima permanecem inalterados e devem ser avaliados por outro agente em uma cópia isolada.
