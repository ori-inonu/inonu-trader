/**
 * The routes of the gateway that live in their own files, in the order the catalog lists them. The catalog imports this one name, so a new file of routes is
 * added here and the catalog does not change again. Each file imports only types from the catalog (no import cycle).
 */
import type { Endpoint } from "../catalog";
import { ADDRESS_TRACKER_ENDPOINTS } from "./address-tracker";
import { CHAIN_LIST_ENDPOINTS } from "./chain-list";
import { CLUSTER_DETAIL_ENDPOINTS } from "./clusters-detail";
import { MEMEPUMP_ENDPOINTS } from "./memepump";
import { TRADE_ENDPOINTS } from "./trade";
import { WALLET_ENDPOINTS } from "./wallet";

export const EXTRA_ENDPOINTS: readonly Endpoint[] = [...WALLET_ENDPOINTS, ...CHAIN_LIST_ENDPOINTS, ...CLUSTER_DETAIL_ENDPOINTS, ...ADDRESS_TRACKER_ENDPOINTS, ...MEMEPUMP_ENDPOINTS, ...TRADE_ENDPOINTS];
