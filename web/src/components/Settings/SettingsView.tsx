"use client";

/**
 * Settings page (CFG-1, CFG-2): the four local secrets, the OnchainOS budget preferences, the visual
 * preferences of the desk and the fixed privacy facts. Secrets are password fields that are cleared after a
 * save; the saved value is never rendered back. The screen part is a pure component so tests can render every
 * state without a server.
 */
import { useEffect, useState, type ReactNode } from "react";
import { applyPalette, PALETTES, readStoredPalette, type PaletteId } from "@/lib/mesa/preferences";
import { applyLayout, readStoredLayout, type LayoutId } from "@/lib/mesa/layout";
import { SHORTCUTS } from "@/lib/mesa/topbar-model";
import { SECRET_IDS, type OnchainPrefs, type SecretId, type SettingsSnapshot } from "@/lib/settings/client";
import { useSettings, type SettingsState } from "@/lib/settings/useSettings";
import { createOnchainClient, type BudgetSnapshot, type OnchainStatus } from "@/lib/onchain/client";
import { CHAIN_ORDER } from "@/lib/onchain/chains";
import InonuUsage from "./InonuUsage";
import TradeSettingsSection from "./TradeSettings";
import styles from "./SettingsView.module.css";

const FIELD_META: Record<SecretId, { readonly label: string; readonly env: string; readonly file: string }> = {
  typesafeAiApiKey: { label: "Chave do Jev", env: "TYPESAFE_AI_API_KEY", file: "data/jev.env" },
  okxWeb3ApiKey: { label: "Chave OnchainOS", env: "OKX_WEB3_API_KEY", file: "data/onchainos.env" },
  okxWeb3ApiSecret: { label: "Segredo OnchainOS", env: "OKX_WEB3_API_SECRET", file: "data/onchainos.env" },
  okxWeb3ApiPassphrase: { label: "Passphrase OnchainOS", env: "OKX_WEB3_API_PASSPHRASE", file: "data/onchainos.env" },
};

const TIER_LABEL = { free: "Free", basic: "Basic", premium: "Premium" } as const;

const OKX_STATE: Record<SettingsSnapshot["okx"]["state"], string> = {
  absent: "Ausente",
  incomplete: "Incompleta",
  complete: "Completa",
};

export const TEST_TEXT: Record<string, string> = {
  ok: "OnchainOS respondeu",
  no_credentials: "OnchainOS: nenhuma credencial salva",
  incomplete_credentials: "OnchainOS: falta preencher as tres credenciais",
  provider_unauthorized: "OnchainOS: chave, segredo ou passphrase recusados",
  provider_payment_required: "OnchainOS: cota gratuita esgotada; o sistema nao paga",
  rate_limited: "OnchainOS: limite de chamadas, espere alguns segundos",
  provider_error: "OnchainOS: o provedor falhou",
  schema: "OnchainOS: resposta fora do esperado",
  clock_skew: "O relogio do computador esta fora do horario da OKX. Sincronize o horario do Windows e tente de novo.",
  budget_exhausted: "OnchainOS: teto do mes atingido",
  pace_limited: "OnchainOS: ritmo diario atingido",
  not_wired: "OnchainOS: o teste ainda nao esta ligado ao gateway",
  probe_error: "OnchainOS: a sonda falhou sem detalhe",
  absent: "nenhuma chave salva",
  format_ok: "formato valido, nao testado (consulta paga)",
};

/**
 * Clock line under the connection card: the gateway measures the OKX-minus-local clock offset on
 * every answer; below 20 s the masking is routine and stays silent, above it the user should sync
 * the Windows clock. Positive offset means the local clock is behind.
 */
export function clockSkewLine(clockOffsetMs: number | null | undefined): string | null {
  if (typeof clockOffsetMs !== "number" || !Number.isFinite(clockOffsetMs) || Math.abs(clockOffsetMs) < 20_000) return null;
  const secs = Math.round(Math.abs(clockOffsetMs) / 1000);
  const dir = clockOffsetMs > 0 ? "atrasado" : "adiantado";
  return `Relogio do computador cerca de ${secs} s ${dir} em relacao a OKX. O sistema compensa nas chamadas, mas sincronize o horario do Windows.`;
}

