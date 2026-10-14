"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadWatch, parseWatchInput, saveWatch, type WatchFamily } from "@/lib/wallet/watch";
import { SWITCHABLE_CHAINS } from "@/lib/wallet/chains";
import {
  ageText, amountText, countText, createHoldingsReader, holdingsErrorText, MAX_CHAINS, pctText, PNL_LIMIT, readingAgeMs, SOLANA_CHAIN_INDEX, TIME_FRAMES, usdText,
  type BalancesData, type HistoryData, type HistoryKind, type HistoryStatus, type HoldingsResult, type OverviewData, type PnlData, type ValueData,
} from "@/lib/wallet/holdings";
import { networkLabel } from "@/lib/wallet/network-label";
import HoldingsConsult from "./HoldingsConsult";
import { createRunGuard } from "@/lib/wallet/run-guard";
import type { UseOkxWalletResult } from "@/lib/useOkxWallet";
import { useChartDetail } from "@/lib/desk/chart/detail-store";
import { useSolanaAccount } from "@/lib/useSolanaAccount";
import { solanaSideOf, type SolanaSide } from "@/lib/wallet/solana-account";
import { holdingsSessionKey, resolveHoldingsScope, scheduleAutoRead, subscribeHoldingsRevision, type HoldingsScope } from "@/lib/wallet/holdings-session";
import { readUnified, unifiedTarget, type MissingPart, type UnifiedTarget } from "@/lib/wallet/unified-read";
import { getBrowserWalletStore } from "@/lib/wallet-store";
import type { OnchainFocus } from "@/lib/onchain/focus";
import WalletChainSwitch from "./WalletChainSwitch";
import styles from "./HoldingsPanel.module.css";

/**
 * "Minha carteira" of the Carteira tab (T9.4, WAL-4): what the connected address holds and did, read through the local gateway from the OKX OnchainOS, only
 * once per connected account and scope, or when the person refreshes. It only SHOWS: there is no button that sends, no field for a key, and nothing here prepares a transaction. Every number says how old
 * it is and where it came from; one the provider did not give is a dash, never zero.
 */

const ROWS_SHOWN = 10;
const SCOPE_TEXT = { atual: "Rede atual", todas: "Todas as redes do seletor", solana: "Solana", tudo: "EVM e Solana juntas" } as const;
const asScope = (value: string): HoldingsScope => (value === "todas" || value === "solana" || value === "tudo" ? value : "atual");
export type { HoldingsScope };
const SOLANA_NAME = "Solana";
// Solana is a second account of the extension with its own provider and no network to switch, so it is a scope of its own: the Solana account, read on network 501 alone
export type { SolanaSide };

export interface HoldingsReadout {
  /** The moment on this screen when the answers arrived. */
  readonly receivedAtMs: number;
  readonly networks: readonly string[];
  readonly value: HoldingsResult<ValueData>;
  readonly balances: HoldingsResult<BalancesData>;
  readonly history: HoldingsResult<HistoryData>;
  /** What the reading could not get (a network, a block, a whole account), when it was a reading of both kinds of account: the rest is shown and this is said, never zero. */
  readonly missing?: readonly MissingPart[];
}

/** What the address did on one network over one window: two premium reads, asked apart from the first three. */
export interface ResultReadout {
  readonly receivedAtMs: number;
  readonly chainIndex: string;
  readonly timeFrame: number;
  readonly overview: HoldingsResult<OverviewData>;
  readonly pnl: HoldingsResult<PnlData>;
}

export interface WatchControl {
  /** The address being followed, or null. */
  readonly address: string | null;
  /** True when the account the screen reads IS the followed one (no wallet connected behind it). */
  readonly active: boolean;
  /** Takes what the person pasted; returns the reason it was refused, or null when it was taken. */
  readonly onWatch: (text: string) => string | null;
  readonly onStop: () => void;
}

export interface WalletConnect {
  readonly available: boolean;
  readonly connecting: boolean;
  readonly onConnect: () => void;
}

