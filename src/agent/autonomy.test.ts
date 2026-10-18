import { describe, expect, test } from "bun:test";
import { DISCIPLINE, lapsedPause, LEGACY_PAUSE_REASONS } from "./autonomy";

describe("the pause of the purchases rests on the money, never on an alternative that did not happen", () => {
  test("a pause lasts a day, and the measurement of a week is only for the stance of a free profile", () => {
    expect(DISCIPLINE.pauseMs).toBe(24 * 3_600_000);
    expect(DISCIPLINE.evidenceDays).toBe(7);
    // no limit of loss over measured decisions is left in the rule: there is nothing here that reads the Placar
    expect(Object.keys(DISCIPLINE).sort()).toEqual(["evidenceDays", "pauseMs"]);
  });

  test("the reasons that the first version wrote from the Placar (a sale against keeping the token, a purchase priced after the position was already sold, a week against keeping dollars) are the legacy ones", () => {
    expect(LEGACY_PAUSE_REASONS).toEqual(["disjuntor_de_perda", "evidencia_perdida"]);
  });

  test("a legacy pause is looked at again and lifted when the agent trades: the value of the wallet is what the rule reads now, and it is not in that reason", () => {
    expect(lapsedPause("disjuntor_de_perda", true)).toBe(true);
    expect(lapsedPause("evidencia_perdida", true)).toBe(true);
  });

  test("a pause for another reason, such as the wallet really falling in value, is never lifted by this, and nor is one the agent is not trading under", () => {
    for (const reason of ["queda_do_dia", "queda_do_pico", "desconhecida", null]) expect(lapsedPause(reason, true)).toBe(false);
    expect(lapsedPause("disjuntor_de_perda", false)).toBe(false);
  });
});
