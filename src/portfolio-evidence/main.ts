/**
 * Process boundary of the wallet evidence CLI: the ONLY file of this module that touches the environment, the global
 * fetch, the clock, timers and the console.
 *
 *   bun --no-env-file src/portfolio-evidence/main.ts demo
 *   bun --no-env-file src/portfolio-evidence/main.ts plan --address 0x... --chains 1,501
 *
 * `--no-env-file` keeps Bun from loading .env files by itself; credentials, when the user chooses to use them, come from
 * the process environment through the explicit --credentials-from-env switch.
 */

import { nodeCaptureFs } from "../onchainos/capture.ts";
import type { FetchLike } from "../onchainos/http.ts";
import { runCli } from "./cli.ts";

const realFetch: FetchLike = (url, init) => fetch(url, init);

if (import.meta.main) {
  const code = await runCli(process.argv.slice(2), {
    env: process.env,
    fetch: realFetch,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    fs: nodeCaptureFs,
  });
  process.exitCode = code;
}
