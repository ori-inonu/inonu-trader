/**
 * The outcome of EVERY purchase the Jev was asked about, from the durable journals the producer writes from the next release on (`answers.jsonl` and `prices.jsonl`, src/agent/recording.ts): gross forward return at
 * 1 and 5 minutes (the scale of the cycle), 15 minutes, 1 hour and 4 hours by how much the Jev preferred each purchase and by what it asked for. READ ONLY: it reads the journals of a folder, writes nothing, calls no model and no network, and prints one JSON object.
 * The return is a counterfactual before cost and impact, never a result and never advice; a return that could not be measured is counted apart, never averaged in. The same token appears in many looks, so the
 * observations are NOT independent: this describes, it does not test (the plan of the test is ADENDO-G).
 * Usage: bun scripts/answers-outcomes.ts [dataDir]
 */
import { outcomesOf, buildPathIndex, summarize, type Group, type WindowName } from "../src/agent/shadow/outcomes";
import { journalSegments, type AnswerRecord, type PriceRow } from "../src/agent/recording";

const dir = (process.argv[2] ?? `${process.env.LOCALAPPDATA ?? ""}/InonuTrader/data/agent`).replaceAll("\\", "/").replace(/\/?$/, "/");
const readAll = async (name: string): Promise<any[]> => {
  const rows: any[] = [];
  for (const file of journalSegments(dir, name)) {
    const text = await Bun.file(file).text();
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      try {
        rows.push(JSON.parse(line));
      } catch {
        // a line that is not a record is skipped, never an error
      }
    }
  }
  return rows;
};

const answers = (await readAll("answers")) as AnswerRecord[];
const prices = (await readAll("prices")) as PriceRow[];
if (answers.length === 0 || prices.length === 0) {
  console.log(JSON.stringify({ dataDir: dir, answers: answers.length, priceRows: prices.length, note: "no data yet: the recorder (src/agent/recording.ts) writes these journals only in a release that contains it; the core running on 2026-10-15 (release24) does not" }, null, 2));
  process.exit(0);
}

const outcomes = outcomesOf(answers, buildPathIndex(prices));
const asked = (o: { requested: string | null }): boolean => o.requested !== null && o.requested !== "skip";
const groups: Group[] = [
  { name: "skipped, preference under 0.10", pick: (o) => !asked(o) && o.preference !== null && o.preference < 0.1 },
  { name: "skipped, preference 0.10 to 0.20", pick: (o) => !asked(o) && o.preference !== null && o.preference >= 0.1 && o.preference < 0.2 },
  { name: "skipped, preference 0.20 or more", pick: (o) => !asked(o) && o.preference !== null && o.preference >= 0.2 },
  { name: "skipped, preference unknown", pick: (o) => !asked(o) && o.preference === null },
  { name: "asked to buy", pick: asked },
];
const windows: WindowName[] = ["1m", "5m", "15m", "1h", "4h"];
console.log(
  JSON.stringify(
    {
      dataDir: dir,
      note: "gross counterfactual before cost and impact; NOT a result and NOT advice; observations are not independent (the same token appears in many looks); a return that could not be measured is counted as unknown",
      answers: answers.length,
      priceRows: prices.length,
      purchasesOffered: outcomes.length,
      byWindow: Object.fromEntries(windows.map((w) => [w, summarize(outcomes, groups, w)])),
    },
    null,
    2,
  ),
);
