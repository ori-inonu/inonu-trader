/** The name of a network as the screens say it: the registry's name, Solana's, or "Rede <number>" for one the app does not name. */
import { SWITCHABLE_CHAINS } from "./chains";
import { SOLANA_CHAIN_INDEX } from "./holdings";

export const networkLabel = (chainIndex: string): string =>
  chainIndex === SOLANA_CHAIN_INDEX ? "Solana" : (SWITCHABLE_CHAINS.find((c) => c.chainIndex === chainIndex)?.name ?? `Rede ${chainIndex}`);
