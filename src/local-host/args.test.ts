import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { absoluteArg } from "./args";
import { isLocalStop, LOCAL_STOP_MESSAGE } from "./protocol";

test("selftest paths must be explicit and absolute, never another flag or a relative financial folder", () => {
  expect(absoluteArg([], "--selftest-home")).toBeNull();
  expect(absoluteArg(["--selftest-home", resolve("synthetic-home")], "--selftest-home")).toBe(resolve("synthetic-home"));
  for (const args of [["--selftest-home"], ["--selftest-home", "--report"], ["--selftest-home", "data"]]) {
    expect(() => absoluteArg(args, "--selftest-home")).toThrow("local_absolute_path_required");
  }
});

test("only the exact private protocol message requests a drain", () => {
  expect(isLocalStop(LOCAL_STOP_MESSAGE)).toBe(true);
  for (const raw of [null, "INONU_LOCAL_STOP_V1", [LOCAL_STOP_MESSAGE], { kind: "other" }, { ...LOCAL_STOP_MESSAGE, execute: true }]) expect(isLocalStop(raw)).toBe(false);
});