/** Server codes that mean the typed secret value was refused; mapped to a constant explanation. */
const SAVE_ERROR_TEXT: Record<string, string> = {
  value_invalid_chars: "Use apenas caracteres ASCII visiveis, sem apostrofo e sem barra invertida junto de cifrao",
  value_too_short: "Valor muito curto, o minimo e 8 caracteres",
  value_too_long: "Valor muito longo, o maximo e 256 caracteres",
  rate_limited: "Muitas gravacoes, espere um minuto",
};

export interface SettingsScreenProps {
  readonly phase: "loading" | "ready" | "error";
  readonly snapshot: SettingsSnapshot | null;
  readonly apiUrl: string;
  readonly networkError?: boolean;
  /** A constant explanation for the last failed action (e.g. a refused secret value). */
  readonly errorNote?: string | null;
  /** More sections of the page, placed before the privacy list (the Inonu usage, in the installed app). */
  readonly extra?: ReactNode;
  readonly budget?: BudgetSnapshot | null;
  readonly onchainStatus?: OnchainStatus | null;
  readonly usageError?: boolean;
  readonly onRefreshUsage?: () => void;
  readonly onRetry?: () => void;
  readonly onSave?: (id: SecretId, value: string) => Promise<void> | void;
  readonly onClear?: (id: SecretId) => Promise<void> | void;
  readonly onSavePrefs?: (patch: { onchain: Partial<OnchainPrefs> }) => Promise<void> | void;
  readonly onTestOnchainos?: () => Promise<{ ok: boolean; code: string }>;
  readonly onTestJev?: () => Promise<{ ok: boolean; code: string; tested?: boolean }>;
  /** Where the four secrets live: `arquivo` (data/*.env, the dev setup) or `cofre` (the Windows vault of the installed app). */
  readonly storage?: "arquivo" | "cofre";
}

/** Build-time switch: the static export of the installed app is built with NEXT_PUBLIC_INONU_APP=1 (scripts/build-desktop.ts). */
const APP_STORAGE: "arquivo" | "cofre" = process.env.NEXT_PUBLIC_INONU_APP === "1" ? "cofre" : "arquivo";

function statusText(configured: boolean, last4: string | null): string {
  if (!configured) return "nao configurada";
  return last4 === null ? "detectada" : `salva, termina em ...${last4}`;
}

const KEY_ORIGINS = { local: "arquivo local", vault: "cofre do Windows", process_environment: "ambiente do servidor", windows_user: "Windows, usuario", windows_machine: "Windows, sistema" };

function SecretRow({ id, snapshot, storage, onSave, onClear }: {
  readonly id: SecretId;
  readonly storage: "arquivo" | "cofre";
  readonly snapshot: SettingsSnapshot | null;
  readonly onSave?: SettingsScreenProps["onSave"];
  readonly onClear?: SettingsScreenProps["onClear"];
}) {
  const [draft, setDraft] = useState("");
  const meta = FIELD_META[id];
  const status = snapshot?.secrets[id];
  const ambient = status?.origin === "process_environment" || status?.origin === "windows_user" || status?.origin === "windows_machine";
  const save = async () => {
    if (!draft || !onSave) return;
    await onSave(id, draft);
    setDraft("");
  };
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={`secret-${id}`}>
        {storage === "cofre" && id === "typesafeAiApiKey" ? "Chave do modelo (Jev)" : meta.label}
      </label>
      <div className={styles.fieldRow}>
        <input
          id={`secret-${id}`}
          name={meta.env}
          className={styles.input}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          placeholder={!status ? "Aguardando leitura" : status.configured ? "detectada nesta maquina" : "colar a chave aqui"}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="button" className={styles.button} disabled={!draft || !onSave} onClick={() => void save()}>
          Salvar
        </button>
        <button type="button" className={styles.buttonGhost} disabled={!status?.configured || !onClear || ambient} onClick={() => void onClear?.(id)}>
          Limpar
        </button>
      </div>
      <p className={styles.fieldNote} data-configured={status?.configured ?? false}>
        {status ? statusText(status.configured, status.last4) : "Aguardando leitura"} <span className={styles.fileTag}>{status?.origin ? KEY_ORIGINS[status.origin] : storage === "cofre" ? "cofre do Windows" : meta.file}</span>
        {id === "typesafeAiApiKey" && status?.configured ? " Presenca detectada no servidor; autenticacao ainda nao testada." : null}
        {ambient ? " Limpar aqui nao altera a variavel do Windows." : null}
      </p>
    </div>
  );
}

