import { describe, expect, test } from 'bun:test';
import { normalizeOpportunity, assessOpportunity, DEFAULT_RESEARCH_POLICY, scenarioEconomics } from './okx-opportunities';

const identity = { chainIndex: '196', tokenContractAddress: '0x1111111111111111111111111111111111111111' };
const price = { ...identity, price: '1.20', time: '1700000000000', holders: '1500' };
const members = [{ tokenContractAddress: identity.tokenContractAddress, tokenAmount: '10000', tokenSymbol: 'FIXTURE' }];

describe('opportunity identity and market facts', () => {
  test('keeps unknown fields unknown and rejects price from another asset', () => {
    const normalized = normalizeOpportunity({ identity, listed: { ...identity, tokenSymbol: 'SAME' }, price: { ...price, tokenContractAddress: '0x2222222222222222222222222222222222222222' } });
    expect(normalized.priceUsd).toBeNull();
    expect(normalized.issues).toContain('price_identity_mismatch');
    expect(normalized.poolLiquidityUsd).toBeNull();
    expect(normalized.riskLevel).toBeNull();
    expect(normalized.tags).toBeNull();
  });
  test('normalizes public USD, percentage and timestamp units without adding pool liquidity', () => {
    const normalized = normalizeOpportunity({ identity, listed: { ...identity, symbol: 'FIXTURE' }, price, advanced: { ...identity, top10HoldPercent: '12.5', riskControlLevel: '2', tokenTags: [] }, pools: [{ liquidityAmount: members, liquidityUsd: '100000', liquidityProviderFeePercent: '0.7%', hookFeePercent: { buy: '', sell: '0.2%' } }, { liquidityAmount: members, liquidityUsd: '150000' }] });
    expect(normalized.priceUsd).toBe(1.2);
    expect(normalized.priceTimeMs).toBe(1700000000000);
    expect(normalized.holders).toBe(1500);
    expect(normalized.top10HoldPercent).toBe(12.5);
    expect(normalized.riskLevel).toBe(2);
    expect(normalized.tags).toEqual([]);
    expect(normalized.poolLiquidityUsd).toBe(150000);
    expect(normalized.poolFees[0]).toEqual({ providerPercent: 0.7, hookBuyPercent: null, hookSellPercent: 0.2, sniperBuyPercent: null, sniperSellPercent: null });
  });
  test('matches EVM case but preserves Solana case and invalid facts', () => {
    const evm = { chainIndex: '196', tokenContractAddress: '0xaBcD111111111111111111111111111111111111' };
    const normalized = normalizeOpportunity({ identity: evm, price: { ...price, ...evm, tokenContractAddress: evm.tokenContractAddress.toLowerCase(), price: '', time: 'Infinity', holders: '-1' }, advanced: { riskControlLevel: '0', top10HoldPercent: '101', tokenTags: null }, pools: [{ liquidityUsd: '-1' }] });
    expect(normalized.issues).not.toContain('price_identity_mismatch');
    expect(normalized.priceUsd).toBeNull();
    expect(normalized.priceTimeMs).toBeNull();
    expect(normalized.holders).toBeNull();
    expect(normalized.top10HoldPercent).toBeNull();
    expect(normalized.riskLevel).toBeNull();
    expect(normalized.poolLiquidityUsd).toBeNull();
    const sol = { chainIndex: '501', tokenContractAddress: 'AbcMint' };
    expect(normalizeOpportunity({ identity: sol, price: { ...sol, tokenContractAddress: 'abcmint', price: '1' } }).issues).toContain('price_identity_mismatch');
  });
  test('rejects advanced and pool facts for another token and keeps absent membership unknown', () => {
    const other = '0x2222222222222222222222222222222222222222';
    const mixed = normalizeOpportunity({ identity, price, listed: { ...identity, tokenContractAddress: other, symbol: 'WRONG' }, advanced: { ...identity, tokenContractAddress: other, top10HoldPercent: '1', riskControlLevel: '1', tokenTags: [] }, pools: [{ liquidityUsd: '900000', liquidityAmount: [{ tokenContractAddress: other }] }] });
    expect(mixed.symbol).toBeNull();
    expect(mixed.riskLevel).toBeNull();
    expect(mixed.poolLiquidityUsd).toBeNull();
    expect(mixed.issues).toContain('listed_identity_mismatch');
    expect(mixed.issues).toContain('advanced_identity_mismatch');
    expect(mixed.issues).toContain('pool_identity_mismatch');
    const absent = normalizeOpportunity({ identity, price, pools: [{ liquidityUsd: '900000' }] });
    expect(absent.poolLiquidityUsd).toBeNull();
    expect(absent.issues).toContain('unknown:pool_membership');
    expect(() => normalizeOpportunity({ identity: { ...identity, tokenContractAddress: '' } })).toThrow('Invalid token identity');
  });
});

