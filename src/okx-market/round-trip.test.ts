import { expect, test } from 'bun:test';
import { hypotheticalRoundTripEconomics, quoteRoundTrip } from './round-trip';
import { createOkxDexReadOnlyClient } from './okx-dex';

const tokenA = { address: '0xAa', decimals: 18, metadataSource: 'synthetic-explicit' };
const tokenB = { address: '0xBb', decimals: 6, metadataSource: 'synthetic-explicit' };
const policy = { maxElapsedMs: 5000, maxImpactMagnitudePercent: 1 };
function quote(from: typeof tokenA, to: typeof tokenA, input: string, output: string) {
  return { chainIndex: '1', swapMode: 'exactIn', fromTokenAmount: input, toTokenAmount: output,
    fromToken: { tokenContractAddress: from.address, decimal: String(from.decimals), isHoneyPot: false, taxRate: '0' },
    toToken: { tokenContractAddress: to.address, decimal: String(to.decimals), isHoneyPot: false, taxRate: '0.01' },
    priceImpactPercent: '-0.10', tradeFee: '1.5', estimateGasFee: '1000000000',
    dexRouterList: [{ subRouterList: [{ fromToken: { tokenContractAddress: 'intermediate-hop' } }] }] };
}
function scenario(overrides: Record<string, unknown> = {}) {
  const calls: unknown[] = [];
  let clock = 1000;
  const client = {
    async supportedChain(chain: string) { calls.push(['coverage', chain]); return [{ chainIndex: '1', chainName: 'synthetic', dexTokenApproveAddress: '' }]; },
    async quote(input: { fromTokenAddress: string; amount: string }) {
      calls.push(input);
      return input.fromTokenAddress.toLowerCase() === '0xaa'
        ? [quote(tokenA, tokenB, '9007199254740993', '18014398509481986')]
        : [quote(tokenB, tokenA, '18014398509481986', '9007199254741000')];
    },
  };
  return { calls, input: { client, chainIndex: '1', tokenA, tokenB, amountAtomic: '9007199254740993', policy,
    source: 'synthetic' as const, now: () => { clock += 10; return clock; }, ...overrides } };
}
function wireScenario(responses: { coverage?: unknown; first?: unknown; second?: unknown } = {}, overrides: Record<string, unknown> = {}) {
  const fixture = scenario(overrides);
  const replies = { coverage: [{ chainIndex: '1', chainName: 'synthetic', dexTokenApproveAddress: '' }], first: [quote(tokenA, tokenB, '9007199254740993', '18014398509481986')],
    second: [quote(tokenB, tokenA, '18014398509481986', '9007199254741000')], ...responses };
  let quoteCalls = 0;
  fixture.input.client = {
    async supportedChain(id: string) { fixture.calls.push(['coverage', id]); return replies.coverage as any; },
    async quote(request) { fixture.calls.push(request); return (++quoteCalls === 1 ? replies.first : replies.second) as any; },
  };
  return fixture;
}

test('paired public quotes preserve exact atomic amounts and expose only a gross quantity delta', async () => {
  const fixture = scenario();
  const result = await quoteRoundTrip(fixture.input);
  expect(fixture.calls).toHaveLength(3);
  expect(fixture.calls[2]).toMatchObject({ chainIndex: '1', fromTokenAddress: '0xbb', toTokenAddress: '0xaa', amount: '18014398509481986', priceImpactProtectionPercent: 1 });
  expect(result.status).toBe('quoted_gross_delta');
  expect(result.inputAtomic).toBe('9007199254740993');
  expect(result.outputAtomic).toBe('9007199254741000');
  expect(result.quotedGrossDeltaAtomic).toBe('7');
  expect(result.netAtomic).toBeNull();
  expect(result.netStatus).toBe('net_not_evaluated');
  expect(result.costsCoverage).toBe('unknown');
  expect(result.execution).toBe('not_qualified');
  expect(result.liveQualified).toBe(false);
  expect(result.legs[0]?.networkEstimates).toEqual({ tradeFeeUsd: '1.5', estimateGasFeeNativeAtomic: '1000000000' });
  expect(result.legs[0]?.priceImpactPercent).toBe(-0.1);
  expect(result.legs[0]?.toTaxFraction).toBe(0.01);
});

