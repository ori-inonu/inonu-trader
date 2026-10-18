/**
 * The pages besides the core's own that may call its APIs, for DEVELOPMENT only: the Next dev server (port 3001, hot reload) runs on another origin than
 * the core (port 3000 from source), and the origin guard of every handler lets only listed origins through. The installed app lists none of these: it has
 * no environment variable set and serves its own page from its own origin.
 *
 * What is accepted is narrow on purpose: `http://127.0.0.1:<port>` and `http://localhost:<port>`, nothing else (no other host, no https, no path, no
 * wildcard, no credentials in the URL), at most four of them. Anything else in the variable is ignored, never "fixed".
 *
 * Who may turn them on: only the development entry (`dev.ts`), by calling `allowDevOrigins`. The installed entry never does, so an environment variable that happens to be set on
 * a person's machine changes nothing for the installed app (independent review 7, finding 10): the origin guard of a route that saves keys does not read the environment.
 */
const LOOPBACK_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost):[1-9]\d{1,4}$/;
const MAX_DEV_ORIGINS = 4;

let allowed: readonly string[] = [];

/** Called once, by the development entry, before the core starts. */
export function allowDevOrigins(env: Readonly<Record<string, string | undefined>>): void {
  allowed = devOrigins(env);
}

/** The development origins this process was started with: none, unless the development entry allowed them. */
export function activeDevOrigins(): readonly string[] {
  return allowed;
}

export function devOrigins(env: Readonly<Record<string, string | undefined>>): readonly string[] {
  const raw = env.INONU_DEV_ORIGINS;
  if (raw === undefined || raw.trim() === "") return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const origin = part.trim();
    if (!LOOPBACK_ORIGIN.test(origin) || Number(origin.slice(origin.lastIndexOf(":") + 1)) > 65535 || out.includes(origin)) continue;
    out.push(origin);
    if (out.length === MAX_DEV_ORIGINS) break;
  }
  return out;
}
