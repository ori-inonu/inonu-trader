import { isAbsolute, resolve } from "node:path";

/** Explicit absolute paths prevent a selftest from silently using the financial home or a flag as a directory. */
export function absoluteArg(args: readonly string[], flag: string): string | null {
  const at = args.indexOf(flag);
  if (at < 0) return null;
  const value = args[at + 1];
  if (!value || value.startsWith("--") || !isAbsolute(value)) throw new Error("local_absolute_path_required");
  return resolve(value);
}

/** The local artifact accepts pulse only as an explicit argv option; ambient environment flags never enable it. */
export function localPulseOption(args: readonly string[]): boolean {
  const occurrences = args.filter((value) => value === "--pulse").length;
  if (occurrences > 1) throw new Error("local_pulse_duplicate");
  const enabled = occurrences === 1;
  if (enabled && args.includes("--selftest")) throw new Error("local_selftest_pulse_forbidden");
  return enabled;
}
