import { createSemanticProofEvaluator, type SemanticReadPorts } from './semantic-proof';
import type { CoreReadInput, CoreSample, NormalizedQuote, SourceEnvelope, SwapBuild } from './types';

/** Must run before sanitizeCoreSample removes the ephemeral unsigned build. */
export async function attachCoreSemanticProof(sample: CoreSample, input: CoreReadInput, ports: SemanticReadPorts, now: () => number): Promise<CoreSample> {
 if (!sample.proposal) return sample;
 const quote=sample.envelopes.quote as SourceEnvelope<NormalizedQuote> | undefined;
 const build=sample.envelopes.build as SourceEnvelope<SwapBuild> | undefined;
 if (!quote || !build) return {...sample,holdReasons:[...new Set([...sample.holdReasons,'semantic-input-unavailable'])]};
 const semanticProof=await createSemanticProofEvaluator({ports,now}).evaluate({address:input.address,proposal:sample.proposal,quote,build,
  expected:{identityKey:sample.identityKey,chainIndex:input.chainIndex,revision:input.revision,correlationId:input.correlationId}});
 return {...sample,semanticProof,holdReasons:[...new Set([...sample.holdReasons,...semanticProof.localReasons,...semanticProof.remainingRequirements])]};
}