export interface HoldingsPanelViewProps {
  /** The connected EVM address, or null: nothing is shown or read without one. */
  readonly account: string | null;
  /** The network the wallet is on, when the app knows it. */
  readonly current: { readonly chainIndex: string; readonly name: string } | null;
  readonly scope: HoldingsScope;
  readonly readout: HoldingsReadout | null;
  readonly reading: boolean;
  readonly nowMs?: number;
  readonly onScope: (scope: HoldingsScope) => void;
  readonly onRead: () => void;
  readonly onCancel: () => void;
  /** The result block: the window, what was read, whether a reading is under way. */
  readonly timeFrame: number;
  readonly result: ResultReadout | null;
  readonly readingResult: boolean;
  readonly onTimeFrame: (value: number) => void;
  readonly onReadResult: () => void;
  readonly onCancelResult: () => void;
  /** The Solana side of the wallet; absent where the page has none. */
  readonly solana?: SolanaSide;
  /** What the screen needs to connect the wallet by a click; absent where another part of the tab already does it. */
  readonly connect?: WalletConnect;
  /** A public address followed in read-only, for a browser that has no wallet extension. */
  readonly watch?: WatchControl;
  /** The simple desk: the holdings and the decision about them, and nothing else (the history and the result by token wait for the complete one). */
  readonly simple?: boolean;
  readonly candidate?: OnchainFocus | null;
  readonly networkSwitch?: ReactNode;
  /** Both accounts are known (the EVM one and the Solana one, connected or followed): the one reading of both is offered, and both addresses are shown. */
  readonly joint?: { readonly evmAddress: string; readonly solanaAddress: string };
}

const KIND_TEXT: Record<HistoryKind, string> = { native: "Moeda da rede", internal: "Interna", token: "Token" };
const STATUS_TEXT: Record<HistoryStatus, string> = { success: "Confirmada", fail: "Falhou", pending: "Pendente" };

export { networkLabel };

function priceText(price: number | null): string {
  return price !== null && Number.isFinite(price) && price > 0 && price < 0.01
    ? `US$ ${new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 6 }).format(price)}`
    : usdText(price);
}

/** A moment as plain text in UTC: the same on every machine, and it says so. */
export function momentText(ms: number): string {
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? `${d.toISOString().slice(0, 16).replace("T", " ")} UTC` : "-";
}

/** The networks a scope reads: the one the wallet is on, the list of the selector (at most what the gateway takes), Solana alone, or the list of the selector and Solana together. */
export function scopeNetworks(scope: HoldingsScope, current: { readonly chainIndex: string } | null): readonly string[] {
  if (scope === "solana") return [SOLANA_CHAIN_INDEX];
  if (scope === "tudo") return [...scopeNetworks("todas", current), SOLANA_CHAIN_INDEX];
  if (scope === "atual") return current === null ? [] : [current.chainIndex];
  return SWITCHABLE_CHAINS.map((c) => c.chainIndex).slice(0, MAX_CHAINS);
}

/**
 * What a click reads: the address and the networks, or null when the scope cannot be read yet. The family of the account decides the networks, so an EVM address
 * never goes with network 501 and the Solana address goes with 501 alone (the reader and the gateway check the same rule again).
 */
export function readTarget(
  scope: HoldingsScope,
  from: { readonly evmAccount: string | null; readonly current: { readonly chainIndex: string } | null; readonly solanaAccount: string | null },
): { readonly address: string; readonly networks: readonly string[] } | null {
  // the reading of both kinds of account is two targets (an address and the networks of its family each), built where it is read: it is never one address
  if (scope === "tudo") return null;
  const address = scope === "solana" ? from.solanaAccount : from.evmAccount;
  const networks = scopeNetworks(scope, from.current);
  return address === null || networks.length === 0 ? null : { address, networks };
}

/** What a reading of both kinds of account could not get, in plain words: each network or account once with the blocks it lacked, then why. */
export function missingText(missing: readonly MissingPart[]): string {
  const byLabel = new Map<string, string[]>();
  for (const m of missing) {
    const whats = byLabel.get(m.label) ?? [];
    if (!whats.includes(m.what)) whats.push(m.what);
    byLabel.set(m.label, whats);
  }
  const named = [...byLabel.entries()].map(([label, whats]) => `${label} (${whats.join(", ")})`).join("; ");
  const reasons = [...new Set(missing.map((m) => m.reason))].join(" ");
  return `Leitura parcial: nao foi possivel ler ${named}. ${reasons} O que nao respondeu nao entra no que esta na tela.`;
}

function Failure({ text }: { readonly text: string }) {
  return (
    <p className={styles.notice} data-tom="erro">
      {text}
    </p>
  );
}

/** What a person sees when the wallet has no account the panel can read: the EVM one is missing, and the Solana one was not found or is still being looked for. */
/** The box that takes a public address to follow in read-only: it refuses a key or a phrase and says so, and it keeps nothing it refused. */
function WatchForm({ watch }: { readonly watch: WatchControl }) {
  const [text, setText] = useState("");
  const [refused, setRefused] = useState<string | null>(null);
  return (
    <div className={styles.decision}>
      <h4 className={styles.subtitle}>Ou acompanhe um endereco publico</h4>
      <div className={styles.form}>
        <label className={styles.field}>
          <span>Endereco publico (somente leitura)</span>
          <input
            type="text"
            aria-label="Endereco publico para acompanhar"
            placeholder="0x... ou endereco Solana"
            value={text}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setText(e.target.value);
              setRefused(null);
            }}
          />
        </label>
        <button
          type="button"
          className={styles.button}
          disabled={text.trim() === ""}
          onClick={() => {
            const reason = watch.onWatch(text);
            setRefused(reason);
            // what was pasted is cleared at once: a refused secret is not kept on the screen, and an accepted address is shown above, not here
            setText("");
          }}
        >
          Acompanhar
        </button>
      </div>
      {refused === null ? null : <Failure text={refused} />}
      <p className={styles.note}>Cole so o endereco publico. Nunca cole chave privada nem frase de recuperacao. O endereco fica so neste navegador e voce pode parar a qualquer momento.</p>
    </div>
  );
}

