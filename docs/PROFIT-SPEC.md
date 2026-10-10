# Economic qualification addendum

User steering on 2026-10-09: improve architecture to seek net profit continuously. Continuous profit remains an aspiration, not a guarantee. Existing frozen R1-R8 remain unchanged.

- P1 Before an inference call or quote, compute hypothetical full-size two-leg maker spread capture at current quote prices, less two estimated gas transactions, two maker fees and one estimated inference allowance. A configurable positive safety buffer is required. An unfavorable or invalid estimate clears paper resting orders and makes no inference/order call.
- P2 This is only a cost feasibility screen: two complete fills at an unchanged book, cash/inventory availability checked separately. It never certifies expected profit, fill probability, future direction or calibrated alpha. Paper gas estimate failures use disclosed existing fallback; no live enablement.
- P3 Observable tests exercise a failing narrow spread, invalid cost data and a viable spread. Readiness exposes the cost assumptions; profitability report preserves the pre-gate capture unchanged. Qualification requires new out-of-sample captures, not reinterpretation of old results.

Files exclusively owned by coordinator: src/economics.ts and test, config/trader integration, docs. Independent reviewers inspect R1-R8 plus P1-P3 in isolated candidate. No derivatives, parameter mining or live-money qualification in this slice.
