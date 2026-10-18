# Execution claims versus observed runtime

Research only. No implementation approval, financial authorization or claim of complete central functionality. Own conversation 01a12971-f941-7e42-8a42-fab6d44d4eb5; candidate HEAD ff37327264d904242c57c21c8acb548a05651e82.

Observed source evidence:

- web/src/components/Rail/Rail.tsx:65 unconditionally says `Decisao do agente. Execucao real a cada bloco.` SHA256 8c43ad2aa5b111910c721c559816a46947b819f5d6c9f03865eeeed134efee8f.
- web/src/components/CommandCenter/CommandCenter.tsx:231 says the model places an on-chain Kuru order in each Monad block, independent of connection, model and execution state. Its cadence at line217 is also fixed. SHA256 36dc834244d9a4b3fa5eb1e1be4b37ce977f3d46d2f6127593699161d0642a58.
- web/src/app/layout.tsx:21 describes real on-chain execution in page metadata. SHA256 150b4e1b84ae6edd658c24f35e874318ad3b4e97de4fa57c579f758913e7a4f8.
- web/src/lib/presentation.ts distinguishes simulation from execution-unverified; dryRun=false and feed connected alone do not prove real execution. SHA256 1560d361d0af3b3e092a33cf1d238adc07b5ad91d288a6d9df760ed7a926b339.
- web/src/lib/rail-render.test.tsx currently requires the unconditional brand copy while also requiring execution-unverified for live metadata. SHA256 d372dfeb7f12986121e0886a3344847b3b414e6833ff51ed3d1564ebf8828580. This expectation is a behavioral inconsistency to assess independently, not acceptance authority to preserve a misleading claim.

Runtime evidence from this conversation: Next dev localhost3002 PID36504 serves GET / 200; PTY57118 re-polled live. Ports3001/3002 listening, no3000 listener at observation. Previous actual browser AX showed backend unavailable and execution-unverified beside real-execution copy. No connected wallet or financial action. Existing3001 service preserved. No whole-app qualification.

Potential acceptance for separate reviewed scope: public header and metadata describe capabilities without asserting confirmed execution or per-block placement; absent/reconnecting/mock/simulation/declared-live states remain distinguishable; confirmed individual fill receipts retain their existing state semantics; no change to execution or economic gates. Rendered regression cases must cover absent and reconnecting metadata, simulation, mock and declared-live without a receipt. Actual browser must demonstrate truthful unavailable state. This is not a replacement for building the full operational integration: backend startup/connectivity and verified data-to-decision flows remain separate required work.

Next dependency: independent runtime research in exclusive Turing copy runtime-qualification-research.md, submission01a12b78-c289-7d53-8ade-030aa849554d; no implementation begun. Jev task consultation c1cdbe99-de1c-4999-9d04-1fef81c6df71 abstained confidence0.4 (jev-1.13.0, input826/output54 tokens); receipt persisted by plugin, billed cost unknown. Investigation proceeds within unchanged explicit runtime objective; no technical choice claimed approved.
