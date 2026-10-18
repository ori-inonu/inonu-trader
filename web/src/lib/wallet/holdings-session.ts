/** `tudo` is the one reading of both kinds of account: the EVM address on its networks and the Solana account, put together. */
export type HoldingsScope = "atual" | "todas" | "solana" | "tudo";

type ScopeContext = {
  readonly evmAccount: string | null;
  readonly solanaAccount: string | null;
  readonly solanaAvailable: boolean;
  readonly followingEvm: boolean;
};

export function resolveHoldingsScope(picked: HoldingsScope | null, context: ScopeContext): HoldingsScope {
  if (context.evmAccount === null) return "solana";
  // with both accounts there is something to join, and the one reading is what a person gets until they choose another; with one of them there is not
  if (picked === "tudo") return context.solanaAccount !== null ? "tudo" : "todas";
  if (picked === "solana") return context.solanaAvailable || context.solanaAccount !== null ? "solana" : "todas";
  if (picked === "atual" && context.followingEvm) return "todas";
  return picked ?? (context.solanaAccount !== null ? "tudo" : "todas");
}

type Session = {
  readonly address: string | null;
  readonly networks: readonly string[];
  readonly scope: HoldingsScope;
  readonly evmRevision?: number;
};

export function holdingsSessionKey(session: Session): string {
  return JSON.stringify([session.scope, session.address, session.networks, session.scope === "solana" ? null : (session.evmRevision ?? 0)]);
}

type RevisionStore = {
  readonly getSnapshot: () => { readonly revision: number };
  readonly subscribe: (listener: () => void) => () => void;
};

export function subscribeHoldingsRevision(
  store: RevisionStore,
  scope: HoldingsScope,
  invalidate: () => void,
): () => void {
  let revision = store.getSnapshot().revision;
  return store.subscribe(() => {
    const next = store.getSnapshot().revision;
    if (next === revision) return;
    revision = next;
    if (scope !== "solana") invalidate();
  });
}

export function scheduleAutoRead(action: () => void): () => void {
  let active = true;
  queueMicrotask(() => {
    if (active) action();
  });
  return () => { active = false; };
}
