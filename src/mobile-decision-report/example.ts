import { exportMobileDecisionHtml, exportMobileDecisionJson } from "./export";
import { SYNTHETIC_NOW_MS, syntheticMobileInput, type SyntheticCase } from "./fixtures";

/** Explicit offline generator. It reads no configuration and never fetches data. */
if (import.meta.main) {
  const input = syntheticMobileInput("fresh");
  const options = { now_ms: SYNTHETIC_NOW_MS };
  const cases: SyntheticCase[] = ["fresh", "missing", "stale", "future", "contradiction", "invalid", "known_costs"];
  await Bun.write(new URL("../../docs/mobile-decision-report/example.html", import.meta.url), exportMobileDecisionHtml(input, options));
  await Bun.write(new URL("../../docs/mobile-decision-report/example.json", import.meta.url), exportMobileDecisionJson(input, options));
  await Bun.write(new URL("../../docs/mobile-decision-report/fixtures.json", import.meta.url), JSON.stringify({
    schema: "synthetic_mobile_fixtures_v1",
    synthetic: true,
    now_ms: SYNTHETIC_NOW_MS,
    cases: cases.map(name => ({ name, input: syntheticMobileInput(name) })),
  }, null, 2) + "\n");
  console.log("Generated synthetic offline HTML, JSON and fixture cases in docs/mobile-decision-report.");
}
