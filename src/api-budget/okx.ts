import type { BudgetEntry } from "./registry.ts";

/**
 * Registro das chamadas OKX OnchainOS. Fontes lidas em 2026-10-17:
 *  - Market: https://web3.okx.com/onchainos/dev-docs/market/market-api-fee (planos, cotas Basic/Premium, classificação por endpoint).
 *    A página não publica RPS/RPM nem descreve 429; por isso Market não tem `rps` aqui e o ritmo é o da fila do cliente.
 *  - Trade: https://web3.okx.com/onchainos/dev-docs/trade/api-fee (Trial: 1 RPS, até 5 sob aprovação, 60 dias da criação da chave).
 * O plano real da chave do dono só aparece no portal (exige login) e não foi verificado: o padrão é o plano Free.
 * Pagar por chamada (x402) existe no provedor e este código nunca o usa: um 402 bloqueia o pool até o mês seguinte.
 */

/** Nome da variável de ambiente da chave OKX. Só o nome; o valor nunca passa por aqui. */
export const OKX_KEY_ENV = "OKX_WEB3_API_KEY";
export const OKX_MARKET_FEE_URL = "https://web3.okx.com/onchainos/dev-docs/market/market-api-fee";
export const OKX_TRADE_FEE_URL = "https://web3.okx.com/onchainos/dev-docs/trade/api-fee";
export const OKX_CATALOG_SOURCE = "src/onchain-read/catalog.ts (faixa assumida; a página de custos não lista este endpoint)";

export type OkxTier = "free" | "basic" | "premium";

/** Cotas mensais por plano Market, da página de custos. `null` é ilimitado (Enterprise). */
export const OKX_MARKET_PLANS: Readonly<Record<string, { readonly basic: number | null; readonly premium: number | null }>> = {
  free: { basic: 100_000, premium: 100_000 },
  starter: { basic: 2_000_000, premium: 600_000 },
  growth: { basic: 5_000_000, premium: 2_000_000 },
  scale: { basic: 20_000_000, premium: 10_000_000 },
  pro: { basic: 50_000_000, premium: 20_000_000 },
  enterprise: { basic: null, premium: null },
};

/** Duração do Trial da Trade API, contada da criação da chave. */
export const OKX_TRADE_TRIAL_MS = 60 * 86_400_000;

interface Listed {
  readonly path: string;
  readonly tier: OkxTier;
  /** A página de custos lista o endpoint nesta faixa. */
  readonly listed: boolean;
}

const dex = (suffix: string) => `/api/v6/dex/${suffix}`;
const at = (tier: OkxTier, suffix: string, listed = true): Listed => ({ path: dex(suffix), tier, listed });

/** Todo caminho que o cliente assina, com a faixa. Fonte da faixa: página market-api-fee; `listed: false` usa a faixa do catálogo local. */
export const OKX_MARKET_ENDPOINTS: readonly Listed[] = [
  at("free", "market/supported/chain"),
  at("free", "market/signal/supported/chain"),
  at("free", "market/leaderboard/supported/chain"),
  at("free", "market/token/cluster/supported/chain"),
  at("free", "balance/supported/chain"),
  at("basic", "market/price"),
  at("basic", "market/trades"),
  at("basic", "market/token/top-liquidity"),
  at("basic", "market/token/hot-token"),
  at("basic", "market/candles"),
  at("basic", "market/token/search"),
  at("basic", "market/token/basic-info"),
  at("premium", "market/token/advanced-info"),
  at("premium", "market/token/holder"),
  at("premium", "market/price-info"),
  at("premium", "market/token/top-trader"),
  at("premium", "market/signal/list"),
  at("premium", "market/leaderboard/list"),
  at("premium", "market/token/cluster/overview"),
  at("premium", "market/token/cluster/top-holders"),
  at("basic", "market/social/news/latest", false),
  at("basic", "market/social/news/by-symbol", false),
  at("basic", "market/social/sentiment/symbol", false),
  at("basic", "market/social/sentiment/ranking", false),
  at("basic", "market/social/vibe/timeline", false),
  at("basic", "market/social/vibe/top-kols", false),
];

/** Cotação do agregador (Trade API). O catálogo local a conta como Basic no gateway; aqui ela pertence ao pool Trade. */
export const OKX_QUOTE_PATH = dex("aggregator/quote");

export interface OkxRegistryOptions {
  /** Plano Market: chave de OKX_MARKET_PLANS. Padrão "free". */
  readonly plan?: string;
  /** Criação da chave Trade (epoch ms). Com ela o Trial expira em 60 dias; sem ela não há prazo conhecido. */
  readonly tradeKeyCreatedAtMs?: number;
  /** RPS da Trade API. Padrão 1 (Trial); 5 só com aprovação do provedor. */
  readonly tradeRps?: number;
}

/** Entradas do orçamento OKX. Endpoints de uma mesma faixa dividem uma única franquia (pool), como o provedor conta. */
export function okxEntries(options: OkxRegistryOptions = {}): BudgetEntry[] {
  const plan = OKX_MARKET_PLANS[options.plan ?? "free"];
  if (plan === undefined) throw new Error(`api-budget: plano OKX desconhecido '${options.plan}'`);
  const quota = { basic: plan.basic, premium: plan.premium, free: null } satisfies Record<OkxTier, number | null>;
  const entries: BudgetEntry[] = OKX_MARKET_ENDPOINTS.map((e) => {
    const franquia = quota[e.tier];
    return {
      module: "okx",
      endpoint: e.path,
      key: OKX_KEY_ENV,
      pool: `market-${e.tier}`,
      ...(franquia === null ? {} : { franquiaMensal: franquia }),
      validated: e.listed,
      fonte: e.listed ? OKX_MARKET_FEE_URL : OKX_CATALOG_SOURCE,
    };
  });
  entries.push({
    module: "okx",
    endpoint: OKX_QUOTE_PATH,
    key: OKX_KEY_ENV,
    pool: "trade",
    rps: options.tradeRps ?? 1,
    ...(options.tradeKeyCreatedAtMs === undefined ? {} : { expiresAt: options.tradeKeyCreatedAtMs + OKX_TRADE_TRIAL_MS }),
    validated: true,
    fonte: OKX_TRADE_FEE_URL,
  });
  return entries;
}
