# Interfaces e testes da fatia S2: Contador de chamadas por rota da OnchainOS e projecao de cota

## Arquivos novos

- src/onchain-read/route-counter.ts: Contador puro por rota e tier, tabela PLANOS da OnchainOS, projecao linear de dia parcial contra o teto, chamadas por minuto e excedente x402 informativo.
- src/onchain-read/route-counter.test.ts: Testes bun:test dos 14 casos: contagem, cache hit, status, tier unknown, copia, projecao, teto, dia invalido, plano, chamadas por minuto e x402.

## Interfaces

```ts
import type { OnchainTier } from "./catalog";

export type PlanoId = "free" | "starter" | "growth" | "scale" | "pro" | "enterprise";

export interface Plano {
 readonly id: PlanoId;
 readonly nome: string;
 /** null quando o preco nao e publicado (Enterprise). */
 readonly precoUsdMes: number | null;
 /** null quando ilimitado ou nao publicado. */
 readonly basicMes: number | null;
 readonly premiumMes: number | null;
 readonly websocket: boolean;
 readonly fonte: "web3.okx.com/onchainos/dev-docs/market/market-api-fee";
 readonly lidoEm: "2026-10-17";
}

export const PLANOS: Readonly<Record<PlanoId, Plano>>;
export const X402_USD_POR_CHAMADA: { readonly basic: 0.0001; readonly premium: 0.0002 };

/** Excedente em USD apos a franquia de 100 mil por tier. Informativo: nunca paga nada. */
export function excedenteX402Usd(usado: { readonly basic: number; readonly premium: number }): number;

export type RotaTier = OnchainTier | "unknown";

export interface RegistroRota {
 readonly rota: string;
 readonly tier: RotaTier;
 /** true quando a resposta veio do cache e nao foi enviada ao provedor. */
 readonly cacheHit: boolean;
 /** Codigo de status curto, por exemplo "ok", "rate_limited", "payment_required", "error". */
 readonly status: string;
}

export interface Contagem {
 /** Chamadas enviadas ao provedor, por tier. */
 readonly enviadas: Readonly<Record<RotaTier, number>>;
 /** Respostas servidas do cache, por tier. */
 readonly cacheHits: Readonly<Record<RotaTier, number>>;
 readonly porStatus: Readonly<Record<string, number>>;
}

export interface RouteCounter {
 record(registro: RegistroRota): void;
 /** Copia profunda: alterar o retorno nao muda o contador. */
 byRoute(): Readonly<Record<string, Contagem>>;
 /** Primeiro registro e instante atual, em ms. desdeMs e null sem registros. */
 janela(): { readonly desdeMs: number | null; readonly ateMs: number };
}

export function createRouteCounter(deps: { readonly now: () => number }): RouteCounter;

export interface TierProjecao {
 readonly usado: number;
 readonly projetado: number;
 /** null para free (sem teto publicado) e para Enterprise. */
 readonly teto: number | null;
 readonly estouraTeto: boolean | null;
 readonly excedenteProjetado: number | null;
}

export interface ProjecaoMes {
 readonly rotulo: "linear de dia parcial";
 readonly plano: PlanoId;
 readonly porTier: Readonly<Record<"free" | "basic" | "premium", TierProjecao>>;
 /** Chamadas com tier unknown: visiveis, fora da cota. */
 readonly naoAtribuidas: number;
}

export function projectMonth(input: {
 readonly usadoPorRota: Readonly<Record<string, Contagem>>;
 /** Dia do mes ja decorrido, 1..diasNoMes. */
 readonly dia: number;
 readonly diasNoMes: number;
 readonly plano: PlanoId;
 /** Hipotese: cache hit nao conta na cota. Default false. */
 readonly contaCacheHit?: boolean;
}): ProjecaoMes;

/** Cota do tier dividida pelos minutos do mes. null para tier free, Enterprise ou ilimitado. */
export function chamadasPorMinuto(input: { readonly plano: PlanoId; readonly tier: "basic" | "premium"; readonly diasNoMes: number }): number | null;
```

## Casos de teste

