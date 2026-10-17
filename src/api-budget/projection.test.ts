import { describe, expect, test } from "bun:test";
import { projectMonth } from "./projection.ts";

// 17 de outubro de 2026, 13h UTC; o mês tem 31 dias, 14 restantes depois de hoje.
const NOW = Date.UTC(2026, 9, 17, 13);

describe("projectMonth", () => {
  test("o dia corrente conta no uso mas não entra no ritmo", () => {
    const p = projectMonth({ "14": 1000, "15": 2000, "16": 3000, "17": 50 }, NOW, 100_000);
    expect(p.used).toBe(6050);
    expect(p.ratePerDay).toBe(2000);
    expect(p.daysInMonth).toBe(31);
  });

  test("outubro de 2026 cabe porque o contador só começou no dia 13", () => {
    // Basic real: dias 13 a 17. Média dos 3 dias completos (14 a 16) = 3810 por dia.
    const p = projectMonth({ "13": 48, "14": 1743, "15": 4753, "16": 4934, "17": 3204 }, NOW, 100_000);
    expect(p.used).toBe(14_682);
    expect(p.ratePerDay).toBe(3810);
    expect(p.overQuota).toBe(false);
    expect(p.exhaustionDay).toBeNull();
    expect(p.sustainablePerDay).toBe(Math.floor((100_000 - 14_682) / 14));
  });

  test("o mesmo ritmo num mês cheio esgota a franquia antes do fim", () => {
    const days = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [String(i + 1).padStart(2, "0"), 4900]));
    const p = projectMonth(days, NOW, 100_000);
    expect(p.used).toBe(83_300);
    expect(p.ratePerDay).toBe(4900);
    expect(p.overQuota).toBe(true);
    expect(p.exhaustionDay).toBe(17 + Math.ceil((100_000 - 83_300) / 4900));
    expect(p.exhaustionDay).toBe(21);
    expect(p.sustainablePerDay).toBe(Math.floor((100_000 - 83_300) / 14));
  });

  test("ritmo baixo cabe na franquia e não esgota", () => {
    const p = projectMonth({ "15": 100, "16": 100, "17": 20 }, NOW, 100_000);
    expect(p.overQuota).toBe(false);
    expect(p.exhaustionDay).toBeNull();
  });

  test("dia ausente no arquivo conta como zero; dia anterior ao primeiro registro fica de fora", () => {
    const p = projectMonth({ "05": 3000, "06": 3000, "07": 3000 }, Date.UTC(2026, 9, 20, 13), 100_000);
    // Janela 17, 18 e 19: nenhuma chamada nesses dias, então o ritmo é zero e não 3000.
    expect(p.ratePerDay).toBe(0);
    expect(p.exhaustionDay).toBeNull();
    // Hoje é o dia 8: janela 5, 6 e 7 (nenhum anterior ao primeiro registro).
    expect(projectMonth({ "05": 3000, "06": 3000, "07": 3000 }, Date.UTC(2026, 9, 8, 13), 100_000).ratePerDay).toBe(3000);
    // Primeiro registro no dia 6 e hoje o dia 8: a janela só alcança o dia 7 (o dia 5 é anterior ao contador).
    expect(projectMonth({ "06": 100, "07": 300 }, Date.UTC(2026, 9, 8, 13), 100_000).ratePerDay).toBe(200);
  });

  test("sem dia completo não há ritmo nem projeção", () => {
    const p = projectMonth({ "17": 300 }, NOW, 100_000);
    expect(p.ratePerDay).toBeNull();
    expect(p.projectedMonth).toBeNull();
    expect(p.exhaustionDay).toBeNull();
    expect(p.overQuota).toBe(false);
  });

  test("franquia já esgotada marca o próprio dia", () => {
    const p = projectMonth({ "15": 60_000, "16": 60_000, "17": 10 }, NOW, 100_000);
    expect(p.exhaustionDay).toBe(17);
    expect(p.sustainablePerDay).toBe(0);
  });
});
