"use client";

/**
 * The screen before there is a command centre to show: the core is being read, the core cannot be reached, or the wallet is not connected yet. Same design as the centre; the only thing a person does here is
 * connect a wallet, after reading one notice. The notice and its version are the proof sent with the connection (DISCLOSURE in lib/agent/client.ts).
 */
import { reasonText } from "@/lib/agent/view";
import HudRain from "./HudRain";
import "./hud.css";

export interface HudGateProps {
  readonly kind: "loading" | "error" | "disconnected";
  /** The reason code of the last failed read. */
  readonly error: string | null;
  readonly busy: boolean;
  readonly notice: { readonly tone: "ok" | "bad"; readonly text: string } | null;
  readonly noticeOpen: boolean;
  readonly onConnect: () => void;
  readonly onAccept: () => void;
  readonly onCancel: () => void;
}

function Ring() {
  return (
    <svg className="hud-ring" viewBox="0 0 400 400" aria-hidden="true">
      <circle cx="200" cy="200" r="190" fill="none" stroke="#17687f" strokeWidth="1.2" strokeDasharray="2 9" className="spin-f" style={{ transformOrigin: "200px 200px" }} />
      <g className="spin-b" style={{ transformOrigin: "200px 200px" }} fill="none" strokeLinecap="round">
        <path d="M200 12A188 188 0 0 1 388 200" stroke="#2ee6ff" strokeWidth="3" />
        <path d="M200 388A188 188 0 0 1 12 200" stroke="#2ee6ff" strokeWidth="3" />
      </g>
      <circle cx="200" cy="200" r="150" fill="none" stroke="#124c5f" strokeWidth="1.4" />
      <circle cx="200" cy="200" r="150" fill="none" stroke="#2ee6ff" strokeWidth="2" className="flow" opacity=".85" />
      <g className="spin-c" style={{ transformOrigin: "200px 200px" }}><circle cx="200" cy="50" r="5" fill="#e9fbff" /><circle cx="200" cy="350" r="3.5" fill="#2ee6ff" /></g>
      <g className="spin-d" style={{ transformOrigin: "200px 200px" }} fill="none" stroke="#2ee6ff" strokeWidth="1" opacity=".55"><circle cx="200" cy="200" r="112" strokeDasharray="3 8" /></g>
      <circle cx="200" cy="200" r="76" fill="url(#gateCore)" />
      <circle cx="200" cy="200" r="76" fill="none" stroke="#bff6ff" strokeWidth="1.4" opacity=".7" />
      <text x="200" y="206" textAnchor="middle" className="t-title" style={{ fill: "#02222c", fontWeight: 700, fontSize: 14, letterSpacing: ".3em" }}>INONU</text>
      <defs>
        <radialGradient id="gateCore" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#bff6ff" stopOpacity=".95" />
          <stop offset=".45" stopColor="#2ee6ff" stopOpacity=".55" />
          <stop offset="1" stopColor="#03202b" stopOpacity=".9" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export default function HudGate(props: HudGateProps) {
  const headline =
    props.kind === "loading" ? "LENDO O ESTADO DO AGENTE" : props.kind === "error" ? reasonText(props.error).toUpperCase() : "CONECTE A CARTEIRA. O RESTO E COM O INONU.";
  return (
    <main className="hud-root hud-gate" aria-label="Inonu Trader">
      <HudRain />
      <Ring />
      <p className="hud-gate-brand">INONU TRADER</p>
      <h1 className="hud-gate-headline">{headline}</h1>
      {props.kind === "disconnected" ? (
        <>
          <p className="hud-gate-lead">O Inonu le todos os seus criptoativos, rastreia o mercado da OKX atras das melhores oportunidades e decide sozinho o que manter, comprar e vender para fazer o capital crescer, com stop e alvo em cada operacao.</p>
          <button type="button" className="hud-cta" disabled={props.busy} onClick={props.onConnect}>CONECTAR CARTEIRA</button>
        </>
      ) : null}
      {props.kind === "error" ? <p className="hud-gate-lead">Confira se o servidor do agente esta no ar. Quando ele responder, esta tela se atualiza sozinha.</p> : null}
      {props.notice !== null ? <p className={`hud-gate-notice ${props.notice.tone === "bad" ? "bad" : "ok"}`} role="status">{props.notice.text}</p> : null}
      {props.noticeOpen ? (
        <div className="hud-modal-scrim" role="presentation">
          <div className="hud-modal" role="dialog" aria-modal="true" aria-labelledby="hud-notice-title">
            <h2 id="hud-notice-title">VOCE VAI ENTREGAR A GESTAO AO INONU</h2>
            <p>Ao conectar a carteira, todas as decisoes e todas as configuracoes passam a ser do agente: o gerenciamento de risco, o gerenciamento do capital, o crescimento do capital, a alavancagem, quando ele julgar que compensa e houver instrumento para isso, e a escolha do que comprar e do que vender.</p>
            <p>O agente trabalha sozinho, 24 horas por dia, e nao pede confirmacao. Voce nao configura nada e nao aprova nenhuma ordem.</p>
            <p>Para operar, ele instala o programa oficial da OKX e usa uma carteira propria, com a chave guardada no cofre da OKX. Ele so negocia o saldo que estiver nessa carteira, dentro dos limites que voce definir na sua conta OKX.</p>
            <p className="warn">Mercado envolve risco de perder capital. Ninguem garante lucro, e o agente tambem erra. Voce pode desconectar a qualquer momento.</p>
            <div className="hud-modal-actions">
              <button type="button" className="hud-cta" disabled={props.busy} onClick={props.onAccept}>ENTENDO E CONECTO A CARTEIRA</button>
              <button type="button" className="hud-cta quiet" onClick={props.onCancel}>CANCELAR</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
