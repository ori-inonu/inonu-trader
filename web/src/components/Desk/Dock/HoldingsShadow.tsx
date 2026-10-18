"use client";
import { useEffect, useRef, useState } from "react";
import type { PortfolioAnswer } from "@/lib/inonu/portfolio";
import { createOnchainClient } from "@/lib/onchain/client";
import { createQuoteReader } from "@/lib/wallet/quote";
import { compareShadow, markShadow, type ShadowMark } from "@/lib/wallet/shadow";
import { readShadowQuotes, type ShadowQuoteCost } from "@/lib/wallet/shadow-quotes";
import { usdText, pctText } from "@/lib/wallet/holdings";
import { PLAN_WORD } from "@/lib/wallet/holdings-consult";
import type { HoldingsReadout } from "./HoldingsPanel";
import styles from "./HoldingsPanel.module.css";

export default function HoldingsShadow({ plan, readout, nowMs, onRefresh }: { readonly plan: PortfolioAnswer; readonly readout: HoldingsReadout | null; readonly nowMs: number; readonly onRefresh: () => void }) {
  const [size, setSize] = useState("1");
  const [marks, setMarks] = useState<readonly ShadowMark[]>([]);
  const [costs, setCosts] = useState<readonly ShadowQuoteCost[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { controller.current?.abort(); setMarks([]); setCosts([]); setBusy(false); setNote(""); return () => { controller.current?.abort(); }; }, [plan]);
  const start = () => {
    controller.current?.abort(); controller.current = null;
    const next = markShadow(plan, Number(size), Date.now());
    setMarks(next); setCosts([]); setBusy(false);
    setNote(next.length ? "Marca local criada. Atualize para comparar com um preco posterior." : "Informe um tamanho valido para a simulacao.");
  };
  const quote = async () => {
    if (busy || !marks.length) return;
    const run = new AbortController(); controller.current = run; setBusy(true); setNote("Consultando custos, ate seis cotacoes somente leitura.");
    const client = createOnchainClient(undefined, (url, init) => fetch(url, { ...init, signal: run.signal }));
    const reader = createQuoteReader();
    const result = await readShadowQuotes(marks, {
      search: async (chainIndex, contract) => { const answer = await client.search({ chainIndex, q: contract }, "user"); if (!answer.ok) throw new Error(answer.error); return answer; },
      quote: (params, signal) => reader.read(params, signal),
    }, run.signal);
    if (controller.current !== run || run.signal.aborted) return;
    setCosts(result); setBusy(false); setNote("Custos parciais consultados. Saida sem unidade qualificada: liquido desconhecido.");
  };
  const cancel = () => { controller.current?.abort(); controller.current = null; setBusy(false); setNote("Consulta de custos cancelada."); };
  return <section className={styles.root} aria-label="Comparacao em modo sombra">
    <h3 className={styles.title}>Modo sombra</h3>
    <p className={styles.note}>Simulacao, nenhuma ordem. Comprar compara com manter USD; vender compara com manter o token.</p>
    <div className={styles.form}>
      <label className={styles.field}>Tamanho simulado por ativo, USD<input aria-label="Tamanho simulado por ativo, USD" type="number" min="0.01" max="1000000" step="0.01" value={size} onChange={e => setSize(e.target.value)} /></label>
      <button className={styles.button} onClick={start} disabled={busy}>Iniciar modo sombra</button>
      <button className={styles.button} onClick={quote} disabled={busy || !marks.some(m => m.action === "buy" || m.action === "sell")}>Consultar custos</button>
      {busy && <button className={styles.button} onClick={cancel}>Cancelar custos</button>}
      <button className={styles.button} onClick={onRefresh} disabled={!marks.length}>Atualizar comparacao</button>
    </div>
    {note && <p className={styles.note} role="status">{note}</p>}
    {!!marks.length && <div className={styles.table} role="table" aria-label="Decisao contra manter">
      <div className={`${styles.row} ${styles.shadow} ${styles.head}`} role="row">{["Ativo e decisao", "Tamanho USD", "Bruto vs manter", "Liquido vs manter", "Estado"].map(label => <span className={styles.cell} role="columnheader" key={label}>{label}</span>)}</div>
      {marks.map(mark => {
        const cost = costs.find(c => c.markId === mark.id);
        const balances = readout?.balances;
        const delta = readout && balances?.ok && !balances.meta.stale ? compareShadow(mark, balances.data.rows, readout.receivedAtMs, balances.meta.ageMs, nowMs, cost?.cost ?? null, balances.meta.cachedAtMs) : { grossVsHoldUsd: null, netVsHoldUsd: null };
        const status = mark.action === "abstain" ? "Sem decisao verificavel" : mark.priceUsd === null ? "Preco inicial indisponivel" : delta.grossVsHoldUsd === null ? "Aguardando preco posterior" : delta.netVsHoldUsd === null ? "Custo nao qualificado" : "Comparacao disponivel";
        return <div className={`${styles.row} ${styles.shadow}`} role="row" key={mark.id} data-action={mark.action}>
          <span className={`${styles.cell} ${styles.verdict}`} role="cell">{mark.symbol}: {PLAN_WORD[mark.action]}</span>
          <span className={styles.cell} role="cell">{usdText(mark.exposureUsd)}</span>
          <span className={styles.cell} role="cell">{usdText(delta.grossVsHoldUsd)}</span>
          <span className={styles.cell} role="cell">{usdText(delta.netVsHoldUsd)}</span>
          <div className={`${styles.cell} ${styles.evidence}`} role="cell">{status}{cost && <details><summary>Custos</summary><p>{cost.note}</p><p>Rede: {usdText(cost.cost.networkFeeUsd)}. Impacto: {pctText(cost.impactPct)}. Leitura: {new Date(cost.atMs).toLocaleTimeString("pt-BR")}.</p></details>}</div>
        </div>;
      })}
    </div>}
    <details className={styles.note}><summary>Metodo da comparacao</summary><p>USDC tratado como US$ 1 apenas nesta simulacao. Comprar usa capital hipotetico, sem verificar disponibilidade de caixa. Vender limita a exposicao ao saldo informado. O delta usa precos posteriores frescos do mesmo ativo. Custos ausentes ou unidade de saida incerta impedem o valor liquido. Impacto nao e descontado novamente da rota, nem gas somado a taxa de rede. Isto nao e lucro realizado.</p></details>
  </section>;
}
