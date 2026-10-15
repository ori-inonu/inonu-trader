import { expect, test } from "bun:test";
import { localCorePlan } from "./plan";
import { probeLocal, type LocalProbeDeps } from "./probe";
import { parseLocalArtifact, verifyLocalArtifact } from "./manifest";

test("the child uses a fixed compiled artifact, idle zero and only OS paths in its environment", () => {
  const plan = localCorePlan("C:/artifact/app", "C:/synthetic/home", { Path: "C:/Windows", LOCALAPPDATA: "C:/synthetic", TYPESAFE_AI_API_KEY: "synthetic-secret", INONU_HOME: "C:/wrong", INONU_WEB_DIR: "C:/wrong", NEXT_PUBLIC_INONU_CLOUD: "1" });
  expect(plan.command.slice(1)).toEqual([]);
  expect(plan.command[0]).toEndWith("InonuTrader.exe");
  expect(plan.command).not.toContain("--watch");
  expect(plan.env).not.toHaveProperty("TYPESAFE_AI_API_KEY");
  expect(plan.env).not.toHaveProperty("NEXT_PUBLIC_INONU_CLOUD");
  expect(plan.env.INONU_HOME).not.toContain("wrong");
  expect(plan.env.INONU_WEB_DIR).not.toContain("wrong");
  expect(plan.env.Path).toBe("C:/Windows");
});

test("pulse reaches the compiled child only through its explicit option, never an ambient environment flag", () => {
  const env = { Path: "C:/Windows", INONU_AGENT_PULSE: "1", INONU_AGENT_PULSE_URL: "wss://synthetic.invalid" };
  expect(localCorePlan("C:/artifact/app", "C:/synthetic/home", env).command.slice(1)).toEqual([]);
  const enabled = localCorePlan("C:/artifact/app", "C:/synthetic/home", env, { pulse: true });
  expect(enabled.command.slice(1)).toEqual(["--pulse"]);
  expect(enabled.env).not.toHaveProperty("INONU_AGENT_PULSE");
  expect(enabled.env).not.toHaveProperty("INONU_AGENT_PULSE_URL");
  expect(localCorePlan("C:/artifact/app", "C:/synthetic/home", env, { pulse: false }).command.slice(1)).toEqual([]);
});

test("only a refused TCP port proves absence; unknown health is never replaced", async () => {
  const signal = new AbortController().signal;
  let calls = 0;
  const send: LocalProbeDeps["fetch"] = async () => { calls++; throw new Error("no network"); };
  expect(await probeLocal(signal, { tcp: async () => "closed", fetch: send })).toBe("absent");
  expect(await probeLocal(signal, { tcp: async () => "unknown", fetch: send })).toBe("other");
  expect(calls).toBe(0);
  expect(await probeLocal(signal, { tcp: async () => "open", fetch: send })).toBe("other");
});

test("health is bounded, GET only, refuses redirects and requires the Inonu marker", async () => {
  const signal = new AbortController().signal;
  for (const [body, expected] of [[{ ok: true, app: "inonu-trader", version: "0.0.2" }, "ours"], [{ ok: true, app: "another", version: "0.0.2" }, "other"], [{ ok: true, app: "inonu-trader" }, "other"]] as const) {
    const result = await probeLocal(signal, { tcp: async () => "open", fetch: (async (url, init) => {
      expect(url).toBe("http://127.0.0.1:3000/health");
      expect(init?.method).toBe("GET"); expect(init?.redirect).toBe("error");
      return Response.json(body);
    }) });
    expect(result).toBe(expected);
  }
  expect(await probeLocal(signal, { tcp: async () => "open", fetch: async () => new Response("x".repeat(5000)) })).toBe("other");
});

test("artifact paths reject escapes, duplicate Windows names and absent entry points", async () => {
  const h = "a".repeat(64);
  const base = [{ path: "InonuTrader.exe", sha256: h }, { path: "web/index.html", sha256: h }];
  expect(parseLocalArtifact({ version: 1, files: base })).not.toBeNull();
  for (const path of ["web/../secret", "web//index.html", "web/./x", "C:/else.exe", "web/secret\\file", "web/.. "]) expect(parseLocalArtifact({ version: 1, files: [...base, { path, sha256: h }] })).toBeNull();
  expect(parseLocalArtifact({ version: 1, files: [...base, { path: "web/INDEX.HTML", sha256: h }] })).toBeNull();
  expect(parseLocalArtifact({ version: 1, files: base.slice(0, 1) })).toBeNull();
});

test("altered artifacts fail before any spawn instead of adopting changed source", async () => {
  const bytes = new TextEncoder().encode("synthetic-artifact");
  const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  const artifact = parseLocalArtifact({ version: 1, files: [{ path: "InonuTrader.exe", sha256: hash }, { path: "web/index.html", sha256: hash }] })!;
  await verifyLocalArtifact("C:/synthetic", artifact, async () => bytes);
  await expect(verifyLocalArtifact("C:/synthetic", artifact, async () => new TextEncoder().encode("changed"))).rejects.toThrow("local_artifact_changed");
});
