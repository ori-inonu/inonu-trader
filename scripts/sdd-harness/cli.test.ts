import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("CLI optional cap and explicit cap validation precede provider setup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-cli-limit-"));
  const file = join(dir, "spec.json");
  writeFileSync(file, JSON.stringify({ id: "cli-limit-test", goal: "Choose safe work", facts: {}, rails: [], options: [{ id: "a", label: "A", what: "A" }, { id: "b", label: "B", what: "B" }] }));
  try {
    for (const flags of [[], ["--max-calls", "17"], ["--max-calls", "1"], ["--max-calls", "16"], ["--max-calls", "0"], ["--max-calls"]]) {
      const child = Bun.spawn([process.execPath, "--no-env-file", "run", join(import.meta.dir, "cli.ts"), "run", file, ...flags], { env: { ...process.env, TYPESAFE_AI_API_KEY: "" }, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect(exitCode).toBe(2);
      expect(stdout).toBe("");
      if (flags.length === 0 || flags[1] === "17") expect(stderr).toContain("credencial ausente");
      else if (flags[1] === "1") expect(stderr).toContain("excedem teto");
      else if (flags[1] === "16") expect(stderr).toContain("credencial ausente");
      else expect(stderr).toContain("max_calls");
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
