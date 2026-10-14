"use client";

/**
 * The Settings section of the orders carried out through the person's own wallet (WAL-10, EXE-1, EXE-2, EXE-8): the option, OFF until the person turns it on, the cap of one order and the cap of a day (without
 * both nothing is sent), the limits of impact and of the tax of a token, the tolerance of price, and the stop. Everything is kept on THIS machine; nothing here sends or signs, and the server never knows. The
 * drawing part is pure so each state is rendered in tests without a wallet.
 */
import { useEffect, useState } from "react";
import { fmtNumber } from "@/lib/desk/ui/format";
import { chainName } from "@/lib/opportunity/picks";
import { DEFAULT_TRADE_SETTINGS, LIMITS, parseTyped, sharedTradeSettings, type TradeSettings } from "@/lib/wallet/send/settings";
import { permissionLine } from "@/lib/wallet/send/texts";
import styles from "./SettingsView.module.css";

export interface TradeSettingsPanelProps {
  readonly settings: TradeSettings;
  /** The result of the last save, in words; null before any. */
  readonly saved: string | null;
  readonly onSave: (next: TradeSettings, change?: { readonly unkill?: boolean }) => boolean;
  readonly onKill: () => void;
  /** Takes back the routers and the approval addresses the person confirmed on a network. */
  readonly onUntrust: (chainIndex: string) => void;
}

const asText = (v: number | null): string => (v === null ? "" : String(v).replace(".", ","));

