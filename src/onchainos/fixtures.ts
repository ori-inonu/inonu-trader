/**
 * Response examples with provenance. Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md section 13.
 *
 *  - "doc-example": rebuilt from the example of the official page named in `source`. The pages were read through a tool
 *    that summarises text, so values and field names were transcribed from its extraction and may contain errors. Where
 *    the published example is not valid JSON the fixture is the repaired version and the note says what was repaired.
 *  - "live-keyless": the real body returned by the public OKX Exchange v5 REST without any key on 2026-10-11, cut to a
 *    few rows. The numbers are market data of that instant.
 *  - "synthetic": invented for edge cases.
 *
 * Fixtures prove PARSING. They say nothing about profit, return or edge, and no value here is a recommendation.
 */

export type FixtureProvenance = "doc-example" | "live-keyless" | "synthetic";

export interface Fixture {
  readonly provenance: FixtureProvenance;
  readonly source: string;
  readonly note: string;
  readonly body: unknown;
}

const DOCS = "https://web3.okx.com/onchainos/dev-docs";
const LIVE = "https://www.okx.com";

function fixture(provenance: FixtureProvenance, source: string, note: string, body: unknown): Fixture {
  return Object.freeze({ provenance, source, note, body });
}

const DOC_NOTE = "reconstruído a partir do exemplo da página (texto resumido por ferramenta)";

