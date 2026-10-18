import { test, expect, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "./store";
import { gate, stopParser } from "./policy";

const temp = () => mkdtempSync(join(tmpdir(), "jev-full-access-test-"));
afterAll(() => stopParser());

test("Jev allow is automatic only in bypassPermissions mode", async () => {
  const store = new Store(temp());
  const workspace = temp();
  const session = store.session("permission-mode", store.scope(workspace));
  const judge = (async () => ({ choice: "allow", confidence: 1 })) as any;
  const ordinary = await gate(store, workspace, session, "& $unknown", { judge, permissionMode: "default" } as any);
  const bypass = await gate(store, workspace, session, "& $unknown", { judge, permissionMode: "bypassPermissions" } as any);
  expect(ordinary.decision).toBe("ask");
  expect(bypass.decision).toBe("allow");
  store.close();
});

test("deterministic credential and out-of-scope denials survive bypassPermissions", async () => {
  const store = new Store(temp());
  const workspace = temp();
  const session = store.session("hard-denies", store.scope(workspace));
  let judgeCalls = 0;
  const judge = (async () => { judgeCalls++; return { choice: "allow", confidence: 1 }; }) as any;
  const credentials = await gate(store, workspace, session, "Get-Content .env", { judge, permissionMode: "bypassPermissions" } as any);
  expect(credentials.decision).toBe("deny");
  expect(judgeCalls).toBe(0);

  writeFileSync(join(workspace, "writer.ts"), 'await Bun.write("C:/outside-policy-root/file.txt", "test");');
  const outside = await gate(store, workspace, session, "bun writer.ts", { judge, permissionMode: "bypassPermissions" } as any);
  expect(outside.decision).toBe("ask");
  expect(judgeCalls).toBe(0);
  store.close();
});

test("a failed Jev judgment does not become approval in bypassPermissions mode", async () => {
  const store = new Store(temp());
  const workspace = temp();
  const session = store.session("failed-judge", store.scope(workspace));
  const result = await gate(store, workspace, session, "& $unknown", {
    permissionMode: "bypassPermissions",
    judge: (async () => { throw Error("synthetic provider failure"); }) as any,
  });
  expect(result.decision).toBe("ask");
  store.close();
});
