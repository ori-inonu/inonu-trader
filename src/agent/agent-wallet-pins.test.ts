import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { assetFor, CLI_RELEASE, installCli, PINNED_SHA256, type InstallDeps } from "./agent-wallet";

const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

describe("the tool is pinned: the hashes of the release this code was written against are in the code, not only beside the download", () => {
  test("every machine the tool is looked at on has an asset and a pinned hash", () => {
    const machines: readonly (readonly [string, string, string])[] = [
      ["win32", "x64", "onchainos-x86_64-pc-windows-msvc.exe"],
      ["linux", "x64", "onchainos-x86_64-unknown-linux-gnu"],
      ["linux", "arm64", "onchainos-aarch64-unknown-linux-gnu"],
      ["darwin", "x64", "onchainos-x86_64-apple-darwin"],
      ["darwin", "arm64", "onchainos-aarch64-apple-darwin"],
    ];
    for (const [platform, arch, asset] of machines) {
      expect(assetFor(platform, arch)).toBe(asset);
      expect(PINNED_SHA256.get(asset)).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(assetFor("linux", "ia32")).toBeNull();
    expect(assetFor("freebsd", "x64")).toBeNull();
  });

  test("the Windows hash is the one this machine's app already checked a real download against", () => {
    expect(PINNED_SHA256.get("onchainos-x86_64-pc-windows-msvc.exe")).toBe("d7f8c8dfbd98f4e3eb9f4a7f2d8bd4167cc861322e28598db30ea9d7d08b5fe8");
  });

  const BIN = new TextEncoder().encode("a pretend tool");
  const installer = (over: { platform?: string; arch?: string; pinned?: ReadonlyMap<string, string>; sums?: string | null } = {}) => {
    const requested: string[] = [];
    const executable: string[] = [];
    const written: string[] = [];
    const platform = over.platform ?? "linux";
    const arch = over.arch ?? "x64";
    const asset = assetFor(platform, arch)!;
    const pinned = over.pinned ?? new Map([[asset, sha(BIN)]]);
    const deps: InstallDeps = {
      fetch: async (url) => {
        requested.push(url);
        if (url.endsWith("checksums.txt")) return over.sums === null ? new Response("no", { status: 404 }) : new Response(over.sums ?? `${sha(BIN)}  ${asset}\n`);
        return new Response(BIN);
      },
      platform,
      arch,
      dir: "/data/agent/cli",
      sha256: sha,
      write: (path) => void written.push(path),
      join: (dir, name) => `${dir}/${name}`,
      pinned,
      makeExecutable: (path) => void executable.push(path),
    };
    return { deps, requested, executable, written, asset };
  };

  test("a download whose hash is not the pinned one is refused even when the checksums beside it agree with it", async () => {
    const t = installer({ pinned: new Map([["onchainos-x86_64-unknown-linux-gnu", "f".repeat(64)]]) });
    expect(await installCli(t.deps)).toEqual({ ok: false, reason: "hash_divergente" });
    expect(t.written).toHaveLength(0);
  });

  test("the pinned hash is enough: a release page that cannot be read does not stop an install the pin can vouch for", async () => {
    const t = installer({ sums: null });
    const out = await installCli(t.deps);
    expect(out).toEqual({ ok: true, path: "/data/agent/cli/onchainos-x86_64-unknown-linux-gnu", sha256: sha(BIN) });
    expect(t.requested.every((u) => !u.endsWith("checksums.txt"))).toBe(true);
    expect(t.requested[0]).toBe(`${CLI_RELEASE.base}/onchainos-x86_64-unknown-linux-gnu`);
  });

  test("a file kept on Linux or macOS is made executable; on Windows there is nothing to do", async () => {
    const linux = installer();
    await installCli(linux.deps);
    expect(linux.executable).toEqual(["/data/agent/cli/onchainos-x86_64-unknown-linux-gnu"]);
    const windows = installer({ platform: "win32" });
    await installCli(windows.deps);
    expect(windows.executable).toEqual([]);
  });

  test("a machine with no pinned hash for its asset is told so and nothing is downloaded", async () => {
    const t = installer({ pinned: new Map() });
    expect(await installCli(t.deps)).toEqual({ ok: false, reason: "plataforma_nao_suportada" });
    expect(t.requested).toHaveLength(0);
  });
});
