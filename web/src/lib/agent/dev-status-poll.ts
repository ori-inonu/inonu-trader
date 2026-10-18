import type { DevAgentStatus } from "./dev-status";

export interface DevStatusPollState {
 readonly status: DevAgentStatus | null;
 readonly unavailable: boolean;
}

export const devStatusPollSucceeded = (status: DevAgentStatus): DevStatusPollState => ({ status, unavailable: false });
export const devStatusPollFailed = (previous: DevStatusPollState): DevStatusPollState => ({
 status: previous.status,
 unavailable: true,
});
