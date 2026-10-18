export const LOCAL_STOP_MESSAGE = { kind: "INONU_LOCAL_STOP_V1" } as const;
export const LOCAL_READY_MESSAGE = { kind: "INONU_LOCAL_READY_V1" } as const;

export function isLocalStop(raw: unknown): boolean {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    && Object.keys(raw).length === 1 && (raw as { kind?: unknown }).kind === LOCAL_STOP_MESSAGE.kind;
}
