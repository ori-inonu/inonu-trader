export interface Eip1193RequestArguments {
  method: string;
  params?: readonly unknown[] | Record<string, unknown>;
}

export interface Eip1193Provider {
  request(args: Eip1193RequestArguments): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface OkxDiscoverySurface extends EventTarget {
  okxwallet?: unknown;
}

export type WalletStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "wrong-network"
  | "reading"
  | "error";

export interface MonadWalletBalances {
  network: "monad";
  mon: string;
  usdc: string;
  block: string;
}

export interface XLayerWalletBalances {
  network: "xlayer";
  okb: string;
  usdt: string;
  usdt0: string;
  nativeUsdc: string;
  usdcBridged: string;
  usdcE: string;
  block: string;
}

export type WalletBalances = MonadWalletBalances | XLayerWalletBalances;

export interface WalletSnapshot {
  status: WalletStatus;
  account: string | null;
  chainId: string | null;
  balances: WalletBalances | null;
  error: string | null;
}

export interface WalletSession {
  getSnapshot(): WalletSnapshot;
  subscribe(listener: (snapshot: WalletSnapshot) => void): () => void;
  connect(): Promise<void>;
  refresh(): Promise<void>;
  switchToMonad(): Promise<void>;
  switchToXLayer(): Promise<void>;
  disconnect(): void;
  dispose(): void;
}

export interface WalletSessionOptions {
  timeoutMs?: number;
}

const MONAD_CHAIN_ID = "0x8f";
const XLAYER_CHAIN_ID = "0xc4";
const MONAD_USDC_CONTRACT = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
const XLAYER_TOKEN_CONTRACTS = [
  { address: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d" },
  { address: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736" },
  { address: "0xB6CEceAB302E2E4948951eE7843FC24E92933061" },
  { address: "0x74b7F16337b8972027F6196A17a631aC6dE26d22" },
  { address: "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035" },
] as const;

function isProvider(value: unknown): value is Eip1193Provider {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Eip1193Provider>;
  return (
    typeof candidate.request === "function" &&
    typeof candidate.on === "function" &&
    typeof candidate.removeListener === "function"
  );
}

function parseAccount(value: unknown): string | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  return value;
}

function parseAccounts(value: unknown): { account: string | null; invalid: boolean } {
  if (!Array.isArray(value)) return { account: null, invalid: true };
  if (value.length === 0) return { account: null, invalid: false };
  const accounts = value.map(parseAccount);
  if (accounts.some((account) => account === null)) return { account: null, invalid: true };
  return { account: accounts[0], invalid: false };
}

function parseChainId(value: unknown): string | null {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) return null;
  try {
    return `0x${BigInt(value).toString(16)}`;
  } catch {
    return null;
  }
}

function parseQuantity(value: unknown): { raw: string; integer: bigint } | null {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) return null;
  try {
    return { raw: value, integer: BigInt(value) };
  } catch {
    return null;
  }
}

function parseTokenBalance(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function formatUnits(value: bigint, decimals: number): string {
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

function errorCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : null;
}

class WalletTimeoutError extends Error {}

function requestWithTimeout(
  provider: Eip1193Provider,
  args: Eip1193RequestArguments,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new WalletTimeoutError());
    }, timeoutMs);
    Promise.resolve()
      .then(() => provider.request(args))
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
  });
}

function isSupportedChain(chainId: string | null): chainId is typeof MONAD_CHAIN_ID | typeof XLAYER_CHAIN_ID {
  return chainId === MONAD_CHAIN_ID || chainId === XLAYER_CHAIN_ID;
}

function stateForAccount(account: string | null, chainId: string | null): WalletStatus {
  if (!account) return "disconnected";
  if (!chainId) return "error";
  if (!isSupportedChain(chainId)) return "wrong-network";
  return "connected";
}

function chainGuidance(chainId: string | null): string | null {
  if (chainId === MONAD_CHAIN_ID || chainId === XLAYER_CHAIN_ID) return null;
  if (chainId) return "Troque para Monad ou X Layer para consultar os ativos suportados.";
  return "A rede ainda não foi confirmada. Atualize para consultar a carteira.";
}

