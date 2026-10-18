// The development origins of the core (INONU_DEV_ORIGINS): narrow, explicit, and absent from the installed app. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { activeDevOrigins, allowDevOrigins, devOrigins } from "./dev-origins";

describe("devOrigins", () => {
  test("nothing set, nothing allowed: the installed app has no variable", () => {
    expect(devOrigins({})).toEqual([]);
    expect(devOrigins({ INONU_DEV_ORIGINS: "" })).toEqual([]);
    expect(devOrigins({ INONU_DEV_ORIGINS: "   " })).toEqual([]);
  });

  test("loopback http origins with a port are taken, trimmed and deduplicated", () => {
    expect(devOrigins({ INONU_DEV_ORIGINS: " http://127.0.0.1:3001 , http://localhost:3001,http://127.0.0.1:3001" })).toEqual(["http://127.0.0.1:3001", "http://localhost:3001"]);
  });

  test("anything else is ignored, never fixed: other hosts, https, no port, a path, credentials, a wildcard, a port out of range", () => {
    const bad = [
      "http://evil.example:3001", "https://127.0.0.1:3001", "http://127.0.0.1", "http://127.0.0.1:3001/", "http://127.0.0.1:3001/x", "http://user@127.0.0.1:3001",
      "http://127.0.0.1:3001@evil.example", "*", "http://*:3001", "http://127.0.0.1:0", "http://127.0.0.1:65536", "http://127.0.0.1:99999", "http://0.0.0.0:3001",
      "http://[::1]:3001", "http://127.0.0.2:3001", "null", "file://",
    ];
    for (const origin of bad) expect(devOrigins({ INONU_DEV_ORIGINS: origin })).toEqual([]);
    // a bad entry does not spoil a good one next to it
    expect(devOrigins({ INONU_DEV_ORIGINS: "http://evil.example:1,http://127.0.0.1:3001" })).toEqual(["http://127.0.0.1:3001"]);
  });

  test("no more than four", () => {
    const five = [3001, 3002, 3003, 3004, 3005].map((p) => `http://127.0.0.1:${p}`).join(",");
    expect(devOrigins({ INONU_DEV_ORIGINS: five }).length).toBe(4);
  });
});

describe("who may turn them on", () => {
  test("none are active until the development entry allows them, and the environment alone changes nothing", () => {
    process.env.INONU_DEV_ORIGINS = "http://127.0.0.1:3001";
    try {
      expect(activeDevOrigins()).toEqual([]);
    } finally {
      delete process.env.INONU_DEV_ORIGINS;
    }
    allowDevOrigins({ INONU_DEV_ORIGINS: "http://127.0.0.1:3001, http://evil.example:1" });
    expect(activeDevOrigins()).toEqual(["http://127.0.0.1:3001"]);
    allowDevOrigins({});
    expect(activeDevOrigins()).toEqual([]);
  });
});
