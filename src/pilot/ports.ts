/**
 * Ports of the pilot service and of the page that may call it. Both used to be fixed (3020 and 3021), and other local servers
 * already listen there, so the entry scripts can now move them with PILOT_PORT and PILOT_UI_PORT. The defaults are unchanged.
 *
 * Nothing here reads the process: the entry scripts hand over the environment and only the two names below are looked at.
 * web/src/lib/gev-pilot-client.ts keeps a browser copy of the same rule for NEXT_PUBLIC_PILOT_PORT (Turbopack is rooted at
 * web/, so it cannot import this file at run time); gev-pilot-endpoint.test.ts keeps the two in agreement.
 */
export interface PilotPorts {
  /** Loopback port of the pilot service. */
  port: number;
  /** Loopback port of the page whose origin may call the service. */
  uiPort: number;
}

export const DEFAULT_PILOT_PORTS: Readonly<PilotPorts> = Object.freeze({ port: 3020, uiPort: 3021 });

/** A port is a plain decimal 1 to 65535: no sign, no leading zero, no space, no exponent. */
export function validPilotPort(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 65535;
}

/** The default when the text is absent, the number when it is valid, null when it is present and invalid. */
export function parsePilotPort(text: string | undefined, fallback: number): number | null {
  if (text === undefined) return fallback;
  return /^[1-9][0-9]{0,4}$/.test(text) && validPilotPort(Number(text)) ? Number(text) : null;
}

export function resolvePilotPorts(env: Readonly<Record<string, string | undefined>>): PilotPorts {
  const port = parsePilotPort(env.PILOT_PORT, DEFAULT_PILOT_PORTS.port);
  if (port === null) throw new Error("Invalid PILOT_PORT");
  const uiPort = parsePilotPort(env.PILOT_UI_PORT, DEFAULT_PILOT_PORTS.uiPort);
  if (uiPort === null) throw new Error("Invalid PILOT_UI_PORT");
  if (port === uiPort) throw new Error("PILOT_PORT and PILOT_UI_PORT must differ");
  return { port, uiPort };
}
