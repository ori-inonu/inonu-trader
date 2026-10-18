import type { MemeStage, OkxReadOnlyClient } from "./okx-api";
import { isOkxIdentityMismatchError, isOkxReadOnlyClient } from "./okx-api";
import { isSyntheticOkxClient } from "./okx-fixture";
import { normalizeTokenAddress } from "./token-identity";
import { normalizeOpportunity, assessOpportunity } from "./okx-opportunities";
import type { OpportunityIdentity, ResearchPolicy } from "./okx-opportunities";

export type ScanInput = {
  client: OkxReadOnlyClient; chainIndex: string; stage: MemeStage; protocolId: string; limit: number;
  policy: ResearchPolicy; now: () => number;
  /** Legacy caller annotation; does not establish source or authentication provenance. */
  source: "synthetic" | "okx_authenticated";
};
function key(x: OpportunityIdentity) {
  return JSON.stringify([x.chainIndex, normalizeTokenAddress(x.chainIndex, x.tokenContractAddress)]);
}
export async function scanOpportunities(input: ScanInput) {
  const observedAt = input.now();
  if (!/^[1-9]\d*$/.test(input.chainIndex) || !["NEW", "MIGRATING", "MIGRATED"].includes(input.stage) || !/^[a-zA-Z0-9_.-]{1,80}$/.test(input.protocolId) || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 30 || !["synthetic", "okx_authenticated"].includes(input.source)) throw new Error("Invalid scan options");
  // Validate policy/clock before any provider call through the agreed public gate.
  assessOpportunity(normalizeOpportunity({ identity: { chainIndex: input.chainIndex, tokenContractAddress: "validation-only" } }), input.policy, observedAt);
  let apiCalls = 0;
  const protocols = await input.client.protocols(); apiCalls++;
  const coverage = protocols.filter(x => x.chainIndex === input.chainIndex);
  if (coverage.length !== 1 || !Array.isArray(coverage[0]?.protocolList) || !coverage[0].protocolList.some(x => x && typeof x === "object" && "protocolId" in x && x.protocolId === input.protocolId)) throw new Error("Unsupported chain or protocol");
  const listed = await input.client.listMemePump({ chainIndex: input.chainIndex, stage: input.stage, protocolIdList: [input.protocolId], limit: input.limit }); apiCalls++;
  let rejectedItems = 0;
  const validTokens = listed.items.slice(0, input.limit).filter(x => {
    if (x.chainIndex !== input.chainIndex || typeof x.tokenContractAddress !== 'string') { rejectedItems++; return false; }
    try { normalizeOpportunity({ identity: x as OpportunityIdentity }); return true; }
    catch { rejectedItems++; return false; }
  });
  const counts = new Map<string, number>();
  for (const token of validTokens) { const id = key(token as OpportunityIdentity); counts.set(id, (counts.get(id) ?? 0) + 1); }
  const tokens = validTokens.filter(x => { if (counts.get(key(x as OpportunityIdentity)) === 1) return true; rejectedItems++; return false; });
  const identities = tokens.map(x => ({ chainIndex: x.chainIndex as string, tokenContractAddress: x.tokenContractAddress as string }));
  let prices: Record<string, unknown>[] = [];
  let priceFailure = false;
  let priceIdentityMismatch = false;
  if (identities.length) {
    apiCalls++;
    try { prices = await input.client.prices(identities); } catch (error) {
      if (isOkxIdentityMismatchError(error)) priceIdentityMismatch = true;
      else priceFailure = true;
    }
  }
  const requested = new Set(identities.map(key));
  const unexpectedPrice = prices.some(x => typeof x.chainIndex !== 'string' || typeof x.tokenContractAddress !== 'string' || !requested.has(key(x as OpportunityIdentity)));
  const items = [];
  for (let i = 0; i < identities.length; i++) {
    const identity = identities[i]!;
    const matches = prices.filter(x => typeof x.chainIndex === "string" && typeof x.tokenContractAddress === "string" && key(x as OpportunityIdentity) === key(identity));
    const price = matches.length === 1 && !unexpectedPrice ? matches[0] : null;
    let advanced: Record<string, unknown> | null = null, pools: Record<string, unknown>[] | null = null;
    const issues: string[] = priceFailure ? ["unknown:price_fetch_failed"] : [];
    if (unexpectedPrice || priceIdentityMismatch) issues.push('price_identity_mismatch');
    if (matches.length > 1) issues.push('unknown:duplicate_price_identity');
    apiCalls++;
    try {
      const rows = await input.client.advanced(identity);
      if (rows.length > 1) issues.push('unknown:duplicate_advanced_identity');
      else advanced = rows[0] ?? null;
    } catch (error) { issues.push(isOkxIdentityMismatchError(error) ? "advanced_identity_mismatch" : "unknown:advanced_fetch_failed"); }
    apiCalls++;
    try { pools = await input.client.pools(identity); } catch (error) { issues.push(isOkxIdentityMismatchError(error) ? "pool_identity_mismatch" : "unknown:pools_fetch_failed"); }
    const opportunity = normalizeOpportunity({ identity, listed: tokens[i], price, advanced, pools });
    opportunity.issues.push(...issues);
    items.push({ opportunity, assessment: assessOpportunity(opportunity, input.policy, input.now()) });
  }
  const source = isSyntheticOkxClient(input.client) ? "synthetic"
    : isOkxReadOnlyClient(input.client) ? "okx_read_only_adapter" : "unknown";
  return { source, externalAccessObserved: false, observedAt, chainIndex: input.chainIndex, stage: input.stage, protocolId: input.protocolId, policy: { ...input.policy }, apiCalls, rejectedItems, costUsd: null, quotaRemaining: null, liveQualified: false, items };
}