test('invalid caller scope and atomic units fail before any provider method', async () => {
  const invalidInputs = [
    { chainIndex: '0' }, { chainIndex: '01' }, { chainIndex: '1&wallet=PRIVATE' },
    { amountAtomic: '01' }, { amountAtomic: '0' }, { amountAtomic: '1.5' }, { amountAtomic: 9007199254740993 },
    { amountAtomic: '1'.repeat(79) }, { tokenA: { ...tokenA, address: 'bad address' } },
    { tokenB: { ...tokenB, address: tokenA.address } }, { tokenA: { ...tokenA, decimals: 256 } },
    { tokenB: { ...tokenB, decimals: 1.5 } }, { tokenA: { ...tokenA, metadataSource: '' } },
    { tokenB: null }, { policy: { ...policy, maxElapsedMs: 0 } },
    { policy: { ...policy, maxImpactMagnitudePercent: NaN } },
    { policy: { ...policy, maxImpactMagnitudePercent: 100 } }, { source: 'live_guaranteed' },
  ];
  for (const invalid of invalidInputs) {
    const fixture = scenario(invalid);
    await expect(quoteRoundTrip(fixture.input as any)).rejects.toThrow('Invalid');
    expect(fixture.calls).toHaveLength(0);
  }
});

test('missing or ambiguous network coverage suppresses dependent quotes without fabricating a delta', async () => {
  for (const [coverage, expected] of [ [[], 'blocked'], [[{ chainIndex: '56', chainName: 'Other', dexTokenApproveAddress: '' }], 'blocked'],
    [[{ chainIndex: '1', chainName: 'Ethereum', dexTokenApproveAddress: '' },
      { chainIndex: '1', chainName: 'Ethereum', dexTokenApproveAddress: '' }], 'unknown'], [[{ chainIndex: 1 }], 'unknown'],
    [{ chainIndex: '1' }, 'unknown'] ] as const) {
    const fixture = wireScenario({ coverage });
    const result = await quoteRoundTrip(fixture.input);
    expect(result.status).toBe(expected);
    expect(result.quotedGrossDeltaAtomic).toBeNull();
    expect(result.outputAtomic).toBeNull();
    expect(result.netAtomic).toBeNull();
    expect(fixture.calls).toHaveLength(1);
  }
});

test('malformed supported-chain metadata suppresses dependent quotes', async () => {
  const malformedCoverage = [
    [{ chainIndex: '1', chainName: 42, dexTokenApproveAddress: '' }],
    [{ chainIndex: '1', chainName: 'Ethereum', dexTokenApproveAddress: [] }],
    [{ chainIndex: '1', chainName: 'Ethereum' }],
  ];
  for (const coverage of malformedCoverage) {
    const fixture = wireScenario({ coverage });
    const result = await quoteRoundTrip(fixture.input);
    expect(result.status).toBe('unknown');
    expect(result.reasons).toContain('coverage_schema_unknown');
    expect(result.outputAtomic).toBeNull();
    expect(result.quotedGrossDeltaAtomic).toBeNull();
    expect(fixture.calls).toHaveLength(1);
  }
});

test('global quote identity, exact input and decimals gate every dependent amount', async () => {
  const original = quote(tokenA, tokenB, '9007199254740993', '18014398509481986');
  const cases: [unknown, 'blocked' | 'unknown'][] = [
    [[{ ...original, chainIndex: '56' }], 'blocked'], [[{ ...original, chainIndex: 1 }], 'unknown'],
    [[{ ...original, swapMode: 'exactOut' }], 'blocked'], [[{ ...original, swapMode: null }], 'unknown'],
    [[{ ...original, fromToken: { ...original.fromToken, tokenContractAddress: '0xdd' } }], 'blocked'],
    [[{ ...original, toToken: { ...original.toToken, tokenContractAddress: '0xdd' } }], 'blocked'],
    [[{ ...original, fromToken: { ...original.fromToken, decimal: '17' } }], 'blocked'],
    [[{ ...original, toToken: { ...original.toToken, decimal: '6.0' } }], 'unknown'],
    [[{ ...original, fromTokenAmount: '2' }], 'blocked'], [[{ ...original, fromTokenAmount: 9007199254740993 }], 'unknown'],
    [[{ ...original, toTokenAmount: '00' }], 'unknown'], [[{ ...original, toTokenAmount: '1'.repeat(79) }], 'unknown'],
    [[], 'unknown'], [[original, original], 'unknown'], [original, 'unknown'], [[null], 'unknown'],
  ];
  for (const [first, expected] of cases) {
    const fixture = wireScenario({ first });
    const result = await quoteRoundTrip(fixture.input);
    expect(result.status).toBe(expected);
    expect(result.outputAtomic).toBeNull();
    expect(result.quotedGrossDeltaAtomic).toBeNull();
    expect(fixture.calls).toHaveLength(2);
  }
  const badReturn = quote(tokenB, tokenA, '18014398509481985', '9007199254741000');
  const fixture = wireScenario({ second: [badReturn] });
  const result = await quoteRoundTrip(fixture.input);
  expect(result.status).toBe('blocked');
  expect(result.quotedGrossDeltaAtomic).toBeNull();
  expect(fixture.calls).toHaveLength(3);
});

