/**
 * Sequential decisions with the Jev as the judge, from the command line (the same engine as the MCP server, src/consensus). READ ONLY for the project: it reads one spec file, writes only the receipt file given by --out,
 * places no order, restarts nothing and changes no setting. `plan` needs no key and no network. `run` asks the REAL Jev (paid, with no ceiling on its calls unless --max-calls is given) and refuses only without the
 * key in the environment (TYPESAFE_AI_API_KEY or TYPESAFE_API_KEY, read only to build the provider, never printed). The result is a recommendation with a receipt: it authorizes nothing.
 * Usage:
 *   bun --no-env-file run scripts/jev-consensus.ts plan <spec.json>
 *   bun --no-env-file run scripts/jev-consensus.ts run <spec.json> [--out <receipt.json>]
 * Exit codes: 0 receipt printed (any status); 2 usage or refusal; 3 error.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { decide, DISCLAIMER } from "../src/consensus/engine";
import { createJevJudge } from "../src/consensus/jev-judge";
import { quotaPath, refund, reserve } from "../src/consensus/quota";
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

if ((command !== "plan" && command !== "run") || file === undefined) refuse("uso: jev-consensus.ts plan|run <spec.json> [--max-calls <n>] [--out <arquivo>]");
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

const capFlag = flag("--max-calls");
if (rest.includes("--max-calls") && capFlag === undefined) refuse("recusado: --max-calls precisa de um valor");
const cap = capFlag === undefined ? undefined : Number(capFlag);
if (cap !== undefined && (!Number.isInteger(cap) || cap < 1)) refuse("recusado: --max-calls, se passado, deve ser inteiro positivo");
const apiKey = process.env.TYPESAFE_API_KEY ?? process.env.TYPESAFE_AI_API_KEY;
if (apiKey === undefined || apiKey === "") refuse("recusado: chave do provedor ausente no ambiente (TYPESAFE_API_KEY ou TYPESAFE_AI_API_KEY)");

// Sem teto: so reserva no ledger quando --max-calls foi dado; sem ele o uso e somado ao ledger depois da execucao.
const QUOTA = quotaPath();
const granted = cap === undefined ? undefined : await reserve(QUOTA, cap);
if (granted === 0) refuse("recusado: sem chamadas ao Jev disponiveis para esta execucao");
const judge = granted === undefined ? createJevJudge({ apiKey: apiKey! }) : createJevJudge({ apiKey: apiKey!, maxCalls: granted });
try {
 const receipt = await decide(spec!, judge);
 const out = { receipt, meter: judge.meter(), disclaimer: DISCLAIMER };
 const out_path = flag("--out");
 if (out_path !== undefined) writeFileSync(out_path, `${JSON.stringify(out, null, 2)}\n`);
 console.log(JSON.stringify(out, null, 2));
} catch (error) {
 console.error(`erro: ${error instanceof Error ? error.message.slice(0, 200) : "desconhecido"}`);
 process.exitCode = 3;
} finally {
 if (granted === undefined) await reserve(QUOTA, judge.meter().sent);
 else await refund(QUOTA, granted - judge.meter().sent);
}
