"use client";

/**
 * The agent's page: the hooks around the command centre. It reads the core's status and its analysis when it opens and every few seconds. Before the wallet is connected it shows the standby screen, where the person
 * does exactly one thing, connect a wallet after reading one notice. Once connected, the command centre takes over; what a person may still do (stop, say what became of an order without a receipt, take a step
 * of the wallet) is in its Sistema tab and comes back here as an action. After the connection this page also carries the steps that need no decision (install the official tool of OKX, prepare the sign-in on OKX's
 * page, notice that the sign-in is done). Nothing here decides or signs anything: the core does.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HudGate from "@/components/Hud/HudGate";
import HudView from "@/components/Hud/HudView";
import { createAgentClient } from "@/lib/agent/client";
import { connectBrowserWallet, type WalletWindow } from "@/lib/agent/wallet-connect";
import { reasonText } from "@/lib/agent/view";
import type { AgentStatus } from "@/lib/agent/types";
import type { Analysis, HudAction, HudUi } from "@/lib/hud/types";

const POLL_MS = 6_000;
const LOGIN_POLL_MS = 4_000;
const CLOCK_MS = 15_000;

type Notice = NonNullable<HudUi["notice"]>;

export default function AgentView() {
  const client = useMemo(() => createAgentClient(), []);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState<HudUi["busy"]>(null);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const auto = useRef({ install: false, login: false });

  const refresh = useCallback(async () => {
    const out = await client.status();
    if (!out.ok) {
      setError(out.reason);
      setLoad("error");
      return;
    }
    setStatus(out.status);
    setLoad("ready");
    setError(null);
    setNowMs(Date.now());
    // the study of the decisions rides along; a core without it (or a failed read) leaves the analysis panels saying so
    if (out.status.connected) {
      const study = await client.analysis();
      setAnalysis(study.ok ? study.analysis : null);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => void refresh(), POLL_MS);
    const clock = setInterval(() => setNowMs(Date.now()), CLOCK_MS);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [refresh]);

  const step = useCallback(
    async (action: "install" | "login") => {
      setBusy("wallet");
      const out = await client.wallet(action);
      if (!out.ok) setNotice({ tone: "bad", text: reasonText(out.reason) });
      await refresh();
      setBusy(null);
    },
    [client, refresh],
  );

  // the steps that need no decision: once, after the person has connected
  useEffect(() => {
    if (status === null || !status.connected || !status.lock) return;
    const w = status.wallet;
    if (w.next === "instalar" && !auto.current.install) {
      auto.current.install = true;
      void step("install");
    } else if (w.next === "entrar" && w.cli === "instalado" && w.loginUrl === null && w.login !== "aguardando" && !auto.current.login) {
      auto.current.login = true;
      void step("login");
    }
  }, [status, step]);

  // while the person signs in on OKX's page, this page looks at whether it is done
  const waiting = status?.wallet.login === "aguardando";
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      void client.wallet("poll").then(() => refresh());
    }, LOGIN_POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, client, refresh]);

  const onConnect = useCallback(() => {
    setNotice(null);
    setNoticeOpen(true);
  }, []);

  const onAccept = useCallback(() => {
    setConnecting(true);
    void (async () => {
      const found = await connectBrowserWallet(typeof window === "undefined" ? undefined : (window as unknown as WalletWindow));
      const managed = found.ok ? ({ kind: "propria", evm: found.wallet.evm, solana: found.wallet.solana } as const) : undefined;
      const out = await client.connect(managed === undefined ? {} : { managed });
      setNoticeOpen(false);
      if (out.ok) {
        auto.current = { install: false, login: false };
        setNotice(found.ok ? null : { tone: "ok", text: "Conectado sem a carteira do navegador. O agente vai usar a carteira da conta OKX em que voce entrar." });
      } else setNotice({ tone: "bad", text: reasonText(out.reason) });
      await refresh();
      setConnecting(false);
    })();
  }, [client, refresh]);

  const onAction = useCallback(
    (action: HudAction) => {
      if (action.kind === "settings") {
        window.location.assign("/configuracoes");
        return;
      }
      if (action.kind === "open") return;
      if (action.kind === "wallet") {
        void step(action.step);
        return;
      }
      setNotice(null);
      if (action.kind === "stop") {
        setBusy("stop");
        void client.disconnect().then(async (out) => {
          setNotice(out.ok ? { tone: "ok", text: "Carteira desconectada. O agente parou." } : { tone: "bad", text: reasonText(out.reason) });
          auto.current = { install: false, login: false };
          await refresh();
          setBusy(null);
        });
      } else {
        setBusy("resolve");
        void client.resolve(action.key, action.outcome).then(async (out) => {
          setNotice(
            out.ok
              ? { tone: "ok", text: action.outcome === "executada" ? "Anotado: a ordem saiu. O saldo da proxima leitura mostra o resultado." : "Anotado: a ordem nao saiu. O token volta a poder receber ordens." }
              : { tone: "bad", text: reasonText(out.reason) },
          );
          await refresh();
          setBusy(null);
        });
      }
    },
    [client, refresh, step],
  );

  if (status === null) return <HudGate kind={load === "error" ? "error" : "loading"} error={error} busy={false} notice={null} noticeOpen={false} onConnect={onConnect} onAccept={onAccept} onCancel={() => setNoticeOpen(false)} />;
  if (!status.connected) return <HudGate kind="disconnected" error={error} busy={connecting} notice={notice} noticeOpen={noticeOpen} onConnect={onConnect} onAccept={onAccept} onCancel={() => setNoticeOpen(false)} />;
  return <HudView status={status} analysis={analysis} nowMs={nowMs} busy={busy} notice={notice} onAction={onAction} />;
}