test('honeypot and signed impact uncertainty prevent dependent quotes on either leg', async () => {
  const first = quote(tokenA, tokenB, '9007199254740993', '18014398509481986');
  const second = quote(tokenB, tokenA, '18014398509481986', '9007199254741000');
  for (const target of ['first', 'second'] as const) {
    const original = target === 'first' ? first : second;
    const cases: [unknown, 'blocked' | 'unknown'][] = [
      [{ ...original, fromToken: { ...original.fromToken, isHoneyPot: true } }, 'blocked'],
      [{ ...original, toToken: { ...original.toToken, isHoneyPot: true } }, 'blocked'],
      [{ ...original, fromToken: { ...original.fromToken, isHoneyPot: 'false' } }, 'unknown'],
      [{ ...original, toToken: { ...original.toToken, isHoneyPot: undefined } }, 'unknown'],
      ...[null, '', 'NaN', '1e-3', 0, undefined].map(value => [{ ...original, priceImpactPercent: value }, 'unknown'] as [unknown, 'unknown']),
      [{ ...original, priceImpactPercent: '-1.01' }, 'blocked'],
      [{ ...original, priceImpactPercent: '+1.01' }, 'blocked'],
    ];
    for (const [bad, status] of cases) {
      const fixture = wireScenario({ [target]: [bad] });
      const result = await quoteRoundTrip(fixture.input);
      expect(result.status).toBe(status);
      expect(result.quotedGrossDeltaAtomic).toBeNull();
      expect(result.outputAtomic).toBeNull();
      expect(fixture.calls).toHaveLength(target === 'first' ? 2 : 3);
    }
  }
  const fixture = wireScenario({ first: [{ ...first, priceImpactPercent: '-1' }], second: [{ ...second, priceImpactPercent: '+1' }] });
  const result = await quoteRoundTrip(fixture.input);
  expect(result.status).toBe('quoted_gross_delta');
  expect(result.legs.map(value => value.priceImpactPercent)).toEqual([-1, 1]);
});

test('decimal impact above the policy cannot pass through binary rounding on either leg', async () => {
  for (const target of ['first', 'second'] as const) {
    for (const impact of ['1.00000000000000001', '-1.00000000000000001']) {
      const original = target === 'first'
        ? quote(tokenA, tokenB, '9007199254740993', '18014398509481986')
        : quote(tokenB, tokenA, '18014398509481986', '9007199254741000');
      const fixture = wireScenario({ [target]: [{ ...original, priceImpactPercent: impact }] });
      const result = await quoteRoundTrip(fixture.input);
      expect(result.status).toBe('blocked');
      expect(result.reasons).toContain('price_impact_exceeds_policy');
      expect(result.quotedGrossDeltaAtomic).toBeNull();
      expect(fixture.calls).toHaveLength(target === 'first' ? 2 : 3);
    }
  }
});

test('a decimal tax above one remains unknown instead of rounding into the valid interval', async () => {
  const first = quote(tokenA, tokenB, '9007199254740993', '18014398509481986');
  const fixture = wireScenario({ first: [{ ...first,
    fromToken: { ...first.fromToken, taxRate: '1.00000000000000001' },
    toToken: { ...first.toToken, taxRate: '1.00000000000000001' } }] });
  const result = await quoteRoundTrip(fixture.input);
  expect(result.legs[0]?.fromTaxFraction).toBeNull();
  expect(result.legs[0]?.toTaxFraction).toBeNull();
  expect(result.reasons).toContain('token_tax_fraction_unknown');
  expect(result.netAtomic).toBeNull();
});

