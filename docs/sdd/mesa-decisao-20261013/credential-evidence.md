# Credential slice evidence

Conversation: 01a135ff-362e-7cf0-ac4f-ef678d322188. Implementer: credential-slice-01a135ff. Isolated workspace: C:/Users/gabri/.codex/visualizations/2026/10/13/01a135ff-362e-7cf0-ac4f-ef678d322188/credential-slice. Parent integrates and independently reviews; this document is not approval.

Exclusive application files: src/settings/runtime-key.ts, src/settings/runtime-key.test.ts, src/settings/store.ts, src/settings/store.test.ts, src/desktop/vault.ts, src/desktop/vault.test.ts. No primary checkout write, project .env read, provider request, order, signing, Windows environment write, app restart, install, commit or publication was performed.

Frozen seam approval: Jev receipt c2e60c81-7da3-41bd-b3ef-40dbd2581fcf, server_fallback, approved_by=jev_delegated. KEY-1 preserved from parent SPEC. SettingsStore constructor and VaultSettingsStore constructor accept runtimeKey resolver injection; credentials() remains server-only. SecretStatus.origin is optional for compatibility. Jev status last4 is always null; OKX public API key tail behavior is preserved. Status never certifies the provider.

## TDD evidence

1. `bun --no-env-file test ./src/settings/store.test.ts -t 'discovers an ambient Jev'`
   Red exit 1: expect(received).toMatchObject(expected), configured expected true received false; origin expected process_environment absent. 0 pass / 1 fail / 29 filtered.
   Green exit 0 after store resolver integration: 1 pass / 0 fail / 29 filtered / 3 expects, 72ms.
2. `bun --no-env-file test ./src/settings/runtime-key.test.ts`
   Red exit 1: Windows User alias expected {value: user-alias-key, origin: windows_user}, received null. 0 pass / 1 fail / 1 expect.
   Green exit 0 after bounded Windows discovery: 1 pass / 0 fail / 1 expect, 46ms.
3. `bun --no-env-file test ./src/desktop/vault.test.ts -t 'vault Jev key wins'`
   Red exit 1: origin vault absent, last4 expected null received fixture tail. 0 pass / 1 fail / 17 filtered / 1 expect.
   Green exit 0 after vault fallback integration: 1 pass / 0 fail / 17 filtered / 5 expects, 98ms.

## Final verification

`bun --no-env-file test ./src/settings/runtime-key.test.ts ./src/settings/store.test.ts ./src/desktop/vault.test.ts`

Exit 0. Bun 1.3.14 (0d9b296a). 58 pass, 0 fail, 212 expect calls, three files, 2.32s. Covers process canonical/alias precedence, Windows User/Machine fallback, cache expiry, lookup failure without error egress, non-Windows absence, local/vault precedence, clear revealing fallback, vault unavailable with separately observed ambient key, no key characters in status, and existing settings/vault contracts.

`bun --no-env-file node_modules/typescript/bin/tsc --ignoreConfig --noEmit --module preserve --moduleResolution bundler --target esnext --types bun --strict --skipLibCheck src/settings/runtime-key.ts src/settings/store.ts src/desktop/vault.ts src/settings/runtime-key.test.ts src/settings/store.test.ts src/desktop/vault.test.ts`

Exit 0, empty output. Initial same command without --ignoreConfig exited 1 with exact error `error TS5112: tsconfig.json is present but will not be loaded if files are specified on commandline. Use '--ignoreConfig' to skip this error.` Re-run used the installed TypeScript 7 option; no implementation change was needed.

Real read-only Windows smoke: createRuntimeKeyResolver({env:{}}) queried only the two allowed key names from User/Machine and printed only presence/origin. Exit 0, output `{"configured":true,"origin":"windows_user"}`. No provider validity or activation in an existing application process is claimed.

Default resolver is lazy and shared. Process variables are read per resolution; Windows observations, including failed reads, are cached for 60 seconds. Child has a fixed allowlisted script, hidden window, ignored stderr, 1500ms timeout, output-size bound, no secret in argv and no mutation. Clearing only removes the configured local file/cofre value; it leaves the ambient key untouched.

Integration seams: root should preserve origin in the settings HTTP/client parser, render the ambient origin explicitly, and inject runtimeKey: () => null in other deterministic tests that expect an empty store. Existing running servers are not reloaded by this implementation. No live model call was made.
