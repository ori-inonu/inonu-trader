# F5/F6 candidate verification — not independent acceptance

Conversation 01a12971-f941-7e42-8a42-fab6d44d4eb5. Baseline 1f08e6edd589449a82eeb70638987a09572a3bd2. Branch codex/inonu-jev-read-safety-f5-f6. Subordinate harness revision6 implementation; original M1–M6 frozen. Parent preview P3/P6 and full goal remain incomplete.

Installed public dependencies were copied from the integrator node_modules into this isolated worktree using robocopy /E /XJ /R:0 /W:0 without deletion, install, provider or credential access. Copy process41272 completed exit1 (robocopy successful-copy status); subsequent offline tests resolve dependencies. JEV actual copy recommendation receipt fe23eab5-c91e-46c2-9a63-de66e1f64e04, confidence .89, model jev-1.13.0, usage721/52, billed cost null, inputDigest0f4d1c70f23c8a296e0cb7fb35012b284a7fc90dfa10ac9ee1b345b096bb59f2, persisted true. Technical advice only.

All tests used Bun1.3.14 with --no-env-file --no-install and injected fake models. Test slices after baseline used the installed RTK/Headroom argv wrapper, original command once. Bun output remained original pass-through, not a measured compression or trading gain.

Baseline read.test.ts: 20 pass, 0 fail, 93 assertions, chunk aed852, exit0.

| Slice | Observed RED | Minimal GREEN |
|---|---|---|
| M1 preabort | ea1371 exit1: calls expected0 received1 | 2b2ab5 exit0, 1 pass/7 assertions |
| M2 in-flight abort ignored | c26a58 exit1: read received null at100ms guard | 15fcc6 exit0, 1 pass/5 assertions; late buy never accepted |
| M3 synchronous elapsed deadline | 7ac622 exit1: expected timeout received ok | c3d0f4 exit0, 1 pass/3 assertions |
| M4 finite overflow | 0b2a07 exit1: expected malformed received ok | d1e062 exit0, 1 pass/4 assertions |
| M4 chosen underflow | 0c0e50 exit1: expected malformed received ok | 3c0973 exit0, full25 pass/116 assertions |

Compatibility controls then added: ordinary buy/hold3:1, zero-total rejection, producer AND public projection of invalid normalized weights. Initial projection fixture used fake name jev-test, which the existing public allowlist correctly emits as unknown (81c8ac exit1); fixture changed to allowed jev-1.13.0, with no production projection changes or weakened acceptance. The accidental nonexistent scripts/jev-read.test.ts selector in93f5d1 ran only five actual src/jev-read files; no script-test claim.

Final command: bun --no-env-file --no-install test src/jev-read. Chunk bdaea2: exit0, 118 pass, 0 fail, 337 assertions, five files, 585ms. Full backend typecheck: bun --no-env-file --no-install run typecheck, chunk d4d931 exit0 (tsc --noEmit -p tsconfig.verification.json). git diff --check chunk9ea50f exit0. Backend affected only, no frontend build or visible UI claim.

Fixed candidate SHA256:
- read.ts: 0422288919d60e969f76b21acee97802cda8ab9028fb73044c9817233b247b52
- decide.ts: e46315754bafad687e25d39dc511fb6cba4e74af79bebe527e4605db1283358c
- read.test.ts: 11c5ef9979fd9abedcdac42abfea43b36e1508ecc590983d9c65a44dbd957828

Independent replay/review pending: Avicenna 01a12ada-7b55-7fd2-8a20-c940f474c1a1, submission01a12cb7-28fa-76c1-91f4-54370b805f6d. Preserve immutable original F5/F6 probe; F1–F4 still separate outstanding findings. No scoped commit/main merge until independent review passes exact candidate. No model inference, wallet, signature, token approval, funds, push or deployment used in verification; delegated sanitized JEV consultation is separate.