function NoWallet({ solana, connect, watch }: { readonly solana: SolanaSide | undefined; readonly connect: WalletConnect | undefined; readonly watch: WatchControl | undefined }) {
  return (
    <section className={styles.root} aria-label="Minha carteira">
      <h3 className={styles.title}>Minha carteira</h3>
      <p className={styles.muted}>Conecte a carteira para ler os saldos e o historico do seu endereco.</p>
      {connect === undefined ? null : (
        <>
          <div className={styles.form}>
            <button type="button" className={styles.button} disabled={!connect.available || connect.connecting} onClick={connect.onConnect}>
              {connect.connecting ? "Aguardando a carteira" : "Conectar carteira"}
            </button>
          </div>
          {connect.available ? (
            <p className={styles.note}>Conectar pede a sua confirmacao na carteira e carrega os saldos automaticamente. Nenhuma transacao e enviada.</p>
          ) : (
            <p className={styles.note}>A extensao OKX Wallet nao foi encontrada neste navegador. Abra o Inonu Trader pelo atalho do app, que usa o navegador com a extensao, ou instale a extensao OKX Wallet.</p>
          )}
        </>
      )}
      {solana === undefined ? null : (
        <p className={styles.muted}>
          {solana.ready ? "A carteira Solana nao foi encontrada neste navegador. Abra a extensao OKX Wallet com a conta Solana ativa e atualize a pagina." : "Procurando a carteira Solana."}
        </p>
      )}
      {watch === undefined ? null : <WatchForm watch={watch} />}
      <p className={styles.note}>Nada aqui assina ou envia.</p>
    </section>
  );
}