export function createWalletSession(
  provider: Eip1193Provider,
  options: WalletSessionOptions = {},
): WalletSession {
  const timeoutMs = Math.max(1, options.timeoutMs ?? 8_000);
  const listeners = new Set<(snapshot: WalletSnapshot) => void>();
  let revision = 0;
  let disposed = false;
  let locallyDisconnected = false;
  let autoRefreshPending = false;
  let autoRefreshScheduled = false;
  let activeConnect: { eventVersion: number; cancelled: boolean } | null = null;
  let activeSwitch: {
    account: string;
    targetChainId: typeof MONAD_CHAIN_ID | typeof XLAYER_CHAIN_ID;
    revision: number;
    chainChanged: boolean;
    cancelled: boolean;
  } | null = null;
  let snapshot: WalletSnapshot = {
    status: "disconnected",
    account: null,
    chainId: null,
    balances: null,
    error: null,
  };

  const publish = (next: WalletSnapshot) => {
    if (disposed) return;
    snapshot = next;
    for (const listener of listeners) listener(snapshot);
  };

  const invalidateWith = (next: Omit<WalletSnapshot, "balances">) => {
    revision++;
    publish({ ...next, balances: null });
  };

  const cancelAutoRefresh = () => {
    autoRefreshPending = false;
  };

  const cancelActiveConnect = () => {
    if (!activeConnect) return;
    activeConnect.cancelled = true;
    activeConnect = null;
  };

  const noteConnectEvent = () => {
    if (activeConnect) activeConnect.eventVersion++;
  };

  let refreshInternal: (onAccountAndChainRead?: () => void) => Promise<void>;

  const scheduleAutoRefresh = () => {
    if (activeConnect) return;
    autoRefreshPending = true;
    if (disposed || autoRefreshScheduled) return;
    autoRefreshScheduled = true;
    Promise.resolve().then(() => {
      autoRefreshScheduled = false;
      if (disposed || locallyDisconnected || !autoRefreshPending) return;
      if (!snapshot.account) {
        cancelAutoRefresh();
        return;
      }
      if (activeSwitch) return;
      autoRefreshPending = false;
      void refreshInternal();
    });
  };

  const handleAccountsChanged = (...args: unknown[]) => {
    if (disposed || locallyDisconnected) return;
    if (activeSwitch) activeSwitch.cancelled = true;
    const parsed = parseAccounts(args[0]);
    if (parsed.invalid || !parsed.account) {
      cancelAutoRefresh();
      cancelActiveConnect();
    } else {
      noteConnectEvent();
    }
    invalidateWith({
      status: parsed.invalid ? "error" : stateForAccount(parsed.account, snapshot.chainId),
      account: parsed.account,
      chainId: snapshot.chainId,
      error: parsed.invalid
        ? "A carteira retornou um endereço inválido. Reconecte no OKX."
        : parsed.account
          ? chainGuidance(snapshot.chainId)
          : "Nenhuma conta está autorizada. Conecte a carteira para continuar.",
    });
    if (!parsed.invalid && parsed.account) scheduleAutoRefresh();
  };

  const handleChainChanged = (...args: unknown[]) => {
    if (disposed || locallyDisconnected) return;
    noteConnectEvent();
    const chainId = parseChainId(args[0]);
    if (activeSwitch) {
      if (chainId && snapshot.account === activeSwitch.account) activeSwitch.chainChanged = true;
      else activeSwitch.cancelled = true;
    }
    if (!snapshot.account || !chainId) cancelAutoRefresh();
    invalidateWith({
      status: chainId ? stateForAccount(snapshot.account, chainId) : "error",
      account: snapshot.account,
      chainId,
      error: chainId
        ? !snapshot.account
          ? null
          : chainGuidance(chainId)
        : "A carteira retornou um identificador de rede inválido.",
    });
    if (snapshot.account && chainId) scheduleAutoRefresh();
  };

  const handleDisconnect = () => {
    if (disposed || locallyDisconnected) return;
    if (activeSwitch) activeSwitch.cancelled = true;
    cancelActiveConnect();
    cancelAutoRefresh();
    invalidateWith({
      status: "disconnected",
      account: null,
      chainId: null,
      error: "A carteira OKX foi desconectada. Reconecte para continuar.",
    });
  };

  provider.on("accountsChanged", handleAccountsChanged);
  provider.on("chainChanged", handleChainChanged);
  provider.on("disconnect", handleDisconnect);

  const requestUntil = (
    method: string,
    params: Eip1193RequestArguments["params"],
    deadline: number,
  ) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return Promise.reject(new WalletTimeoutError());
    return requestWithTimeout(
      provider,
      { method, ...(params === undefined ? {} : { params }) },
      remaining,
    );
  };

  const request = (method: string, params?: Eip1193RequestArguments["params"]) =>
    requestUntil(method, params, Date.now() + timeoutMs);

  const acceptAccountAndChain = (accountValue: unknown, chainValue: unknown): boolean => {
    const parsedAccount = parseAccounts(accountValue);
    const chainId = parseChainId(chainValue);
    if (parsedAccount.invalid || !chainId) {
      publish({
        status: "error",
        account: parsedAccount.invalid ? null : parsedAccount.account,
        chainId,
        balances: null,
        error: parsedAccount.invalid
          ? "A carteira retornou um endereço inválido. Reconecte no OKX."
          : "A carteira retornou um identificador de rede inválido.",
      });
      return false;
    }
    if (!parsedAccount.account) {
      publish({
        status: "disconnected",
        account: null,
        chainId,
        balances: null,
        error: "Nenhuma conta está autorizada. Conecte a carteira para continuar.",
      });
      return false;
    }
    const status = stateForAccount(parsedAccount.account, chainId);
    if (status !== "connected") {
      publish({
        status,
        account: parsedAccount.account,
        chainId,
        balances: null,
        error: chainGuidance(chainId),
      });
      return false;
    }
    publish({
      status: "connected",
      account: parsedAccount.account,
      chainId,
      balances: null,
      error: null,
    });
    return true;
  };

  const readBalances = async (operation: number, account: string, chainId: string): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    publish({
      status: "reading",
      account,
      chainId,
      balances: null,
      error: null,
    });
    try {
      const rawBlock = await requestUntil("eth_blockNumber", undefined, deadline);
      const block = parseQuantity(rawBlock);
      if (!block) throw new Error("invalid block response");
      if (disposed || operation !== revision) return;

      const callData = "0x70a08231" + account.slice(2).toLowerCase().padStart(64, "0");
      const nativeRequest = requestUntil("eth_getBalance", [account, block.raw], deadline);
      if (chainId === MONAD_CHAIN_ID) {
        const [rawMon, rawUsdc] = await Promise.all([
          nativeRequest,
          requestUntil(
            "eth_call",
            [{ to: MONAD_USDC_CONTRACT, data: callData }, block.raw],
            deadline,
          ),
        ]);
        const mon = parseQuantity(rawMon);
        const usdc = parseTokenBalance(rawUsdc);
        if (!mon || usdc === null) throw new Error("invalid balance response");
        if (disposed || operation !== revision) return;
        publish({
          status: "connected",
          account,
          chainId,
          balances: {
            network: "monad",
            mon: formatUnits(mon.integer, 18),
            usdc: formatUnits(usdc, 6),
            block: block.raw,
          },
          error: null,
        });
        return;
      }

      if (chainId !== XLAYER_CHAIN_ID) throw new Error("unsupported chain read");
      const tokenRequests = XLAYER_TOKEN_CONTRACTS.map(({ address }) =>
        requestUntil(
          "eth_call",
          [{ to: address, data: callData }, block.raw],
          deadline,
        ),
      );
      const [rawOkb, ...rawTokens] = await Promise.all([nativeRequest, ...tokenRequests]);
      const okb = parseQuantity(rawOkb);
      const tokens = rawTokens.map(parseTokenBalance);
      if (!okb || tokens.some((value) => value === null)) throw new Error("invalid balance response");
      if (disposed || operation !== revision) return;
      publish({
        status: "connected",
        account,
        chainId,
        balances: {
          network: "xlayer",
          okb: formatUnits(okb.integer, 18),
          usdt: formatUnits(tokens[0]!, 6),
          usdt0: formatUnits(tokens[1]!, 6),
          nativeUsdc: formatUnits(tokens[2]!, 6),
          usdcBridged: formatUnits(tokens[3]!, 6),
          usdcE: formatUnits(tokens[4]!, 6),
          block: block.raw,
        },
        error: null,
      });
    } catch (error) {
      if (disposed || operation !== revision) return;
      publish({
        status: "error",
        account,
        chainId,
        balances: null,
        error: error instanceof WalletTimeoutError
          ? "A carteira não respondeu a tempo. Tente atualizar."
          : "Não foi possível ler os dados da carteira. Verifique a extensão OKX e tente novamente.",
      });
    }
  };

  const connect = async (): Promise<void> => {
    if (disposed) return;
    locallyDisconnected = false;
    cancelActiveConnect();
    if (activeSwitch) activeSwitch.cancelled = true;
    cancelAutoRefresh();
    const operation = ++revision;
    const connection = { eventVersion: 0, cancelled: false };
    activeConnect = connection;
    const isCurrentConnection = () =>
      !disposed && !locallyDisconnected && !connection.cancelled && activeConnect === connection;
    const reconcileAfterEvents = async (): Promise<void> => {
      while (isCurrentConnection()) {
        const eventVersion = connection.eventVersion;
        await refreshInternal(() => {
          if (isCurrentConnection() && connection.eventVersion === eventVersion) activeConnect = null;
        });
        if (!isCurrentConnection() || connection.eventVersion === eventVersion) return;
      }
    };
    let permissionGranted = false;
    publish({ status: "connecting", account: null, chainId: null, balances: null, error: null });
    try {
      const accounts = await request("eth_requestAccounts");
      if (!isCurrentConnection()) return;
      const parsed = parseAccounts(accounts);
      if (parsed.invalid || !parsed.account) {
        publish({
          status: parsed.invalid ? "error" : "disconnected",
          account: null,
          chainId: null,
          balances: null,
          error: parsed.invalid
            ? "A carteira retornou um endereço inválido. Reconecte no OKX."
            : "Nenhuma conta foi selecionada no OKX.",
        });
        cancelActiveConnect();
        return;
      }
      permissionGranted = true;
      if (connection.eventVersion > 0 || operation !== revision) {
        await reconcileAfterEvents();
        return;
      }
      const chainValue = await request("eth_chainId");
      if (!isCurrentConnection()) return;
      if (connection.eventVersion > 0 || operation !== revision) {
        if (connection.eventVersion > 0) await reconcileAfterEvents();
        return;
      }
      const accepted = acceptAccountAndChain(accounts, chainValue);
      if (activeConnect === connection) activeConnect = null;
      if (accepted && snapshot.account && snapshot.chainId) {
        await readBalances(operation, snapshot.account, snapshot.chainId);
      }
    } catch (error) {
      if (!isCurrentConnection()) return;
      if (permissionGranted && connection.eventVersion > 0) {
        await reconcileAfterEvents();
        return;
      }
      publish({
        status: "error",
        account: null,
        chainId: null,
        balances: null,
        error: error instanceof WalletTimeoutError
          ? "A carteira não respondeu a tempo. Tente atualizar."
          : errorCode(error) === 4001
            ? "A conexão foi recusada no OKX."
            : "Não foi possível conectar. Verifique a extensão OKX e tente novamente.",
      });
    } finally {
      if (activeConnect === connection) activeConnect = null;
    }
  };

  refreshInternal = async (onAccountAndChainRead?: () => void): Promise<void> => {
    if (disposed || locallyDisconnected) return;
    const operation = ++revision;
    publish({ ...snapshot, status: "reading", balances: null, error: null });
    try {
      const accounts = await request("eth_accounts");
      if (disposed || operation !== revision) return;
      const chainValue = await request("eth_chainId");
      if (disposed || operation !== revision) return;
      const accepted = acceptAccountAndChain(accounts, chainValue);
      onAccountAndChainRead?.();
      if (accepted && snapshot.account && snapshot.chainId) {
        await readBalances(operation, snapshot.account, snapshot.chainId);
      }
    } catch (error) {
      if (disposed || operation !== revision) return;
      publish({
        ...snapshot,
        status: "error",
        balances: null,
        error: error instanceof WalletTimeoutError
          ? "A carteira não respondeu a tempo. Tente atualizar."
          : "Não foi possível ler os dados da carteira. Verifique a extensão OKX e tente novamente.",
      });
    }
  };

  const refresh = async (): Promise<void> => {
    if (disposed || locallyDisconnected) return;
    cancelActiveConnect();
    if (activeSwitch) activeSwitch.cancelled = true;
    cancelAutoRefresh();
    await refreshInternal();
  };

  const switchTo = async (
    targetChainId: typeof MONAD_CHAIN_ID | typeof XLAYER_CHAIN_ID,
  ): Promise<void> => {
    if (disposed || locallyDisconnected) return;
    cancelActiveConnect();
    if (!snapshot.account) {
      publish({ ...snapshot, status: "disconnected", balances: null, error: "Conecte uma conta primeiro." });
      return;
    }
    if (activeSwitch) activeSwitch.cancelled = true;
    cancelAutoRefresh();
    const targetName = targetChainId === MONAD_CHAIN_ID ? "Monad" : "X Layer";
    const attempt = {
      account: snapshot.account,
      targetChainId,
      revision: ++revision,
      chainChanged: false,
      cancelled: false,
    };
    activeSwitch = attempt;
    publish({ ...snapshot, status: "reading", balances: null, error: null });
    try {
      await request("wallet_switchEthereumChain", [{ chainId: targetChainId }]);
      if (disposed || attempt.cancelled || snapshot.account !== attempt.account) return;
      if (attempt.revision !== revision) {
        if (!attempt.chainChanged || snapshot.account !== attempt.account) return;
        attempt.revision = ++revision;
      }
      const chainId = parseChainId(await request("eth_chainId"));
      if (disposed || attempt.cancelled || attempt.revision !== revision) return;
      if (chainId !== targetChainId) {
        publish({
          ...snapshot,
          status: chainId ? stateForAccount(snapshot.account, chainId) : "error",
          chainId,
          balances: null,
          error: chainId
            ? chainGuidance(chainId) ?? "A carteira não confirmou a rede selecionada."
            : "A carteira retornou um identificador de rede inválido.",
        });
        return;
      }
      publish({ ...snapshot, status: "connected", chainId, balances: null, error: null });
      await readBalances(attempt.revision, attempt.account, chainId);
      if (attempt.chainChanged && snapshot.chainId === targetChainId && snapshot.balances) {
        autoRefreshPending = false;
      }
    } catch (error) {
      if (disposed || attempt.cancelled || attempt.revision !== revision) return;
      publish({
        ...snapshot,
        status: snapshot.chainId
          ? stateForAccount(snapshot.account, snapshot.chainId)
          : "error",
        balances: null,
        error: error instanceof WalletTimeoutError
          ? "A carteira não respondeu a tempo. Tente atualizar."
          : errorCode(error) === 4001
            ? "A troca de rede foi recusada. Selecione " + targetName + " manualmente no OKX e atualize."
            : errorCode(error) === 4902
              ? targetName + " não está disponível nesta carteira. Selecione " + targetName + " manualmente no OKX e atualize."
              : "Não foi possível trocar de rede. Selecione " + targetName + " manualmente no OKX e atualize.",
      });
    } finally {
      if (activeSwitch === attempt) activeSwitch = null;
      if (autoRefreshPending) scheduleAutoRefresh();
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect,
    refresh,
    switchToMonad: () => switchTo(MONAD_CHAIN_ID),
    switchToXLayer: () => switchTo(XLAYER_CHAIN_ID),
    disconnect() {
      if (disposed) return;
      locallyDisconnected = true;
      cancelActiveConnect();
      if (activeSwitch) activeSwitch.cancelled = true;
      cancelAutoRefresh();
      invalidateWith({
        status: "disconnected",
        account: null,
        chainId: null,
        error: "Sessão encerrada neste painel. As permissões do OKX não foram alteradas.",
      });
    },
    dispose() {
      if (disposed) return;
      cancelActiveConnect();
      if (activeSwitch) activeSwitch.cancelled = true;
      cancelAutoRefresh();
      revision++;
      disposed = true;
      provider.removeListener("accountsChanged", handleAccountsChanged);
      provider.removeListener("chainChanged", handleChainChanged);
      provider.removeListener("disconnect", handleDisconnect);
      snapshot = {
        status: "disconnected",
        account: null,
        chainId: null,
        balances: null,
        error: null,
      };
      listeners.clear();
    },
  };
}
interface Eip6963Announcement {
  provider?: unknown;
}

/** Discover only the provider exposed directly on `okxwallet` on this surface. */
export function discoverOkxProvider(
  surface: OkxDiscoverySurface,
  onProvider: (provider: Eip1193Provider) => void,
): () => void {
  let active = true;
  let reported: Eip1193Provider | null = null;

  const reportAnchor = () => {
    const anchor = isProvider(surface.okxwallet) ? surface.okxwallet : null;
    if (active && anchor && anchor !== reported) {
      reported = anchor;
      onProvider(anchor);
    }
  };

  const handleAnnouncement: EventListener = (event) => {
    const detail = (event as CustomEvent<Eip6963Announcement>).detail;
    if (!detail || !isProvider(detail.provider)) return;
    const anchor = isProvider(surface.okxwallet) ? surface.okxwallet : null;
    if (anchor && detail.provider === anchor) reportAnchor();
  };

  surface.addEventListener("eip6963:announceProvider", handleAnnouncement);
  reportAnchor();
  surface.dispatchEvent(new Event("eip6963:requestProvider"));

  return () => {
    if (!active) return;
    active = false;
    surface.removeEventListener("eip6963:announceProvider", handleAnnouncement);
  };
}
