/**
 * Onchain OS Gateway, read only: gas price and the list of supported chains.
 * Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md section 7.5 (criterion D15).
 *
 * Units, as declared by the gas price page: wei (EVM) and SUN (Tron) for `normal`, `min`, `max` and the EIP-1559 fields;
 * micro-lamports per compute unit for the Solana priority fees. There is NO gwei and nothing here converts anything.
 *
 * Documented defects handled: the table says `supporteip1559` and `eip1559Protocol` while the example says
 * `supportEip1559` and `eip1599Protocol`; both spellings are accepted. The tier of these endpoints is not declared by
 * the plan page, and the update frequency is not documented.
 *
 * Not implemented: gas limit (it posts transaction data), simulate (whitelist), broadcast (sends a signed transaction)
 * and orders. Chain names and logo URLs are third party text and are dropped.
 */

import { OnchainosError } from "./errors.ts";
import type { OnchainosHttp } from "./http.ts";
import { readGet, type Read } from "./read.ts";
import { asArray, asRecord, field, readBoolean, readChainIndex, readCode, readCount, schemaFail, type Microlamports, type WeiOrSun } from "./values.ts";

export interface Eip1559Fees {
  readonly suggestBaseFee: WeiOrSun | null;
  readonly baseFee: WeiOrSun | null;
  readonly proposePriorityFee: WeiOrSun | null;
  readonly safePriorityFee: WeiOrSun | null;
  readonly fastPriorityFee: WeiOrSun | null;
}

export interface EvmLikeGasPrice {
  readonly kind: "evm_like";
  readonly chainIndex: string;
  /** Medium gas price, in wei (EVM) or SUN (Tron). */
  readonly normal: WeiOrSun | null;
  readonly min: WeiOrSun | null;
  readonly max: WeiOrSun | null;
  readonly supportsEip1559: boolean | null;
  readonly eip1559: Eip1559Fees | null;
}

export interface SolanaLikeGasPrice {
  readonly kind: "solana_like";
  readonly chainIndex: string;
  /** 80th percentile. */
  readonly proposePriorityFee: Microlamports | null;
  /** 60th percentile. */
  readonly safePriorityFee: Microlamports | null;
  /** 95th percentile. */
  readonly fastPriorityFee: Microlamports | null;
  /** 99th percentile. */
  readonly extremePriorityFee: Microlamports | null;
}

export type GasPrice = EvmLikeGasPrice | SolanaLikeGasPrice;

export interface GatewayChainRow {
  readonly chainIndex: string;
  readonly shortName: string | null;
}

const MAX_CHAINS = 500;

/** A gas amount in the smallest unit: a safe integer, otherwise unknown. */
function readMinorUnits(value: unknown): number | null {
  return readCount(value);
}

function has(record: Record<string, unknown>, ...names: string[]): boolean {
  return names.some((name) => Object.hasOwn(record, name));
}

export function parseGasPrice(data: unknown, chainIndex: string): GasPrice {
  const items = asArray(data, "data", 1);
  const first = items[0];
  if (first === undefined) return schemaFail("resposta de preço de gás sem itens");
  const item = asRecord(first, "item", 0);

  if (has(item, "normal", "min", "max")) {
    const protocolValue = field(item, "eip1559Protocol", "eip1599Protocol");
    let eip1559: Eip1559Fees | null = null;
    if (typeof protocolValue === "object" && protocolValue !== null && !Array.isArray(protocolValue)) {
      const protocol = protocolValue as Record<string, unknown>;
      if (has(protocol, "suggestBaseFee", "baseFee", "proposePriorityFee", "safePriorityFee", "fastPriorityFee")) {
        eip1559 = {
          suggestBaseFee: readMinorUnits(field(protocol, "suggestBaseFee")),
          baseFee: readMinorUnits(field(protocol, "baseFee")),
          proposePriorityFee: readMinorUnits(field(protocol, "proposePriorityFee")),
          safePriorityFee: readMinorUnits(field(protocol, "safePriorityFee")),
          fastPriorityFee: readMinorUnits(field(protocol, "fastPriorityFee")),
        };
      }
    }
    return {
      kind: "evm_like",
      chainIndex,
      normal: readMinorUnits(field(item, "normal")),
      min: readMinorUnits(field(item, "min")),
      max: readMinorUnits(field(item, "max")),
      supportsEip1559: readBoolean(field(item, "supportEip1559", "supporteip1559")),
      eip1559,
    };
  }

  if (has(item, "proposePriorityFee", "safePriorityFee", "fastPriorityFee", "extremePriorityFee")) {
    return {
      kind: "solana_like",
      chainIndex,
      proposePriorityFee: readMinorUnits(field(item, "proposePriorityFee")),
      safePriorityFee: readMinorUnits(field(item, "safePriorityFee")),
      fastPriorityFee: readMinorUnits(field(item, "fastPriorityFee")),
      extremePriorityFee: readMinorUnits(field(item, "extremePriorityFee")),
    };
  }
  return schemaFail("forma da resposta de preço de gás não reconhecida");
}

export function parseGatewayChains(data: unknown): GatewayChainRow[] {
  const seen = new Set<string>();
  return asArray(data, "data", MAX_CHAINS).map((raw, index) => {
    const record = asRecord(raw, "linha", index);
    const chainIndex = readChainIndex(field(record, "chainIndex"));
    if (chainIndex === null) return schemaFail("chainIndex ilegível", { rowIndex: index });
    if (seen.has(chainIndex)) return schemaFail("cadeia repetida", { rowIndex: index });
    seen.add(chainIndex);
    return { chainIndex, shortName: readCode(field(record, "shortName"), 16) };
  });
}

export interface GatewayClient {
  supportedChains(): Promise<Read<GatewayChainRow[]>>;
  gasPrice(chainIndex: string): Promise<Read<GasPrice>>;
}

export function createGatewayClient(http: OnchainosHttp): GatewayClient {
  return {
    supportedChains: () => readGet(http, "gateway.supported-chains", undefined, (data) => parseGatewayChains(data)),
    gasPrice: async (chainIndex) => {
      const chain = readChainIndex(chainIndex);
      if (chain === null) throw new OnchainosError("invalid_request", "chainIndex inválido");
      return readGet(http, "gateway.gas-price", { chainIndex: chain }, (data) => parseGasPrice(data, chain));
    },
  };
}