export function HoldingsPanelView(p: HoldingsPanelViewProps) {
  const sol = p.solana;
  const solanaKnown = sol !== undefined && (sol.available || sol.account !== null);
  if (p.account === null && !solanaKnown) return <NoWallet solana={sol} connect={p.connect} watch={p.watch} />;
  // with no EVM account the only thing there is to read is Solana; the one reading of both needs both accounts
  const scope: HoldingsScope = p.account === null ? "solana" : p.scope === "tudo" && p.joint === undefined ? "todas" : p.scope;
  const onSolana = scope === "solana";
  const joined = scope === "tudo";
  const solanaAccount = sol?.account ?? null;
  const shownAccount = onSolana ? solanaAccount : p.account;
  const scopes: HoldingsScope[] = [
    ...(p.joint === undefined ? [] : (["tudo"] as const)),
    ...(p.account === null ? [] : p.watch?.active ? (["todas"] as const) : (["atual", "todas"] as const)),
    ...(solanaKnown ? (["solana"] as const) : []),
  ];
  const networks = scopeNetworks(scope, p.current);
  const canRead = networks.length > 0 && !p.reading && (!onSolana || solanaAccount !== null);
  const r = p.readout;
  const metas = r === null ? [] : [r.value, r.balances, r.history].flatMap((x) => (x.ok ? [x.meta] : []));
  const age = r === null || p.nowMs === undefined ? null : readingAgeMs(metas, r.receivedAtMs, p.nowMs);
  return (
    <section className={styles.root} aria-label="Minha carteira">
      <h3 className={styles.title}>Minha carteira</h3>
      {p.simple ? null : p.networkSwitch}
      <dl className={styles.facts}>
        <div>
          <dt>{joined ? "Endereco EVM" : "Endereco"}</dt>
          <dd className={styles.mono}>{shownAccount ?? "Nao conectada"}</dd>
        </div>
        {joined && p.joint !== undefined ? (
          <div>
            <dt>Endereco Solana</dt>
            <dd className={styles.mono}>{p.joint.solanaAddress}</dd>
          </div>
        ) : null}
        {p.watch?.active ? (
          <div>
            <dt>Modo</dt>
            <dd>
              Somente leitura: este endereco nao esta conectado.{" "}
              <button type="button" className={styles.link} onClick={p.watch.onStop}>
                Parar de acompanhar
              </button>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Rede da carteira</dt>
          <dd>{joined ? `EVM e ${SOLANA_NAME}` : onSolana ? SOLANA_NAME : p.current === null ? "Fora da lista do app" : p.current.name}</dd>
        </div>
      </dl>
      <div className={styles.form}>
        <label className={styles.field}>
          <span>Redes a ler</span>
          <select
            aria-label="Redes a ler"
            value={scope}
            onChange={(e) => p.onScope(asScope(e.target.value))}
          >
            {scopes.map((key) => (
              <option key={key} value={key}>
                {SCOPE_TEXT[key]}
              </option>
            ))}
          </select>
        </label>
        {p.reading ? (
          <button type="button" className={styles.button} onClick={p.onCancel}>
            Cancelar
          </button>
        ) : onSolana && solanaAccount === null ? (
          <button type="button" className={styles.button} disabled={sol === undefined || sol.connecting || !sol.available} onClick={sol?.onConnect}>
            {sol?.connecting ? "Aguardando a carteira" : "Conectar Solana"}
          </button>
        ) : (
          <button type="button" className={styles.button} disabled={!canRead} onClick={p.onRead}>
            Atualizar carteira
          </button>
        )}
      </div>
      {onSolana && solanaAccount === null ? (
        <p className={styles.note}>Conectar pede a sua confirmacao na carteira e carrega os saldos Solana automaticamente.</p>
      ) : null}
      {onSolana && sol?.errorText ? <Failure text={sol.errorText} /> : null}
      {onSolana && sol?.notice ? <p className={styles.note}>{sol.notice}</p> : null}
      <p className={styles.note}>
        {joined
          ? "Ler junto faz mais leituras da OKX OnchainOS, da camada gratuita, do que uma rede so: as redes EVM em grupos de 4 e a Solana a parte; um grupo que a OKX recusa e refeito rede a rede. Conectar ou mudar o escopo comeca a leitura e Atualizar repete quando voce clica. O endereco vai ao servidor local e dele a OKX; nunca ao modelo. Nada aqui assina ou envia."
          : scope === "todas"
            ? "Ler todas as redes do seletor faz mais leituras da OKX OnchainOS, da camada gratuita, do que uma rede so: as redes em grupos de 4; um grupo que a OKX recusa e refeito rede a rede. Conectar ou mudar o escopo comeca a leitura e Atualizar repete quando voce clica. O endereco vai ao servidor local e dele a OKX; nunca ao modelo. Nada aqui assina ou envia."
            : "Conectar ou mudar o escopo faz 3 leituras da OKX OnchainOS, da camada gratuita, pelo servidor local. Atualizar repete a leitura quando voce clica. O endereco vai ao servidor local e dele a OKX; nunca ao modelo. Nada aqui assina ou envia."}
      </p>
      {scope === "atual" && p.current === null ? (
        <p className={styles.note}>A rede atual da carteira nao esta na lista do app: troque de rede em Trocar rede ou leia todas as redes do seletor.</p>
      ) : null}

      {r === null ? null : (
        <>
          <p className={styles.note}>{`Lido ${ageText(age)}, em ${r.networks.map(networkLabel).join(", ")}. Origem: OKX OnchainOS pelo servidor local.`}</p>
          {r.missing === undefined || r.missing.length === 0 ? null : <p className={styles.note}>{missingText(r.missing)}</p>}

          <h4 className={styles.subtitle}>Valor total</h4>
          {r.value.ok ? (
            <p className={styles.headline}>{`${usdText(r.value.data.totalValueUsd)}${r.missing?.some((m) => m.what === "valor") ? " (parcial)" : ""}`}</p>
          ) : (
            <Failure text={holdingsErrorText(r.value.error)} />
          )}

          <h4 className={styles.subtitle}>Saldos</h4>
          {!r.balances.ok ? (
            <Failure text={holdingsErrorText(r.balances.error)} />
          ) : r.balances.data.rows.length === 0 ? (
            <p className={styles.muted}>Nenhum saldo nas redes lidas.</p>
          ) : (
            <>
              <div className={`${styles.table} ${styles.positions}`} role="table" aria-label="Saldos" tabIndex={0}>
                <div className={`${styles.row} ${styles.balances} ${styles.head}`} role="row">
                  {["Ativo", "Rede", "Quantidade", "Preco", "Valor", "Aviso"].map((label) => (
                    <div key={label} className={styles.cell} role="columnheader">
                      {label}
                    </div>
                  ))}
                </div>
                {r.balances.data.rows.map((row, index) => (
                  <div key={`${row.chainIndex}-${row.tokenAddress ?? "native"}-${index}`} className={`${styles.row} ${styles.balances}`} role="row" data-tom={row.flaggedRisk ? "alerta" : "normal"}>
                    <div className={styles.cell} role="cell">{row.symbol}</div>
                    <div className={styles.cell} role="cell">{networkLabel(row.chainIndex)}</div>
                    <div className={styles.cell} role="cell">{amountText(row.balance)}</div>
                    <div className={styles.cell} role="cell">{priceText(row.priceUsd)}</div>
                    <div className={styles.cell} role="cell">{usdText(row.valueUsd)}</div>
                    <div className={styles.cell} role="cell">{row.flaggedRisk ? "Marcado como risco pelo provedor" : "-"}</div>
                  </div>
                ))}
              </div>
              <p className={styles.note}>{`Mostrando ${r.balances.data.rows.length} de ${r.balances.data.total}, do maior valor para o menor. Saldo sem preco fica por ultimo e o valor dele e um traco, nao zero. Preco e valor vem do provedor, sem checar liquidez: um token recebido sem voce pedir pode ter um preco que nao se realiza.`}</p>
              <HoldingsConsult rows={r.balances.data.rows} receivedAtMs={r.receivedAtMs} ageMs={r.balances.meta.ageMs} nowMs={p.nowMs ?? r.receivedAtMs} candidate={p.candidate} onRefresh={p.onRead} />
            </>
          )}

          {p.simple ? null : (
          <>
          <h4 className={styles.subtitle}>Historico</h4>
          {!r.history.ok ? (
            <Failure text={holdingsErrorText(r.history.error)} />
          ) : r.history.data.rows.length === 0 ? (
            <p className={styles.muted}>Nenhuma movimentacao no periodo que o provedor guarda, nas redes lidas.</p>
          ) : (
            <>
              <div className={styles.table} role="table" aria-label="Historico">
                <div className={`${styles.row} ${styles.history} ${styles.head}`} role="row">
                  {["Quando", "Rede", "Tipo", "Quantidade", "Estado", "De", "Para"].map((label) => (
                    <div key={label} className={styles.cell} role="columnheader">
                      {label}
                    </div>
                  ))}
                </div>
                {r.history.data.rows.slice(0, ROWS_SHOWN).map((row) => (
                  <div key={`${row.chainIndex}-${row.txHash}`} className={`${styles.row} ${styles.history}`} role="row" data-tom={row.flaggedByProvider || row.status === "fail" ? "alerta" : "normal"}>
                    <div className={styles.cell} role="cell">{momentText(row.atMs)}</div>
                    <div className={styles.cell} role="cell">{networkLabel(row.chainIndex)}</div>
                    <div className={styles.cell} role="cell">{row.kind === null ? "-" : KIND_TEXT[row.kind]}</div>
                    <div className={styles.cell} role="cell">{row.amount === null ? "-" : `${amountText(row.amount)} ${row.symbol ?? ""}`.trim()}</div>
                    <div className={styles.cell} role="cell">{row.flaggedByProvider ? "Marcada pelo provedor" : row.status === null ? "-" : STATUS_TEXT[row.status]}</div>
                    <div className={styles.cell} role="cell">{row.from ?? "-"}</div>
                    <div className={styles.cell} role="cell">{row.to ?? "-"}</div>
                  </div>
                ))}
              </div>
              <p className={styles.note}>{`Mostrando ${Math.min(ROWS_SHOWN, r.history.data.rows.length)} de ${r.history.data.rows.length} linhas lidas (ate 20 por leitura). As carteiras do outro lado aparecem encurtadas.`}</p>
            </>
          )}
          </>
          )}
        </>
      )}

      {p.simple ? null : <ResultBlock p={p} />}
    </section>
  );
}

/** Result by token: what the address made or lost, on the network the wallet is on, over a window. Two premium reads, asked only by this button. */
function ResultBlock({ p }: { readonly p: HoldingsPanelViewProps }) {
  const x = p.result;
  // the result follows the account that is read above: the Solana one on Solana, the EVM one on the network the wallet is on
  const onSolana = p.account === null || p.scope === "solana";
  const target = onSolana ? (p.solana?.account ? { chainIndex: SOLANA_CHAIN_INDEX, name: SOLANA_NAME } : null) : p.current;
  const canRead = target !== null && !p.readingResult;
  const metas = x === null ? [] : [x.overview, x.pnl].flatMap((r) => (r.ok ? [r.meta] : []));
  const age = x === null || p.nowMs === undefined ? null : readingAgeMs(metas, x.receivedAtMs, p.nowMs);
  const windowLabel = x === null ? "" : (TIME_FRAMES.find((t) => t.value === x.timeFrame)?.label ?? `janela ${x.timeFrame}`);
  return (
    <>
      <h4 className={styles.subtitle}>Resultado por token</h4>
      <div className={styles.form}>
        <label className={styles.field}>
          <span>Janela</span>
          <select aria-label="Janela do resultado" value={String(p.timeFrame)} disabled={p.readingResult} onChange={(e) => p.onTimeFrame(Number(e.target.value))}>
            {TIME_FRAMES.map((t) => (
              <option key={t.value} value={String(t.value)}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {p.readingResult ? (
          <button type="button" className={styles.button} onClick={p.onCancelResult}>
            Cancelar resultado
          </button>
        ) : (
          <button type="button" className={styles.button} disabled={!canRead} onClick={p.onReadResult}>
            Ler resultado
          </button>
        )}
      </div>
      <p className={styles.note}>
        Ler o resultado faz 2 leituras da camada premium da OKX OnchainOS, que contam na cota do mes; o servidor local nao paga alem dela.{" "}
        {onSolana ? "E lido na Solana, a conta Solana da carteira." : "E lido numa rede por vez, a da carteira."}
      </p>
      {target !== null ? null : onSolana ? (
        <p className={styles.note}>Conecte a Solana para ler o resultado.</p>
      ) : (
        <p className={styles.note}>A rede atual da carteira nao esta na lista do app: troque de rede em Trocar rede para ler o resultado.</p>
      )}
      {x === null ? null : (
        <>
          <p className={styles.note}>{`Lido ${ageText(age)}, em ${networkLabel(x.chainIndex)}, janela de ${windowLabel}. Origem: OKX OnchainOS pelo servidor local.`}</p>
          {!x.overview.ok ? (
            <Failure text={holdingsErrorText(x.overview.error)} />
          ) : (
            <dl className={styles.facts} aria-label="Resumo do resultado">
              <div>
                <dt>Compras</dt>
                <dd>{`${countText(x.overview.data.buyCount)} (${usdText(x.overview.data.buyVolumeUsd)})`}</dd>
              </div>
              <div>
                <dt>Vendas</dt>
                <dd>{`${countText(x.overview.data.sellCount)} (${usdText(x.overview.data.sellVolumeUsd)})`}</dd>
              </div>
              <div>
                <dt>Taxa de acerto</dt>
                <dd>{x.overview.data.sellCount === 0 ? "sem vendas na janela, nao se aplica" : pctText(x.overview.data.winRatePct)}</dd>
              </div>
              <div>
                <dt>Resultado realizado</dt>
                <dd>{usdText(x.overview.data.realizedPnlUsd)}</dd>
              </div>
            </dl>
          )}
          {!x.pnl.ok ? (
            <Failure text={holdingsErrorText(x.pnl.error)} />
          ) : x.pnl.data.rows.length === 0 ? (
            <p className={styles.muted}>Nenhum token com resultado calculado nesta rede.</p>
          ) : (
            <>
              <div className={styles.table} role="table" aria-label="Resultado por token">
                <div className={`${styles.row} ${styles.results} ${styles.head}`} role="row">
                  {["Ativo", "Saldo (USD)", "Resultado total (USD)", "Resultado (%)", "Posicao (%)", "Ultima atividade"].map((label) => (
                    <div key={label} className={styles.cell} role="columnheader">
                      {label}
                    </div>
                  ))}
                </div>
                {x.pnl.data.rows.slice(0, ROWS_SHOWN).map((row, index) => (
                  <div key={`${row.chainIndex}-${row.tokenAddress ?? "native"}-${index}`} className={`${styles.row} ${styles.results}`} role="row" data-tom={row.totalUsd !== null && row.totalUsd < 0 ? "alerta" : "normal"}>
                    <div className={styles.cell} role="cell">{row.symbol}</div>
                    <div className={styles.cell} role="cell">{usdText(row.balanceUsd)}</div>
                    <div className={styles.cell} role="cell">{usdText(row.totalUsd)}</div>
                    <div className={styles.cell} role="cell">{pctText(row.totalPct)}</div>
                    <div className={styles.cell} role="cell">{pctText(row.positionPct)}</div>
                    <div className={styles.cell} role="cell">{row.lastActiveMs === null ? "-" : momentText(row.lastActiveMs)}</div>
                  </div>
                ))}
              </div>
              <p className={styles.note}>{`Mostrando ${Math.min(ROWS_SHOWN, x.pnl.data.rows.length)} de ${x.pnl.data.rows.length} linhas lidas (ate ${PNL_LIMIT} por leitura). O resultado e o do provedor, nao um calculo daqui.`}</p>
            </>
          )}
        </>
      )}
    </>
  );
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export default function HoldingsPanel({ wallet, candidate = null }: { readonly wallet: UseOkxWalletResult; readonly candidate?: OnchainFocus | null }) {
  const { snapshot } = wallet;
  // one choice for the whole desk: the simple one reads the holdings and decides on them, the complete one adds the history and the result by token
  const [detail] = useChartDetail();
  const solana = useSolanaAccount();
  // a public address followed in read-only (no extension needed), read again from this machine after mount so the first paint is always the same
  const [watched, setWatched] = useState<{ readonly address: string; readonly family: WatchFamily } | null>(null);
  useEffect(() => {
    try {
      setWatched(loadWatch(window.localStorage));
    } catch {
      setWatched(null);
    }
  }, []);
  const watch = {
    onWatch: (text: string): string | null => {
      const parsed = parseWatchInput(text);
      if (!parsed.ok) return parsed.reason;
      setWatched({ address: parsed.address, family: parsed.family });
      try {
        saveWatch(window.localStorage, parsed.address);
      } catch {
        // followed until the page closes
      }
      return null;
    },
    onStop: () => {
      setWatched(null);
      try {
        saveWatch(window.localStorage, null);
      } catch {
        // nothing to forget
      }
    },
  };
  const connectedAccount = snapshot.account !== null && snapshot.status !== "disconnected" && EVM_ADDRESS.test(snapshot.account) ? snapshot.account : null;
  const account = connectedAccount ?? (watched?.family === "evm" ? watched.address : null);
  const chainHex = snapshot.chainId === null ? null : snapshot.chainId.toLowerCase();
  const current = useMemo(() => {
    const spec = chainHex === null ? undefined : SWITCHABLE_CHAINS.find((c) => c.chainIdHex === chainHex);
    return spec === undefined ? null : { chainIndex: spec.chainIndex, name: spec.name };
  }, [chainHex]);
  const side = solanaSideOf(solana);
  // the wallet that is connected always wins over the address that is followed
  const solanaAccount = side.account ?? (watched?.family === "solana" ? watched.address : null);
  const solanaKnown = side.available || solanaAccount !== null;

  const [picked, setScope] = useState<HoldingsScope | null>(null);
  // A Solana account that was not there and now is, while the Solana scope was only the way to connect it: the one reading of both is what comes next. It is decided while rendering (the
  // state of a render that is thrown away has no effects), so the Solana account is not read alone for an instant before the reading of both starts.
  const [solanaSeen, setSolanaSeen] = useState<string | null>(solanaAccount);
  if (solanaSeen !== solanaAccount) {
    setSolanaSeen(solanaAccount);
    if (solanaSeen === null && account !== null && picked === "solana") setScope(null);
  }
  // with no EVM account the only scope there is to read is Solana, and a Solana scope that has no wallet behind it falls back to the network of the wallet
  const followingEvm = connectedAccount === null && account !== null;
  const scope = resolveHoldingsScope(picked, { evmAccount: account, solanaAccount, solanaAvailable: solanaKnown, followingEvm });
  const active = scope === "solana" ? { address: solanaAccount, chain: SOLANA_CHAIN_INDEX } : { address: account, chain: chainHex };
  const [readout, setReadout] = useState<HoldingsReadout | null>(null);
  const [readoutSubject, setReadoutSubject] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [timeFrame, setTimeFrame] = useState(3);
  const [result, setResult] = useState<ResultReadout | null>(null);
  const [readingResult, setReadingResult] = useState(false);
  // only the clock: the age on the screen grows with it, and nothing is asked of the network
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const guard = useRef(createRunGuard());
  const reader = useMemo(() => createHoldingsReader(), []);
  useEffect(() => {
    const own = guard.current;
    return () => own.invalidate();
  }, []);
  // another account, another network or another scope is another subject: what was read does not carry over
  const target = readTarget(scope, { evmAccount: account, current, solanaAccount });
  // the one reading of both kinds of account is two targets (an address and the networks of its family each). The EVM networks of the selector go in groups too, whether or not Solana
  // is joined: the provider refuses a request for six or more of them at once when the address holds a lot of tokens ("A OKX respondeu com erro"), and a single request for all of them did that
  const evmNetworks = scopeNetworks("todas", current);
  const unified: UnifiedTarget | null =
    scope === "tudo" ? unifiedTarget({ evmAccount: account, solanaAccount, evmNetworks }) : scope === "todas" ? unifiedTarget({ evmAccount: account, solanaAccount: null, evmNetworks }) : null;
  const joint = account !== null && solanaAccount !== null ? { evmAddress: account, solanaAddress: solanaAccount } : undefined;
  const subject = holdingsSessionKey({
    address: scope === "tudo" && unified !== null ? `${unified.evm?.address ?? ""}+${unified.solana?.address ?? ""}` : (target?.address ?? null),
    networks: scope === "tudo" ? scopeNetworks("tudo", current) : (target?.networks ?? []),
    scope,
    evmRevision: wallet.revision,
  });
  // the result block depends on the account and the network, not on the scope of the first block
  const resultGuard = useRef(createRunGuard());
  useEffect(() => {
    const own = resultGuard.current;
    return () => own.invalidate();
  }, []);
  const resultSubject = `${active.address ?? ""}:${active.chain ?? ""}`;
  useEffect(() => {
    resultGuard.current.invalidate();
    setResult(null);
    setReadingResult(false);
  }, [resultSubject]);
  useEffect(
    () =>
      subscribeHoldingsRevision(getBrowserWalletStore(), scope, () => {
        guard.current.invalidate();
        resultGuard.current.invalidate();
        setReadout(null);
        setReading(false);
        setResult(null);
        setReadingResult(false);
      }),
    [scope],
  );

  const readResult = () => {
    // the result is read for the account of the scope: the Solana one on network 501, or the EVM one on the network the wallet is on
    const chainIndex = scope === "solana" ? SOLANA_CHAIN_INDEX : (current?.chainIndex ?? null);
    if (active.address === null || chainIndex === null || readingResult) return;
    const run = resultGuard.current.begin();
    setReadingResult(true);
    const params = { address: active.address, chainIndex, timeFrame };
    void Promise.all([reader.overview(params, run.signal), reader.pnl(params, run.signal)])
      .then(([overview, pnl]) => {
        if (run.isCurrent()) setResult({ receivedAtMs: Date.now(), chainIndex: params.chainIndex, timeFrame: params.timeFrame, overview, pnl });
      })
      .catch(() => undefined)
      .finally(() => {
        if (run.isCurrent()) {
          resultGuard.current.release(run);
          setReadingResult(false);
        }
      });
  };

  const startRead = useCallback((target: NonNullable<ReturnType<typeof readTarget>>, key: string) => {
    const networks = target.networks;
    const run = guard.current.begin();
    setReadout(null);
    setReadoutSubject(key);
    setReading(true);
    const params = { address: target.address, chains: networks };
    void Promise.all([reader.value(params, run.signal), reader.balances(params, run.signal), reader.history(params, run.signal)])
      .then(([value, balances, history]) => {
        if (run.isCurrent()) setReadout({ receivedAtMs: Date.now(), networks, value, balances, history });
      })
      .catch(() => undefined)
      .finally(() => {
        if (run.isCurrent()) {
          guard.current.release(run);
          setReading(false);
        }
      });
  }, [reader]);

  /** The one reading of both kinds of account: the EVM networks in groups and Solana apart, put together (see lib/wallet/unified-read.ts). */
  const startUnified = useCallback((both: UnifiedTarget, key: string) => {
    const run = guard.current.begin();
    setReadout(null);
    setReadoutSubject(key);
    setReading(true);
    void readUnified(reader, both, { now: Date.now, signal: run.signal })
      .then((r) => {
        if (r !== null && run.isCurrent()) setReadout({ receivedAtMs: r.receivedAtMs, networks: r.networks, value: r.value, balances: r.balances, history: r.history, missing: r.missing });
      })
      .catch(() => undefined)
      .finally(() => {
        if (run.isCurrent()) {
          guard.current.release(run);
          setReading(false);
        }
      });
  }, [reader]);

  useEffect(() => {
    guard.current.invalidate();
    setReadout(null);
    setReadoutSubject(subject);
    setReading(false);
    const begin = unified !== null ? () => startUnified(unified, subject) : target !== null ? () => startRead(target, subject) : null;
    const cancel = begin === null ? () => {} : scheduleAutoRead(begin);
    const own = guard.current;
    return () => {
      cancel();
      own.invalidate();
    };
    // The serialized subject includes the address, networks and relevant session revision.
  }, [subject, startRead, startUnified]); // eslint-disable-line react-hooks/exhaustive-deps

  const read = () => {
    if (reading) return;
    if (unified !== null) startUnified(unified, subject);
    else if (target !== null) startRead(target, subject);
  };

  return (
    <HoldingsPanelView
      account={account}
      current={current}
      scope={scope}
      readout={readoutSubject === subject ? readout : null}
      reading={readoutSubject === subject && reading}
      nowMs={nowMs}
      onScope={setScope}
      onRead={read}
      onCancel={() => { guard.current.invalidate(); setReading(false); }}
      timeFrame={timeFrame}
      result={result}
      readingResult={readingResult}
      onTimeFrame={setTimeFrame}
      onReadResult={readResult}
      onCancelResult={() => resultGuard.current.stop()}
      solana={side}
      joint={joint}
      simple={detail === "simples"}
      candidate={candidate}
      networkSwitch={<WalletChainSwitch wallet={wallet} scope={scope} onScope={setScope} />}
      connect={detail === "simples" ? { available: wallet.available, connecting: snapshot.status === "connecting", onConnect: () => void wallet.connect() } : undefined}
      watch={{
        address: watched?.address ?? null,
        active: watched !== null && (watched.family === "evm" ? followingEvm : side.account === null),
        onWatch: watch.onWatch,
        onStop: watch.onStop,
      }}
    />
  );
}
