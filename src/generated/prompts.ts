/**
 * Texto dos prompts do Jev, em constantes puras (sem imports), com marcadores {nome} onde o codigo preenche um valor.
 * Reconstruido em 2026-10-17 a partir dos literais que estavam inline nas fontes da main (antes da extracao do commit 0147547), sem mudar uma letra:
 * a igualdade das perguntas montadas foi provada por teste contra o codigo original. O gerador do dono, a partir dos nos `p-*` do grafo, nao existe
 * em nenhum commit; quando existir, ele deve produzir este mesmo arquivo. Nao edite o texto aqui sem passar pelo Jev.
 */
export const PROMPTS = {
  "p-system-one": {
    "question": "Which single leverage candidate should System One open now, or should it hold?",
    "goal": "Act as the fast decision layer of the wallet. Grow median wealth over the horizon while keeping the probability of touching liquidation low. Never exceed the listed caps; prefer hold when carry and basis are small relative to drag and liquidation risk.",
    "baseInputs": "Every candidate already passed the phase envelope: leverage cap, liquidation floor, order and exposure caps, complete inventory. Touch probabilities assume no drift. Funding carry is from the candidate side's point of view. Probabilities are decision weights, not win rates.",
    "quantInputs": " The state may also carry a quant block. It describes risk and data quality and does not change which candidates are eligible; touchProbability above is the envelope figure. dataGrade: A clean, B some bars were marked as outliers, C bars were lost so only the newest continuous stretch is used. sigmaDaily is the band of daily volatility from several estimators; regime says whether recent volatility is calm, normal or stressed against the sample; tailRatio is close to close sigma over robust sigma, and well above 1 means a few extreme bars dominate; excessKurtosis and hillIndex describe fat tails, where a lower hillIndex is a heavier tail, about 2 to 4 is typical for crypto, and it uses the largest 10 percent of moves so it is biased for other shapes; clusteringHalfLifeBars is how many bars a volatility shock takes to halve, null when the fit was unreliable. Per candidate, sideAwareTouch is a closed form that uses the liquidation barrier of the candidate side and simulatedTouch is a simulation that keeps fat tails and volatility clustering. Both assume no drift and are decision weights, not win rates. A simulatedTouch of 0 means fewer than 1 hit in simulationPaths, not impossibility, and simulatedStdError is its standard error. In 90 days of real data for five perpetuals the simulation still underestimated low probabilities by a factor of about 4 to 22, and it was calibrated for barriers 1 to 4 horizon sigmas away. Read low values as a floor and far barriers as extrapolation.",
    "hold": "Do not open or add to a position now. Choose this when the funding carry, the basis and the realized volatility do not justify the liquidation risk inside the horizon, or when any input is missing.",
    "candidate": "Open a {side} position at {leverage}x with margin {marginUsd} USD (notional {notionalUsd} USD). Choose this only when the expected funding carry and basis over the horizon outweigh the volatility drag and the probability of touching liquidation listed for it."
  },
  "p-operator": {
    "instructions": {
      "question": "Which single candidate should the operator commit capital to now, or should it hold?",
      "goal": "Act as the wallet's financial operator. Grow realized net equity across the chains listed. Preserve capital; never borrow. Prefer hold when costs, staleness or incomplete evidence make the net gain doubtful.",
      "inputs": "Every candidate already passed deterministic gates for balance, gas reserve, size, freshness and costs. netUsd is a conservative estimate after fees, gas and inference; it is not a forecast. Probabilities are decision weights, not win rates."
    },
    "criteria": {
      "hold": "Commit no capital this cycle: no candidate clears costs with adequate certainty, or the inventory evidence is incomplete.",
      "byKind": {
        "dex_round_trip": "Swap the base asset to the counter asset and back on the same chain",
        "cross_chain_rebalance": "Bridge the base asset to the home chain",
        "kuru_spot_maker": "Keep inventory allocated to the every-block Kuru maker",
        "defi_yield": "Subscribe the base asset to a DeFi product for the stated horizon",
        "perp_funding_carry": "Research only",
        "memepump_research": "Research only"
      },
      "fallback": "Candidate",
      "candidateFormat": "{kindText} ({from} to {to}, chain {chain})",
      "candidateSuffix": ". Commit the listed size now because its conservative net result after every listed cost is the best realizable gain among the candidates."
    }
  },
  "p-real-allocation": {
    "question": "Should this paper cycle hold, or is the observed evidence insufficient to assess even its current readiness?",
    "goal": "Preserve capital and describe the current evidence honestly. No candidate is financially qualified and execution is disabled.",
    "inputs": "State is a sanitized summary. Values may be unknown. Source freshness does not establish economic eligibility. Do not infer address, private balances, profit, or permission.",
    "criteria": {
      "hold": "The observed data supports a paper hold decision; commit no capital because no financially qualified candidate exists.",
      "insufficient_evidence": "The source evidence is inconsistent or insufficient to assess readiness; commit no capital and request better observations."
    }
  },
  "p-jev-read": {
    "analysisInputsText": "Optional analysis is a pre-computed digest of CLOSED candles and public derivatives data for this market, ageSec seconds old. It can lag the tape by minutes, may be missing in whole or in part, is descriptive only and never overrides the tape. trend: regime (up, down or range from ADX on 15 minute bars), adx15m (above 25 is a trend), efficiency15m (0 noise, 1 straight line), emaStack15m, emaStack1h and emaStack4h (+1 close above EMA20 above EMA50, -1 the opposite, 0 mixed), extensionAtr15m (signed distance of the price from EMA50 in ATR units, positive above). momentum: rsi5m, rsi15m and rsi1h (RSI 14), macdHistAtr15m (MACD histogram in ATR units). volatility: atrBps15m and atrBps1h, volRank24h (percentile 0 to 1 of the last hour's volatility among the last 24 hours) and bbWidthRank15m (percentile 0 to 1 of the 15 minute Bollinger band width against recent history, low is a squeeze), bbPercentB15m (0 lower band, 1 upper band), expectedAbsMove5mBps (typical absolute 5 minute move). structure: donchianPos1h (0 low, 1 high of the last 24 hours, outside 0 to 1 means the price is beyond that range), supportBps and resistanceBps (distance to the nearest computed level below and above, null if none) with supportTouches and resistanceTouches (swing points that formed it), renkoRun15m (signed run of Renko bricks, positive up). smc15m and smc1h inside structure are smart money digests of the closed 15 minute and 1 hour bars, null when there are too few bars: demandBlockBps and supplyBlockBps (distance from the price to the nearest untouched order block, a demand zone below or a supply zone above, 0 when the price is inside it, null if none), gapsUp and gapsDown (how many fair value gaps, price imbalances left by a fast move, are still open) with gapNearestBps (distance to the nearest open gap, 0 when inside), lastBreak (the latest break of structure, a close beyond the last swing point: kind BOS continues the previous direction and CHoCH reverses it, dir up or down, ageBars closed bars ago), rangePos (0 to 1 position of the price inside the last swing range, below 0.5 is discount and above 0.5 is premium) with rangeState (inside, above or below that range), poolAboveBps and poolBelowBps (distance to the nearest equal highs or equal lows, where stop orders tend to rest, not yet swept) and lastSweep (kind highs or lows, ageBars: the latest wick through such a pool that closed back inside). They describe where the price has been, not an entry or an exit. derivatives: fundingZ and fundingPctile (current funding against the last 30 days), oiChange1hPct and oiPriceRegime (open interest change read with price: long_buildup, short_buildup, short_covering, long_unwind, mixed), longShortRatio and longShortZ (account positioning), takerBuyShare1h (share of taker volume that bought in the last hour, 0.5 balanced). crossAsset: corrBtc48h, betaBtc48h, relStrengthVsBtc24hBps (24 hour move minus the BTC move). cost: moveToCost is the typical 5 minute move divided by (assumedRoundTripFeeBps + spreadBps); well below 1 means a typical move does not pay for the cost.",
    "direction": {
      "type": "choice",
      "instructions": {
        "question": "Over the next {horizonMinutes} minutes, should a spot trader on {instId} buy, sell or hold?",
        "goal": "Read the tape of one market. Capital is preserved first: costs are the spread plus taker fees (assume about 20 bps for a round trip), so a move that does not clearly exceed them is not an edge. Prefer hold when the evidence is mixed, thin or contradictory.",
        "inputsPlain": "Spread and depth describe the book. Returns are in basis points over the last 1, 5, 15 and 30 minutes. volBpsPerMinute is realized volatility. flow60s is taker flow over the last 60 seconds, cvdBase is taker buys minus taker sells in base units. Funding is of the matching perpetual when known. Every figure is a noisy observation and the probabilities you give are uncalibrated decision weights, not win rates.",
        "inputsWithAnalysis": "Spread and depth describe the book. Returns are in basis points over the last 1, 5, 15 and 30 minutes. volBpsPerMinute is realized volatility. flow60s is taker flow over the last 60 seconds, cvdBase is taker buys minus taker sells in base units. Funding is of the matching perpetual when known. Optional analysis is a pre-computed digest of CLOSED candles and public derivatives data for this market, ageSec seconds old. It can lag the tape by minutes, may be missing in whole or in part, is descriptive only and never overrides the tape. trend: regime (up, down or range from ADX on 15 minute bars), adx15m (above 25 is a trend), efficiency15m (0 noise, 1 straight line), emaStack15m, emaStack1h and emaStack4h (+1 close above EMA20 above EMA50, -1 the opposite, 0 mixed), extensionAtr15m (signed distance of the price from EMA50 in ATR units, positive above). momentum: rsi5m, rsi15m and rsi1h (RSI 14), macdHistAtr15m (MACD histogram in ATR units). volatility: atrBps15m and atrBps1h, volRank24h (percentile 0 to 1 of the last hour's volatility among the last 24 hours) and bbWidthRank15m (percentile 0 to 1 of the 15 minute Bollinger band width against recent history, low is a squeeze), bbPercentB15m (0 lower band, 1 upper band), expectedAbsMove5mBps (typical absolute 5 minute move). structure: donchianPos1h (0 low, 1 high of the last 24 hours, outside 0 to 1 means the price is beyond that range), supportBps and resistanceBps (distance to the nearest computed level below and above, null if none) with supportTouches and resistanceTouches (swing points that formed it), renkoRun15m (signed run of Renko bricks, positive up). smc15m and smc1h inside structure are smart money digests of the closed 15 minute and 1 hour bars, null when there are too few bars: demandBlockBps and supplyBlockBps (distance from the price to the nearest untouched order block, a demand zone below or a supply zone above, 0 when the price is inside it, null if none), gapsUp and gapsDown (how many fair value gaps, price imbalances left by a fast move, are still open) with gapNearestBps (distance to the nearest open gap, 0 when inside), lastBreak (the latest break of structure, a close beyond the last swing point: kind BOS continues the previous direction and CHoCH reverses it, dir up or down, ageBars closed bars ago), rangePos (0 to 1 position of the price inside the last swing range, below 0.5 is discount and above 0.5 is premium) with rangeState (inside, above or below that range), poolAboveBps and poolBelowBps (distance to the nearest equal highs or equal lows, where stop orders tend to rest, not yet swept) and lastSweep (kind highs or lows, ageBars: the latest wick through such a pool that closed back inside). They describe where the price has been, not an entry or an exit. derivatives: fundingZ and fundingPctile (current funding against the last 30 days), oiChange1hPct and oiPriceRegime (open interest change read with price: long_buildup, short_buildup, short_covering, long_unwind, mixed), longShortRatio and longShortZ (account positioning), takerBuyShare1h (share of taker volume that bought in the last hour, 0.5 balanced). crossAsset: corrBtc48h, betaBtc48h, relStrengthVsBtc24hBps (24 hour move minus the BTC move). cost: moveToCost is the typical 5 minute move divided by (assumedRoundTripFeeBps + spreadBps); well below 1 means a typical move does not pay for the cost. Every figure is a noisy observation and the probabilities you give are uncalibrated decision weights, not win rates."
      },
      "criteria": {
        "buy": "Buy: the mid is more likely to be higher after the horizon by clearly more than the costs.",
        "sell": "Sell: the mid is more likely to be lower after the horizon by clearly more than the costs.",
        "hold": "Hold: the edge is uncertain, smaller than the costs, or the signals disagree."
      }
    }
  },
  "p-lab-chooser": {
    "shadowNotice": "This is a SHADOW evaluation for measurement: nothing is executed, signed or sent, no capital is at risk and no real position exists.",
    "question": "Which single candidate, if any, has the best net result over its horizon, or is holding better?",
    "goal": "{shadowNotice} Pick the candidate whose expected net result over the horizon, after the listed costs, is clearly positive. Holding is always valid and is the preferred answer whenever the evidence is thin, mixed, stale or unknown.",
    "inputs": "Each candidate has an opaque id, a modality, a side and a horizon in hours. Every figure under values was measured before the decision time, and names ending in Bps are basis points. A criterion listed under unknown is UNKNOWN: it is not zero and must not be guessed or assumed. costBps is already a conservative total of fees, spread and slippage. The probabilities you give are uncalibrated decision weights, not win rates, and your confidence is not calibrated.",
    "holdCriterion": "Hold: do not select any candidate this epoch. This is a valid and preferred answer when the evidence is thin, mixed, stale or unknown, or when the expected net result does not clearly exceed costBps.",
    "candidateCriterion": "Select candidate {candidateId}: the hypothetical {side} {modality} position over {horizonHours} hours. Select it only if its figures imply a net gain over that horizon that is clearly larger than its costBps and the uncertainty; figures listed as unknown count against it."
  },
  "p-inonu": {
    "decision": {
      "kindDescriptions": {
        "zone": "the zone",
        "spot": "the spot market",
        "perp": "the perpetual swap",
        "token": "this on-chain token",
        "candidate": "this candidate"
      },
      "criteria": {
        "hold": "Do nothing now. Choose this when the evidence is thin, stale (see the ages), conflicting, or when a field that matters is null.",
        "buy": "Take the buying side on {kind} {id}. Choose it only when the flow, the score and the state in the Brief support it.",
        "sell": "Take the selling side on {kind} {id}. Choose it only when the flow, the score and the state in the Brief support it."
      },
      "question": "What is the single best action now: buy or sell one candidate, or hold?",
      "goal": "You are the decision layer of a read-only advisory desk. Candidates are listed in the state; a zone describes demand or supply and is never an order by itself. Prefer hold when the evidence is thin, stale or conflicting.",
      "rankingGoalSuffix": " The candidates are instruments the person chose to compare: pick the one whose evidence is clearly strongest, or hold when none stands out.",
      "inputs": "The state is an Evidence Brief: flow counts and levels, candidates with score, state and distances in basis points of the current price, the age of each field, and nulls with their reasons. Nothing in it is a recommendation.",
      "rankingInputsSuffix": " In fluxo.itens each instrument has negocios (trades counted in the last minute), deltaRazao (bought minus sold over everything traded, from -1 to 1, comparable across instruments) and imb (counts of imbalances, c on the buying side and v on the selling side, null while the thresholds warm up). A candidate nota is the score of its best zone; estado says how many zones it has."
    },
    "portfolio": {
      "criteria": {
        "buy": "Consider acquiring this candidate only if its observed evidence supports a conservative portfolio decision. No size or order is requested.",
        "hold": "Leave this candidate unchanged; when its observed balance is zero or unknown, this means no acquisition or sale.",
        "abstain": "Do not give a directional recommendation when evidence is missing, stale, conflicting, or insufficient for this candidate.",
        "sell": "Consider reducing an observed positive position in this candidate if the evidence supports it. No size or order is requested."
      },
      "question": "What is the advisory portfolio action for candidate {id}?",
      "goal": "Assess conservative capital preservation and growth without leverage. The set is bounded and partial; it is not the entire wallet or market. Missing valuation, cost basis, confidence and returns remain unknown. Prefer abstention when an essential source is unavailable. Do not infer a guaranteed profit, allocation size, return or numeric confidence.",
      "inputs": "The state is only an Evidence Brief. All fluxo.carteira arrays follow candidatos order. items=[symbol,exactBalance,buyShare,riskLevel,aggregateAgeMs,gapKeysIndices,origin]; market=[priceUsd,liquidityUsd,changePct(m5,h1,h4,h24),volumeUsd(m5,h1,h4,h24),ageMs,stale], with the two window groups flattened. A numeric market entry is a zero-based reference to a prior full tuple in this same array, representing an exactly identical observation including age and stale; null means unavailable. riskDetails=[lpBurnedPct,devCreateCount,devLaunchedCount,devRugCount,ageMs,stale]; its level and documented tags are in items.riskLevel and risk_flag gaps. concentration=[top10HoldPct,devHoldPct,bundleHoldPct,sniperHoldPct,suspiciousHoldPct] uses riskDetails freshness; missing trailing values mean null, never zero. poolLiquidity=[poolCount,topPoolsLiquidityUsd,largestPoolSharePct,ageMs,stale] uses the same prior-tuple numeric reference convention in its own array and summarizes at most five returned pools: always partial; the largest share denominator is those pools, not the market. All percentages are percentage points, qualified by the source; ambiguous units remain null with gaps. Each source has its own age/stale: stale or unknown-age data is not current support. Null arrays mean unavailable. Origin is in items; risk_flag is observed risk, not an action. Flow not collected because of the cap is an explicit optional gap, not an invented flow analysis or a blanket action rule. Wallet valuation and cost basis remain unknown; market price is public token evidence, not wallet net worth. Symbols are labels; chain and contract in the candidate id establish identity. A native token has no invented wrapped mapping."
    },
    "ecosystem": {
      "goal": "You are the decision layer of an advisory desk that helps a person use a small balance well. The candidates in the state were put forward by code from several networks, each with measured facts, the families of evidence in its favour and marks of care. Weigh all the facts together, not one: a candidate with a mark of care needs a strong case, and few good picks are better than many weak ones. Prefer skip when the evidence is thin, conflicting, stale or marked. A size is a fraction of a ceiling the code computed from the person's balance; you never choose an amount. Do not invent numeric confidence, freshness, safety or a guaranteed return.",
      "inputs": "The state is an Evidence Brief. fluxo.ecossistema.itens has one object per candidate id, with the short keys explained in fluxo.ecossistema.chaves. A null is unknown, never zero. x is the ceiling of what may be bought as a percent of the portfolio; x of 0 or null means no buy size is available. fontes explains origin, ageMs, stale and timeFrame per network/source; itens.q describes token-risk metadata. Fresh hot data does not make signals or risk fresh. Unknown age or unavailable risk is not evidence of freshness or safety; the Brief asOf is not the source time. Nothing in the state is a recommendation.",
      "stanceCriteria": {
        "skip": "Do not buy it: the evidence is thin, conflicting, or the marks of care outweigh it.",
        "watch": "Interesting, but not now: it may deserve a look later.",
        "buy_third": "Buy one third of the ceiling of this candidate: the case is good but not strong.",
        "buy_two_thirds": "Buy two thirds of the ceiling of this candidate: the case is strong.",
        "buy_full": "Buy the whole ceiling of this candidate: the case is very strong and nothing gives pause."
      },
      "stanceQuestion": "What is your stance on candidate {symbol} ({id})?",
      "familyMeanings": {
        "nenhuma": "No single observed family is sufficiently supported or stands out.",
        "carteiras": "Tracked wallets bought it and mostly still hold it.",
        "fluxo": "Buys are most of the transactions.",
        "liquidez": "Its pool is deep: people can leave.",
        "distribuicao": "The supply is not concentrated in a few wallets or in the creator.",
        "tracao": "It rises with real volume.",
        "seguranca": "The provider gives it a low risk level and marks no risk flag."
      },
      "familyQuestion": "Which observed family of evidence is best supported for candidate {symbol} ({id})?",
      "familyGoal": "Choose the single positive family best supported by observed facts, or none. This question is independent of the stance question and does not receive its answer."
    },
    "priority": {
      "question": "Which one eligible candidate has the first priority to watch or buy now?",
      "goal": "Choose one real priority from the validated decisions, or none. Never rank skip or change a stance. Ranking a watch never makes it a purchase and does not choose an amount. Missing, stale, conflicting or unknown evidence may support none. Do not invent confidence, freshness or returns.",
      "inputs": "The state contains the original Evidence Brief and the actual validated decisions of the first evaluation. Decisions are not new market evidence. Compare their observed facts and source ages; null is unknown, not zero. Only offered IDs are eligible.",
      "none": "No watch or buy candidate deserves priority now.",
      "candidate": "Candidate {id}, with its validated stance unchanged."
    },
    "screener": {
      "goal": "You turn the sentence of a person into the filter of a table of crypto trading pairs. Read the sentence in the state and pick the option that matches what the person asked. When the sentence says nothing about this question, pick the neutral option described in it.",
      "inputs": "The state holds only the sentence of the person. There is no market data: do not guess prices or names."
    }
  }
} as const;