export function TradeSettingsPanel({ settings, saved, onSave, onKill, onUntrust }: TradeSettingsPanelProps) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [perOperation, setPerOperation] = useState(asText(settings.perOperationUsd));
  const [daily, setDaily] = useState(asText(settings.dailyUsd));
  const [impact, setImpact] = useState(asText(settings.maxImpactPct));
  const [tax, setTax] = useState(asText(settings.maxTaxPct));
  const [slippage, setSlippage] = useState(asText(settings.slippagePct));
  const [error, setError] = useState<string | null>(null);
  // the fields follow the settings in force when they change (a save, the stop, another tab)
  useEffect(() => {
    setEnabled(settings.enabled);
    setPerOperation(asText(settings.perOperationUsd));
    setDaily(asText(settings.dailyUsd));
    setImpact(asText(settings.maxImpactPct));
    setTax(asText(settings.maxTaxPct));
    setSlippage(asText(settings.slippagePct));
  }, [settings]);

  const save = (turnBackOn = false) => {
    const perOperationUsd = perOperation.trim() === "" ? null : parseTyped(perOperation, 0, LIMITS.maxCapUsd);
    const dailyUsd = daily.trim() === "" ? null : parseTyped(daily, 0, LIMITS.maxCapUsd);
    const maxImpactPct = parseTyped(impact, 0, LIMITS.maxImpactPct);
    const maxTaxPct = parseTyped(tax, 0, LIMITS.maxTaxPct, true);
    const slippagePct = parseTyped(slippage, 0, LIMITS.maxSlippagePct, false, 2);
    if (perOperation.trim() !== "" && perOperationUsd === null) return setError(`O teto de uma ordem e um valor em dolares maior que zero e ate ${fmtNumber(LIMITS.maxCapUsd, 0)}`);
    if (daily.trim() !== "" && dailyUsd === null) return setError(`O teto do dia e um valor em dolares maior que zero e ate ${fmtNumber(LIMITS.maxCapUsd, 0)}`);
    if (perOperationUsd !== null && dailyUsd !== null && perOperationUsd > dailyUsd) return setError("O teto de uma ordem nao pode ser maior que o teto do dia");
    if (maxImpactPct === null) return setError(`O impacto maximo e um percentual maior que zero e ate ${LIMITS.maxImpactPct}`);
    if (maxTaxPct === null) return setError(`A taxa maxima do token e um percentual de 0 ate ${LIMITS.maxTaxPct}`);
    if (slippagePct === null) return setError(`A tolerancia de preco e um percentual maior que zero e ate ${LIMITS.maxSlippagePct}, com no maximo duas casas depois da virgula`);
    if (enabled && (perOperationUsd === null || dailyUsd === null)) return setError("Para ligar o envio, defina os dois tetos: o de uma ordem e o do dia");
    setError(null);
    // the stop is never undone by a save: only "Religar o envio" says so, and the trusted addresses are the ones kept now
    onSave({ enabled, perOperationUsd, dailyUsd, maxImpactPct, maxTaxPct, slippagePct, killed: settings.killed, trustedRouters: settings.trustedRouters, trustedSpenders: settings.trustedSpenders }, { unkill: turnBackOn });
  };

  return (
    <section id="ordens" className={styles.section} aria-label="Ordens pela minha carteira">
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>ORDENS PELA CARTEIRA</p>
          <h2 className={styles.heading}>Enviar pela minha carteira</h2>
        </div>
        <span className={styles.sectionTag}>{permissionLine(settings).toUpperCase()}</span>
      </div>
      <p className={styles.sectionNote}>
        Quando ligado, voce pode carregar uma ordem de troca pela sua OKX Wallet com um clique no app. Cada ordem ainda abre a janela da carteira, e voce aprova la. O app nunca guarda a sua chave, o servidor nunca envia nada e saques e
        transferencias ficam so na carteira. Isto envolve dinheiro de verdade: a conferencia antes de cada envio diz o que a transacao faz, e qualquer coisa fora do combinado para o envio. Comece com tetos pequenos.
      </p>

      <label className={styles.checkboxField}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Permitir enviar pela minha carteira
      </label>

      <div className={styles.preferencesGrid}>
        <label className={styles.inlineField}>
          Teto de uma ordem (US$)
          <input className={styles.inputSmall} inputMode="decimal" aria-label="Teto de uma ordem em dolares" placeholder="ex.: 50" value={perOperation} onChange={(e) => setPerOperation(e.target.value)} />
        </label>
        <label className={styles.inlineField}>
          Teto por dia (US$)
          <input className={styles.inputSmall} inputMode="decimal" aria-label="Teto por dia em dolares" placeholder="ex.: 200" value={daily} onChange={(e) => setDaily(e.target.value)} />
        </label>
        <label className={styles.inlineField}>
          Impacto maximo no preco (%)
          <input className={styles.inputSmall} inputMode="decimal" aria-label="Impacto maximo em percentual" value={impact} onChange={(e) => setImpact(e.target.value)} />
        </label>
        <label className={styles.inlineField}>
          Taxa maxima do token (%)
          <input className={styles.inputSmall} inputMode="decimal" aria-label="Taxa maxima do token em percentual" value={tax} onChange={(e) => setTax(e.target.value)} />
        </label>
        <label className={styles.inlineField}>
          Tolerancia de preco (%)
          <input className={styles.inputSmall} inputMode="decimal" aria-label="Tolerancia de preco em percentual" value={slippage} onChange={(e) => setSlippage(e.target.value)} />
        </label>
      </div>

      <div className={styles.preferenceFooter}>
        <button type="button" className={styles.button} onClick={() => save()}>
          Salvar
        </button>
        {settings.killed ? (
          <button type="button" className={styles.buttonGhost} onClick={() => save(true)}>
            Religar o envio
          </button>
        ) : settings.enabled ? (
          <button type="button" className={styles.buttonGhost} onClick={onKill}>
            Parar tudo agora
          </button>
        ) : null}
      </div>
      <div className={styles.trustedBlock} aria-label="Roteadores confirmados">
        <p className={styles.fieldLabel}>Roteadores confirmados</p>
        {Object.keys(settings.trustedRouters).length === 0 ? (
          <p className={styles.sectionNote}>Nenhum ainda. Na primeira ordem de cada rede, o painel mostra o endereco do roteador e voce confirma depois de conferir com a OKX.</p>
        ) : (
          Object.keys(settings.trustedRouters).map((chain) => (
            <div key={chain} className={styles.trustedRow}>
              <span>{chainName(chain)}</span>
              <code>{(settings.trustedRouters[chain] ?? []).join(", ")}</code>
              <code>{`aprovacao: ${(settings.trustedSpenders[chain] ?? []).join(", ") || "nenhuma"}`}</code>
              <button type="button" className={styles.buttonGhost} onClick={() => onUntrust(chain)}>
                Remover
              </button>
            </div>
          ))
        )}
      </div>
      {error === null ? null : (
        <p className={styles.result} role="alert">
          {error}
        </p>
      )}
      {saved === null || error !== null ? null : <p className={styles.result}>{saved}</p>}
      <p className={styles.sectionNote}>Sem os dois tetos nada e enviado. O teto do dia conta as trocas das ultimas 24 horas deste computador. Parar tudo bloqueia o envio ate voce religar aqui.</p>
    </section>
  );
}

export default function TradeSettingsSection() {
  const [settings, setSettings] = useState<TradeSettings>(DEFAULT_TRADE_SETTINGS);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    const store = sharedTradeSettings();
    setSettings(store.get());
    return store.subscribe(() => setSettings(store.get()));
  }, []);
  return (
    <TradeSettingsPanel
      settings={settings}
      saved={saved}
      onSave={(next, change) => {
        const ok = sharedTradeSettings().set(next, change);
        setSaved(ok ? "Salvo neste computador" : "Nao foi possivel salvar: confira os valores e se o navegador deixa gravar neste site. Nada mudou");
        return ok;
      }}
      onKill={() => {
        sharedTradeSettings().kill();
        setSaved("Envio parado");
      }}
      onUntrust={(chain) => {
        sharedTradeSettings().untrust(chain);
        setSaved("Roteador removido");
      }}
    />
  );
}
