import { isAbsolute, join, resolve } from "node:path";

const OS_ENV = new Set(["SYSTEMROOT", "WINDIR", "PATH", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "TEMP", "TMP"]);

/** Only OS paths cross into the child. Vault/session credentials are read by the existing core, never copied by this launcher. */
export function localCorePlan(
  appDir: string,
  home: string,
  sourceEnv: Readonly<Record<string, string | undefined>>,
  options: { readonly pulse?: boolean } = {},
) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(sourceEnv)) if (OS_ENV.has(key.toUpperCase()) && typeof value === "string") env[key] = value;
  env.INONU_HOME = resolve(home);
  env.INONU_WEB_DIR = join(resolve(appDir), "web");
  env.INONU_NO_DIALOG = "1";
  return {
    command: [join(resolve(appDir), "InonuTrader.exe"), ...(options.pulse === true ? ["--pulse"] : [])],
    cwd: resolve(home),
    env,
    origin: "http://127.0.0.1:3000",
  } as const;
}

/** Arguments for the detached supervisor child. Ambient pulse settings are deliberately filtered out. */
export function localSupervisorPlan(
  appDir: string,
  home: string,
  sourceEnv: Readonly<Record<string, string | undefined>>,
  entry: string,
  bunExecutable: string,
  options: { readonly pulse?: boolean; readonly awaitHandoff?: boolean; readonly controlPath?: string } = {},
) {
  if (options.controlPath !== undefined && !isAbsolute(options.controlPath)) throw new Error("local_absolute_path_required");
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(sourceEnv)) if (OS_ENV.has(key.toUpperCase()) && typeof value === "string") env[key] = value;
  const command = [
    resolve(bunExecutable), "--no-env-file", "run", resolve(entry), "--app", resolve(appDir), "--home", resolve(home),
    ...(options.awaitHandoff === true ? ["--await-handoff"] : []),
    ...(options.pulse === true ? ["--pulse"] : []),
    ...(options.controlPath === undefined ? [] : ["--control", resolve(options.controlPath)]),
  ];
  return { command, env } as const;
}

export const LOCAL_MESSAGES = {
  local_waiting: "Supervisor em espera. O Inonu atual continua com seu lancador; o supervisor inicia seu proprio processo somente depois que a porta ficar livre.",
  local_existing: "Ja existe um Inonu na porta 3000. Este lancador nao assumiu a supervisao dele. A troca precisa encerrar o lancador anterior primeiro.",
  local_port_busy: "Outro programa ocupa a porta 3000. Nenhum processo foi encerrado.",
  local_started: "Processo local iniciado. Consulte a pagina do agente para saber se esta em analise ou com autoridade para negociar.",
  local_retry: "O processo terminou. Aguardando antes de tentar novamente.",
  local_failed: "As tentativas de reinicio terminaram. Confira o log antes de iniciar novamente.",
  local_stopped: "Supervisor encerrado.",
} as const;