test('exact decimal boundaries work when the numeric policy renders with an exponent', async () => {
  const first = quote(tokenA, tokenB, '9007199254740993', '18014398509481986');
  const second = quote(tokenB, tokenA, '18014398509481986', '9007199254741000');
  for (const [impact, limit, expected] of [
    ['0.0000001', 1e-7, 'quoted_gross_delta'],
    ['-0.00000010000000000000001', 1e-7, 'blocked'],
    ['0.00000009999999999999999', 1e-7, 'quoted_gross_delta'],
    ['0.00000000000000000001', 1e-20, 'quoted_gross_delta'],
    ['0.000000000000000000010000000000000001', 1e-20, 'blocked'],
    ['0', 0, 'quoted_gross_delta'], ['0.00000000000000000001', 0, 'blocked'],
  ] as const) {
    const fixture = wireScenario({ first: [{ ...first, priceImpactPercent: impact }],
      second: [{ ...second, priceImpactPercent: '0' }] }, { policy: { ...policy, maxImpactMagnitudePercent: limit } });
    const result = await quoteRoundTrip(fixture.input);
    expect(result.status).toBe(expected);
    expect(result.netAtomic).toBeNull();
  }
});

test('missing taxes and network estimates remain unknown without deducting them twice', async () => {
  const first = quote(tokenA, tokenB, '9007199254740993', '18014398509481986');
  for (const missing of [null, undefined, '', '1e-2', '-0.01', '1.01', 0]) {
    const fixture = wireScenario({ first: [{ ...first,
      fromToken: { ...first.fromToken, taxRate: missing }, toToken: { ...first.toToken, taxRate: missing },
      tradeFee: missing, estimateGasFee: missing }] });
    const result = await quoteRoundTrip(fixture.input);
    expect(result.status).toBe('quoted_gross_delta');
    expect(result.quotedGrossDeltaAtomic).toBe('7');
    expect(result.netAtomic).toBeNull();
    expect(result.legs[0]?.fromTaxFraction).toBeNull();
    expect(result.legs[0]?.toTaxFraction).toBeNull();
    expect(result.reasons).toContain('token_tax_fraction_unknown');
    expect(result.legs[0]?.networkEstimates.estimateGasFeeNativeAtomic).toBeNull();
  }
  const absent = wireScenario({ first: [{ ...first, tradeFee: null, estimateGasFee: undefined }] });
  const result = await quoteRoundTrip(absent.input);
  expect(result.legs[0]?.networkEstimates).toEqual({ tradeFeeUsd: null, estimateGasFeeNativeAtomic: null });
  const bounded = wireScenario({ first: [{ ...first, fromToken: { ...first.fromToken, taxRate: '1' }, tradeFee: '0', estimateGasFee: '0' }] });
  expect((await quoteRoundTrip(bounded.input)).legs[0]).toMatchObject({ fromTaxFraction: 1, networkEstimates: { tradeFeeUsd: '0', estimateGasFeeNativeAtomic: '0' } });
});

test('local timing includes coverage and rejects stale or invalid clocks before dependent requests', async () => {
  const sequence = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700];
  const normal = scenario({ now: () => sequence.shift() });
  const result = await quoteRoundTrip(normal.input as any);
  expect(result.timing).toEqual({ startedAt: 1000, completedAt: 1700, elapsedMs: 700, coverageRequestedAt: 1100, coverageReceivedAt: 1200 });
  expect(result.legs.map(value => [value.requestedAt, value.receivedAt])).toEqual([[1300, 1400], [1500, 1600]]);
  const staleCases: [number[], number][] = [
    [[1000, 1100, 7001, 7002], 1],
    [[1000, 1100, 1200, 1300, 7001, 7002], 2],
    [[1000, 1100, 1200, 1300, 1400, 1500, 7001, 7002], 3],
  ];
  for (const [samples, expectedCalls] of staleCases) {
    const fixture = scenario({ now: () => samples.shift() });
    const expired = await quoteRoundTrip(fixture.input as any);
    expect(expired.status).toBe('blocked');
    expect(expired.quotedGrossDeltaAtomic).toBeNull();
    expect(expired.outputAtomic).toBeNull();
    expect(expired.reasons).toContain('scenario_elapsed_exceeds_policy');
    expect(fixture.calls).toHaveLength(expectedCalls);
  }
  for (const invalid of [0, -1, NaN, Infinity, 1.5, '1000']) {
    const fixture = scenario({ now: () => invalid });
    await expect(quoteRoundTrip(fixture.input as any)).rejects.toThrow('Invalid');
    expect(fixture.calls).toHaveLength(0);
  }
  for (const samples of [[1000, 1100, 1099, 1200], [1000, 1100, NaN, 1200],
    [1000, 1100, 1200, 1300, 1400, 1500, 1900, 1800]]) {
    const fixture = scenario({ now: () => samples.shift() });
    const unknown = await quoteRoundTrip(fixture.input as any);
    expect(unknown.status).toBe('unknown');
    expect(unknown.quotedGrossDeltaAtomic).toBeNull();
    expect(unknown.reasons).toContain('local_clock_unknown');
  }
});