export function SettingsScreen({ phase, snapshot, apiUrl, networkError = false, errorNote = null, budget = null, onchainStatus = null, usageError = false, onRefreshUsage, onRetry, onSave, onClear, onSavePrefs, onTestOnchainos, onTestJev, storage = "arquivo", extra = null }: SettingsScreenProps) {
  const [palette, setPalette] = useState<PaletteId>("padrao");
  const [layout, setLayout] = useState<LayoutId>("completo");
  const [capBasic, setCapBasic] = useState("");
  const [capPremium, setCapPremium] = useState("");
  const [prefsNote, setPrefsNote] = useState("");
  const [jevTest, setJevTest] = useState("");
  const [okxTest, setOkxTest] = useState("");

  useEffect(() => {
    setPalette(readStoredPalette());
    setLayout(readStoredLayout());
  }, []);
  useEffect(() => {
    if (snapshot) {
      setCapBasic(String(snapshot.prefs.onchain.capBasic));
      setCapPremium(String(snapshot.prefs.onchain.capPremium));
    }
  }, [snapshot]);

  const onchain = snapshot?.prefs.onchain;
  const credentials = snapshot?.vault === "indisponivel" ? null : snapshot;
  const jevStatus = credentials ? (credentials.secrets.typesafeAiApiKey.configured ? "Chave detectada" : "Sem chave") : "Aguardando leitura";
  const okxStatus = credentials ? OKX_STATE[credentials.okx.state] : "Aguardando leitura";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>INONU TRADER / AMBIENTE LOCAL</p>
          <h1 className={styles.title}>Configuracoes</h1>
          <p className={styles.subtitle}>Conexoes, consumo e preferencias do seu ambiente.</p>
        </div>
        <a className={styles.backLink} href="/">Voltar a mesa</a>
      </header>

      <div className={styles.overview} aria-label="Resumo do ambiente">
        <div><span>Nucleo local</span><strong>{phase === "ready" && snapshot ? "Respondendo" : phase === "error" ? "Sem resposta" : "Aguardando leitura"}</strong></div>
        <div><span>Modelo (Jev)</span><strong>{jevStatus}</strong></div>
        <div><span>Credenciais OnchainOS</span><strong>{okxStatus}</strong></div>
      </div>

      <div className={styles.workspace}>
        <nav className={styles.navigation} aria-label="Secoes das configuracoes">
          <p className={styles.navLabel}>SEU AMBIENTE</p>
          <a href="#conexoes"><span>01</span> Conexoes</a>
          <a href="#consumo"><span>02</span> Consumo da API</a>
          {extra ? <a href="#modelo"><span>03</span> Modelo e provedores</a> : null}
          <a href="#aparencia"><span>04</span> Aparencia</a>
          <a href="#atalhos"><span>05</span> Atalhos</a>
          <a href="#privacidade"><span>06</span> Privacidade</a>
          <div className={styles.localNote}><span className={styles.localDot} /> Preferencias locais<br />Chaves protegidas nesta maquina</div>
        </nav>
        <div className={styles.content}>

      {phase === "loading" ? <p className={styles.notice}>Carregando configuracoes</p> : null}
      {phase === "error" ? (
        <div className={styles.notice} role="alert">
          <p>Servidor local nao respondeu em {apiUrl}</p>
          {onRetry ? (
            <button type="button" className={styles.button} onClick={onRetry}>
              Tentar de novo
            </button>
          ) : null}
        </div>
      ) : null}
      {networkError && phase === "ready" ? <p className={styles.notice}>A ultima acao falhou: servidor local nao respondeu em {apiUrl}</p> : null}
      {errorNote ? <p className={styles.notice} role="alert">{errorNote}</p> : null}

      <section id="conexoes" className={styles.section} aria-label="Conexoes">
        <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>01 / INTEGRACOES</p><h2 className={styles.heading}>Conexoes</h2></div><span className={styles.sectionTag}>ACESSO LOCAL</span></div>
        {snapshot?.vault === "indisponivel" ? (
          <p className={styles.result} role="alert">
            O cofre do Windows nao respondeu: as chaves nao puderam ser lidas. Elas nao foram apagadas. Desbloqueie o Windows e reinicie o Inonu.
          </p>
        ) : null}
        <p className={styles.sectionNote}>{storage === "cofre" ? "As chaves ficam so nesta maquina, no cofre do Windows. Nao vao ao navegador depois de salvas, nem ao modelo, nem ao diario." : "As chaves ficam so nesta maquina, em data/. Nao vao ao navegador depois de salvas, nem ao modelo, nem ao diario."}</p>
        <div className={styles.connectionGrid}>
          <div className={styles.connectionCard}>
            <div className={styles.connectionHead}><span className={styles.providerMark} aria-hidden="true">J</span><div><h3>Modelo (Jev)</h3><p>Inteligencia System One</p></div><span className={styles.badge}>{jevStatus}</span></div>
            <p className={styles.cardDescription}>Credencial do modelo que avalia os dados enviados pelo Inonu.</p>
            <SecretRow id="typesafeAiApiKey" snapshot={credentials} storage={storage} onSave={onSave} onClear={onClear} />
            <div className={styles.connectionFooter}>
              {onTestJev ? <button type="button" className={styles.buttonGhost} onClick={() => void onTestJev().then((r) => setJevTest(TEST_TEXT[r.code] ?? r.code)).catch(() => setJevTest("falhou"))}>Verificar formato</button> : null}
              {jevTest ? <p className={styles.result}>Modelo (Jev): {jevTest}</p> : null}
              <details className={styles.details}><summary>Detalhes da deteccao</summary><p>A chave do modelo vale no proximo pedido ao Inonu (Jev). O servidor local usa primeiro a chave salva, depois TYPESAFE_AI_API_KEY ou TYPESAFE_API_KEY no ambiente e no Windows. A deteccao do Windows tem cache de ate 60 s.</p></details>
            </div>
          </div>
          <div className={styles.connectionCard}>
            <div className={styles.connectionHead}><span className={styles.okxMark} aria-hidden="true"><i /><i /><i /><i /><i /></span><div><h3>OnchainOS</h3><p>Ecossistema OKX</p></div><span className={styles.badge}>{okxStatus}</span></div>
            <p className={styles.cardDescription}>Estas credenciais autorizam APIs OnchainOS. A conexao da OKX Wallet ao app e independente.</p>
            {SECRET_IDS.filter((id) => id !== "typesafeAiApiKey").map((id) => <SecretRow key={id} id={id} snapshot={credentials} storage={storage} onSave={onSave} onClear={onClear} />)}
            <div className={styles.stateLine}>
              <span>Credencial OnchainOS:</span>{" "}<strong data-state={credentials?.okx.state ?? "unknown"}>{okxStatus}</strong>
              {onTestOnchainos ? (
            <button
              type="button"
              className={styles.button}
              onClick={() => void onTestOnchainos().then((r) => setOkxTest(TEST_TEXT[r.code] ?? `OnchainOS: ${r.code}`)).catch(() => setOkxTest("OnchainOS: falhou"))}
            >
              Testar conexao
            </button>
              ) : null}
            </div>
            {okxTest ? <p className={styles.result}>{okxTest}</p> : null}
          </div>
        </div>
      </section>

      <section id="consumo" className={styles.section} aria-label="Uso da API OnchainOS">
        <p className={styles.eyebrow}>02 / CONTROLE DE CONSUMO</p><h2 className={styles.heading}>Uso da API OnchainOS</h2>
        {budget ? (
          <div className={styles.meters}>
            {(["free", "basic", "premium"] as const).map((tier) => {
              const t = budget.tiers[tier];
              const pct = t.cap === null ? 0 : t.cap === 0 ? (t.used > 0 ? 100 : 0) : Math.min(100, Math.round((t.used / t.cap) * 100));
              return (
                <div key={tier} className={styles.meter}>
                  <div className={styles.meterHead}>
                    <strong>{TIER_LABEL[tier]}</strong>
                    <span>{t.cap === null ? `${t.used} chamadas` : `${t.used} de ${t.cap}`}</span>
                  </div>
                  {t.cap !== null ? (
                    <div className={styles.meterBar} role="img" aria-label={`${tier}: ${pct}% do teto`}>
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  ) : null}
                  <p className={styles.fieldNote}>
                    hoje {t.today}; projecao {t.projection} no mes {budget.month}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={styles.sectionNote}>{usageError ? `Servidor local nao respondeu em ${apiUrl}` : "Leitura do orcamento indisponivel"}</p>
        )}
        {onRefreshUsage ? (
          <div className={styles.fieldRow}>
            <button type="button" className={styles.buttonGhost} onClick={onRefreshUsage}>
              Atualizar
            </button>
            {onchainStatus ? (
              <span className={styles.fieldNote}>
                {onchainStatus.credential === "complete" ? "credencial presente" : onchainStatus.credential === "incomplete" ? "credencial incompleta" : "sem credencial"}
                {onchainStatus.lastCode !== null ? `; ultimo codigo ${onchainStatus.lastCode}` : ""}
                {onchainStatus.cooldownUntilMs !== null ? "; em espera de limite" : ""}
              </span>
            ) : null}
            {clockSkewLine(onchainStatus?.clockOffsetMs) !== null ? (
              <p className={styles.fieldNote} role="status">
                {clockSkewLine(onchainStatus?.clockOffsetMs)}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className={styles.preferencesGrid}>
          <label className={styles.inlineField}>
            Teto Basic por mes
            <input className={styles.inputSmall} inputMode="numeric" value={capBasic} onChange={(e) => setCapBasic(e.target.value)} />
          </label>
          <label className={styles.inlineField}>
            Teto Premium por mes
            <input className={styles.inputSmall} inputMode="numeric" value={capPremium} onChange={(e) => setCapPremium(e.target.value)} />
          </label>
          <label className={styles.inlineField}>
            Rede padrao
            <select
              className={styles.inputSmall}
              aria-label="Rede padrao do OnchainOS"
              value={onchain?.defaultChainIndex ?? ""}
              disabled={!onSavePrefs}
              onChange={(e) => void onSavePrefs?.({ onchain: { defaultChainIndex: e.target.value === "" ? null : e.target.value } })}
            >
              <option value="">Nenhuma</option>
              {CHAIN_ORDER.map((c) => (
                <option key={c.chainIndex} value={c.chainIndex}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.preferenceFooter}>
          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              checked={onchain?.background ?? false}
              disabled={!onSavePrefs}
              onChange={(e) => void onSavePrefs?.({ onchain: { background: e.target.checked } })}
            />
            Chamadas em segundo plano
          </label>
          <button
            type="button"
            className={styles.button}
            disabled={!onSavePrefs}
            onClick={() =>
              void Promise.resolve(onSavePrefs?.({ onchain: { capBasic: Number(capBasic), capPremium: Number(capPremium) } }))
                .then(() => setPrefsNote("limites salvos"))
                .catch(() => setPrefsNote("valor invalido"))
            }
          >
            Salvar limites
          </button>
        </div>
        {prefsNote ? <p className={styles.result}>{prefsNote}</p> : null}
        <p className={styles.sectionNote}>Plano gratuito: 100 mil chamadas Basic e 100 mil Premium por mes; o sistema nunca paga.</p>
      </section>

      {extra ? <div id="modelo" className={styles.modelSections}>{extra}</div> : null}

      <section id="aparencia" className={styles.section} aria-label="Aparencia e mesa">
        <p className={styles.eyebrow}>04 / PERSONALIZACAO</p><h2 className={styles.heading}>Aparencia e mesa</h2>
        <div className={styles.options} role="group" aria-label="Cores de alta e baixa">
          {PALETTES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={styles.option}
              aria-pressed={palette === option.id}
              onClick={() => {
                applyPalette(option.id);
                setPalette(option.id);
              }}
            >
              <span className={styles.swatch} aria-hidden="true">
                <span style={{ background: option.up }} />
                <span style={{ background: option.down }} />
              </span>
              <span>
                <span className={styles.optionLabel}>{option.label}</span>
                <span className={styles.optionHint}>{option.hint}</span>
              </span>
            </button>
          ))}
        </div>
        <div className={styles.options} role="group" aria-label="Distribuicao da mesa">
          <button
            type="button"
            className={styles.option}
            aria-pressed={layout === "completo"}
            onClick={() => {
              applyLayout("completo");
              setLayout("completo");
            }}
          >
            Mesa completa
          </button>
          <button
            type="button"
            className={styles.option}
            aria-pressed={layout === "grafico"}
            onClick={() => {
              applyLayout("grafico");
              setLayout("grafico");
            }}
          >
            Modo grafico
          </button>
        </div>
        <p className={styles.sectionNote}>Fica salvo neste navegador.</p>
      </section>

      <section id="atalhos" className={styles.section} aria-label="Atalhos">
        <p className={styles.eyebrow}>05 / NAVEGACAO</p><h2 className={styles.heading}>Atalhos</h2>
        <ul className={styles.keys}>
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys}>
              <kbd className={styles.kbd}>{shortcut.keys}</kbd>
              <span>{shortcut.action}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="privacidade" className={styles.section} aria-label="Privacidade">
        <p className={styles.eyebrow}>06 / DADOS E ACESSO</p><h2 className={styles.heading}>Privacidade</h2>
        <ul className={styles.privacyList}>
          <li>O navegador le dados publicos da OKX (precos, livro, negocios).</li>
          <li>{storage === "cofre" ? "As chaves ficam no cofre do Windows e nunca voltam ao navegador depois de salvas." : "As chaves ficam em arquivos locais em data/ e nunca voltam ao navegador depois de salvas."}</li>
          <li>Preferencias visuais ficam neste navegador.</li>
          <li>O diario do Inonu nao recebe segredos.</li>
        </ul>
      </section>
        </div>
      </div>
    </main>
  );
}

export default function SettingsView() {
  const settings = useSettings();
  const [usage, setUsage] = useState<{ budget: BudgetSnapshot; status: OnchainStatus } | null>(null);
  const [usageError, setUsageError] = useState(false);
  const refreshUsage = () => {
    const client = createOnchainClient();
    // intent "user" marks the read as explicit; there is no polling, only open and this button
    void Promise.all([client.budget("user"), client.status("user")])
      .then(([budget, status]) => {
        setUsage({ budget, status });
        setUsageError(false);
      })
      .catch(() => setUsageError(true));
  };
  useEffect(refreshUsage, []);

  const errorNote =
    settings.error === null || settings.error.code === "network"
      ? null
      : SAVE_ERROR_TEXT[settings.error.serverCode ?? ""] ?? "A ultima acao falhou";

  return (
    <SettingsScreen
      phase={settings.phase}
      snapshot={settings.snapshot}
      apiUrl={settings.apiUrl}
      networkError={settings.error !== null && settings.error.code === "network" && settings.phase === "ready"}
      errorNote={errorNote}
      budget={usage?.budget ?? null}
      onchainStatus={usage?.status ?? null}
      usageError={usageError}
      onRefreshUsage={refreshUsage}
      onRetry={() => void settings.reload()}
      onSave={settings.save}
      onClear={settings.clear}
      onSavePrefs={settings.savePrefs}
      onTestOnchainos={settings.testOnchainos}
      onTestJev={settings.testJev}
      storage={APP_STORAGE}
      extra={
        <>
          <InonuUsage />
          <TradeSettingsSection />
        </>
      }
    />
  );
}
