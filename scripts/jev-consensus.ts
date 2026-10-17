/**
 * Sequential decisions with the Jev as the judge, from the command line (the same engine as the MCP server, src/consensus). READ ONLY for the project: it reads one spec file, writes only the receipt file given by --out,
 * places no order, restarts nothing and changes no setting. `plan` needs no key and no network. `run` asks the REAL Jev (paid) and refuses without --allow-paid-inference, without --max-calls (1 to 40) and without the
 * key in the environment (TYPESAFE_AI_API_KEY or TYPESAFE_API_KEY, read only to build the provider, never printed). The result is a recommendation with a receipt: it authorizes nothing.
 * Usage:
 *   bun --no-env-file run scripts/jev-consensus.ts plan <spec.json>
 *   bun --no-env-file run scripts/jev-consensus.ts run <spec.json> --allow-paid-inference --max-calls <n> [--out <receipt.json>]
 * Exit codes: 0 receipt printed (any status); 2 usage or refusal; 3 error.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { decide, DISCLAIMER } from "../src/consensus/engine";
import { createJevJudge, JEV_JUDGE_HARD_MAX_CALLS } from "../src/consensus/jev-judge";
import { parseSpec, planOf } from "../src/consensus/spec";

const [command, file, ...rest] = process.argv.slice(2);
const flag = (name: string): string | undefined => {
 const i = rest.indexOf(name);
 return i >= 0 ? rest[i + 1] : undefined;
};
const refuse = (message: string): never => {
 console.error(message);
 process.exit(2);
};

if ((command !== "plan" && command !== "run") || file === undefined) refuse("uso: jev-consensus.ts plan|run <spec.json> [--allow-paid-inference --max-calls <n> --out <arquivo>]");
let spec;
try {
 spec = parseSpec(JSON.parse(readFileSync(file!, "utf8")));
} catch (error) {
 console.error(`spec recusada: ${error instanceof Error ? error.message : "erro"}`);
 process.exit(2);
}

if (command === "plan") {
 console.log(JSON.stringify({ specId: spec!.id, ...planOf(spec!), note: "um teto, nao uma previsao; nada foi enviado" }, null, 2));
 process.exit(0);
}

if (!rest.includes("--allow-paid-inference")) refuse("recusado: a consulta ao Jev e paga; passe --allow-paid-inference");
const cap = Number(flag("--max-calls"));
if (!Number.isInteger(cap) || cap < 1 || cap > JEV_JUDGE_HARD_MAX_CALLS) refuse(`recusado: --max-calls deve ser inteiro de 1 a ${JEV_JUDGE_HARD_MAX_CALLS}`);
const apiKey = process.env.TYPESAFE_API_KEY ?? process.env.TYPESAFE_AI_API_KEY;
if (apiKey === undefined || apiKey === "") refuse("recusado: chave do provedor ausente no ambiente (TYPESAFE_API_KEY ou TYPESAFE_AI_API_KEY)");

try {
 const judge = createJevJudge({ apiKey: apiKey!, maxCalls: cap });
 const receipt = await decide(spec!, judge);
 const out = { receipt, meter: judge.meter(), disclaimer: DISCLAIMER };
 const out_path = flag("--out");
 if (out_path !== undefined) writeFileSync(out_path, `${JSON.stringify(out, null, 2)}\n`);
 console.log(JSON.stringify(out, null, 2));
} catch (error) {
 console.error(`erro: ${error instanceof Error ? error.message.slice(0, 200) : "desconhecido"}`);
 process.exit(3);
}