test('reports discard caller extras and never expose a provider error payload', async () => {
  const fixture = scenario({ tokenA: { ...tokenA, privateKey: 'PRIVATE_SENTINEL' },
    policy: { ...policy, walletAddress: 'WALLET_SENTINEL' } });
  const result = await quoteRoundTrip(fixture.input);
  expect(JSON.stringify(result)).not.toContain('SENTINEL');
  expect(result.tokenA).toEqual({ ...tokenA, address: '0xaa' });
  fixture.input.client.supportedChain = async () => { throw new Error('SECRET_SENTINEL body url credentials'); };
  const failed = await quoteRoundTrip(fixture.input);
  expect(failed.status).toBe('unknown');
  expect(failed.reasons).toContain('provider_request_failed');
  expect(failed.quotedGrossDeltaAtomic).toBeNull();
  expect(JSON.stringify(failed)).not.toContain('SENTINEL');
});

test('Solana preserves contract case and valid negative deltas remain gross quoted losses', async () => {
  const a = { ...tokenA, address: 'PublicAa', decimals: 9 }, b = { ...tokenB, address: 'Publicaa', decimals: 6 };
  const first = { ...quote(a, b, '9007199254740993', '18014398509481986'), chainIndex: '501' };
  const second = { ...quote(b, a, '18014398509481986', '9007199254740990'), chainIndex: '501' };
  const fixture = wireScenario({ coverage: [{ chainIndex: '501', chainName: 'Solana', dexTokenApproveAddress: '' }], first: [first], second: [second] }, { chainIndex: '501', tokenA: a, tokenB: b });
  const result = await quoteRoundTrip(fixture.input);
  expect(fixture.calls[1]).toMatchObject({ fromTokenAddress: 'PublicAa', toTokenAddress: 'Publicaa' });
  expect(result.status).toBe('quoted_gross_delta');
  expect(result.quotedGrossDeltaAtomic).toBe('-3');
  expect(result.netAtomic).toBeNull();
  const wrong = wireScenario({ coverage: [{ chainIndex: '501', chainName: 'Solana', dexTokenApproveAddress: '' }], first: [{ ...first, fromToken: { ...first.fromToken, tokenContractAddress: 'publicaa' } }] },
    { chainIndex: '501', tokenA: a, tokenB: b });
  expect((await quoteRoundTrip(wrong.input)).status).toBe('blocked');
  expect(wrong.calls).toHaveLength(2);
});