export const FIXTURES = {
  // ---- Market: preço, índice, candles, trades -------------------------------------------------
  "market.price.supported-chains/doc": fixture("doc-example", `${DOCS}/market/market-price-chains`, `${DOC_NOTE}; só o primeiro item; chainLogoUrl não aparece no exemplo`, {
    code: "0",
    msg: "",
    data: [{ chainIndex: "1", chainName: "Ethereum", chainSymbol: "ETH" }],
  }),
  "market.price.price/doc": fixture("doc-example", `${DOCS}/market/market-price`, `${DOC_NOTE}; o exemplo pede chainIndex 66 e responde 1: aqui os dois são 1 (reparo)`, {
    code: "0",
    msg: "",
    data: [{ chainIndex: "1", tokenContractAddress: "0x382bb369d343125bfb2117af9c149795c6c65c50", time: "1716892020000", price: "26.458143090226812" }],
  }),
  "market.price.price/doc-literal-mismatch": fixture("doc-example", `${DOCS}/market/market-price`, `${DOC_NOTE}; a resposta literal do exemplo (chainIndex 1) para um pedido com chainIndex 66: deve ser recusada`, {
    code: "0",
    msg: "",
    data: [{ chainIndex: "1", tokenContractAddress: "0x382bb369d343125bfb2117af9c149795c6c65c50", time: "1716892020000", price: "26.458143090226812" }],
  }),
  "market.index.current-price/doc": fixture("doc-example", `${DOCS}/market/index-price`, `${DOC_NOTE}; o original tem code numérico 0 e JSON inválido (vírgulas), reparado`, {
    code: 0,
    msg: "success",
    data: [{ chainIndex: "1", tokenContractAddress: "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72", time: "1716892020000", price: "26.458143090226812" }],
  }),
  "market.price.candles/doc": fixture("doc-example", `${DOCS}/market/market-candlesticks`, `${DOC_NOTE}; as duas velas do exemplo têm o mesmo ts (defeito da página, mantido)`, {
    code: "0",
    msg: "",
    data: [
      ["1597026383085", "3.721", "3.743", "3.677", "3.708", "22698348.04828491", "226348.0482", "0"],
      ["1597026383085", "3.731", "3.799", "3.494", "3.72", "67632347.24399722", "6767.2439", "1"],
    ],
  }),
  "market.price.trades/doc": fixture("doc-example", `${DOCS}/market/market-trades`, `${DOC_NOTE}; o original tem JSON inválido (vírgula faltando e vírgula final), reparado`, {
    code: "0",
    msg: "",
    data: [
      {
        id: "1739439633000!@#120!@#14731892839",
        chainIndex: "501",
        tokenContractAddress: "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC",
        txHashUrl: "https://solscan.io/tx/zgDzoiVG4XuDgQcoEg9vhpRyfyk5thNUQuTeTCeF289Qec5iraeCrUzPLyiE2UCviox2ebbTcsagGvzYF7M5uqs",
        userAddress: "2kCm1RHGJjeCKL4SA3ZJCLyXqUD7nEJ7GMtVaP7c6jQ8",
        dexName: "Orca Whirlpools",
        poolLogoUrl: "https://static.okx.com/cdn/wallet/logo/dex_orcaswap.png",
        type: "sell",
        changedTokenInfo: [
          { amount: "100.396595878", tokenSymbol: "ai16z", tokenContractAddress: "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC" },
          { amount: "2.482831", tokenSymbol: "SOL", tokenContractAddress: "So11111111111111111111111111111111111111112" },
        ],
        price: "26.458143090226812",
        volume: "519.788163",
        time: "1739439633000",
        isFiltered: "0",
      },
    ],
  }),
  "market.index.historical-price/doc": fixture("doc-example", `${DOCS}/market/historical-index-price`, `${DOC_NOTE}; o exemplo cita o caminho /api/v5/wallet/token/historical-price; os tempos foram escritos como texto`, {
    code: "0",
    msg: "success",
    data: [
      {
        cursor: "31",
        prices: [
          { time: "1700040600000", price: "1994.430000000000000000" },
          { time: "1700040300000", price: "1994.190000000000000000" },
          { time: "1700040000000", price: "1992.090000000000000000" },
        ],
      },
    ],
  }),

  // ---- Market: token ----------------------------------------------------------------------------
  "market.token.search/doc": fixture("doc-example", `${DOCS}/market/market-token-search`, `${DOC_NOTE}; o exemplo pede weth nas cadeias 1 e 10 e responde com tokens da Solana (defeito da página)`, {
    code: "0",
    msg: "",
    data: [
      {
        chainIndex: "501",
        change: "6.59",
        decimal: "8",
        explorerUrl: "https://web3.okx.com/explorer/solana/token/XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
        holders: "22447",
        liquidity: "3492546.00711048141155477039737838",
        marketCap: "51095303.595316825571569398",
        price: "381.228119807066217995",
        tagList: { communityRecognized: true },
        tokenContractAddress: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
        tokenLogoUrl: "https://static.oklink.com/cdn/web3/currency/token/large/501-XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB-900/type=default_90_0?v=1771926275192",
        tokenName: "Tesla xStock",
        tokenSymbol: "TSLAx",
        cursor: "0",
      },
    ],
  }),
  "market.token.basic-info/doc": fixture("doc-example", `${DOCS}/market/market-token-basic-info`, `${DOC_NOTE}; só o primeiro item`, {
    code: "0",
    msg: "",
    data: [
      {
        chainIndex: "501",
        decimal: "6",
        tagList: { communityRecognized: true },
        tokenContractAddress: "5mbK36SZ7J19An8jFochhQS4of8g6BwUjbeCSxBSoWdp",
        tokenLogoUrl: "https://static.oklink.com/cdn/web3/currency/token/small/501-5mbK36SZ7J19An8jFochhQS4of8g6BwUjbeCSxBSoWdp-106?v=1749146943562",
        tokenName: "michi",
        tokenSymbol: "$michi",
      },
    ],
  }),
  "market.token.price-info/doc": fixture("doc-example", `${DOCS}/market/market-token-price-info`, `${DOC_NOTE}; só o primeiro item`, {
    code: "0",
    msg: "",
    data: [
      {
        chainIndex: "501",
        circSupply: "555761678.7348550000",
        holders: "46998",
        liquidity: "2909733.283759244562509712218832656",
        marketCap: "12252728.212049527112081409",
        maxPrice: "0.023000175796511334",
        minPrice: "0.021290716539724027",
        price: "0.022046730965585534",
        priceChange1H: "-1.24",
        priceChange24H: "-1.8",
        priceChange4H: "-2.64",
        priceChange5M: "0.22",
        time: "1756816961600",
        tokenContractAddress: "5mbK36SZ7J19An8jFochhQS4of8g6BwUjbeCSxBSoWdp",
        tradeNum: "9577269.994247",
        txs1H: "27664",
        txs24H: "127879",
        txs4H: "108489",
        txs5M: "2265",
        volume1H: "7376.6139697593500223",
        volume24H: "213047.96235814982022456",
        volume4H: "33943.03136454470008366",
        volume5M: "544.69701090069000181",
      },
    ],
  }),
  "market.token.advanced-info/doc-rwa": fixture("doc-example", `${DOCS}/market/market-token-advanced-info`, `${DOC_NOTE}; exemplo 1, token RWA, quase todos os campos vazios (vazio é desconhecido, nunca zero)`, {
    code: "0",
    msg: "",
    data: {
      bundleHoldingPercent: "",
      chainIndex: "1",
      createTime: "",
      creatorAddress: "",
      devCreateTokenCount: "",
      devHoldingPercent: "",
      devLaunchedTokenCount: "0",
      devRugPullTokenCount: "",
      isInternal: false,
      lpBurnedPercent: "",
      progress: "",
      protocolId: "",
      riskControlLevel: "1",
      sniperHoldingPercent: "",
      snipersClearAddressCount: "",
      snipersTotal: "",
      stockProfile: { companyName: "Micron Technology, Inc.", exchange: "Nasdaq", industry: "Technology", listingDate: "1984-05-31", stockCode: "MU", stockType: "普通股" },
      suspiciousHoldingPercent: "",
      tokenContractAddress: "0x050362ab1072cb2ce74d74770e22a3203ad04ee5",
      tokenTags: ["dexBoost", "rwaOndoStatusOvernight", "rwaOndo"],
      top10HoldPercent: "92.3947",
      totalFee: "",
    },
  }),
  "market.token.advanced-info/doc-general": fixture("doc-example", `${DOCS}/market/market-token-advanced-info`, `${DOC_NOTE}; exemplo 2, token geral`, {
    code: "0",
    msg: "",
    data: {
      bundleHoldingPercent: "",
      chainIndex: "501",
      createTime: "1729231507000",
      creatorAddress: "HyYNVYmnFmi87NsQqWzLJhUTPBKQUfgfhdbBa554nMFF",
      devCreateTokenCount: "480",
      devHoldingPercent: "",
      devLaunchedTokenCount: "",
      devRugPullTokenCount: "26",
      isInternal: false,
      lpBurnedPercent: "74.3609957824270349103361582217",
      progress: "",
      protocolId: "120596",
      riskControlLevel: "1",
      sniperHoldingPercent: "",
      snipersClearAddressCount: "",
      snipersTotal: "",
      suspiciousHoldingPercent: "",
      tokenContractAddress: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",
      tokenTags: ["dexBoost", "communityRecognized", "devHoldingStatusSellAll", "smartMoneyBuy"],
      top10HoldPercent: "13.6832",
      totalFee: "2180.105145301",
    },
  }),
  "market.token.holder/doc": fixture("doc-example", `${DOCS}/market/market-token-holder`, `${DOC_NOTE}; o original tem uma linha de comentário que não é JSON, removida`, {
    code: "0",
    msg: "",
    data: [
      {
        avgBuyPrice: "0",
        avgSellPrice: "0",
        boughtAmount: "0",
        fundingSource: "9k8jWWqfmTTXrc8gmZqYVxSFJhygURvyVRztivJXFTYP",
        holdAmount: "767501192.534284",
        holdPercent: "76.750184380179418200",
        holderWalletAddress: "2RH6rUTPBJ9rUDPpuV9b8z1YL56k1tYU6Uk5ZoaEFFSK",
        nativeTokenBalance: "6.091849989",
        realizedPnlUsd: "0",
        totalPnlUsd: "0.000000000000000000",
        totalSellAmount: "0",
        unrealizedPnlUsd: "0.000000000000000000",
        cursor: "0",
      },
    ],
  }),
  "market.token.top-liquidity/doc": fixture("doc-example", `${DOCS}/market/market-token-top-liquidity`, `${DOC_NOTE}; só o primeiro dos cinco itens; traz campos fora da tabela (poolBasicFeePercent, poolLogoUrl, sniperTaxInfo)`, {
    code: "0",
    msg: "",
    data: [
      {
        hookFeePercent: { buy: "1%", sell: "1%" },
        liquidityAmount: [
          { tokenAmount: "38775020.48665667", tokenContractAddress: "0xd9db30bb0d2b8d2eae3826a1372117e058791e18", tokenSymbol: "MOO" },
          { tokenAmount: "653.36523431004980229835744728", tokenContractAddress: "0xff080c8ce2e5feadaca0da81314ae59d232d4afd", tokenSymbol: "MU" },
        ],
        liquidityProviderFeePercent: "0.7%",
        liquidityUsd: "1343864.31842109989918644517516400036894252703585374203425260868",
        pool: "MOO/MU",
        poolAddress: "0xc3cc877a8a7d28efdb5dbec9ae71724652431e6411aa1a9fc8928028da554aa1",
        poolBasicFeePercent: null,
        poolCreator: "",
        poolLogoUrl: "https://static.coinall.ltd/cdn/web3/protocol/logo/1770884244454.png/type=png_350_0",
        protocolName: "Uniswap V4 - Community Hook",
        sniperTaxInfo: null,
      },
    ],
  }),
  "market.token.hot-token/doc": fixture("doc-example", `${DOCS}/market/market-token-hot-token`, `${DOC_NOTE}; o original tem comentários que não são JSON, removidos; cursor é número no exemplo e texto na tabela (mantido como número)`, {
    code: "0",
    msg: "",
    data: [
      {
        bundleHoldPercent: "0.055471",
        chainIndex: "501",
        change: "124.46",
        devHoldPercent: "",
        firstTradeTime: "1774376729000",
        holders: "3518",
        inflowUsd: "48877.03736178689",
        insiderHoldPercent: "",
        liquidity: "656584.515776979964291925",
        marketCap: "7120200.171337115253774998",
        mentionsCount: "",
        price: "0.007120235922518026",
        riskLevelControl: "1",
        tokenContractAddress: "FtSRgyCEhKTc1PPgEAXvuHN3NyiP6LS9uyB28KCN3CAP",
        tokenLogoUrl: "https://static.oklink.com/cdn/web3/currency/token/large/501-FtSRgyCEhKTc1PPgEAXvuHN3NyiP6LS9uyB28KCN3CAP-109/type=default_90_0?v=1774381887925",
        tokenSymbol: "CAPTCHA",
        top10HoldPercent: "20.6599",
        txs: "13616",
        txsBuy: "6699",
        txsSell: "6917",
        uniqueTraders: "3508",
        vibeScore: "",
        volume: "2733012.43208665053",
        cursor: 21,
      },
    ],
  }),
  "market.token.top-trader/doc": fixture("doc-example", `${DOCS}/market/market-token-top-trader`, `${DOC_NOTE}; só o primeiro item`, {
    code: "0",
    msg: "",
    data: [
      {
        avgBuyPrice: "0.000061961311739113",
        avgSellPrice: "0.000122073405687202",
        boughtAmount: "48443482.085545000000000000",
        cursor: "0",
        fundingSource: "AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2",
        holdAmount: "0",
        holdPercent: "0.000000000000000000",
        holderWalletAddress: "GHPyCYecXh398J72qi8nx9Sdaq8PiUJmLoL2q2yLwTY9",
        nativeTokenBalance: "0.024254276",
        realizedPnlUsd: "2912.039146298874538842343358",
        soldAmount: "41626711.761828000000000000",
        totalPnlUsd: "2912.039146298874538842343358",
        unrealizedPnlUsd: "0.000000000000000000",
      },
    ],
  }),
  "market.token.cluster.supported-chain/doc": fixture("doc-example", `${DOCS}/market/market-token-cluster-supported-chain`, `${DOC_NOTE}; os dois primeiros itens`, {
    code: "0",
    msg: "",
    data: [
      { chainIndex: "1", chainName: "Ethereum", chainLogo: "https://static.okx.com/cdn/wallet/logo/ETH-20220328.png" },
      { chainIndex: "501", chainName: "Solana", chainLogo: "https://static.okx.com/cdn/wallet/logo/SOL.png" },
    ],
  }),
  "market.token.cluster.overview/doc": fixture("doc-example", `${DOCS}/market/market-token-cluster-overview`, `${DOC_NOTE}; code numérico e campos error_code, error_message, detailMsg; holderNewAddressPercent vem como "--"`, {
    code: 0,
    msg: "success",
    error_code: "0",
    error_message: "",
    detailMsg: "",
    data: {
      clusterConcentration: "Low",
      top100HoldingsPercent: "0.68776",
      rugPullPercent: "1.00000",
      holderNewAddressPercent: "--",
      holderSameFundSourcePercent: "0.47800",
      holderSameCreationTimePercent: "0.09000",
    },
  }),
  "market.token.cluster.list/doc": fixture("doc-example", `${DOCS}/market/market-token-cluster-list`, `${DOC_NOTE}; o exemplo da página está truncado: só o primeiro cluster e o primeiro endereço; holdingAmount do endereço usa notação científica`, {
    code: 0,
    msg: "success",
    error_code: "0",
    error_message: "",
    detailMsg: "",
    data: {
      clusterList: [
        {
          holdingAmount: "161022025.9",
          holdingValueUsd: "9340.1",
          holdingPercent: "0.16103",
          trendType: null,
          averageHoldingPeriod: "1762472580",
          pnlUsd: "0",
          pnlPercent: "0.0",
          buyVolume: "0",
          averageBuyPriceUsd: "0.0",
          sellVolume: "0",
          averageSellPriceUsd: "0.0",
          lastActiveTimestamp: "0",
          clusterAddressList: [
            {
              address: "B6NR5XYLroBdAnKjcF2o1raKqgSdi68yGZm4jtPMmQbQ",
              holdingAmount: "1.61022025886108E8",
              holdingValueUsd: "9340.1",
              holdingPercent: "0.16103",
              averageHoldingPeriod: "1762472580",
              lastActiveTimestamp: "0",
              addressRank: "1",
              isContract: true,
              isExchange: false,
              isKol: false,
            },
          ],
        },
      ],
    },
  }),
  "market.token.cluster.top-holders/doc": fixture("doc-example", `${DOCS}/market/market-token-cluster-top-holders`, `${DOC_NOTE}; code numérico; os valores ausentes vêm como o texto "null"`, {
    code: 0,
    msg: "success",
    error_code: "0",
    error_message: "",
    detailMsg: "",
    data: {
      holdingAmount: "9651442.5",
      holdingPercent: "0.42483",
      clusterTrendType: ["buy", "transferIn"],
      averageHoldingPeriod: "1744614666",
      averagePnlUsd: "null",
      averageBuyPriceUsd: "null",
      averageBuyPricePercent: "null",
      averageSellPriceUsd: "null",
      averageSellPricePercent: "null",
    },
  }),

  // ---- Sinais e leaderboard ---------------------------------------------------------------------
  "market.signal.supported-chain/doc": fixture("doc-example", `${DOCS}/market/market-signal-chains`, `${DOC_NOTE}; cinco cadeias do exemplo, sem a 143`, {
    code: "0",
    msg: "",
    data: [
      { chainIndex: "1", chainName: "Ethereum", chainLogo: "https://static.coinall.ltd/cdn/wallet/logo/ETH-20220328.png" },
      { chainIndex: "196", chainName: "X Layer", chainLogo: "https://static.coinall.ltd/cdn/wallet/logo/okb_22400.png" },
      { chainIndex: "501", chainName: "Solana", chainLogo: "https://static.coinall.ltd/cdn/wallet/logo/SOL-20220525.png" },
      { chainIndex: "8453", chainName: "Base", chainLogo: "https://static.coinall.ltd/cdn/web3/dex/market/base_v2.png" },
      { chainIndex: "56", chainName: "BNB Chain", chainLogo: "https://static.coinall.ltd/cdn/web3/oklinkadmin/picture/new_bsc_chain_color.png" },
    ],
  }),
  "market.signal.list/doc": fixture("doc-example", `${DOCS}/market/market-signal-list`, `${DOC_NOTE}; o original tem um comentário // que não é JSON, removido; o msg não aparece no exemplo; cursor dentro do item`, {
    code: "0",
    msg: "",
    data: [
      {
        amountUsd: "669.455417761799554132",
        chainIndex: "501",
        price: "0.000122496972899498",
        soldRatioPercent: "64.29",
        timestamp: "1774364940575",
        token: {
          holders: "445",
          logo: "https://static.oklink.com/cdn/web3/currency/token/pre/large/501-FN9ZSeNDdPV6bBF9DeDYxvqYK4JvFKeF7DBrhGGXJZ3Q-109/type=webp_90_0?v=1774292374274",
          marketCapUsd: "64466.670905193533007211",
          name: "Van Cleef Memes",
          symbol: "VanCleef",
          tokenAddress: "FN9ZSeNDdPV6bBF9DeDYxvqYK4JvFKeF7DBrhGGXJZ3Q",
          top10HolderPercent: "17.9547",
        },
        triggerWalletAddress: "5jds1qi6nYu2JTZv5YTczPwyaq1RAkNkjbpsma8xSTem,4YzpSZpxDdjNf3unjkCtdWEsz2FL5mok7e5XQaDNqry8,F8sHTSpZpoNB7H2JUZ7tmMb2YWRM1pXiHPuubHVRDSsB",
        triggerWalletCount: "3",
        walletType: "2",
        cursor: "1774364940575!@#123",
      },
    ],
  }),
  "market.leaderboard.supported-chain/doc": fixture("doc-example", `${DOCS}/market/market-signal-leaderboard-supported-chain`, `${DOC_NOTE}; os dois itens do exemplo`, {
    code: "0",
    msg: "",
    data: [
      { chainIndex: "1", chainName: "Ethereum", chainLogo: "https://static.okx.com/cdn/wallet/logo/ETH-20220328.png" },
      { chainIndex: "501", chainName: "Solana", chainLogo: "https://static.okx.com/cdn/wallet/logo/SOL.png" },
    ],
  }),
  "market.leaderboard.list/doc": fixture("doc-example", `${DOCS}/market/market-signal-leaderboard-list`, `${DOC_NOTE}; só o primeiro item; valores redondos de exemplo`, {
    code: "0",
    msg: "",
    data: [
      {
        walletAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        realizedPnlUsd: "125430.56",
        realizedPnlPercent: "312.45",
        winRatePercent: "68.5",
        avgBuyValueUsd: "2340.00",
        topPnlTokenList: [
          { tokenContractAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", tokenSymbol: "USDC", tokenPnlUsd: "45230.12", tokenPnlPercent: "156.78" },
          { tokenContractAddress: "So11111111111111111111111111111111111111112", tokenSymbol: "SOL", tokenPnlUsd: "38120.00", tokenPnlPercent: "98.34" },
          { tokenContractAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", tokenSymbol: "BONK", tokenPnlUsd: "20450.88", tokenPnlPercent: "204.60" },
        ],
        txVolume: "890234.50",
        txs: "342",
        lastActiveTimestamp: "1697630501000",
      },
    ],
  }),

  // ---- Social ---------------------------------------------------------------------------------
  "market.social.sentiment-symbol/doc": fixture("doc-example", `${DOCS}/market/market-social-sentiment-symbol`, `${DOC_NOTE}; o exemplo pede 24 pontos de tendência e devolve 2`, {
    code: "0",
    msg: "",
    data: {
      period: "1h",
      ts: "1697630501000",
      details: [
        {
          tokenSymbol: "BTC",
          mentionCount: "12540",
          xMentionCount: "10200",
          newsMentionCount: "2340",
          sentiment: { bullishCnt: "7890", bearishCnt: "1230", neutralCnt: "3420", bullishRatio: "0.629", bearishRatio: "0.098", label: "bullish" },
          trend: [
            { ts: "1697626901000", mentionCount: "520", bullishRatio: "0.645", bearishRatio: "0.092" },
            { ts: "1697627051000", mentionCount: "498", bullishRatio: "0.631", bearishRatio: "0.101" },
          ],
        },
      ],
    },
  }),
  "market.social.vibe-timeline/doc": fixture("doc-example", `${DOCS}/market/market-social-vibe-timeline`, `${DOC_NOTE}; resumo e primeiro bucket`, {
    code: "0",
    msg: "",
    data: {
      summary: {
        score: "82",
        scoreType: "dex_vibe_hotness",
        scoreRange: "0-100",
        scoreChangeRate: "+15.3",
        mentionsCount: "8450",
        mentionsCountChangeRate: "+22.1",
        engagement: "345600",
        engagementChangeRate: "+18.7",
        impressions: "12800000",
        impressionsChangeRate: "+25.4",
        supportFirstMentioned: true,
      },
      timeline: [
        {
          ts: "1697544101000",
          score: "65",
          mentionCount: "42",
          kols: [{ handle: "VitalikButerin", nickname: "vitalik.eth", avatar: "https://pbs.twimg.com/profile_images/977496875887558661/L86xyLF4_400x400.jpg", followers: "5200000" }],
        },
      ],
    },
  }),
  "market.social.vibe-top-kols/doc": fixture("doc-example", `${DOCS}/market/market-social-vibe-top-kols`, `${DOC_NOTE}; a tabela diz data.kols; se data é objeto ou lista não está claro`, {
    code: "0",
    msg: "",
    data: {
      kols: [
        {
          handle: "VitalikButerin",
          nickname: "vitalik.eth",
          avatar: "https://pbs.twimg.com/profile_images/977496875887558661/L86xyLF4_400x400.jpg",
          followers: "5200000",
          engagement: "125400",
          mentions: "8",
          impressions: "4800000",
          firstMention: { time: "1697544101000", contentId: "1714567890123456789", tweetUrl: "https://x.com/VitalikButerin/status/1714567890123456789" },
        },
      ],
    },
  }),

  // ---- Gateway ---------------------------------------------------------------------------------
  "gateway.supported-chains/doc": fixture("doc-example", `${DOCS}/wallet/onchain-gateway-api-chains`, `${DOC_NOTE}; um item`, {
    code: "0",
    msg: "",
    data: [{ name: "Ethereum", logoUrl: "http://www.eth.org/eth.png", shortName: "ETH", chainIndex: "1" }],
  }),
  "gateway.gas-price/doc": fixture("doc-example", `${DOCS}/wallet/onchain-gateway-api-gas-price`, `${DOC_NOTE}; o original tem comentários // (JSON inválido) e os nomes supportEip1559 e eip1599Protocol divergem da tabela (supporteip1559 e eip1559Protocol): mantidos como no exemplo`, {
    code: "0",
    msg: "",
    data: [
      {
        normal: "21289500000",
        min: "15670000000",
        max: "29149000000",
        supportEip1559: true,
        eip1599Protocol: { suggestBaseFee: "15170000000", baseFee: "15170000000", proposePriorityFee: "810000000", safePriorityFee: "500000000", fastPriorityFee: "3360000000" },
        priorityFee: {},
      },
    ],
  }),
  "gateway.gas-price/synthetic-solana": fixture("synthetic", `${DOCS}/wallet/onchain-gateway-api-gas-price`, "forma de Solana descrita pela tabela da página (percentis em microlamports); os valores são inventados", {
    code: "0",
    msg: "",
    data: [{ priorityFee: {}, proposePriorityFee: "1500", safePriorityFee: "800", fastPriorityFee: "4000", extremePriorityFee: "20000" }],
  }),

  // ---- DeFi ------------------------------------------------------------------------------------
  "defi.product.supported-chains/doc": fixture("doc-example", `${DOCS}/wallet/defi-product-supported-chains`, `${DOC_NOTE}; code numérico; o msg não aparece no exemplo`, {
    code: 0,
    msg: "",
    data: [
      { chainIndex: "1", network: "ETH" },
      { chainIndex: "56", network: "BSC" },
      { chainIndex: "137", network: "POLYGON" },
    ],
  }),
  "defi.product.supported-platforms/doc": fixture("doc-example", `${DOCS}/wallet/defi-product-supported-platforms`, `${DOC_NOTE}; code numérico; o msg não aparece no exemplo`, {
    code: 0,
    msg: "",
    data: [
      { analysisPlatformId: "10", platformName: "Aave V3", investmentCount: 68 },
      { analysisPlatformId: "20", platformName: "Lido", investmentCount: 1 },
      { analysisPlatformId: "30", platformName: "PancakeSwap V3", investmentCount: 120 },
    ],
  }),
  "defi.product.search/doc": fixture("doc-example", `${DOCS}/wallet/defi-product-search`, `${DOC_NOTE}; code numérico; investmentId é número no exemplo e texto na tabela (mantido como número); só o primeiro dos itens`, {
    code: 0,
    msg: "",
    data: {
      total: 8,
      list: [{ investmentId: 9502, name: "USDC", platformName: "Aave V3", rate: "0.02140", tvl: "3423591587.48413", detailPath: null, feeRate: null, productGroup: "SINGLE_EARN", chainIndex: "1" }],
    },
  }),
  "defi.product.detail/doc": fixture("doc-example", `${DOCS}/wallet/defi-product-detail`, `${DOC_NOTE}; code numérico; subscriptionMethod, redeemMethod, feeRate e qaList não aparecem no exemplo`, {
    code: 0,
    msg: "",
    data: {
      investmentId: 9502,
      investmentName: "USDC",
      platformName: "Aave V3",
      platformLogo: "https://static.coinall.ltd/cdn/web3/protocol/logo/aave-v3.png/type=png_350_0?v=1774409445039",
      investType: 1,
      tvl: "3423591587.48413",
      rate: "0.02140",
      rateType: 0,
      rateTypeDesc: "APY",
      network: "Ethereum",
      networkLogo: "https://static.coinall.ltd/cdn/wallet/logo/ETH-20220328.png",
      underlyingToken: [{ tokenSymbol: "USDC", tokenLogo: "https://static.coinall.ltd/cdn/wallet/logo/USDC.png", tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", isBaseToken: false }],
      rateDetails: [{ tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", tokenSymbol: "USDC", rate: "0.0214", title: "Supply APY", type: 1 }],
      aboutToken: [
        { tokenSymbol: "USDC", tokenLogo: "https://static.coinall.ltd/cdn/wallet/logo/USDC.png", tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", isBaseToken: false, marketCap: "55468602892.82830569743700036", price: "0.99988" },
      ],
      isSupportClaim: false,
      isInvestable: true,
      isSupportRedeem: true,
      analysisPlatformId: "10",
      chainIndex: "1",
      detailPath: "aave-v3-ethereum-usdc-9502",
      platformUrl: "https://app.aave.com",
      utilizationRate: "0.755200",
      hasRateChart: true,
      hasTvlChart: false,
    },
  }),
  "defi.product.rate-chart/doc": fixture("doc-example", `${DOCS}/wallet/defi-product-rate-chart`, `${DOC_NOTE}; code numérico; timestamp é número no exemplo e texto na tabela`, {
    code: 0,
    msg: "",
    data: [
      { timestamp: 1741737600000, rate: "0.0312", bonusRate: "0.0045", limitValue: 1, totalReward: "0.0357" },
      { timestamp: 1741651200000, rate: "0.0298", bonusRate: "0.0045", limitValue: null, totalReward: "0.0343" },
    ],
  }),
  "defi.product.tvl-chart/doc": fixture("doc-example", `${DOCS}/wallet/defi-product-tvl-chart`, `${DOC_NOTE}; code numérico; o primeiro timestamp é texto e os outros são números no exemplo`, {
    code: 0,
    msg: "",
    data: {
      chartVos: [
        { timestamp: "1741737600000", tvl: "523847291.45", limitValue: 1 },
        { timestamp: 1741651200000, tvl: "498312044.78", limitValue: null },
        { timestamp: 1741564800000, tvl: "480125367.22", limitValue: -1 },
      ],
      text: null,
    },
  }),
  "defi.product.depth-price-chart/doc-depth": fixture("doc-example", `${DOCS}/wallet/defi-product-depth-price-chart`, `${DOC_NOTE}; gráfico de profundidade (chartType DEPTH); code numérico`, {
    code: 0,
    msg: "",
    data: [
      { tick: -32932, liquidity: "1234567890123456", liquidityNet: "500000000000000", token0Price: "0.9985", token1Price: "1.0015" },
      { tick: -32931, liquidity: "1234567890123456", liquidityNet: "0", token0Price: "0.9986", token1Price: "1.0014" },
    ],
  }),
  "defi.product.depth-price-chart/doc-price": fixture("doc-example", `${DOCS}/wallet/defi-product-depth-price-chart`, `${DOC_NOTE}; histórico de preço (chartType PRICE); code numérico`, {
    code: 0,
    msg: "",
    data: [
      { token0Price: "0.9985", token1Price: "1.0015", timestamp: 1741737600000 },
      { token0Price: "0.9990", token1Price: "1.0010", timestamp: 1741651200000 },
    ],
  }),
  "defi.product.depth-price-chart/doc-error": fixture("doc-example", `${DOCS}/wallet/defi-product-depth-price-chart`, `${DOC_NOTE}; erro de produto que não é pool V3`, {
    code: 84032,
    msg: "This api is only supported for V3 DEX Pool products",
    data: null,
  }),

  // ---- OKX Exchange v5 pública: respostas reais sem chave ------------------------------------
  "public.instruments.swap/live": fixture("live-keyless", `${LIVE}/api/v5/public/instruments?instType=SWAP&instId=BTC-USDT-SWAP`, "BTC-USDT-SWAP, linear, ctVal 0.01 BTC; obtido sem chave em 2026-10-11; cortado a poucas linhas", {
      "code": "0",
      "data": [
        {
          "alias": "",
          "auctionEndTime": "",
          "baseCcy": "",
          "category": "1",
          "contTdSwTime": "1611916860000",
          "ctMult": "1",
          "ctType": "linear",
          "ctVal": "0.01",
          "ctValCcy": "BTC",
          "expTime": "",
          "floatPxLmtPct": "0.005",
          "freq": "",
          "futureSettlement": false,
          "groupId": "4",
          "initPxLmtPct": "0.02",
          "instCategory": "1",
          "instFamily": "BTC-USDT",
          "instId": "BTC-USDT-SWAP",
          "instIdCode": 10459,
          "instType": "SWAP",
          "lever": "100",
          "listTime": "1573557408000",
          "longPosRemainingQuota": "",
          "lotSz": "0.01",
          "maxIcebergSz": "100000000.0000000000000000",
          "maxLmtAmt": "20000000",
          "maxLmtSz": "100000000",
          "maxMktAmt": "",
          "maxMktSz": "35000",
          "maxPlatOICoinLmt": "",
          "maxPlatOILmt": "",
          "maxPxLmtPct": "0.01",
          "maxStopSz": "35000",
          "maxTriggerSz": "100000000.0000000000000000",
          "maxTwapSz": "100000000.0000000000000000",
          "method": "",
          "minSz": "0.01",
          "openType": "call_auction",
          "optType": "",
          "posLmtAmt": "250000",
          "posLmtPct": "30",
          "preMktSwTime": "",
          "quoteCcy": "",
          "rpiMinLevel": "3",
          "rpiMinPxBand": "20",
          "ruleType": "normal",
          "seriesId": "",
          "settleCcy": "USDT",
          "shortPosRemainingQuota": "",
          "state": "live",
          "stk": "",
          "tickSz": "0.1",
          "tradeQuoteCcyList": [],
          "uly": "BTC-USDT",
          "upcChg": []
        }
      ],
      "msg": ""
    }),
  "public.instruments.spot/live": fixture("live-keyless", `${LIVE}/api/v5/public/instruments?instType=SPOT&instId=BTC-USDT`, "BTC-USDT spot; obtido sem chave em 2026-10-11; cortado a poucas linhas", {
      "code": "0",
      "data": [
        {
          "alias": "",
          "auctionEndTime": "",
          "baseCcy": "BTC",
          "category": "1",
          "contTdSwTime": "",
          "ctMult": "",
          "ctType": "",
          "ctVal": "",
          "ctValCcy": "",
          "expTime": "",
          "floatPxLmtPct": "0.005",
          "freq": "",
          "futureSettlement": false,
          "groupId": "12",
          "initPxLmtPct": "",
          "instCategory": "1",
          "instFamily": "",
          "instId": "BTC-USDT",
          "instIdCode": 3,
          "instType": "SPOT",
          "lever": "10",
          "listTime": "1611907686000",
          "longPosRemainingQuota": "",
          "lotSz": "0.00000001",
          "maxIcebergSz": "9999999999.0000000000000000",
          "maxLmtAmt": "20000000",
          "maxLmtSz": "9999999999",
          "maxMktAmt": "1000000",
          "maxMktSz": "1000000",
          "maxPlatOICoinLmt": "",
          "maxPlatOILmt": "",
          "maxPxLmtPct": "0.01",
          "maxStopSz": "1000000",
          "maxTriggerSz": "9999999999.0000000000000000",
          "maxTwapSz": "9999999999.0000000000000000",
          "method": "",
          "minSz": "0.00001",
          "openType": "fix_price",
          "optType": "",
          "posLmtAmt": "",
          "posLmtPct": "",
          "preMktSwTime": "",
          "quoteCcy": "USDT",
          "rpiMinLevel": "3",
          "rpiMinPxBand": "20",
          "ruleType": "normal",
          "seriesId": "",
          "settleCcy": "",
          "shortPosRemainingQuota": "",
          "state": "live",
          "stk": "",
          "tickSz": "0.1",
          "tradeQuoteCcyList": [
            "USDT"
          ],
          "uly": "",
          "upcChg": []
        }
      ],
      "msg": ""
    }),
  "public.funding-rate/live": fixture("live-keyless", `${LIVE}/api/v5/public/funding-rate?instId=BTC-USDT-SWAP`, "inclui prevFundingTime, campo que a documentação não lista; obtido sem chave em 2026-10-11; cortado a poucas linhas", {
      "code": "0",
      "data": [
        {
          "formulaType": "withRate",
          "fundingRate": "-0.0000148689400726",
          "fundingTime": "1791734400000",
          "impactValue": "20000.0000000000000000",
          "instId": "BTC-USDT-SWAP",
          "instType": "SWAP",
          "interestRate": "0.0001000000000000",
          "maxFundingRate": "0.00375",
          "method": "current_period",
          "minFundingRate": "-0.00375",
          "nextFundingRate": "",
          "nextFundingTime": "1791763200000",
          "premium": "-0.0004361072727514",
          "prevFundingTime": "1791705600000",
          "settFundingRate": "-0.0000154175824147",
          "settState": "settled",
          "ts": "1791714443125"
        }
      ],
      "msg": ""
    }),
  "public.funding-rate-history/live": fixture("live-keyless", `${LIVE}/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=3`, "três liquidações, mais recente primeiro; obtido sem chave em 2026-10-11; cortado a poucas linhas", {
      "code": "0",
      "data": [
        {
          "formulaType": "withRate",
          "fundingRate": "-0.0000154175824147",
          "fundingTime": "1791705600000",
          "instId": "BTC-USDT-SWAP",
          "instType": "SWAP",
          "method": "current_period",
          "realizedRate": "-0.0000154175824147"
        },
        {
          "formulaType": "withRate",
          "fundingRate": "-0.000021973068193",
          "fundingTime": "1791676800000",
          "instId": "BTC-USDT-SWAP",
          "instType": "SWAP",
          "method": "current_period",
          "realizedRate": "-0.000021973068193"
        },
        {
          "formulaType": "withRate",
          "fundingRate": "0.0000112787516257",
          "fundingTime": "1791648000000",
          "instId": "BTC-USDT-SWAP",
          "instType": "SWAP",
          "method": "current_period",
          "realizedRate": "0.0000112787516257"
        }
      ],
      "msg": ""
    }),
  "public.mark-price/live": fixture("live-keyless", `${LIVE}/api/v5/public/mark-price?instType=SWAP&instId=BTC-USDT-SWAP`, "preço de marcação; obtido sem chave em 2026-10-11; cortado a poucas linhas", {
      "code": "0",
      "data": [
        {
          "instId": "BTC-USDT-SWAP",
          "instType": "SWAP",
          "markPx": "82970.7",
          "ts": "1791714493199"
        }
      ],
      "msg": ""
    }),
  "public.ticker.swap/live": fixture("live-keyless", `${LIVE}/api/v5/market/ticker?instId=BTC-USDT-SWAP`, "ticker do perpétuo; obtido sem chave em 2026-10-11; cortado a poucas linhas", {
      "code": "0",
      "data": [
        {
          "instType": "SWAP",
          "instId": "BTC-USDT-SWAP",
          "last": "82970.8",
          "lastSz": "1",
          "askPx": "82970.9",
          "askSz": "1570.77",
          "bidPx": "82970.8",
          "bidSz": "580.42",
          "open24h": "82762.7",
          "high24h": "83188",
          "low24h": "82734.4",
          "volCcy24h": "15823.2915",
          "vol24h": "1582329.15",
          "ts": "1791714495270",
          "sodUtc0": "82940.5",
          "sodUtc8": "83016.7"
        }
      ],
      "msg": ""
    }),
  "public.ticker.spot/live": fixture("live-keyless", `${LIVE}/api/v5/market/ticker?instId=BTC-USDT`, "ticker do spot; obtido sem chave em 2026-10-11; cortado a poucas linhas", {
      "code": "0",
      "data": [
        {
          "instType": "SPOT",
          "instId": "BTC-USDT",
          "last": "82983.2",
          "lastSz": "0.00505015",
          "askPx": "82983.2",
          "askSz": "0.82990421",
          "bidPx": "82983.1",
          "bidSz": "0.2529884",
          "open24h": "82826.4",
          "high24h": "83230",
          "low24h": "82767.4",
          "volCcy24h": "133369722.134158974",
          "vol24h": "1607.11433251",
          "ts": "1791715024170",
          "sodUtc0": "82985.1",
          "sodUtc8": "83054.6"
        }
      ],
      "msg": ""
    }),
  "public.candles.swap/live": fixture("live-keyless", `${LIVE}/api/v5/market/candles?instId=BTC-USDT-SWAP&bar=1m&limit=3`, "três velas de 1 minuto, a mais recente aberta (confirm 0); obtido sem chave em 2026-10-11; cortado a poucas linhas", {
      "code": "0",
      "data": [
        [
          "1791714480000",
          "82970.8",
          "82970.9",
          "82970.8",
          "82970.8",
          "8.74",
          "0.0874",
          "7251.64803",
          "0"
        ],
        [
          "1791714420000",
          "82970.8",
          "82970.9",
          "82970.8",
          "82970.8",
          "241.48",
          "2.4148",
          "200357.88966",
          "1"
        ],
        [
          "1791714360000",
          "82975.7",
          "82975.7",
          "82970.8",
          "82970.9",
          "442.09",
          "4.4209",
          "366824.21949",
          "1"
        ]
      ],
      "msg": ""
    }),
  "public.candles.spot/live": fixture("live-keyless", `${LIVE}/api/v5/market/candles?instId=BTC-USDT&bar=1m&limit=3`, "três velas de 1 minuto do spot, a mais recente aberta; obtido sem chave em 2026-10-11; cortado a poucas linhas", {
      "code": "0",
      "data": [
        [
          "1791715020000",
          "82983.2",
          "82983.2",
          "82983.2",
          "82983.2",
          "0.012228",
          "1014.7185696",
          "1014.7185696",
          "0"
        ],
        [
          "1791714960000",
          "82983.5",
          "82987",
          "82983.2",
          "82983.2",
          "0.01778343",
          "1475.734896878",
          "1475.734896878",
          "1"
        ],
        [
          "1791714900000",
          "82987",
          "82987",
          "82981.7",
          "82985.4",
          "0.39175439",
          "32509.934931786",
          "32509.934931786",
          "1"
        ]
      ],
      "msg": ""
    }),
  "public.books.swap/live": fixture("live-keyless", `${LIVE}/api/v5/market/books?instId=BTC-USDT-SWAP&sz=5`, "cinco níveis por lado; obtido sem chave em 2026-10-11; cortado a poucas linhas", {
      "code": "0",
      "msg": "",
      "data": [
        {
          "asks": [
            [
              "82948.1",
              "890.22",
              "0",
              "62"
            ],
            [
              "82948.2",
              "0.56",
              "0",
              "6"
            ],
            [
              "82948.3",
              "0.06",
              "0",
              "4"
            ],
            [
              "82948.4",
              "3.51",
              "0",
              "2"
            ],
            [
              "82948.5",
              "17.18",
              "0",
              "3"
            ]
          ],
          "bids": [
            [
              "82948",
              "298.2",
              "0",
              "26"
            ],
            [
              "82947.9",
              "0.08",
              "0",
              "4"
            ],
            [
              "82947.8",
              "18.52",
              "0",
              "5"
            ],
            [
              "82947.7",
              "0.09",
              "0",
              "1"
            ],
            [
              "82947.6",
              "0.09",
              "0",
              "1"
            ]
          ],
          "ts": "1791715028856",
          "seqId": 345292865266
        }
      ]
    }),
  "public.books.spot/live": fixture("live-keyless", `${LIVE}/api/v5/market/books?instId=BTC-USDT&sz=5`, "cinco níveis por lado; obtido sem chave em 2026-10-11; cortado a poucas linhas", {
      "code": "0",
      "msg": "",
      "data": [
        {
          "asks": [
            [
              "82983.2",
              "0.82851885",
              "0",
              "16"
            ],
            [
              "82983.9",
              "0.06672986",
              "0",
              "1"
            ],
            [
              "82984",
              "0.17979244",
              "0",
              "1"
            ],
            [
              "82984.6",
              "0.0000102",
              "0",
              "1"
            ],
            [
              "82986",
              "0.00301517",
              "0",
              "1"
            ]
          ],
          "bids": [
            [
              "82983.1",
              "0.2517884",
              "0",
              "14"
            ],
            [
              "82981.6",
              "0.00111991",
              "0",
              "1"
            ],
            [
              "82980.2",
              "0.006026",
              "0",
              "1"
            ],
            [
              "82980.1",
              "0.05528958",
              "0",
              "1"
            ],
            [
              "82980",
              "0.18522471",
              "0",
              "2"
            ]
          ],
          "ts": "1791715026956",
          "seqId": 82239039626
        }
      ]
    }),
  "public.open-interest/live": fixture("live-keyless", `${LIVE}/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP`, "interesse em aberto; obtido sem chave em 2026-10-11; cortado a poucas linhas", {
      "code": "0",
      "data": [
        {
          "instId": "BTC-USDT-SWAP",
          "instType": "SWAP",
          "oi": "3003402.5300000128",
          "oiCcy": "30034.025300000128",
          "oiUsd": "2491947106.3612506202624",
          "ts": "1791714502733"
        }
      ],
      "msg": ""
    }),
} as const satisfies Record<string, Fixture>;

export type FixtureKey = keyof typeof FIXTURES;

/** The body of a fixture as the text a server would send. */
export function fixtureText(key: FixtureKey): string {
  return JSON.stringify(FIXTURES[key].body);
}
