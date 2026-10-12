/**
 * Environment of the two processes that `real:console` creates (the paper backend and the Next dev or start server).
 *
 * A child never inherits the shell. A repository .env, a shell export or a CI variable can hold keys that have nothing to
 * do with the paper pipeline (wallet, operator and Solana keys, live acknowledgements), so every child receives only the
 * names listed here, copied from the parent they are given. The functions take the parent as an argument and never read
 * the process themselves; the entry script decides what the parent is.
 */
export type EnvSource = Readonly<Record<string, string | undefined>>;

/** What any child needs just to start: the Windows system directories, the temporary directories and the search path. */
export const CHILD_BASE_ENV = ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH"] as const;

/** Every REAL_ variable that loadRealConfig reads and docs/real-integration/real.env.example documents for the backend. */
export const BACKEND_REAL_ENV = [
  "REAL_PORT", "REAL_INTERVAL_MS", "REAL_JOURNAL_PATH",
  "REAL_JEV_MODEL", "REAL_JEV_CONSUMPTION_AUTHORIZED", "REAL_JEV_MAX_CALLS", "REAL_JEV_USD_PER_MILLION",
  "REAL_FROM_TOKEN", "REAL_TO_TOKEN", "REAL_AMOUNT", "REAL_SLIPPAGE_PERCENT",
] as const;

/**
 * The application's own service credentials, documented in real.env.example and loaded by the owner with an explicit
 * `--env-file`. Only the backend reads them (loadRealConfig); the frontend never receives them.
 */
export const BACKEND_CREDENTIAL_ENV = ["OKX_WEB3_API_KEY", "OKX_WEB3_API_SECRET", "OKX_WEB3_API_PASSPHRASE", "TYPESAFE_AI_API_KEY"] as const;

/** REAL_ variables that belong to the console script itself and are therefore never passed on. */
export const CONSOLE_ONLY_REAL_ENV = ["REAL_UI_PORT", "REAL_UI_MODE", "REAL_NODE_EXECUTABLE"] as const;

/** Windows spells variables with any letter case, so an exact name is preferred and a differently cased one is accepted. */
function lookup(source: EnvSource, name: string): string | undefined {
  const exact = source[name];
  if (typeof exact === "string") return exact;
  const wanted = name.toLowerCase();
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (typeof value === "string" && key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function pick(source: EnvSource, names: readonly string[]): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const name of names) {
    const value = lookup(source, name);
    if (value !== undefined) picked[name] = value;
  }
  return picked;
}

/** Backend child: the base names, the documented REAL_ settings and credentials, and the origins computed from the UI port. */
export function backendChildEnv(source: EnvSource, uiPort: number): Record<string, string> {
  return {
    ...pick(source, [...CHILD_BASE_ENV, ...BACKEND_REAL_ENV, ...BACKEND_CREDENTIAL_ENV]),
    REAL_DASHBOARD_ORIGINS: `http://localhost:${uiPort},http://127.0.0.1:${uiPort}`,
  };
}

/** Frontend child: the base names plus the public API address and the telemetry switch the console sets itself. */
export function frontendChildEnv(source: EnvSource, backendPort: number): Record<string, string> {
  return {
    ...pick(source, CHILD_BASE_ENV),
    NEXT_PUBLIC_API_URL: `http://127.0.0.1:${backendPort}`,
    NEXT_TELEMETRY_DISABLED: "1",
  };
}