describe('hypothetical two-leg economics', () => {
  const input = { capitalUsd: 100, exitGrossReturnPercent: 10, buyFeePercent: 1, sellFeePercent: 1, buyTaxPercent: 0, sellTaxPercent: 0, buySlippagePercent: 0, sellSlippagePercent: 0, networkUsd: 1, inferenceUsd: 0.5, otherUsd: 0.5, bufferUsd: 1 };
  test('rejects every omitted scenario field instead of treating absence as zero', () => {
    for (const key of Object.keys(input) as (keyof typeof input)[]) {
      const incomplete = { ...input };
      delete (incomplete as Partial<typeof input>)[key];
      expect(() => scenarioEconomics(incomplete)).toThrow('Invalid hypothetical scenario');
    }
  });
  test('subtracts both legs and fixed costs, reporting breakeven without execution authority', () => {
    const result = scenarioEconomics(input);
    expect(result.netUsd).toBeCloseTo(5.811, 6);
    expect(result.costUsd).toBeCloseTo(4.189, 6);
    expect(result.breakevenReturnPercent).toBeCloseTo(4.07101316, 6);
    expect(result.eligible).toBe(true);
    expect(result.execution).toBe('not_qualified');
    expect(scenarioEconomics({ ...input, bufferUsd: 5.811 }).eligible).toBe(false);
    expect(() => scenarioEconomics({ ...input, buyTaxPercent: 100 })).toThrow('Invalid hypothetical scenario');
    expect(() => scenarioEconomics({ ...input, inferenceUsd: NaN })).toThrow('Invalid hypothetical scenario');
  });
  test('charges all six proportional costs and a realized loss cannot pass', () => {
    // 10% on each of six legs/cost components leaves 53.1441 of 100 before fixed costs.
    const result = scenarioEconomics({ ...input, exitGrossReturnPercent: 0, buyFeePercent: 10, sellFeePercent: 10, buyTaxPercent: 10, sellTaxPercent: 10, buySlippagePercent: 10, sellSlippagePercent: 10 });
    expect(result.netUsd).toBeCloseTo(-48.8559, 6);
    expect(result.costUsd).toBeCloseTo(48.8559, 6);
    expect(result.eligible).toBe(false);
    expect(scenarioEconomics({ ...input, exitGrossReturnPercent: -100 }).netUsd).toBe(-102);
    expect(() => scenarioEconomics({ ...input, otherUsd: undefined as unknown as number })).toThrow('Invalid hypothetical scenario');
  });
});

describe('research qualification, never execution qualification', () => {
  const good = () => normalizeOpportunity({ identity, listed: { ...identity, symbol: 'FIXTURE' }, price, advanced: { ...identity, top10HoldPercent: '12.5', riskControlLevel: '2', tokenTags: [] }, pools: [{ liquidityAmount: members, liquidityUsd: '150000' }] });
  test('distinguishes candidate, critical unknown and known blockers with explicit policy', () => {
    const candidate = assessOpportunity(good(), DEFAULT_RESEARCH_POLICY, 1700000030000);
    expect(candidate.status).toBe('research_candidate');
    expect(candidate.execution).toBe('not_qualified');
    expect(assessOpportunity({ ...good(), riskLevel: null }, DEFAULT_RESEARCH_POLICY, 1700000030000).status).toBe('unknown');
    const honey = assessOpportunity({ ...good(), tags: ['honeypot'], poolLiquidityUsd: null }, DEFAULT_RESEARCH_POLICY, 1700000030000);
    expect(honey.status).toBe('blocked');
    expect(honey.reasons).toContain('risk_tag:honeypot');
    expect(honey.reasons).toContain('unknown:pool_liquidity');
    expect(assessOpportunity(good(), DEFAULT_RESEARCH_POLICY, 1700000060001).reasons).toContain('stale_price');
    expect(assessOpportunity(good(), DEFAULT_RESEARCH_POLICY, 1699999999999).reasons).toContain('future_price');
    expect(() => assessOpportunity(good(), { ...DEFAULT_RESEARCH_POLICY, minPoolLiquidityUsd: NaN }, 1700000030000)).toThrow('Invalid research policy');
  });
  test('rejects incomplete policy and treats invalid discrete facts as unknown', () => {
    const incomplete = { ...DEFAULT_RESEARCH_POLICY }; delete (incomplete as Partial<typeof incomplete>).maxPriceAgeMs;
    expect(() => assessOpportunity(good(), incomplete, 1700000030000)).toThrow('Invalid research policy');
    expect(assessOpportunity({ ...good(), riskLevel: 0 }, DEFAULT_RESEARCH_POLICY, 1700000030000).status).toBe('unknown');
    expect(assessOpportunity({ ...good(), holders: 1000.5 }, DEFAULT_RESEARCH_POLICY, 1700000030000).status).toBe('unknown');
    expect(assessOpportunity({ ...good(), top10HoldPercent: -1 }, DEFAULT_RESEARCH_POLICY, 1700000030000).status).toBe('unknown');
    expect(assessOpportunity({ ...good(), tags: [' honeypot '] }, DEFAULT_RESEARCH_POLICY, 1700000030000).status).toBe('blocked');
  });
});