test('preserves exact TRON and unknown-chain identity through public round-trip composition', async () => {
  const identities = [
    ['195', 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8', 'TVjsykeQKpR7xR6M9U5W3uV2WcXB4Qv8wE'],
    ['999999', 'UnknownAaCase', 'UnknownBbCase'],
  ] as const;
  for (const [chainIndex, addressA, addressB] of identities) {
    const a = { ...tokenA, address: addressA };
    const b = { ...tokenB, address: addressB };
    const first = { ...quote(a, b, '9007199254740993', '18014398509481986'), chainIndex };
    const second = { ...quote(b, a, '18014398509481986', '9007199254741000'), chainIndex };
    const overrides = { chainIndex, tokenA: a, tokenB: b };
    const coverage = [{ chainIndex, chainName: 'identity-test', dexTokenApproveAddress: '' }];
    const exact = wireScenario({ coverage, first: [first], second: [second] }, overrides);
    const accepted = await quoteRoundTrip(exact.input);
    expect(accepted.status).toBe('quoted_gross_delta');

    const changedCaseFirst = { ...first, fromToken: { ...first.fromToken, tokenContractAddress: addressA.toLowerCase() } };
    const changedCase = wireScenario({ coverage, first: [changedCaseFirst], second: [second] }, overrides);
    const rejected = await quoteRoundTrip(changedCase.input);
    expect(rejected.status).toBe('blocked');
    expect(rejected.reasons).toContain('quote_identity_or_units_mismatch');
    expect(changedCase.calls).toHaveLength(2);
    expect(accepted.tokenA.address).toBe(addressA);
    expect(exact.calls[1]).toMatchObject({ fromTokenAddress: addressA, toTokenAddress: addressB });
  }
});

test('manual complete-cost hypotheses use exact integers and require net strictly above buffer', () => {
  const input = { inputAtomic: '9007199254740993', outputAtomic: '9007199254741000', externalCostsAtomic: '2', bufferAtomic: '5' };
  expect(hypotheticalRoundTripEconomics(input)).toMatchObject({ hypothetical: true, execution: 'not_qualified',
    grossDeltaAtomic: '7', netAtomic: '5', eligible: false, costsCoverage: 'caller_assumed_complete', coverageVerified: false });
  expect(hypotheticalRoundTripEconomics({ ...input, bufferAtomic: '4' })).toMatchObject({ netAtomic: '5', eligible: true });
  expect(hypotheticalRoundTripEconomics({ ...input, externalCostsAtomic: '8', bufferAtomic: '0' })).toMatchObject({ netAtomic: '-1', eligible: false });
});

test('manual economics rejects incomplete, negative or non-atomic hypotheses', () => {
  const original = { inputAtomic: '100', outputAtomic: '110', externalCostsAtomic: '1', bufferAtomic: '0' };
  for (const field of ['inputAtomic', 'outputAtomic', 'externalCostsAtomic', 'bufferAtomic']) {
    for (const invalid of [undefined, null, '', '-1', '1.1', '1e2', '01', 100, '1'.repeat(79)]) {
      expect(() => hypotheticalRoundTripEconomics({ ...original, [field]: invalid } as any)).toThrow('Invalid hypothetical');
    }
  }
  expect(() => hypotheticalRoundTripEconomics({ ...original, inputAtomic: '0' })).toThrow('Invalid hypothetical');
  expect(() => hypotheticalRoundTripEconomics({ ...original, outputAtomic: '0' })).toThrow('Invalid hypothetical');
  expect(() => hypotheticalRoundTripEconomics(null as any)).toThrow('Invalid hypothetical');
  expect(hypotheticalRoundTripEconomics({ ...original, externalCostsAtomic: '0' }).netAtomic).toBe('10');
});

test('the real read-only adapter composes with the quote validator using an injected transport', async () => {
  const requests: URL[] = [];
  const client = createOkxDexReadOnlyClient({ credentials: { apiKey: 'PUBLIC_TEST_KEY', secret: 'PUBLIC_TEST_SECRET', passphrase: 'PUBLIC_TEST_PASSPHRASE' },
    minRequestIntervalMs: 0, now: () => new Date('2026-10-09T00:00:00.000Z'),
    fetch: async (url, init) => {
      requests.push(new URL(String(url)));
      expect(init?.method).toBe('GET');
      expect(init?.redirect).toBe('error');
      const data = requests.length === 1 ? [{ chainIndex: '1', chainName: 'Ethereum', dexTokenApproveAddress: 'not-used' }]
        : requests.length === 2 ? [quote(tokenA, tokenB, '9007199254740993', '18014398509481986')]
        : [quote(tokenB, tokenA, '18014398509481986', '9007199254741000')];
      return new Response(JSON.stringify({ code: '0', msg: '', data }));
    } });
  const fixture = scenario({ client });
  const report = await quoteRoundTrip(fixture.input);
  expect(requests).toHaveLength(3);
  expect(requests.map(value => value.pathname)).toEqual(['/api/v6/dex/aggregator/supported/chain', '/api/v6/dex/aggregator/quote', '/api/v6/dex/aggregator/quote']);
  expect(requests[2]?.searchParams.get('amount')).toBe('18014398509481986');
  expect(requests[2]?.searchParams.get('singleRouteOnly')).toBe('true');
  expect(report.quotedGrossDeltaAtomic).toBe('7');
  expect(report.netAtomic).toBeNull();
  expect(report.liveQualified).toBe(false);
  expect(JSON.stringify(report)).not.toContain('PUBLIC_TEST');
});