- 1. Contagem enviada por rota e tier: entrada record({rota:'/market/price', tier:'basic', cacheHit:false, status:'ok'}) duas vezes e record({rota:'/market/price', tier:'premium', cacheHit:false, status:'ok'}) uma vez; saida esperada byRoute()['/market/price'].enviadas: basic 2, premium 1, free 0, unknown 0
- 2. Cache hit fica fora de enviadas: entrada record({rota:'/market/price', tier:'basic', cacheHit:true, status:'ok'}) tres vezes; saida esperada enviadas.basic 0 e cacheHits.basic 3
- 3. Status agregado por rota: entrada record com status 'rate_limited' duas vezes e status 'ok' uma vez na mesma rota; saida esperada porStatus {rate_limited: 2, ok: 1}
- 4. Tier unknown separado: entrada record({rota:'/x', tier:'unknown', cacheHit:false, status:'ok'}) e projectMonth com dia 10 de 30 e plano free; saida esperada enviadas.unknown 1 e naoAtribuidas 1; porTier.basic.usado 0
- 5. byRoute devolve copia: entrada obter byRoute(), apagar a chave da rota retornada, chamar byRoute() de novo; saida esperada a segunda chamada ainda contem a rota com a contagem original
- 6. Janela de tempo: entrada now() devolve 1000 no primeiro record e 5000 no segundo; janela() chamado depois; saida esperada desdeMs 1000 e ateMs 5000; antes de qualquer record, desdeMs null
- 7. Projecao linear de dia parcial: entrada usadoPorRota com basic 3000 em uma rota; dia 10, diasNoMes 30, plano free; saida esperada rotulo 'linear de dia parcial'; porTier.basic.usado 3000 e projetado 9000
- 8. Estouro do teto do Free: entrada basic 50000 em uma rota; dia 10, diasNoMes 31, plano free; saida esperada projetado 155000, teto 100000, estouraTeto true, excedenteProjetado 55000
- 9. Cache hit so entra com contaCacheHit true: entrada cacheHits.basic 5000 e enviadas.basic 0, dia 10 de 30, plano free; depois a mesma entrada com contaCacheHit true; saida esperada sem o parametro: porTier.basic.usado 0; com true: usado 5000 e projetado 15000
- 10. Dia fora do intervalo: entrada projectMonth com dia 0 e depois dia 32, diasNoMes 31; saida esperada as duas chamadas lancam RangeError
- 11. Enterprise sem teto: entrada basic 900000 no dia 15 de 30, plano enterprise; saida esperada porTier.basic.teto null, estouraTeto null, excedenteProjetado null
- 12. Chamadas por minuto: entrada chamadasPorMinuto({plano:'free', tier:'basic', diasNoMes:31}) e chamadasPorMinuto({plano:'starter', tier:'premium', diasNoMes:30}); saida esperada primeiro valor cerca de 2,2401 (100000 / 44640) e segundo cerca de 13,8889 (600000 / 43200), com toBeCloseTo de 3 casas
- 13. Excedente x402 informativo: entrada excedenteX402Usd({basic: 150000, premium: 120000}); saida esperada 9 (50000 * 0,0001 mais 20000 * 0,0002 = 5 mais 4)
- 14. Tabela de planos: entrada PLANOS.starter, PLANOS.free e PLANOS.enterprise; saida esperada starter: precoUsdMes 99, basicMes 2000000, premiumMes 600000, websocket true; free: websocket false e precoUsdMes 0; enterprise: basicMes null e precoUsdMes null; todos com lidoEm '2026-10-17' e fonte 'web3.okx.com/onchainos/dev-docs/market/market-api-fee'

## Verificacao

- bun --no-env-file test src/onchain-read/route-counter.test.ts
- bun run typecheck
- grep -nP "\x{00B7}|\x{2014}|\x{2013}" src/onchain-read/route-counter.ts src/onchain-read/route-counter.test.ts

## Riscos

- Hipotese de cache hit: se a cota do provedor contar cache hit, a projecao com contaCacheHit false subestima o consumo. Mitigacao: parametro explicito e teste de ambos os valores.
- Projecao linear de dia parcial e alerta, nao medida: com poucos dias no mes ou trafego irregular, o numero oscila. O rotulo fixo deixa isso visivel.
- Franquia x402 usada no excedente nao foi confirmada na pagina; o numero e informativo e nao deve virar cobranca.
- PAID_PLANS em scripts/api-budget.ts esta incompleto (faltam Scale, Pro e Enterprise). Enquanto a integracao nao sair, os dois lugares divergem.
- Aritmetica de chamadas por minuto usa minutos do mes inteiro; o ritmo real pode ser maior em horas de pico e nao e medido aqui.
- Se o provedor contar tentativas de retry como chamadas, a contagem subestima o consumo real. Nao ha dado para medir isso nesta fatia.

## Fora de escopo


## Integracao proposta (NAO implementada; arquivos quentes)

- src/onchain-read/gateway.ts: Depois de cada chamada, chamar counter.record({rota: endpoint.route, tier: endpoint.tier, cacheHit: !sent, status}) usando o campo sent que o gateway ja expõe (gateway.ts:56). Recebe o contador por injecao em GatewayDeps, sem alterar a ordem validate, cache, reserve, client, normalize.
- scripts/api-budget.ts: Trocar a leitura so por tier por byRoute e projectMonth com plano lido de PLANOS. Corrigir PAID_PLANS (linhas 17 a 20), que hoje lista so Starter e Growth e falta Scale, Pro e Enterprise; a fonte e PLANOS. Nao alterar o teto de consultas do Jev.
- src/onchain-read/budget.ts: Nenhuma alteracao proposta nesta fatia. O contador novo e paralelo ao orcamento de reserva e nao o substitui; a decisao de unificar fica para outra fatia.

## Duvidas para o Jev

- Cache hit conta na cota mensal da OnchainOS? (opcoes: nao_conta, conta; recomendacao sem Jev: nao_conta, por ser o padrao do parametro e coerente com o orcamento existente; trocar por conta muda so um booleano.)
- projectMonth recebe o plano como campo do objeto de entrada? (opcoes: campo, funcao_separada; recomendacao sem Jev: campo, por ser uma chamada so e reduzir superficie publica.)
- A franquia x402 de 100 mil por tier e a mesma do plano Free? (opcoes: franquia_100k, franquia_plano; recomendacao sem Jev: franquia_100k, por ser o numero publicado e informativo; nenhum pagamento depende dele.)

## Bloqueios do dono

