import type { AgentStatus } from "./types";

export interface StatusPollState {
 readonly status: AgentStatus | null;
 readonly stale: boolean;
}

export const statusPollSucceeded = (status: AgentStatus): StatusPollState => ({ status, stale: false });
export const statusPollFailed = (previous: StatusPollState): StatusPollState => ({
 status: previous.status,
 stale: previous.status !== null,
});

export const STATUS_REQUEST_TIMEOUT_MS = 10_000;

export function coalesceStatusRequest<T>(
 active: { current: Promise<T> | null },
 start: () => Promise<T>,
 timeoutMs = STATUS_REQUEST_TIMEOUT_MS,
): Promise<T> {
 const pending = active.current;
 if (pending !== null) return pending;

 let timeout: ReturnType<typeof setTimeout>;
 const request = new Promise<T>((resolve, reject) => {
  let settled = false;
  const finish = (action: () => void): void => {
   if (settled) return;
   settled = true;
   clearTimeout(timeout);
   if (active.current === request) active.current = null;
   action();
  };
  timeout = setTimeout(() => finish(() => reject(new Error("status_request_timeout"))), timeoutMs);
  void Promise.resolve().then(start).then(
   (value) => finish(() => resolve(value)),
   (error: unknown) => finish(() => reject(error)),
  );
 });
 active.current = request;
 return request;
}
