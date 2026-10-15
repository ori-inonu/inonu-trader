import { expect, test } from "bun:test";
import { createRuntimeKeyResolver } from "./runtime-key";

test("a Windows User alias is discovered when the launched process lacks the key", () => {
  const resolve = createRuntimeKeyResolver({ env: {}, platform: "win32", readWindows: () => ({ user: { TYPESAFE_API_KEY: "user-alias-key" }, machine: { TYPESAFE_AI_API_KEY: "machine-key" } }) });
  expect(resolve()).toEqual({ value: "user-alias-key", origin: "windows_user" });
});

test("canonical process key wins over aliases and persistent Windows keys", () => {
  const resolve = createRuntimeKeyResolver({ env: { TYPESAFE_AI_API_KEY: "process-canonical", TYPESAFE_API_KEY: "process-alias" }, platform: "win32",
    readWindows: () => { throw new Error("Windows must not be queried when a process credential is present"); } });
  expect(resolve()).toEqual({ value: "process-canonical", origin: "process_environment" });
});

test("process alias is detected and can update without waiting for Windows cache expiry", () => {
  const env = { TYPESAFE_API_KEY: "first-process-key" };
  const resolve = createRuntimeKeyResolver({ env, platform: "linux" });
  expect(resolve()).toEqual({ value: "first-process-key", origin: "process_environment" });
  env.TYPESAFE_API_KEY = "second-process-key";
  expect(resolve()).toEqual({ value: "second-process-key", origin: "process_environment" });
});

test("Windows Machine canonical wins over its alias, after empty User scope", () => {
  const resolve = createRuntimeKeyResolver({ env: {}, platform: "win32", readWindows: () => ({ user: {}, machine: { TYPESAFE_AI_API_KEY: "machine-canonical", TYPESAFE_API_KEY: "machine-alias" } }) });
  expect(resolve()).toEqual({ value: "machine-canonical", origin: "windows_machine" });
});

test("persistent credentials stay cached until expiry and then pick up a changed Windows value", () => {
  let at = 100;
  let key = "initial-user-key";
  const resolve = createRuntimeKeyResolver({ env: {}, platform: "win32", cacheMs: 1_000, now: () => at,
    readWindows: () => ({ user: { TYPESAFE_API_KEY: key }, machine: {} }) });
  expect(resolve()?.value).toBe("initial-user-key");
  key = "changed-user-key";
  at = 1_099;
  expect(resolve()?.value).toBe("initial-user-key");
  at = 1_100;
  expect(resolve()?.value).toBe("changed-user-key");
});

test("an unavailable Windows lookup is an unconfigured observation and never exposes its error", () => {
  const resolve = createRuntimeKeyResolver({ env: {}, platform: "win32", readWindows: () => { throw new Error("private sentinel"); } });
  expect(resolve()).toBeNull();
});

test("non-Windows discovery does not require a Windows reader and empty values are absent", () => {
  const resolve = createRuntimeKeyResolver({ env: { TYPESAFE_AI_API_KEY: "", TYPESAFE_API_KEY: "  " }, platform: "linux", readWindows: () => { throw new Error("unsupported system"); } });
  expect(resolve()).toBeNull();
});
