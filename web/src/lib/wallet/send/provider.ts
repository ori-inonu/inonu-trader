/** The part of a wallet provider (EIP-1193) that the order modules use: one call that takes a method and its parameters. Types only, so a module that reads the wallet does not import the module that sends. */
import type { Eip1193Provider } from "../../okx-wallet";

export type SendProvider = Pick<Eip1193Provider, "request">;
