# Inventário de branches — 2026-10-11

Leitura Git desta sessão. Baseline main: 14cbb7bd2878eed0a930b324b0c50610be7cdab8. Contagens de commits não certificam qualidade, ausência de WIP ou prontidão para uso.

| Branch | HEAD | Exclusivos main | Exclusivos branch |
| --- | --- | --- | --- |
| codex/inonu-jev-read-safety-f5-f6 | 14cbb7bd2878eed0a930b324b0c50610be7cdab8 | 0 | 0 |
| codex/inonu-jev-tape-data-f1-f4 | 14cbb7bd2878eed0a930b324b0c50610be7cdab8 | 0 | 0 |
| codex/inonu-system-one-safety | 1f08e6edd589449a82eeb70638987a09572a3bd2 | 1 | 0 |
| codex/inonu-trader-preparation | 12394df44e1bd28e424fb55db462eeadf7168d41 | 137 | 0 |
| codex/jev-panel-integration | 32fbaf8c51d799c734a758ed2e9afa23a9c898d5 | 15 | 0 |
| feature/central-ui | 2f71f8ff186e77863c8095bd2aef8e8fb01a11cf | 119 | 0 |
| feature/derivatives-and-live-qualification | 62b6453e61da47928ae5086a93ad24d139edcdb3 | 128 | 0 |
| feature/jev-command-center | 055a637f27f28cbf357cfb492534f7ed33d9b68f | 47 | 0 |
| feature/jev-decision-lab | ab30273e4c0d322fe49efc888ff49061224aa32f | 68 | 0 |
| feature/jev-trading-desk | 2d00d8f789434df83796b381900ea5ce68a9346e | 3 | 0 |
| feature/lab-real-jev | bd8f78aeb0f3ba8acfc184a3b31699a5c815c8e8 | 50 | 0 |
| feature/okx-operator-r8 | bd8f78aeb0f3ba8acfc184a3b31699a5c815c8e8 | 50 | 0 |
| feature/onchainos-data-clients | 60133ceb718d41f573fbb343e53d14248c7989ee | 65 | 0 |
| feature/onchainos-inventory | 3edfd5c5e7817f032b01f4d70ea3e190219e0483 | 102 | 0 |
| feature/policy-envelope | 026abdd657656901aa4d906d3f0093497011f570 | 119 | 0 |
| hermes/release-v0.0.2 | a14a425f9af7ceae6a24b02b32ba9fe15ce4203f | 137 | 0 |
| hermes/release-v0.0.2-ready | a2fa020ca827d283d50dfb3ade282808a7801128 | 137 | 0 |
| hermes/release-v0.0.2-receipt-safety | ee4249de3be554a0f0eccfbf20d77a7f0d739cec | 137 | 0 |
| integration/v0.0.2 | c352f82755862f4a4619d5e0d4411e2194f8d6a8 | 137 | 0 |
| main | 14cbb7bd2878eed0a930b324b0c50610be7cdab8 | 0 | 0 |
| worktree-agent-a8cd8353a9c2206b8 | 85141d12266f824deaf7532c8b64ccb860dfe7de | 127 | 0 |
| worktree-agent-ac3b992be12068e8d | 667a32761f775497bc7b270b412a18e6922ab632 | 127 | 0 |

Worktrees existentes: 14, conforme git worktree list em 0168d9. O checkout raiz está sujo, com alterações de SYSTEM-ONE, wallet, UI e arquivos não rastreados; nenhum desses arquivos foi alterado ou incorporado nesta recuperação.

Branches sem commits exclusivos já têm seu histórico alcançável pelo main. Isso evita merges redundantes, mas não valida suas funcionalidades nem incorpora alterações não commitadas. Branches com histórico divergente exigem comparação de conteúdo, SPEC e revisão antes de qualquer integração.

SPEC F1–F4 V2 recebida e enviada para revisão independente por Turing, submission 01a12ceb-33c9-79e3-b019-28e633b332ac. Harness revisão 5, specification/active, sem congelamento. Próximo passo: receber parecer, resolver achados, congelar aceitação e iniciar TDD público com clocks/fetch/socket/modelo locais.
