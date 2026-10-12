# Committed JEV read candidate: boundary findings

Own conversation: 01a12971-f941-7e42-8a42-fab6d44d4eb5. Baseline f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c; candidate 4a1d9e9500468ba566d377d6248d20834e932b4f. Research only; no fixes, integration, financial execution or completion claim.

## Verified source and probes

Read committed sources with git show. Current desk working files match candidate blobs: src/jev-read/decide.ts db16b398b5ace6582ac67ce3cbb817af89431da9; src/jev-read/state.ts 165d981fc40bf25a39e09a2c74d16f7922f0c884. Hash-object revalidation tool bd8ec8, exit 0. Preserve concurrent .env.example/web/.env.example changes and new mesa files; these are excluded from review and any future integration.

1. validateTapeDecision receives choice buy, probabilities buy=Number.MAX_VALUE, sell=Number.MAX_VALUE, hold=0. Each finite raw weight passes validation, but their sum overflows. Tool 0c4bc3 produced {"action":"buy","probabilities":{"buy":0,"sell":0,"hold":0},"confidence":0,"latencyMs":0,"model":"jev-1.13.0","status":"ok","inputTokens":null}; deliberate assertion exit 1. The public-view projection rejects zero chosen weight, so this is an inconsistent decision boundary, not evidence of an executed trade. Probe imported only the public validator; it did not construct/evaluate JevTapeModel.

2. buildTapeState with nowMs=100000000, future=nowMs+3600000, book bid99/ask101 size1, ticker last/open100 high110 low90, book/ticker receipt=future, and 31 valid contiguous minute closes100 ending at future returned ok:true (tool 662e34, exit0). trades=[], fundingRate=null. Upper-age-only comparisons accept these future timestamps. This is a synthetic public-boundary reproduction, not evidence that the live OKX feed actually emitted future data. Book/ticker receipts are local Date.now; candles retain provider timestamps. Source clock domains and permitted skew require explicit qualification.

## Review and next action

Two independent axes assigned to existing isolated reviewers; no production edits in their contract. Spec source includes committed GOAL-INONU-TRADER, WEB3-INTEGRATION-DELIVERY-SPEC, ARQUITETURA-CENTRAL-DE-OPERACOES and JEV-DECISAO-ONCHAIN-OS. Spec submission 01a12c3e-c93c-7881-8890-daf6cdcc49bd; standards submission 01a12c3e-d924-76e3-a0d7-f4def04f92ef. They must separate documented requirements from heuristic smells and broad unimplemented project goals. No review result is assumed.

Jev task sequencing receipt from preceding engineering continuation: 0631d90a-4c54-4362-8c4e-6a52e88910b4, assessed inspect_concurrent_commits, confidence1, model jev-1.13.0, usage802 input/58 output, billed cost null; input digest ee6832d0212a6c41581e33b1c451be6762d2d6d67e6bb1b28e11569623a5bf75. Advice only, not authority or approval. Current automatic advisory abstentions do not establish technical failure or denial.

Fixes require an isolated scoped SDD/TDD delivery with immutable decision/freshness contracts and fresh independent review. Do not amend the frozen HTTP preview cycle to absorb these changes. The native goal remains active and incomplete.
