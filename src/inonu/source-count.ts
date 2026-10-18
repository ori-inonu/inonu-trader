/**
 * Counting the OnchainOS calls that really left (ASK-6): the sources count them when they succeed, but a source that refuses after
 * reading (no signals, no data, only honeypots) used to report nothing, and the ledger and the usage panel under-counted. The
 * gateway is wrapped so each call that was SENT (a cache hit or a refusal that never left is not) is counted, and the source is wrapped
 * so a refusal carries that count. Asking is single flight, so one counter per gateway serves every click.
 */
import type { InternalGatewayResult, OnchainGatewayInternal } from "../onchain-read/gateway";
import { SourceError } from "./source-error";
import type { BriefSource } from "./ask";

export function countSentCalls(gateway: Pick<OnchainGatewayInternal, "callInternal">) {
  let sent = 0;
  return {
    gateway: {
      async callInternal(route, params, intent): Promise<InternalGatewayResult> {
        const result = await gateway.callInternal(route, params, intent);
        if (result.sent) sent += 1;
        return result;
      },
    } satisfies Pick<OnchainGatewayInternal, "callInternal">,
    count: (): number => sent,
    reset: (): void => {
      sent = 0;
    },
  };
}

/** A source whose refusals say how many provider calls the click had already spent. */
export function withSentCount(inner: BriefSource, counter: { readonly count: () => number; readonly reset: () => void }): BriefSource {
  return {
    async build(request, context) {
      counter.reset();
      try {
        return await inner.build(request, context);
      } catch (error) {
        if (error instanceof SourceError && error.onchainosCalls === null) throw new SourceError(error.code, counter.count());
        throw error;
      }
    },
  };
}
