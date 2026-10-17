import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { updateLedger } from "./ledger.ts";

const dir = mkdtempSync(join(tmpdir(), "api-budget-ledger-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("ledger do api-budget", () => {
  test("cria o diretorio e persiste a alteracao entre chamadas", async () => {
    const path = join(dir, "nested", "ledger.json");
    await updateLedger(path, (state) => {
      state.blocked.x = 5;
    });
    expect(await updateLedger(path, (state) => state.blocked.x)).toBe(5);
  });

  test("atualizacoes concorrentes nao perdem incremento", async () => {
    const path = join(dir, "race.json");
    await Promise.all(
      Array.from({ length: 20 }, () =>
        updateLedger(path, (state) => {
          state.cooldown.k = (state.cooldown.k ?? 0) + 1;
        }),
      ),
    );
    expect(await updateLedger(path, (state) => state.cooldown.k)).toBe(20);
  });
});
