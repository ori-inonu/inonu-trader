# Branch and worktree inventory — 2026-10-11

Observed main f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c. Snapshot only, not a concurrency lock. Native goal remains incomplete. Local refs only; no remote fetch/push performed.

## Local branches

Branch | Main-only commits | Branch-only commits
--- | ---: | ---:
codex/inonu-system-one-safety | 0 | 0
codex/inonu-trader-preparation | 124 | 0
codex/jev-panel-integration | 2 | 0
feature/central-ui | 106 | 0
feature/derivatives-and-live-qualification | 115 | 0
feature/jev-command-center | 34 | 0
feature/jev-decision-lab | 55 | 0
feature/lab-real-jev | 37 | 0
feature/okx-operator-r8 | 37 | 0
feature/onchainos-data-clients | 52 | 0
feature/onchainos-inventory | 89 | 0
feature/policy-envelope | 106 | 0
hermes/release-v0.0.2 | 124 | 0
hermes/release-v0.0.2-ready | 124 | 0
hermes/release-v0.0.2-receipt-safety | 124 | 0
integration/v0.0.2 | 124 | 0
main | 0 | 0
worktree-agent-a8cd8353a9c2206b8 | 114 | 0
worktree-agent-ac3b992be12068e8d | 114 | 0

All 19 observed local branch tips have zero branch-only commits relative to main. Their committed histories are already contained in main; this does not prove specifications complete or concurrent working changes integrated.

## Working changes

- C:/Users/gabri/jev-trader — HEAD 055a637f27f28cbf357cfb492534f7ed33d9b68f; tracked status entries 18; untracked files 49.
- C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader — HEAD f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c; tracked status entries 0; untracked files 64.
- C:/Users/gabri/.codex/worktrees/jev-panel-integration/jev-trader — HEAD 32fbaf8c51d799c734a758ed2e9afa23a9c898d5; tracked status entries 0; untracked files 0.
- C:/Users/gabri/.codex/worktrees/okx-real-integration/jev-trader — HEAD 055a637f27f28cbf357cfb492534f7ed33d9b68f; tracked status entries 18; untracked files 6158.
- C:/Users/gabri/jev-trader/.claude/worktrees/agent-a8cd8353a9c2206b8 — HEAD 85141d12266f824deaf7532c8b64ccb860dfe7de; tracked status entries 0; untracked files 0.
- C:/Users/gabri/jev-trader/.claude/worktrees/agent-ac3b992be12068e8d — HEAD 667a32761f775497bc7b270b412a18e6922ab632; tracked status entries 0; untracked files 0.
- C:/Users/gabri/jev-trader-jev — HEAD bd8f78aeb0f3ba8acfc184a3b31699a5c815c8e8; tracked status entries 0; untracked files 0.
- C:/Users/gabri/jev-trader-main — HEAD f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c; tracked status entries 0; untracked files 0.
- C:/Users/gabri/jev-trader-r8 — HEAD bd8f78aeb0f3ba8acfc184a3b31699a5c815c8e8; tracked status entries 16; untracked files 0.

Preserved shared feature/jev-command-center, detached okx-real-integration and feature/okx-operator-r8 concurrent modifications. No reset, broad stage, deletion or unrelated merge. Integrator untracked files are local evidence, not production changes. Needs separate source-backed acceptance and review before any concurrent change can be integrated; zero branch-only commits is not proof untracked functionality exists in main.