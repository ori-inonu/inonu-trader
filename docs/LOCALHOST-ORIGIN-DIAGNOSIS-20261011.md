# Localhost origin diagnosis — 2026-10-11

Own conversation: 01a12971-f941-7e42-8a42-fab6d44d4eb5. Main f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c clean, checked this turn. No production edit, service restart, wallet connection, financial operation or API inference occurred during diagnosis.

Listeners observed: loopback 3000 bun PID25128; 3001 node PID33732 and 3002 node PID36504 on ::. Frontend source/cwd of those node processes still not certified. Prior CUA observation at http://localhost:3002 showed disconnected feed and Failed to fetch. This turn did not reobserve browser, so do not claim current visual verification.

Direct System.Net.Http.HttpClient probes with UseProxy=false and 3s timeout:

- GET http://127.0.0.1:3000/ without Origin =>200: model mock, wallet null, dryRun true, market local-readonly-preview, startedAt1791734615542, latest null. GET localhost:3000/ same.
- GET /, /operator, /system-one with Origin http://localhost:3001 => each403 {"error":"origin not allowed"}; same three with http://localhost:3002 => each403 same body. No financial state bodies were requested with an accepted origin.

Bounded process command-line extraction printed only the .ts entry path, not argv/env: C:/Users/gabri/.codex/tmp/jev-central-01a12971/preview-main-authorized.ts. Source inspected; SHA256 0f3422c50e78b4a8a5a496fb41ce52f3eebc3e1dbdb77c0df619c4a858b4e434. Entry statically imports read handlers from main, binds 127.0.0.1:3000, allows only http://127.0.0.1:3005 and http://localhost:3005. State/journal paths point to C:/Users/gabri/jev-trader/data, not isolated reviewed public state. This accounts for observed origin rejection. It does not prove the running in-memory entry is byte-identical to current disk, nor qualify private snapshots or financial execution.

Do not add 3002 to that private-state preview merely to make UI green. Proposed durable remedy: dedicated integrated HTTP-only entry with explicit origins, isolated state and honest read_only/no-producer meta. Preserve existing process until a reviewed replacement and ownership/rollback are verified.

Research-strategy Jev receipt6c558054-8741-4048-ad4d-6e5bbba27fe0: assessed recover_parallel,.88 confidence, jev-1.13.0,685 input/47 output tokens; billed cost unknown. Task sequencing receipt a5a260af-c4ab-4a11-9303-6660f2582537: assessed preview_cycle,.8 confidence,784 input/51 output tokens. Neither receipt supplies permission or proves implementation.

Previous prompt-only goal turn was no progress on implementation. Current turn is progress: completed independent startup research and runtime entry/origin diagnosis change next executable action. Roundtrip router-proof and integration-gap same research handles remained observation timeouts, not terminal or restarted.
