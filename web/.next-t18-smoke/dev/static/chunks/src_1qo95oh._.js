(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/components/Agent/AgentView.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AgentView
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * The agent's page: the hooks around the command centre. It reads the core's status and its analysis when it opens and every few seconds. Before the wallet is connected it shows the standby screen, where the person
 * does exactly one thing, connect a wallet after reading one notice. Once connected, the command centre takes over; what a person may still do (stop, say what became of an order without a receipt, take a step
 * of the wallet) is in its Sistema tab and comes back here as an action. After the connection this page also carries the steps that need no decision (install the official tool of OKX, prepare the sign-in on OKX's
 * page, notice that the sign-in is done). Nothing here decides or signs anything: the core does.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Hud$2f$HudGate$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/Hud/HudGate.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Hud$2f$HudView$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/Hud/HudView.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Agent$2f$DevelopmentReviewView$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/Agent/DevelopmentReviewView.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent/client.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$wallet$2d$connect$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent/wallet-connect.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent/view.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$status$2d$poll$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent/status-poll.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$analysis$2d$poll$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent/analysis-poll.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
;
;
;
const POLL_MS = 6_000;
const LOGIN_POLL_MS = 4_000;
const CLOCK_MS = 15_000;
const DEVELOPMENT = ("TURBOPACK compile-time value", "0") === "1";
function OperationalAgentView() {
    _s();
    const readOnly = DEVELOPMENT;
    const client = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "OperationalAgentView.useMemo[client]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createAgentClient"])()
    }["OperationalAgentView.useMemo[client]"], []);
    const [statusPoll, setStatusPoll] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        status: null,
        stale: false
    });
    const status = statusPoll.status;
    const [analysis, setAnalysis] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const reviewPageRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(1);
    const analysisGeneration = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    const analysisInFlight = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const statusRequest = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    const statusRequestInFlight = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [load, setLoad] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("loading");
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [nowMs, setNowMs] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "OperationalAgentView.useState": ()=>Date.now()
    }["OperationalAgentView.useState"]);
    const [busy, setBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [connecting, setConnecting] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [notice, setNotice] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [noticeOpen, setNoticeOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const auto = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])({
        install: false,
        login: false
    });
    const refresh = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "OperationalAgentView.useCallback[refresh]": async ()=>{
            try {
                const refreshed = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$status$2d$poll$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["coalesceStatusRequest"])(statusRequestInFlight, {
                    "OperationalAgentView.useCallback[refresh]": async ()=>{
                        const statusRequestId = ++statusRequest.current;
                        const out = await client.status();
                        if (statusRequestId !== statusRequest.current) return {
                            analysis: Promise.resolve()
                        };
                        if (!out.ok) {
                            setStatusPoll({
                                "OperationalAgentView.useCallback[refresh]": (previous)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$status$2d$poll$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["statusPollFailed"])(previous)
                            }["OperationalAgentView.useCallback[refresh]"]);
                            setError(out.reason);
                            setLoad("error");
                            return {
                                analysis: Promise.resolve()
                            };
                        }
                        setStatusPoll((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$status$2d$poll$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["statusPollSucceeded"])(out.status));
                        setLoad("ready");
                        setError(null);
                        setNowMs(Date.now());
                        // the study of the decisions rides along; a core without it (or a failed read) leaves the analysis panels saying so
                        if (out.status.connected) {
                            const page = reviewPageRef.current;
                            const generation = analysisGeneration.current;
                            const analysis = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$analysis$2d$poll$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requestAnalysis"])(analysisInFlight, page, generation, {
                                "OperationalAgentView.useCallback[refresh].analysis": (requestedPage)=>client.analysis(requestedPage)
                            }["OperationalAgentView.useCallback[refresh].analysis"], {
                                "OperationalAgentView.useCallback[refresh].analysis": (requestedPage, requestedGeneration)=>reviewPageRef.current === requestedPage && analysisGeneration.current === requestedGeneration
                            }["OperationalAgentView.useCallback[refresh].analysis"], {
                                "OperationalAgentView.useCallback[refresh].analysis": (study)=>setAnalysis(study.ok ? study.analysis : null)
                            }["OperationalAgentView.useCallback[refresh].analysis"]);
                            return {
                                analysis
                            };
                        }
                        return {
                            analysis: Promise.resolve()
                        };
                    }
                }["OperationalAgentView.useCallback[refresh]"]);
                await refreshed.analysis;
            } catch (error) {
                statusRequest.current++;
                setStatusPoll({
                    "OperationalAgentView.useCallback[refresh]": (previous)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$status$2d$poll$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["statusPollFailed"])(previous)
                }["OperationalAgentView.useCallback[refresh]"]);
                setError(error instanceof Error ? error.message : "sem_conexao");
                setLoad("error");
            }
        }
    }["OperationalAgentView.useCallback[refresh]"], [
        client
    ]);
    const onReviewPageChange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "OperationalAgentView.useCallback[onReviewPageChange]": (page)=>{
            if (page < 1 || page > 10 || page === reviewPageRef.current) return;
            reviewPageRef.current = page;
            const generation = ++analysisGeneration.current;
            void (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$analysis$2d$poll$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["requestAnalysis"])(analysisInFlight, page, generation, {
                "OperationalAgentView.useCallback[onReviewPageChange]": (requestedPage)=>client.analysis(requestedPage)
            }["OperationalAgentView.useCallback[onReviewPageChange]"], {
                "OperationalAgentView.useCallback[onReviewPageChange]": (requestedPage, requestedGeneration)=>reviewPageRef.current === requestedPage && analysisGeneration.current === requestedGeneration
            }["OperationalAgentView.useCallback[onReviewPageChange]"], {
                "OperationalAgentView.useCallback[onReviewPageChange]": (study)=>setAnalysis(study.ok ? study.analysis : null)
            }["OperationalAgentView.useCallback[onReviewPageChange]"]);
        }
    }["OperationalAgentView.useCallback[onReviewPageChange]"], [
        client
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OperationalAgentView.useEffect": ()=>{
            void refresh();
            const poll = setInterval({
                "OperationalAgentView.useEffect.poll": ()=>void refresh()
            }["OperationalAgentView.useEffect.poll"], POLL_MS);
            const clock = setInterval({
                "OperationalAgentView.useEffect.clock": ()=>setNowMs(Date.now())
            }["OperationalAgentView.useEffect.clock"], CLOCK_MS);
            return ({
                "OperationalAgentView.useEffect": ()=>{
                    clearInterval(poll);
                    clearInterval(clock);
                }
            })["OperationalAgentView.useEffect"];
        }
    }["OperationalAgentView.useEffect"], [
        refresh
    ]);
    const step = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "OperationalAgentView.useCallback[step]": async (action)=>{
            setBusy("wallet");
            const out = await client.wallet(action);
            if (!out.ok) setNotice({
                tone: "bad",
                text: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["reasonText"])(out.reason)
            });
            await refresh();
            setBusy(null);
        }
    }["OperationalAgentView.useCallback[step]"], [
        client,
        refresh
    ]);
    // the steps that need no decision: once, after the person has connected
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OperationalAgentView.useEffect": ()=>{
            if (readOnly || status === null || !status.connected || !status.lock) return;
            const w = status.wallet;
            if (w.next === "instalar" && !auto.current.install) {
                auto.current.install = true;
                void step("install");
            } else if (w.next === "entrar" && w.cli === "instalado" && w.loginUrl === null && w.login !== "aguardando" && !auto.current.login) {
                auto.current.login = true;
                void step("login");
            }
        }
    }["OperationalAgentView.useEffect"], [
        status,
        step,
        readOnly
    ]);
    // while the person signs in on OKX's page, this page looks at whether it is done
    const waiting = status?.wallet.login === "aguardando";
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OperationalAgentView.useEffect": ()=>{
            if (readOnly || !waiting) return;
            const timer = setInterval({
                "OperationalAgentView.useEffect.timer": ()=>{
                    void client.wallet("poll").then({
                        "OperationalAgentView.useEffect.timer": ()=>refresh()
                    }["OperationalAgentView.useEffect.timer"]);
                }
            }["OperationalAgentView.useEffect.timer"], LOGIN_POLL_MS);
            return ({
                "OperationalAgentView.useEffect": ()=>clearInterval(timer)
            })["OperationalAgentView.useEffect"];
        }
    }["OperationalAgentView.useEffect"], [
        waiting,
        client,
        refresh,
        readOnly
    ]);
    const onConnect = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "OperationalAgentView.useCallback[onConnect]": ()=>{
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
            setNotice(null);
            setNoticeOpen(true);
        }
    }["OperationalAgentView.useCallback[onConnect]"], [
        readOnly
    ]);
    const onAccept = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "OperationalAgentView.useCallback[onAccept]": ()=>{
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
            setConnecting(true);
            void ({
                "OperationalAgentView.useCallback[onAccept]": async ()=>{
                    const found = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$wallet$2d$connect$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["connectBrowserWallet"])(("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : window);
                    const managed = found.ok ? {
                        kind: "propria",
                        evm: found.wallet.evm,
                        solana: found.wallet.solana
                    } : undefined;
                    const out = await client.connect(managed === undefined ? {} : {
                        managed
                    });
                    setNoticeOpen(false);
                    if (out.ok) {
                        auto.current = {
                            install: false,
                            login: false
                        };
                        setNotice(found.ok ? null : {
                            tone: "ok",
                            text: "Conectado sem a carteira do navegador. O agente vai usar a carteira da conta OKX em que voce entrar."
                        });
                    } else setNotice({
                        tone: "bad",
                        text: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["reasonText"])(out.reason)
                    });
                    await refresh();
                    setConnecting(false);
                }
            })["OperationalAgentView.useCallback[onAccept]"]();
        }
    }["OperationalAgentView.useCallback[onAccept]"], [
        client,
        refresh,
        readOnly
    ]);
    const onAction = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "OperationalAgentView.useCallback[onAction]": (action)=>{
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
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
                void client.disconnect().then({
                    "OperationalAgentView.useCallback[onAction]": async (out)=>{
                        setNotice(out.ok ? {
                            tone: "ok",
                            text: "Carteira desconectada. O agente parou."
                        } : {
                            tone: "bad",
                            text: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["reasonText"])(out.reason)
                        });
                        auto.current = {
                            install: false,
                            login: false
                        };
                        await refresh();
                        setBusy(null);
                    }
                }["OperationalAgentView.useCallback[onAction]"]);
            } else {
                setBusy("resolve");
                void client.resolve(action.key, action.outcome).then({
                    "OperationalAgentView.useCallback[onAction]": async (out)=>{
                        setNotice(out.ok ? {
                            tone: "ok",
                            text: action.outcome === "executada" ? "Anotado: a ordem saiu. O saldo da proxima leitura mostra o resultado." : "Anotado: a ordem nao saiu. O token volta a poder receber ordens."
                        } : {
                            tone: "bad",
                            text: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["reasonText"])(out.reason)
                        });
                        await refresh();
                        setBusy(null);
                    }
                }["OperationalAgentView.useCallback[onAction]"]);
            }
        }
    }["OperationalAgentView.useCallback[onAction]"], [
        client,
        refresh,
        step,
        readOnly
    ]);
    if (status === null) return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Hud$2f$HudGate$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
        kind: load === "error" ? "error" : "loading",
        error: error,
        busy: false,
        notice: null,
        noticeOpen: false,
        onConnect: onConnect,
        onAccept: onAccept,
        onCancel: ()=>setNoticeOpen(false),
        readOnly: readOnly
    }, void 0, false, {
        fileName: "[project]/src/components/Agent/AgentView.tsx",
        lineNumber: 201,
        columnNumber: 30
    }, this);
    if (!status.connected) return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Hud$2f$HudGate$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
        kind: "disconnected",
        error: error,
        busy: connecting,
        notice: notice,
        noticeOpen: noticeOpen,
        onConnect: onConnect,
        onAccept: onAccept,
        onCancel: ()=>setNoticeOpen(false),
        readOnly: readOnly
    }, void 0, false, {
        fileName: "[project]/src/components/Agent/AgentView.tsx",
        lineNumber: 202,
        columnNumber: 32
    }, this);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Hud$2f$HudView$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
        status: status,
        analysis: analysis,
        nowMs: nowMs,
        busy: busy,
        notice: notice,
        onAction: onAction,
        onReviewPageChange: onReviewPageChange,
        readOnly: readOnly,
        walletPollFailed: statusPoll.stale
    }, void 0, false, {
        fileName: "[project]/src/components/Agent/AgentView.tsx",
        lineNumber: 203,
        columnNumber: 9
    }, this);
}
_s(OperationalAgentView, "t2EtbQ5iZlVUHY8sGLmsCTVMOO4=");
_c = OperationalAgentView;
function AgentView() {
    return ("TURBOPACK compile-time falsy", 0) ? /*#__PURE__*/ "TURBOPACK unreachable" : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(OperationalAgentView, {}, void 0, false, {
        fileName: "[project]/src/components/Agent/AgentView.tsx",
        lineNumber: 207,
        columnNumber: 51
    }, this);
}
_c1 = AgentView;
var _c, _c1;
__turbopack_context__.k.register(_c, "OperationalAgentView");
__turbopack_context__.k.register(_c1, "AgentView");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/Agent/DevelopmentReviewView.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DevelopmentReviewView
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Hud$2f$CycleReviewPanel$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/Hud/CycleReviewPanel.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent/client.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$dev$2d$status$2d$poll$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent/dev-status-poll.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
const POLL_MS = 6_000;
const money = (value)=>value === null ? "desconhecido" : `US$ ${value.toFixed(2)}`;
const timestamp = (value)=>value === null ? "desconhecido" : new Date(value).toLocaleString();
function DevelopmentReviewView() {
    _s();
    const client = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DevelopmentReviewView.useMemo[client]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createAgentClient"])()
    }["DevelopmentReviewView.useMemo[client]"], []);
    const [analysis, setAnalysis] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [load, setLoad] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("loading");
    const [statusPoll, setStatusPoll] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        status: null,
        unavailable: false
    });
    const [reviewPage, setReviewPage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(1);
    const reviewPageRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(1);
    const requestGeneration = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    const statusGeneration = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DevelopmentReviewView.useEffect": ()=>{
            let active = true;
            const refresh = {
                "DevelopmentReviewView.useEffect.refresh": async ()=>{
                    const generation = ++statusGeneration.current;
                    const result = await client.devStatus();
                    if (!active || generation !== statusGeneration.current) return;
                    if (!result.ok) {
                        setStatusPoll({
                            "DevelopmentReviewView.useEffect.refresh": (previous)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$dev$2d$status$2d$poll$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["devStatusPollFailed"])(previous)
                        }["DevelopmentReviewView.useEffect.refresh"]);
                        return;
                    }
                    setStatusPoll((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$dev$2d$status$2d$poll$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["devStatusPollSucceeded"])(result.status));
                }
            }["DevelopmentReviewView.useEffect.refresh"];
            void refresh();
            const poll = setInterval({
                "DevelopmentReviewView.useEffect.poll": ()=>void refresh()
            }["DevelopmentReviewView.useEffect.poll"], POLL_MS);
            return ({
                "DevelopmentReviewView.useEffect": ()=>{
                    active = false;
                    clearInterval(poll);
                }
            })["DevelopmentReviewView.useEffect"];
        }
    }["DevelopmentReviewView.useEffect"], [
        client
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DevelopmentReviewView.useEffect": ()=>{
            let active = true;
            const refresh = {
                "DevelopmentReviewView.useEffect.refresh": async ()=>{
                    const generation = ++requestGeneration.current;
                    const result = await client.analysis(reviewPage);
                    if (!active || generation !== requestGeneration.current || reviewPageRef.current !== reviewPage) return;
                    if (!result.ok) {
                        setLoad("unavailable");
                        return;
                    }
                    setAnalysis(result.analysis);
                    setLoad("ready");
                }
            }["DevelopmentReviewView.useEffect.refresh"];
            void refresh();
            const poll = setInterval({
                "DevelopmentReviewView.useEffect.poll": ()=>void refresh()
            }["DevelopmentReviewView.useEffect.poll"], POLL_MS);
            return ({
                "DevelopmentReviewView.useEffect": ()=>{
                    active = false;
                    clearInterval(poll);
                }
            })["DevelopmentReviewView.useEffect"];
        }
    }["DevelopmentReviewView.useEffect"], [
        client,
        reviewPage
    ]);
    const onReviewPageChange = (page)=>{
        if (page < 1 || page > 10 || page === reviewPageRef.current) return;
        reviewPageRef.current = page;
        requestGeneration.current += 1;
        setReviewPage(page);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        "aria-label": "Revisão de ciclos em desenvolvimento",
        style: {
            minHeight: "100vh",
            padding: 24,
            boxSizing: "border-box",
            color: "#e7edf5",
            background: "#101722",
            font: "14px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                style: {
                    margin: "0 0 8px",
                    fontSize: 20
                },
                children: "Revisão de ciclos JEV"
            }, void 0, false, {
                fileName: "[project]/src/components/Agent/DevelopmentReviewView.tsx",
                lineNumber: 75,
                columnNumber: 3
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                style: {
                    margin: 0,
                    color: "#aab7c7"
                },
                children: "Modo de desenvolvimento somente leitura. Status em cache e análise atualizados a cada 6 segundos. Não lê status operacional da carteira nem envia ações."
            }, void 0, false, {
                fileName: "[project]/src/components/Agent/DevelopmentReviewView.tsx",
                lineNumber: 76,
                columnNumber: 3
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                "aria-label": "Status seguro em cache",
                style: {
                    margin: "12px 0",
                    padding: 12,
                    border: "1px solid #344253",
                    borderRadius: 8
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        style: {
                            margin: "0 0 6px",
                            fontSize: 16
                        },
                        children: "Status em cache"
                    }, void 0, false, {
                        fileName: "[project]/src/components/Agent/DevelopmentReviewView.tsx",
                        lineNumber: 78,
                        columnNumber: 4
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        role: "status",
                        "aria-live": "polite",
                        style: {
                            margin: 0,
                            color: statusPoll.unavailable ? "#f3c66a" : "#aab7c7"
                        },
                        children: statusPoll.unavailable ? `Status indisponível${statusPoll.status === null ? "" : "; exibindo o último snapshot conhecido."}` : statusPoll.status === null ? "Status desconhecido; lendo projeção em cache." : `Status recebido às ${timestamp(statusPoll.status.atMs)}.`
                    }, void 0, false, {
                        fileName: "[project]/src/components/Agent/DevelopmentReviewView.tsx",
                        lineNumber: 79,
                        columnNumber: 4
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        style: {
                            margin: "4px 0"
                        },
                        children: [
                            "Conectado: ",
                            statusPoll.status === null ? "desconhecido" : statusPoll.status.connected ? "sim" : "não"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/Agent/DevelopmentReviewView.tsx",
                        lineNumber: 82,
                        columnNumber: 4
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        style: {
                            margin: "4px 0"
                        },
                        children: [
                            "Livro: ",
                            statusPoll.status === null || statusPoll.status.book === null ? "indisponível ou desconhecido" : statusPoll.status.book.quality
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/Agent/DevelopmentReviewView.tsx",
                        lineNumber: 83,
                        columnNumber: 4
                    }, this),
                    statusPoll.status === null || statusPoll.status.book === null ? null : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                style: {
                                    margin: "4px 0"
                                },
                                children: [
                                    "Observado em: ",
                                    timestamp(statusPoll.status.book.observedAtMs),
                                    "; projeção: ",
                                    timestamp(statusPoll.status.book.atMs)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/Agent/DevelopmentReviewView.tsx",
                                lineNumber: 85,
                                columnNumber: 5
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                style: {
                                    margin: "4px 0"
                                },
                                children: [
                                    "Total: ",
                                    money(statusPoll.status.book.totalUsd),
                                    ", Agente: ",
                                    money(statusPoll.status.book.agentUsd),
                                    ", Caixa: ",
                                    money(statusPoll.status.book.cashUsd)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/Agent/DevelopmentReviewView.tsx",
                                lineNumber: 86,
                                columnNumber: 5
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/Agent/DevelopmentReviewView.tsx",
                        lineNumber: 84,
                        columnNumber: 76
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/Agent/DevelopmentReviewView.tsx",
                lineNumber: 77,
                columnNumber: 3
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                role: "status",
                "aria-live": "polite",
                style: {
                    margin: "8px 0",
                    color: load === "unavailable" ? "#f3c66a" : "#aab7c7"
                },
                children: load === "loading" ? "Lendo a análise do core." : load === "unavailable" ? "Análise indisponível. Confirme que o core local está ativo e atualizado." : `Análise atualizada. Ciclos revisados: ${analysis?.cycleReviewPage?.total ?? 0}.`
            }, void 0, false, {
                fileName: "[project]/src/components/Agent/DevelopmentReviewView.tsx",
                lineNumber: 89,
                columnNumber: 3
            }, this),
            analysis === null ? null : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Hud$2f$CycleReviewPanel$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                reviews: analysis.cycleReviews ?? [],
                pageInfo: analysis.cycleReviewPage,
                onPageChange: onReviewPageChange
            }, void 0, false, {
                fileName: "[project]/src/components/Agent/DevelopmentReviewView.tsx",
                lineNumber: 92,
                columnNumber: 31
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/Agent/DevelopmentReviewView.tsx",
        lineNumber: 74,
        columnNumber: 9
    }, this);
}
_s(DevelopmentReviewView, "w5x1CLC8wRwYe2+QWiphNx+/ad8=");
_c = DevelopmentReviewView;
var _c;
__turbopack_context__.k.register(_c, "DevelopmentReviewView");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/Hud/CycleReviewPanel.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>CycleReviewPanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
"use client";
;
const findingText = {
    input_unknown: {
        title: "Entrada desconhecida",
        action: "Verifique a fonte e a idade desta evidência antes de usá-la."
    },
    data_stale: {
        title: "Dado vencido",
        action: "Confirme uma leitura atual antes de usar esta evidência."
    },
    stance_diverged: {
        title: "Pedido e aplicação divergem",
        action: "Revise o gate registrado; esta revisão não ajusta a política."
    },
    estimated_cost_unknown: {
        title: "Custo estimado desconhecido",
        action: "Confirme a cotação antes de avaliar o custo."
    },
    realized_fee_unknown: {
        title: "Taxa realizada desconhecida",
        action: "Confirme o recibo. Uma taxa em lamports isolada não informa custo USD nem retorno líquido."
    },
    order_uncertain: {
        title: "Ordem incerta",
        action: "Confirme o recibo pela chave da ordem antes de concluir a execução."
    },
    outcome_unmeasured: {
        title: "Resultado ainda não medido",
        action: "Confirme a coleta e a disponibilidade do preço da janela antes de avaliar o resultado."
    }
};
const windowStatusText = {
    pending: "Pendente",
    measured: "Medido",
    unknown: "Indisponível",
    unmeasured: "Não medido"
};
const time = (value)=>{
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Data desconhecida" : date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
};
const evidence = (value)=>typeof value === "string" ? value : JSON.stringify(value);
const freshness = (review, candidateId)=>{
    if (review.status === "unknown" || review.ageMin === null) return "Idade do campo desconhecida";
    const source = review.source ?? "campo desconhecido";
    const note = source === "evidence.tm.ag" ? " (inicio da barra 1h mais recente)" : source === "evidence.mo.ag" ? " (inicio da barra 5m mais recente)" : source === "context.s1_idade_min" ? " (idade informada pelo contexto)" : source === "evidence.ag" ? ` (posicoes.${candidateId ?? "<id>"}.ag: idade dos fatos de price-info; timestamp do provedor quando disponivel, senao idade da cache do gateway mais o tempo desde a leitura; nao e idade do saldo ou da posicao desde a entrada, nem prova frescor na origem sem timestamp do provedor)` : "";
    return review.status === "data_stale" ? `Idade registrada ${review.ageMin} min (campo ${source}) excede o limite registrado${note}` : `Idade registrada ${review.ageMin} min (campo ${source})${note}`;
};
function Findings({ items }) {
    if (items.length === 0) return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
        style: {
            margin: "4px 0",
            color: "#aab7c7"
        },
        children: "Nenhum achado acionavel nos fatos registrados."
    }, void 0, false, {
        fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
        lineNumber: 38,
        columnNumber: 33
    }, this);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
        style: {
            margin: "4px 0 8px",
            paddingLeft: 18
        },
        children: items.map((item, index)=>{
            const text = findingText[item.code];
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                style: {
                    margin: "4px 0"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                        children: text.title
                    }, void 0, false, {
                        fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                        lineNumber: 43,
                        columnNumber: 5
                    }, this),
                    ": ",
                    text.action,
                    item.decision ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: [
                            " Decisao relacionada: ",
                            item.decision,
                            "."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                        lineNumber: 44,
                        columnNumber: 22
                    }, this) : null,
                    item.orderKey ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: [
                            " Chave base da ordem: ",
                            item.orderKey,
                            "."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                        lineNumber: 45,
                        columnNumber: 22
                    }, this) : null,
                    item.fields.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: [
                            " Campos: ",
                            item.fields.join(", "),
                            "."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                        lineNumber: 46,
                        columnNumber: 27
                    }, this) : null,
                    item.window ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: [
                            " Janela: ",
                            item.window,
                            "."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                        lineNumber: 47,
                        columnNumber: 20
                    }, this) : null
                ]
            }, `${item.code}-${item.candidateId ?? "cycle"}-${item.orderKey ?? ""}-${index}`, true, {
                fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                lineNumber: 42,
                columnNumber: 11
            }, this);
        })
    }, void 0, false, {
        fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
        lineNumber: 39,
        columnNumber: 9
    }, this);
}
_c = Findings;
function CycleReviewPanel({ reviews, pageInfo, onPageChange }) {
    const paging = pageInfo ?? {
        page: 1,
        pageSize: 12,
        total: reviews.length,
        totalPages: 1
    };
    const visible = reviews.slice().reverse();
    const firstCycle = paging.total === 0 ? 0 : (paging.page - 1) * paging.pageSize + 1;
    const lastCycle = Math.min(paging.page * paging.pageSize, paging.total);
    const changePage = (page)=>{
        if (page !== paging.page) onPageChange?.(page);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
        "aria-label": "Revisao por ciclo",
        style: {
            position: "fixed",
            zIndex: 30,
            right: 12,
            bottom: 12,
            width: "min(620px, calc(100vw - 24px))",
            maxHeight: "52vh",
            overflow: "auto",
            boxSizing: "border-box",
            padding: 12,
            color: "#e7edf5",
            background: "rgba(9, 16, 27, 0.96)",
            border: "1px solid #506179",
            borderRadius: 8,
            font: "12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace",
            boxShadow: "0 8px 28px rgba(0,0,0,.45)"
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("details", {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("summary", {
                    style: {
                        cursor: "pointer",
                        color: "#f3c66a",
                        fontWeight: 600
                    },
                    children: [
                        "Revisao por ciclo (",
                        paging.total,
                        " retidos, maximo 120)"
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                    lineNumber: 65,
                    columnNumber: 4
                }, this),
                visible.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    style: {
                        margin: 0,
                        color: "#aab7c7"
                    },
                    children: "Nenhum ciclo valido para revisao neste core antigo ou sem fatos suficientes."
                }, void 0, false, {
                    fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                    lineNumber: 66,
                    columnNumber: 28
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            style: {
                                margin: "8px 0",
                                color: "#aab7c7"
                            },
                            children: "A revisao usa fatos congelados antes da decisao. Resultados posteriores aparecem separados."
                        }, void 0, false, {
                            fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                            lineNumber: 67,
                            columnNumber: 5
                        }, this),
                        visible.map((review)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("details", {
                                style: {
                                    borderTop: "1px solid #34445b",
                                    padding: "7px 0"
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("summary", {
                                        style: {
                                            cursor: "pointer",
                                            color: "#f3c66a"
                                        },
                                        children: [
                                            time(review.atMs),
                                            " | ",
                                            review.cycleId,
                                            " | ",
                                            review.items.length,
                                            " itens",
                                            review.itemsTruncated ? " ou mais" : ""
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                        lineNumber: 69,
                                        columnNumber: 6
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        style: {
                                            padding: "6px 0 0"
                                        },
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                style: {
                                                    margin: "0 0 4px"
                                                },
                                                children: [
                                                    "Brief congelado: ",
                                                    review.frozen.briefHash ?? "hash indisponivel",
                                                    "."
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                lineNumber: 71,
                                                columnNumber: 7
                                            }, this),
                                            review.frozen.context ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                style: {
                                                    margin: "0 0 4px",
                                                    overflowWrap: "anywhere"
                                                },
                                                children: [
                                                    "Contexto congelado: ",
                                                    Object.entries(review.frozen.context).map(([key, value])=>`${key}=${value ?? "unknown"}`).join("; ")
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                lineNumber: 72,
                                                columnNumber: 32
                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                style: {
                                                    margin: "0 0 4px"
                                                },
                                                children: "Contexto congelado indisponivel."
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                lineNumber: 72,
                                                columnNumber: 222
                                            }, this),
                                            review.frozen.history ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                style: {
                                                    margin: "0 0 4px",
                                                    overflowWrap: "anywhere"
                                                },
                                                children: [
                                                    "Historico congelado: ",
                                                    Object.entries(review.frozen.history).map(([key, row])=>`${key} ${Object.entries(row).map(([field, value])=>`${field}=${value ?? "unknown"}`).join(", ")}`).join("; ")
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                lineNumber: 73,
                                                columnNumber: 32
                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                style: {
                                                    margin: "0 0 4px"
                                                },
                                                children: "Historico congelado indisponivel."
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                lineNumber: 73,
                                                columnNumber: 291
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Findings, {
                                                items: review.findings
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                lineNumber: 74,
                                                columnNumber: 7
                                            }, this),
                                            review.items.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                    style: {
                                                        margin: "8px 0",
                                                        padding: 8,
                                                        background: "rgba(255,255,255,.035)",
                                                        borderLeft: "2px solid #7890ad",
                                                        overflowWrap: "anywhere"
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                            children: [
                                                                item.kind === "buy" ? "Candidato" : "Posicao",
                                                                ": ",
                                                                item.candidateId
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                            lineNumber: 76,
                                                            columnNumber: 8
                                                        }, this),
                                                        item.kind === "holding" && item.frozen.evidence?.pt !== undefined ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                "Timestamp reportado na resposta normalizada de price-info: ",
                                                                item.frozen.evidence.pt === 1 ? "sim" : "nao",
                                                                ". Nao e verificacao independente de frescor, relogio, autenticidade, preco ou saldo."
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                            lineNumber: 77,
                                                            columnNumber: 77
                                                        }, this) : null,
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                "Solicitado: ",
                                                                item.requested ?? "desconhecido",
                                                                " | Aplicado: ",
                                                                item.applied ?? "desconhecido",
                                                                ". ",
                                                                freshness(item.freshness, item.kind === "holding" ? item.candidateId : undefined),
                                                                "."
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                            lineNumber: 78,
                                                            columnNumber: 8
                                                        }, this),
                                                        item.gate ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                "Gate: ",
                                                                item.gate.asked,
                                                                " para ",
                                                                item.gate.applied,
                                                                "; razao ",
                                                                item.gate.reason ?? "desconhecida",
                                                                "."
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                            lineNumber: 79,
                                                            columnNumber: 21
                                                        }, this) : null,
                                                        item.order ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    children: [
                                                                        "Ordem vinculada pela chave exata ",
                                                                        item.order.orderKey,
                                                                        ", etapa ",
                                                                        item.order.stage,
                                                                        ". Etapas aplicada ou enviando nao confirmam; fills e recibos vinculados aparecem abaixo."
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                                    lineNumber: 80,
                                                                    columnNumber: 24
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    children: [
                                                                        "Motivo local (nao prova resultado on-chain): ",
                                                                        item.order.reason ?? "nao registrado",
                                                                        "."
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                                    lineNumber: 80,
                                                                    columnNumber: 203
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                            lineNumber: 80,
                                                            columnNumber: 22
                                                        }, this) : null,
                                                        item.decision.action || item.decision.inaction ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                "Decisao registrada: ",
                                                                item.decision.action ? `${item.decision.action.side} ${item.decision.action.stance ?? "sem postura"} (chave ${item.decision.action.key})` : "sem acao",
                                                                "; inacao: ",
                                                                item.decision.inaction ? `${item.decision.inaction.side} ${item.decision.inaction.stance ?? "sem postura"} (chave ${item.decision.inaction.key})` : "sem registro",
                                                                "."
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                            lineNumber: 81,
                                                            columnNumber: 58
                                                        }, this) : null,
                                                        item.decision.action?.estimatedCostUsd !== null && item.decision.action?.estimatedCostUsd !== undefined ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                "Custo USD estimado na cotacao: ",
                                                                item.decision.action.estimatedCostUsd.toFixed(4),
                                                                ". Nao e taxa realizada."
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                            lineNumber: 82,
                                                            columnNumber: 115
                                                        }, this) : null,
                                                        item.frozen.evidence ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                "Evidencia do brief: ",
                                                                Object.entries(item.frozen.evidence).map(([key, value])=>`${key}=${evidence(value)}`).join("; ")
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                            lineNumber: 83,
                                                            columnNumber: 32
                                                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: "Evidencia detalhada do brief indisponivel."
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                            lineNumber: 83,
                                                            columnNumber: 166
                                                        }, this),
                                                        item.results.fills.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                "Resultado posterior: ",
                                                                item.results.fills.map((fill)=>`ordem ${fill.orderKey}, ${fill.side}, taxa ${fill.walletFeeLamports === null ? "desconhecida" : `${fill.walletFeeLamports} lamports`}`).join("; "),
                                                                ". Taxa isolada nao e custo USD nem retorno liquido."
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                            lineNumber: 84,
                                                            columnNumber: 37
                                                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: "Resultado posterior: nenhum fill vinculado por chave exata foi encontrado nos fatos disponiveis."
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                            lineNumber: 84,
                                                            columnNumber: 305
                                                        }, this),
                                                        [
                                                            ...item.results.action.map((row)=>({
                                                                    ...row,
                                                                    kind: "ação"
                                                                })),
                                                            ...item.results.inaction.map((row)=>({
                                                                    ...row,
                                                                    kind: "inação"
                                                                }))
                                                        ].map((row)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    "Medição posterior ",
                                                                    row.kind,
                                                                    " ",
                                                                    row.window,
                                                                    ": ",
                                                                    windowStatusText[row.status],
                                                                    row.movePct === null ? "" : `, variação ${row.movePct.toFixed(2)}%`,
                                                                    row.reason ? `, motivo ${row.reason}` : "",
                                                                    "."
                                                                ]
                                                            }, `${row.kind}-${row.window}`, true, {
                                                                fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                                lineNumber: 85,
                                                                columnNumber: 157
                                                            }, this)),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Findings, {
                                                            items: item.findings
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                            lineNumber: 86,
                                                            columnNumber: 8
                                                        }, this)
                                                    ]
                                                }, item.candidateId, true, {
                                                    fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                    lineNumber: 75,
                                                    columnNumber: 35
                                                }, this)),
                                            review.itemsTruncated ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                children: "Lista de candidatos limitada pelo contrato de revisao; nao representa todos os itens."
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                                lineNumber: 88,
                                                columnNumber: 32
                                            }, this) : null
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                        lineNumber: 70,
                                        columnNumber: 6
                                    }, this)
                                ]
                            }, review.cycleId, true, {
                                fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                lineNumber: 68,
                                columnNumber: 30
                            }, this)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            style: {
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                justifyContent: "space-between",
                                marginTop: 8
                            },
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    "aria-label": "Ir a primeira pagina de revisoes",
                                    disabled: paging.page <= 1 || onPageChange === undefined,
                                    onClick: ()=>changePage(1),
                                    children: "Mais recentes"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                    lineNumber: 92,
                                    columnNumber: 6
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    "aria-label": "Pagina anterior de revisoes",
                                    disabled: paging.page <= 1 || onPageChange === undefined,
                                    onClick: ()=>changePage(paging.page - 1),
                                    children: "Anterior"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                    lineNumber: 93,
                                    columnNumber: 6
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: [
                                        "Pagina ",
                                        paging.page,
                                        " de ",
                                        paging.totalPages,
                                        "; ciclos ",
                                        firstCycle,
                                        " a ",
                                        lastCycle,
                                        " de ",
                                        paging.total,
                                        "."
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                    lineNumber: 94,
                                    columnNumber: 6
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    "aria-label": "Proxima pagina de revisoes",
                                    disabled: paging.page >= paging.totalPages || onPageChange === undefined,
                                    onClick: ()=>changePage(paging.page + 1),
                                    children: "Proxima"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                    lineNumber: 95,
                                    columnNumber: 6
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    "aria-label": "Ir a ultima pagina de revisoes",
                                    disabled: paging.page >= paging.totalPages || onPageChange === undefined,
                                    onClick: ()=>changePage(paging.totalPages),
                                    children: "Mais antigas"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                                    lineNumber: 96,
                                    columnNumber: 6
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                            lineNumber: 91,
                            columnNumber: 5
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
                    lineNumber: 66,
                    columnNumber: 154
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
            lineNumber: 64,
            columnNumber: 3
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/Hud/CycleReviewPanel.tsx",
        lineNumber: 63,
        columnNumber: 9
    }, this);
}
_c1 = CycleReviewPanel;
var _c, _c1;
__turbopack_context__.k.register(_c, "Findings");
__turbopack_context__.k.register(_c1, "CycleReviewPanel");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/Hud/HudGate.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>HudGate
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * The screen before there is a command centre to show: the core is being read, the core cannot be reached, or the wallet is not connected yet. Same design as the centre; the only thing a person does here is
 * connect a wallet, after reading one notice. The notice and its version are the proof sent with the connection (DISCLOSURE in lib/agent/client.ts).
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent/view.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Hud$2f$HudRain$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/Hud/HudRain.tsx [app-client] (ecmascript)");
"use client";
;
;
;
;
function Ring() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        className: "hud-ring",
        viewBox: "0 0 400 400",
        "aria-hidden": "true",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                cx: "200",
                cy: "200",
                r: "190",
                fill: "none",
                stroke: "#17687f",
                strokeWidth: "1.2",
                strokeDasharray: "2 9",
                className: "spin-f",
                style: {
                    transformOrigin: "200px 200px"
                }
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 27,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "spin-b",
                style: {
                    transformOrigin: "200px 200px"
                },
                fill: "none",
                strokeLinecap: "round",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M200 12A188 188 0 0 1 388 200",
                        stroke: "#2ee6ff",
                        strokeWidth: "3"
                    }, void 0, false, {
                        fileName: "[project]/src/components/Hud/HudGate.tsx",
                        lineNumber: 29,
                        columnNumber: 5
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M200 388A188 188 0 0 1 12 200",
                        stroke: "#2ee6ff",
                        strokeWidth: "3"
                    }, void 0, false, {
                        fileName: "[project]/src/components/Hud/HudGate.tsx",
                        lineNumber: 30,
                        columnNumber: 5
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 28,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                cx: "200",
                cy: "200",
                r: "150",
                fill: "none",
                stroke: "#124c5f",
                strokeWidth: "1.4"
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 32,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                cx: "200",
                cy: "200",
                r: "150",
                fill: "none",
                stroke: "#2ee6ff",
                strokeWidth: "2",
                className: "flow",
                opacity: ".85"
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 33,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "spin-c",
                style: {
                    transformOrigin: "200px 200px"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: "200",
                        cy: "50",
                        r: "5",
                        fill: "#e9fbff"
                    }, void 0, false, {
                        fileName: "[project]/src/components/Hud/HudGate.tsx",
                        lineNumber: 34,
                        columnNumber: 69
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: "200",
                        cy: "350",
                        r: "3.5",
                        fill: "#2ee6ff"
                    }, void 0, false, {
                        fileName: "[project]/src/components/Hud/HudGate.tsx",
                        lineNumber: 34,
                        columnNumber: 117
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 34,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("g", {
                className: "spin-d",
                style: {
                    transformOrigin: "200px 200px"
                },
                fill: "none",
                stroke: "#2ee6ff",
                strokeWidth: "1",
                opacity: ".55",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                    cx: "200",
                    cy: "200",
                    r: "112",
                    strokeDasharray: "3 8"
                }, void 0, false, {
                    fileName: "[project]/src/components/Hud/HudGate.tsx",
                    lineNumber: 35,
                    columnNumber: 128
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 35,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                cx: "200",
                cy: "200",
                r: "76",
                fill: "url(#gateCore)"
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 36,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                cx: "200",
                cy: "200",
                r: "76",
                fill: "none",
                stroke: "#bff6ff",
                strokeWidth: "1.4",
                opacity: ".7"
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 37,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("text", {
                x: "200",
                y: "206",
                textAnchor: "middle",
                className: "t-title",
                style: {
                    fill: "#02222c",
                    fontWeight: 700,
                    fontSize: 14,
                    letterSpacing: ".3em"
                },
                children: "INONU"
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 38,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("defs", {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("radialGradient", {
                    id: "gateCore",
                    cx: "50%",
                    cy: "50%",
                    r: "50%",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("stop", {
                            offset: "0",
                            stopColor: "#bff6ff",
                            stopOpacity: ".95"
                        }, void 0, false, {
                            fileName: "[project]/src/components/Hud/HudGate.tsx",
                            lineNumber: 41,
                            columnNumber: 6
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("stop", {
                            offset: ".45",
                            stopColor: "#2ee6ff",
                            stopOpacity: ".55"
                        }, void 0, false, {
                            fileName: "[project]/src/components/Hud/HudGate.tsx",
                            lineNumber: 42,
                            columnNumber: 6
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("stop", {
                            offset: "1",
                            stopColor: "#03202b",
                            stopOpacity: ".9"
                        }, void 0, false, {
                            fileName: "[project]/src/components/Hud/HudGate.tsx",
                            lineNumber: 43,
                            columnNumber: 6
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/Hud/HudGate.tsx",
                    lineNumber: 40,
                    columnNumber: 5
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 39,
                columnNumber: 4
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/Hud/HudGate.tsx",
        lineNumber: 26,
        columnNumber: 3
    }, this);
}
_c = Ring;
function HudGate(props) {
    const headline = props.kind === "loading" ? "LENDO O ESTADO DO AGENTE" : props.kind === "error" ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["reasonText"])(props.error).toUpperCase() : props.readOnly ? "AGENTE DESCONECTADO. NENHUMA ACAO DISPONIVEL." : "CONECTE A CARTEIRA. O RESTO E COM O INONU.";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "hud-root hud-gate",
        "aria-label": "Inonu Trader",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Hud$2f$HudRain$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 55,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Ring, {}, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 56,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "hud-gate-brand",
                children: "INONU TRADER"
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 57,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                className: "hud-gate-headline",
                children: headline
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 58,
                columnNumber: 4
            }, this),
            props.readOnly ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "hud-readonly-banner",
                role: "status",
                children: "Modo dev somente leitura. Status e análise são exibidos sem ações no agente."
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 59,
                columnNumber: 22
            }, this) : null,
            props.kind === "disconnected" && !props.readOnly ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "hud-gate-lead",
                        children: "O Inonu le todos os seus criptoativos, rastreia o mercado da OKX atras das melhores oportunidades e decide sozinho o que manter, comprar e vender para fazer o capital crescer, com stop e alvo em cada operacao."
                    }, void 0, false, {
                        fileName: "[project]/src/components/Hud/HudGate.tsx",
                        lineNumber: 62,
                        columnNumber: 6
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        className: "hud-cta",
                        disabled: props.busy,
                        onClick: props.onConnect,
                        children: "CONECTAR CARTEIRA"
                    }, void 0, false, {
                        fileName: "[project]/src/components/Hud/HudGate.tsx",
                        lineNumber: 63,
                        columnNumber: 6
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 61,
                columnNumber: 5
            }, this) : null,
            props.kind === "error" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "hud-gate-lead",
                children: "Confira se o servidor do agente esta no ar. Quando ele responder, esta tela se atualiza sozinha."
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 66,
                columnNumber: 30
            }, this) : null,
            props.notice !== null ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: `hud-gate-notice ${props.notice.tone === "bad" ? "bad" : "ok"}`,
                role: "status",
                children: props.notice.text
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 67,
                columnNumber: 29
            }, this) : null,
            !props.readOnly && props.noticeOpen ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "hud-modal-scrim",
                role: "presentation",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "hud-modal",
                    role: "dialog",
                    "aria-modal": "true",
                    "aria-labelledby": "hud-notice-title",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                            id: "hud-notice-title",
                            children: "VOCE VAI ENTREGAR A GESTAO AO INONU"
                        }, void 0, false, {
                            fileName: "[project]/src/components/Hud/HudGate.tsx",
                            lineNumber: 71,
                            columnNumber: 7
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            children: "Ao conectar a carteira, todas as decisoes e todas as configuracoes passam a ser do agente: o gerenciamento de risco, o gerenciamento do capital, o crescimento do capital, a alavancagem, quando ele julgar que compensa e houver instrumento para isso, e a escolha do que comprar e do que vender."
                        }, void 0, false, {
                            fileName: "[project]/src/components/Hud/HudGate.tsx",
                            lineNumber: 72,
                            columnNumber: 7
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            children: "O agente trabalha sozinho, 24 horas por dia, e nao pede confirmacao. Voce nao configura nada e nao aprova nenhuma ordem."
                        }, void 0, false, {
                            fileName: "[project]/src/components/Hud/HudGate.tsx",
                            lineNumber: 73,
                            columnNumber: 7
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            children: "Para operar, ele instala o programa oficial da OKX e usa uma carteira propria, com a chave guardada no cofre da OKX. Ele so negocia o saldo que estiver nessa carteira, dentro dos limites que voce definir na sua conta OKX."
                        }, void 0, false, {
                            fileName: "[project]/src/components/Hud/HudGate.tsx",
                            lineNumber: 74,
                            columnNumber: 7
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "warn",
                            children: "Mercado envolve risco de perder capital. Ninguem garante lucro, e o agente tambem erra. Voce pode desconectar a qualquer momento."
                        }, void 0, false, {
                            fileName: "[project]/src/components/Hud/HudGate.tsx",
                            lineNumber: 75,
                            columnNumber: 7
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "hud-modal-actions",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "hud-cta",
                                    disabled: props.busy,
                                    onClick: props.onAccept,
                                    children: "ENTENDO E CONECTO A CARTEIRA"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/Hud/HudGate.tsx",
                                    lineNumber: 77,
                                    columnNumber: 8
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    className: "hud-cta quiet",
                                    onClick: props.onCancel,
                                    children: "CANCELAR"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/Hud/HudGate.tsx",
                                    lineNumber: 78,
                                    columnNumber: 8
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/Hud/HudGate.tsx",
                            lineNumber: 76,
                            columnNumber: 7
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/Hud/HudGate.tsx",
                    lineNumber: 70,
                    columnNumber: 6
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudGate.tsx",
                lineNumber: 69,
                columnNumber: 5
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/Hud/HudGate.tsx",
        lineNumber: 54,
        columnNumber: 3
    }, this);
}
_c1 = HudGate;
var _c, _c1;
__turbopack_context__.k.register(_c, "Ring");
__turbopack_context__.k.register(_c1, "HudGate");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/Hud/HudRain.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>HudRain
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/** The quiet rain behind the command centre (lib/hud/rain.ts). Decorative: hidden from assistive technology, no pointer, and off for a person who asked the system for less motion (hud.css). */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$rain$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/rain.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
function HudRain() {
    _s();
    const [width, setWidth] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "HudRain.useEffect": ()=>{
            const on = {
                "HudRain.useEffect.on": ()=>setWidth(window.innerWidth)
            }["HudRain.useEffect.on"];
            on();
            window.addEventListener("resize", on);
            return ({
                "HudRain.useEffect": ()=>window.removeEventListener("resize", on)
            })["HudRain.useEffect"];
        }
    }["HudRain.useEffect"], []);
    const count = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$rain$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["rainColumnCount"])(width);
    // a column is made from its own index: a wider window only adds columns, the ones on screen are left as they are
    const columns = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "HudRain.useMemo[columns]": ()=>Array.from({
                length: count
            }, {
                "HudRain.useMemo[columns]": (_, i)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$rain$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["rainColumn"])(i)
            }["HudRain.useMemo[columns]"])
    }["HudRain.useMemo[columns]"], [
        count
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "hud-rain",
        "aria-hidden": "true",
        children: columns.map((c, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "hud-rain-col",
                style: {
                    left: c.x,
                    fontSize: c.sizePx,
                    "--d": `${c.durationS}s`,
                    "--delay": `${c.delayS}s`,
                    "--o": c.opacity
                },
                children: c.glyphs
            }, i, false, {
                fileName: "[project]/src/components/Hud/HudRain.tsx",
                lineNumber: 21,
                columnNumber: 9
            }, this))
    }, void 0, false, {
        fileName: "[project]/src/components/Hud/HudRain.tsx",
        lineNumber: 19,
        columnNumber: 5
    }, this);
}
_s(HudRain, "14SQ6WiT8EAn5hxyf+ZccARDFvw=");
_c = HudRain;
var _c;
__turbopack_context__.k.register(_c, "HudRain");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/Hud/HudView.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>HudView,
    "openHttps",
    ()=>openHttps
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * The command centre of the agent: the Inonu at the centre of a screen that needs no scrolling, every instrument around it, six tabs. The drawing is an SVG string made by pure functions (lib/hud/draw); this
 * component only chooses the tab and the shape, puts the string on screen, runs the parts that follow the clock (lib/hud/live) and turns a click on a drawn button into an action for the page that owns the connection.
 * It reads and decides nothing: the numbers are the core's. The things a person can do (look now, stop, say what became of an order, take the step of the wallet) live in the Sistema tab, in the same drawing.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/layout.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$scene$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/scene.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$live$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/live.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$model$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/model.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$morph$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/morph.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Hud$2f$HudRain$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/Hud/HudRain.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Hud$2f$CycleReviewPanel$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/Hud/CycleReviewPanel.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
;
;
;
const SVG_NS = "http://www.w3.org/2000/svg";
const ROTATE_MS = 6_500;
const CLOCK_MS = 250;
const hashTab = ()=>{
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const h = window.location.hash.replace("#", "");
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$scene$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["isTab"])(h) ? h : "comando";
};
/** The size of the window the screen is drawn for; a server render (no window) is a full screen, as always. */ const viewNow = ()=>("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : {
        w: window.innerWidth,
        h: Math.max(1, window.innerHeight)
    };
function openHttps(raw) {
    try {
        const url = new URL(decodeURIComponent(raw));
        if (url.protocol !== "https:") return false;
        window.open(url.toString(), "_blank", "noopener,noreferrer");
        return true;
    } catch  {
        return false;
    }
}
function HudView({ status, analysis, nowMs, busy, notice, onAction, onReviewPageChange, walletPollFailed = false, readOnly = false }) {
    _s();
    const [tab, setTab] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(hashTab);
    const [view, setView] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(viewNow);
    const [reduce, setReduce] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [confirmStop, setConfirmStop] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const svgRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const rootRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const select = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    const ui = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "HudView.useMemo[ui]": ()=>({
                busy,
                notice,
                confirmStop,
                walletPollFailed
            })
    }["HudView.useMemo[ui]"], [
        busy,
        notice,
        confirmStop,
        walletPollFailed
    ]);
    const model = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "HudView.useMemo[model]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$model$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildHudModel"])(status, analysis, nowMs, ui)
    }["HudView.useMemo[model]"], [
        status,
        analysis,
        nowMs,
        ui
    ]);
    const modelRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(model);
    modelRef.current = model;
    // the shape follows the size of the window: the stage where it can be read, otherwise a board of columns or one narrow column (draw/layout.ts)
    const layout = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "HudView.useMemo[layout]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pickLayout"])(view.w, view.h)
    }["HudView.useMemo[layout]"], [
        view.w,
        view.h
    ]);
    const aspect = view.w / Math.max(1, view.h);
    const scene = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "HudView.useMemo[scene]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$scene$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["buildScene"])(model, tab, aspect, layout)
    }["HudView.useMemo[scene]"], [
        model,
        tab,
        aspect,
        layout
    ]);
    // the shape of the screen, measured again whenever the window is resized or turned (after the person stops: a drag fires many)
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "HudView.useEffect": ()=>{
            let timer;
            const onResize = {
                "HudView.useEffect.onResize": ()=>{
                    clearTimeout(timer);
                    timer = setTimeout({
                        "HudView.useEffect.onResize": ()=>setView({
                                "HudView.useEffect.onResize": (was)=>{
                                    const now = viewNow();
                                    return was.w === now.w && was.h === now.h ? was : now;
                                }
                            }["HudView.useEffect.onResize"])
                    }["HudView.useEffect.onResize"], 100);
                }
            }["HudView.useEffect.onResize"];
            // the first measure is taken here too: the window may not have the size it had when the state was made (a pane that was opened, a screen that was rotated)
            onResize();
            window.addEventListener("resize", onResize);
            window.addEventListener("orientationchange", onResize);
            return ({
                "HudView.useEffect": ()=>{
                    clearTimeout(timer);
                    window.removeEventListener("resize", onResize);
                    window.removeEventListener("orientationchange", onResize);
                }
            })["HudView.useEffect"];
        }
    }["HudView.useEffect"], []);
    // the stage is the whole screen at once: while it is on, the page itself has no scrollbar, and what the page had is restored when the board or the column takes over
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "HudView.useEffect": ()=>{
            if (scene.tall) return;
            const html = document.documentElement, body = document.body;
            const before = {
                html: html.style.overflow,
                body: body.style.overflow
            };
            html.style.overflow = "hidden";
            body.style.overflow = "hidden";
            return ({
                "HudView.useEffect": ()=>{
                    html.style.overflow = before.html;
                    body.style.overflow = before.body;
                }
            })["HudView.useEffect"];
        }
    }["HudView.useEffect"], [
        scene.tall
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "HudView.useEffect": ()=>{
            const query = window.matchMedia("(prefers-reduced-motion: reduce)");
            setReduce(query.matches);
            const on = {
                "HudView.useEffect.on": ()=>setReduce(query.matches)
            }["HudView.useEffect.on"];
            query.addEventListener("change", on);
            return ({
                "HudView.useEffect": ()=>query.removeEventListener("change", on)
            })["HudView.useEffect"];
        }
    }["HudView.useEffect"], []);
    /** In a scene that scrolls, the tabs keep to the top of the window: the group is moved by how far the page has gone, and its plate shows once it has left its own place. */ const syncSticky = ()=>{
        const root = rootRef.current, svg = svgRef.current;
        if (root === null || svg === null) return;
        const head = svg.querySelector(".sticky-head");
        const unit = svg.getBoundingClientRect().width / Math.max(1, svg.viewBox.baseVal.width);
        const off = head === null ? 0 : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stickyOffset"])(root.scrollTop, unit, Number(head.getAttribute("data-top")));
        if (head !== null) head.style.transform = off > 0 ? `translateY(${off.toFixed(1)}px)` : "";
        svg.classList.toggle("stuck", off > 0);
    };
    const go = (next)=>{
        if (next === tab) return;
        setTab(next);
        rootRef.current?.scrollTo({
            top: 0
        });
        setConfirmStop(false);
        try {
            window.history.replaceState(null, "", "#" + next);
        } catch  {}
    };
    // keys: 1 to 6 change the tab
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "HudView.useEffect": ()=>{
            const onKey = {
                "HudView.useEffect.onKey": (e)=>{
                    if (e.ctrlKey || e.metaKey || e.altKey) return;
                    const i = Number(e.key) - 1;
                    if (Number.isInteger(i) && i >= 0 && i < __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$scene$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["TABS"].length) go(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$scene$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["TABS"][i][0]);
                }
            }["HudView.useEffect.onKey"];
            window.addEventListener("keydown", onKey);
            return ({
                "HudView.useEffect": ()=>window.removeEventListener("keydown", onKey)
            })["HudView.useEffect"];
        }
    }["HudView.useEffect"], [
        tab
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "HudView.useEffect": ()=>{
            const label = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$scene$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["TABS"].find({
                "HudView.useEffect": (t)=>t[0] === tab
            }["HudView.useEffect"])?.[1] ?? "";
            const before = document.title;
            document.title = `Inonu Trader, ${label.toLowerCase()}`;
            return ({
                "HudView.useEffect": ()=>{
                    document.title = before;
                }
            })["HudView.useEffect"];
        }
    }["HudView.useEffect"], [
        tab
    ]);
    // The drawing goes on screen whole only when the PAGE changes (the first one, another tab, the column of a narrow screen against the stage of a wide one): then the entrance plays, and the numbers count up once. When
    // the core answers again with new data the elements that are the same stay the same element and only what changed is written, so nothing that moves (the rings, the flows) starts over and nothing sweeps the screen.
    const pageKey = `${tab}|${scene.key}`;
    const shown = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])("");
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "HudView.useEffect": ()=>{
            const svg = svgRef.current;
            if (svg === null) return;
            const entering = shown.current !== pageKey;
            if (entering) {
                svg.innerHTML = scene.html;
                shown.current = pageKey;
            } else {
                const next = document.createElementNS(SVG_NS, "svg");
                next.innerHTML = scene.html;
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$morph$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["morphChildren"])(svg, next);
            }
            // what follows the clock and the selection is written again over what the template holds
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$live$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tickLive"])(svg, modelRef.current, Date.now());
            syncSticky();
            const order = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$live$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["withFacets"])(modelRef.current);
            if (order.length > 0) (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$live$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["showCandidate"])(svg, modelRef.current, order[select.current % order.length]);
            if (reduce) {
                svg.pauseAnimations?.();
                return;
            }
            return entering ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$live$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["startCountUp"])(svg) : undefined;
        }
    }["HudView.useEffect"], [
        scene.html,
        pageKey,
        reduce
    ]);
    // the clock and the countdown follow the time, not the data
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "HudView.useEffect": ()=>{
            const timer = setInterval({
                "HudView.useEffect.timer": ()=>{
                    if (svgRef.current !== null) (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$live$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tickLive"])(svgRef.current, modelRef.current, Date.now());
                }
            }["HudView.useEffect.timer"], CLOCK_MS);
            return ({
                "HudView.useEffect": ()=>clearInterval(timer)
            })["HudView.useEffect"];
        }
    }["HudView.useEffect"], []);
    // the flower of facets shows one candidate after the other
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "HudView.useEffect": ()=>{
            if (reduce) return;
            const timer = setInterval({
                "HudView.useEffect.timer": ()=>{
                    const svg = svgRef.current;
                    const order = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$live$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["withFacets"])(modelRef.current);
                    if (svg === null || order.length < 2) return;
                    select.current = (select.current + 1) % order.length;
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$live$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["showCandidate"])(svg, modelRef.current, order[select.current]);
                }
            }["HudView.useEffect.timer"], ROTATE_MS);
            return ({
                "HudView.useEffect": ()=>clearInterval(timer)
            })["HudView.useEffect"];
        }
    }["HudView.useEffect"], [
        reduce
    ]);
    /** A drawn button was pressed (by click, Enter or Space): what it asks, if the page allows it now. */ const press = (el)=>{
        const act = el.getAttribute("data-action");
        if (act === null || el.getAttribute("aria-disabled") === "true") return;
        if (readOnly) return;
        switch(act){
            case "stop":
                setConfirmStop(true);
                break;
            case "stop-cancel":
                setConfirmStop(false);
                break;
            case "stop-confirm":
                setConfirmStop(false);
                onAction({
                    kind: "stop"
                });
                break;
            case "settings":
                onAction({
                    kind: "settings"
                });
                break;
            case "wallet":
                {
                    const step = el.getAttribute("data-step");
                    if (step === "install" || step === "login") onAction({
                        kind: "wallet",
                        step
                    });
                    break;
                }
            case "resolve":
                {
                    const key = el.getAttribute("data-key"), outcome = el.getAttribute("data-outcome");
                    if (key !== null && (outcome === "executada" || outcome === "falhou")) onAction({
                        kind: "resolve",
                        key,
                        outcome
                    });
                    break;
                }
            case "open":
                {
                    const url = el.getAttribute("data-url");
                    if (url !== null) openHttps(url);
                    break;
                }
        }
    };
    const onClick = (e)=>{
        const target = e.target;
        const tabEl = target.closest("[data-tab]");
        if (tabEl !== null) {
            const k = tabEl.getAttribute("data-tab");
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$scene$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["isTab"])(k)) go(k);
            return;
        }
        const button = target.closest("[data-action], .btn");
        if (button !== null) {
            press(button);
            return;
        }
        const blip = target.closest(".blip");
        if (blip !== null) {
            const i = Number(blip.getAttribute("data-i"));
            const order = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$live$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["withFacets"])(modelRef.current);
            const k = order.indexOf(i);
            if (k >= 0 && svgRef.current !== null) {
                select.current = k;
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$live$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["showCandidate"])(svgRef.current, modelRef.current, i);
            }
        }
    };
    const onKeyDown = (e)=>{
        const target = e.target;
        const tabEl = target.closest("[data-tab]");
        if (tabEl !== null) {
            const k = tabEl.getAttribute("data-tab");
            if ((e.key === "Enter" || e.key === " ") && (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$scene$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["isTab"])(k)) {
                e.preventDefault();
                go(k);
            } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                const items = Array.from(e.currentTarget.querySelectorAll("[data-tab]"));
                const at = items.indexOf(tabEl);
                items[(at + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length]?.focus();
            }
            return;
        }
        const button = target.closest("[data-action]");
        if (button !== null && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            press(button);
        }
    };
    const waiting = model.system.inFlight.filter((o)=>o.needsWord).length;
    const stopped = model.agent.cycling ? "" : " O agente esta parado: so acompanhamento, nenhuma ordem sai.";
    const money = model.wallet.total === null ? "Carteira gerida sem leitura" : `Carteira gerida US$ ${model.wallet.total.toFixed(2)}, caixa ${model.wallet.cash === null ? "sem leitura" : "US$ " + model.wallet.cash.toFixed(2)}`;
    const summary = `${money}.${stopped} ${model.candidates.length} candidatos na ultima consulta, ${model.events.length} ordens recentes.${waiting > 0 ? ` ${waiting} ordem aguarda a sua palavra na aba Sistema.` : ""}`;
    const walletStatus = ui.walletPollFailed && model.wallet.quality === "unavailable" ? "A ultima consulta de status falhou; nao ha leitura bem-sucedida da carteira gerida." : ui.walletPollFailed ? `A ultima consulta de status falhou; valores exibidos mantidos da observacao ${model.wallet.observedAtMs === null ? "indisponivel" : new Date(model.wallet.observedAtMs).toLocaleTimeString()}.` : model.wallet.quality === "current" ? null : model.wallet.quality === "partial" ? `Leitura parcial: ${model.wallet.unpriced} posicao(oes) gerida(s) sem preco${model.wallet.observedAtMs === null ? "" : `; observada em ${new Date(model.wallet.observedAtMs).toLocaleTimeString()}`}.` : model.wallet.quality === "stale" ? `Leitura antiga da carteira gerida${model.wallet.observedAtMs === null ? "" : `; ultima observacao em ${new Date(model.wallet.observedAtMs).toLocaleTimeString()}`}.` : "Carteira gerida indisponivel: ainda nao ha leitura bem-sucedida.";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        ref: rootRef,
        className: `hud-root${scene.tall ? " hud-tall" : ""}`,
        "aria-label": "Painel do agente",
        onScroll: syncSticky,
        children: [
            readOnly ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "hud-readonly-banner",
                role: "status",
                children: "Modo dev somente leitura. Navegação local entre abas e dados é permitida; ações do agente e da carteira estão bloqueadas."
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudView.tsx",
                lineNumber: 278,
                columnNumber: 16
            }, this) : null,
            walletStatus === null ? null : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "hud-wallet-status",
                role: "status",
                children: walletStatus
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudView.tsx",
                lineNumber: 279,
                columnNumber: 36
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Hud$2f$HudRain$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                fileName: "[project]/src/components/Hud/HudView.tsx",
                lineNumber: 280,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                className: "hud-sr",
                children: "Inonu Trader, agente autonomo de carteira"
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudView.tsx",
                lineNumber: 281,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "hud-sr",
                "aria-live": "polite",
                children: summary
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudView.tsx",
                lineNumber: 282,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                ref: svgRef,
                className: "hud-svg",
                xmlns: "http://www.w3.org/2000/svg",
                viewBox: `0 0 ${scene.width.toFixed(2)} ${scene.height.toFixed(2)}`,
                preserveAspectRatio: "xMidYMid meet",
                role: "group",
                "aria-label": "Painel do agente",
                onClick: onClick,
                onKeyDown: onKeyDown
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudView.tsx",
                lineNumber: 283,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Hud$2f$CycleReviewPanel$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                reviews: analysis?.cycleReviews ?? [],
                pageInfo: analysis?.cycleReviewPage ?? {
                    page: 1,
                    pageSize: 12,
                    total: 0,
                    totalPages: 1
                },
                onPageChange: onReviewPageChange
            }, void 0, false, {
                fileName: "[project]/src/components/Hud/HudView.tsx",
                lineNumber: 294,
                columnNumber: 4
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/Hud/HudView.tsx",
        lineNumber: 277,
        columnNumber: 3
    }, this);
}
_s(HudView, "fkHME3DdgB5rG9t+ld1DOoKZV9Y=");
_c = HudView;
var _c;
__turbopack_context__.k.register(_c, "HudView");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/agent/analysis-poll.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "requestAnalysis",
    ()=>requestAnalysis
]);
function requestAnalysis(active, page, generation, read, isCurrent, apply) {
    const pending = active.current;
    if (pending?.page === page && pending.generation === generation) return pending.promise;
    const promise = read(page).then((result)=>{
        if (isCurrent(page, generation)) apply(result);
    });
    const request = {
        page,
        generation,
        promise
    };
    active.current = request;
    const clear = ()=>{
        if (active.current === request) active.current = null;
    };
    void promise.then(clear, clear);
    return promise;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/agent/client.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DISCLOSURE",
    ()=>DISCLOSURE,
    "createAgentClient",
    ()=>createAgentClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
/**
 * The screen's client of the autonomous agent (src/agent/http.ts). Every write carries the intent header that says a person acted; every failure is a NAMED outcome so the screen can say what happened and
 * never throws. The base is the core's own origin (empty in the installed app, the development core in dev). The person does one thing here: connect (and, if they wish, disconnect).
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/parse-analysis.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$parse$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent/parse.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$dev$2d$status$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent/dev-status.ts [app-client] (ecmascript)");
;
;
;
const DISCLOSURE = "2026-10-14.1";
const intent = {
    "x-inonu-intent": "user"
};
const JSON_HEADERS = {
    "content-type": "application/json",
    ...intent
};
const isRec = (v)=>v !== null && typeof v === "object" && !Array.isArray(v);
async function failureOf(res, body) {
    if (res === null) return {
        ok: false,
        reason: "sem_conexao"
    };
    if (isRec(body) && typeof body.code === "string" && /^[a-z_]{1,50}$/.test(body.code)) return {
        ok: false,
        reason: body.code
    };
    if (res.status === 404) return {
        ok: false,
        reason: "servidor_sem_rota"
    };
    if (res.status === 403) return {
        ok: false,
        reason: "origem_negada"
    };
    return {
        ok: false,
        reason: "servidor_com_erro"
    };
}
function createAgentClient(base = ("TURBOPACK compile-time value", "http://127.0.0.1:3000") ?? "", fetchImpl = (url, init)=>fetch(url, init), development = ("TURBOPACK compile-time value", "0") === "1") {
    const readBase = development ? "/api/dev-agent" : base;
    async function call(method, path, body) {
        if (development && method !== "GET") return {
            res: null,
            json: null
        };
        let res;
        try {
            res = await fetchImpl(`${readBase}${path}`, {
                method,
                headers: method === "GET" ? {} : JSON_HEADERS,
                ...body === undefined ? {} : {
                    body: JSON.stringify(body)
                },
                cache: "no-store"
            });
        } catch  {
            return {
                res: null,
                json: null
            };
        }
        const json = await res.json().catch(()=>null);
        return {
            res,
            json
        };
    }
    const done = (res, json)=>res !== null && res.ok && isRec(json) && json.ok === true;
    const readOnlyFailure = {
        ok: false,
        reason: "dev_somente_leitura"
    };
    return {
        async status () {
            const { res, json } = await call("GET", "/agent/status");
            if (res === null) return failureOf(null, null);
            const status = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$parse$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["parseStatus"])(json);
            if (status !== null) return {
                ok: true,
                status
            };
            return res.ok ? {
                ok: false,
                reason: "resposta_invalida"
            } : failureOf(res, json);
        },
        /** A narrow in-memory projection for the local development review panel. */ async devStatus () {
            const { res, json } = await call("GET", "/agent/dev-status");
            if (res === null) return failureOf(null, null);
            const status = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$dev$2d$status$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["parseDevStatus"])(json);
            if (status !== null) return {
                ok: true,
                status
            };
            return res.ok ? {
                ok: false,
                reason: "resposta_invalida"
            } : failureOf(res, json);
        },
        /** The study of the decisions (src/agent/analysis.ts), for the command centre. An older core has no such route: that is a named failure and the screen says it has no analysis. */ async analysis (reviewPage = 1) {
            const { res, json } = await call("GET", `/agent/analysis?reviewPage=${reviewPage}`);
            if (res === null) return failureOf(null, null);
            const parsed = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["parseAnalysis"])(json);
            if (parsed !== null) {
                if (parsed.cycleReviewPage !== undefined) return {
                    ok: true,
                    analysis: parsed
                };
                const reviews = parsed.cycleReviews ?? [];
                const total = reviews.length, pageSize = 12, totalPages = Math.max(1, Math.ceil(total / pageSize));
                const page = Math.min(reviewPage, totalPages), end = total - (page - 1) * pageSize;
                return {
                    ok: true,
                    analysis: {
                        ...parsed,
                        cycleReviews: reviews.slice(Math.max(0, end - pageSize), end),
                        cycleReviewPage: {
                            page,
                            pageSize,
                            total,
                            totalPages
                        }
                    }
                };
            }
            return res.ok ? {
                ok: false,
                reason: "resposta_invalida"
            } : failureOf(res, json);
        },
        /** The one authorization: connecting, with the version of the notice the person read. */ async connect (input = {}) {
            if (development) return readOnlyFailure;
            const { res, json } = await call("POST", "/agent/connect", {
                disclosure: DISCLOSURE,
                ...input.managed === undefined ? {} : {
                    managed: input.managed
                }
            });
            return done(res, json) ? {
                ok: true
            } : failureOf(res, json);
        },
        async disconnect () {
            if (development) return readOnlyFailure;
            const { res, json } = await call("POST", "/agent/disconnect", {});
            return done(res, json) ? {
                ok: true
            } : failureOf(res, json);
        },
        /** Connecting the wallet the agent trades from: install the tool, start the sign-in on OKX's page, look whether it is done. */ async wallet (action) {
            if (development) return readOnlyFailure;
            const { res, json } = await call("POST", "/agent/wallet", {
                action
            });
            return done(res, json) ? {
                ok: true
            } : failureOf(res, json);
        },
        /** The person's word on an order that was sent without an answer, after looking at the wallet's own history. */ async resolve (orderKey, outcome) {
            if (development) return readOnlyFailure;
            const { res, json } = await call("POST", "/agent/resolve", {
                orderKey,
                outcome
            });
            return done(res, json) ? {
                ok: true
            } : failureOf(res, json);
        }
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/agent/dev-status-poll.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "devStatusPollFailed",
    ()=>devStatusPollFailed,
    "devStatusPollSucceeded",
    ()=>devStatusPollSucceeded
]);
const devStatusPollSucceeded = (status)=>({
        status,
        unavailable: false
    });
const devStatusPollFailed = (previous)=>({
        status: previous.status,
        unavailable: true
    });
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/agent/dev-status.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "parseDevStatus",
    ()=>parseDevStatus
]);
const rec = (value)=>value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
const finite = (value)=>typeof value === "number" && Number.isFinite(value);
const nullableFinite = (value)=>value === null || finite(value);
const exactKeys = (value, keys)=>Object.keys(value).length === keys.length && keys.every((key)=>Object.hasOwn(value, key));
const BOOK_QUALITIES = [
    "current",
    "partial",
    "stale",
    "unavailable"
];
const STATUS_KEYS = [
    "atMs",
    "connected",
    "book"
];
const BOOK_KEYS = [
    "atMs",
    "observedAtMs",
    "quality",
    "totalUsd",
    "agentUsd",
    "cashUsd"
];
function parseDevStatus(body) {
    const envelope = rec(body);
    const status = envelope?.ok === true ? rec(envelope.status) : null;
    if (status === null || !exactKeys(status, STATUS_KEYS) || !finite(status.atMs) || typeof status.connected !== "boolean") return null;
    if (status.book === null) return {
        atMs: status.atMs,
        connected: status.connected,
        book: null
    };
    const book = rec(status.book);
    if (book === null || !exactKeys(book, BOOK_KEYS) || !finite(book.atMs) || !nullableFinite(book.observedAtMs) || typeof book.quality !== "string" || !BOOK_QUALITIES.includes(book.quality) || !nullableFinite(book.totalUsd) || !nullableFinite(book.agentUsd) || !nullableFinite(book.cashUsd)) return null;
    return {
        atMs: status.atMs,
        connected: status.connected,
        book: {
            atMs: book.atMs,
            observedAtMs: book.observedAtMs,
            quality: book.quality,
            totalUsd: book.totalUsd,
            agentUsd: book.agentUsd,
            cashUsd: book.cashUsd
        }
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/agent/parse.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "parseStatus",
    ()=>parseStatus
]);
/**
 * Reads `GET /agent/status` strictly. A body that is not what the core promises is no status: the screen then says the core did not answer, instead of drawing a half-filled agent. Inside a good status,
 * a piece the screen can live without (the book, the context, the last cycle) is null when it is not well formed, and never invented.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent/types.ts [app-client] (ecmascript)");
;
const rec = (v)=>v !== null && typeof v === "object" && !Array.isArray(v) ? v : null;
const num = (v)=>typeof v === "number" && Number.isFinite(v) ? v : null;
const text = (v, max = 400)=>typeof v === "string" && v.length <= max ? v : null;
const arr = (v)=>Array.isArray(v) ? v : [];
const MODES = [
    "desligado",
    "sombra",
    "limitado"
];
const isMode = (v)=>typeof v === "string" && MODES.includes(v);
const STAGES = [
    "preparada",
    "enviando",
    "executada",
    "falhou",
    "incerta"
];
const isStage = (v)=>typeof v === "string" && STAGES.includes(v);
const ADDRESS = /^[A-Za-z0-9]{20,80}$/;
function strings(v, max = 40) {
    return arr(v).filter((x)=>typeof x === "string" && x.length <= 200).slice(0, max);
}
function parseOrder(v) {
    const o = rec(v);
    if (o === null) return null;
    const usd = num(o.usd);
    const side = o.side === "buy" || o.side === "sell" ? o.side : null;
    const wallet = o.wallet === "agente" || o.wallet === "principal" ? o.wallet : null;
    const [candidateId, stance, chainIndex, symbol, address] = [
        text(o.candidateId),
        text(o.stance),
        text(o.chainIndex),
        text(o.symbol),
        text(o.address)
    ];
    if (usd === null || side === null || wallet === null || candidateId === null || stance === null || chainIndex === null || symbol === null || address === null) return null;
    return {
        candidateId,
        side,
        stance,
        chainIndex,
        symbol,
        address,
        usd,
        wallet,
        profile: text(o.profile),
        source: o.source === "protecao" ? "protecao" : "modelo"
    };
}
function parseOutcome(v) {
    const o = rec(v);
    const order = parseOrder(o?.order);
    if (o === null || order === null || !isStage(o.stage)) return null;
    return {
        order,
        stage: o.stage,
        ref: text(o.ref),
        reason: text(o.reason)
    };
}
function parseView(v) {
    const o = rec(v);
    const [id, symbol, chainIndex] = [
        text(o?.id, 300),
        text(o?.symbol, 40),
        text(o?.chainIndex, 20)
    ];
    if (o === null || id === null || symbol === null || chainIndex === null || o.kind !== "holding" && o.kind !== "buy") return null;
    return {
        id,
        kind: o.kind,
        symbol,
        chainIndex,
        stance: text(o.stance, 40),
        families: strings(o.families, 6),
        marks: strings(o.marks, 6),
        closed: text(o.closed, 30),
        probs: unitMap(o.probs),
        facets: unitMap(o.facets)
    };
}
/** A map of names to numbers between 0 and 1 (probabilities), at most a dozen entries; null when it is not one. */ function unitMap(v) {
    const o = rec(v);
    if (o === null) return null;
    const out = {};
    for (const [k, val] of Object.entries(o).slice(0, 12)){
        if (!/^[a-z_]{1,24}$/.test(k) || typeof val !== "number" || !Number.isFinite(val) || val < 0 || val > 1) return null;
        out[k] = val;
    }
    return Object.keys(out).length === 0 ? null : out;
}
/** How many purchases each level of risk would open: whole numbers by level; null when absent. */ function unitCounts(v) {
    const o = rec(v);
    if (o === null) return null;
    const out = {};
    for (const [k, val] of Object.entries(o).slice(0, 6))if (/^[a-z_]{1,24}$/.test(k) && typeof val === "number" && Number.isInteger(val) && val >= 0 && val <= 1000) out[k] = val;
    return Object.keys(out).length === 0 ? null : out;
}
function parsePerformance(v) {
    const o = rec(v);
    const series = [];
    for (const raw of arr(o?.series).slice(-200)){
        const p = rec(raw);
        const [t, value] = [
            num(p?.t),
            num(p?.v)
        ];
        if (t !== null && value !== null && value >= 0) series.push({
            t,
            v: value
        });
    }
    const record = {};
    for (const [k, raw] of Object.entries(rec(o?.record) ?? {}).slice(0, 12)){
        const r = rec(raw);
        const n = num(r?.n);
        if (/^[a-z_]{1,24}$/.test(k) && n !== null) record[k] = {
            n,
            acerto: num(r?.acerto)
        };
    }
    return {
        series,
        record
    };
}
function parseCycle(v) {
    const o = rec(v);
    if (o === null) return null;
    const outcome = o.outcome === "mantido" || o.outcome === "decidido" || o.outcome === "bloqueado" || o.outcome === "erro" ? o.outcome : null;
    const [cycleId, atMs, durationMs] = [
        text(o.cycleId, 80),
        num(o.atMs),
        num(o.durationMs)
    ];
    if (outcome === null || cycleId === null || atMs === null || durationMs === null || !isMode(o.mode)) return null;
    const considered = rec(o.considered);
    const stances = {};
    for (const [k, val] of Object.entries(rec(o.stances) ?? {}))if (typeof val === "string" && k.length <= 300) stances[k] = val;
    return {
        cycleId,
        atMs,
        durationMs,
        mode: o.mode,
        outcome,
        reason: text(o.reason),
        consulted: o.consulted === true,
        modelo: text(o.modelo, 80),
        posture: o.posture === "defensiva" || o.posture === "neutra" || o.posture === "ofensiva" ? o.posture : null,
        stances,
        orders: arr(o.orders).map(parseOutcome).filter((x)=>x !== null),
        dropped: arr(o.dropped).flatMap((d)=>{
            const r = rec(d);
            const id = text(r?.candidateId);
            const reason = text(r?.reason);
            return id !== null && reason !== null ? [
                {
                    candidateId: id,
                    reason
                }
            ] : [];
        }),
        considered: {
            holdings: num(considered?.holdings) ?? 0,
            buys: num(considered?.buys) ?? 0,
            protected: num(considered?.protected) ?? 0
        },
        notes: strings(o.notes),
        view: arr(o.view).map(parseView).filter((x)=>x !== null).slice(0, 16),
        opened: unitCounts(o.opened)
    };
}
function parsePlanView(v) {
    const o = rec(v);
    const profile = text(o?.profile, 40);
    const [held, left] = [
        num(o?.hoursHeld),
        num(o?.hoursLeft)
    ];
    if (o === null || profile === null || held === null || left === null) return null;
    return {
        profile,
        sinceEntryPct: num(o.sinceEntryPct),
        toTargetPct: num(o.toTargetPct),
        toStopPct: num(o.toStopPct),
        hoursHeld: held,
        hoursLeft: left,
        targetHit: o.targetHit === true,
        trimmed: o.trimmed === true
    };
}
function parseBook(v) {
    const o = rec(v);
    if (o === null) return null;
    const [atMs, watchFailed, flagged, unpriced] = [
        num(o.atMs),
        num(o.watchFailed),
        num(o.flagged),
        num(o.unpriced)
    ];
    if (atMs === null || typeof o.managedOk !== "boolean" || watchFailed === null || flagged === null || unpriced === null) return null;
    const positions = [];
    for (const raw of arr(o.positions)){
        const p = rec(raw);
        const [id, symbol, chainIndex] = [
            text(p?.id),
            text(p?.symbol, 40),
            text(p?.chainIndex, 20)
        ];
        if (p === null || id === null || symbol === null || chainIndex === null || p.wallet !== "agente" && p.wallet !== "principal") continue;
        positions.push({
            id,
            symbol,
            chainIndex,
            wallet: p.wallet,
            usd: num(p.usd),
            sharePct: num(p.sharePct),
            isCash: p.isCash === true,
            plan: parsePlanView(p.plan)
        });
    }
    const hasObservationField = o.observedAtMs !== undefined;
    const legacyFailedStatus = !hasObservationField && !o.managedOk;
    const totalUsd = legacyFailedStatus ? null : num(o.totalUsd);
    const agentUsd = legacyFailedStatus ? null : num(o.agentUsd);
    const cashUsd = legacyFailedStatus ? null : num(o.cashUsd);
    const observedAtMs = num(o.observedAtMs) ?? (o.observedAtMs === undefined && o.managedOk ? atMs : null);
    const qualityValue = o.quality;
    const hasQuality = qualityValue === "current" || qualityValue === "partial" || qualityValue === "stale" || qualityValue === "unavailable";
    const visibleManagedUnpriced = positions.filter((p)=>p.wallet === "agente" && p.usd === null).length;
    const parsedUnpriced = hasQuality ? unpriced : visibleManagedUnpriced;
    const quality = hasQuality ? qualityValue : !o.managedOk ? "stale" : visibleManagedUnpriced > 0 ? "partial" : "current";
    return {
        atMs,
        observedAtMs,
        quality,
        managedOk: o.managedOk,
        watchFailed,
        flagged,
        unpriced: parsedUnpriced,
        totalUsd,
        agentUsd,
        cashUsd,
        positions: legacyFailedStatus ? [] : positions
    };
}
function parseWindow(v) {
    const o = rec(v);
    if (o === null) return null;
    const [n, settled, pending, unknownPrice, grossUsd] = [
        num(o.n),
        num(o.settled),
        num(o.pending),
        num(o.unknownPrice),
        num(o.grossUsd)
    ];
    if (n === null || settled === null || pending === null || unknownPrice === null || grossUsd === null) return null;
    return {
        n,
        overlapping: num(o.overlapping) ?? 0,
        settled,
        pending,
        unknownPrice,
        grossUsd,
        netUsd: num(o.netUsd),
        hitRate: num(o.hitRate),
        claim: o.claim === "acima_de_manter" || o.claim === "nao_acima_de_manter" ? o.claim : null,
        claimBasis: o.claimBasis === "liquido" || o.claimBasis === "bruto" ? o.claimBasis : null,
        claimReason: text(o.claimReason, 60)
    };
}
function parseLedger(v) {
    const o = rec(v);
    const [cycleId, atMs] = [
        text(o?.cycleId, 80),
        num(o?.atMs)
    ];
    if (o === null || cycleId === null || atMs === null || o.kind !== "cycle" && o.kind !== "order") return null;
    return {
        kind: o.kind,
        cycleId,
        atMs,
        reason: text(o.reason),
        ...text(o.outcome, 20) !== null ? {
            outcome: text(o.outcome, 20)
        } : {},
        ...isMode(o.mode) ? {
            mode: o.mode
        } : {},
        ...text(o.posture, 20) !== null ? {
            posture: text(o.posture, 20)
        } : {},
        ...isStage(o.stage) ? {
            stage: o.stage
        } : {},
        ...o.side === "buy" || o.side === "sell" ? {
            side: o.side
        } : {},
        ...text(o.symbol, 40) !== null ? {
            symbol: text(o.symbol, 40)
        } : {},
        ...num(o.usd) !== null ? {
            usd: num(o.usd)
        } : {},
        ...text(o.stance, 40) !== null ? {
            stance: text(o.stance, 40)
        } : {},
        ...text(o.source, 20) !== null ? {
            source: text(o.source, 20)
        } : {},
        ...o.kind === "cycle" && Array.isArray(o.dropped) ? {
            dropped: o.dropped.flatMap((d)=>{
                const r = rec(d);
                const id = text(r?.candidateId, 300);
                const reason = text(r?.reason, 60);
                return id !== null && reason !== null ? [
                    {
                        candidateId: id,
                        reason
                    }
                ] : [];
            })
        } : {}
    };
}
const METER_STATUS = [
    "valid",
    "unreported",
    "corrupt",
    "unreadable",
    "month_mismatch",
    "invalid"
];
const CAP_EVIDENCE = [
    "local_configuration",
    "provider_reported",
    "unknown"
];
const SCOPES = [
    "local_gateway",
    "account_reported"
];
function parseMeter(v) {
    const o = rec(v);
    if (o === null) return null;
    const scope = SCOPES.find((x)=>x === o.scope);
    const status = METER_STATUS.find((x)=>x === o.status);
    const capEvidence = CAP_EVIDENCE.find((x)=>x === o.capEvidence);
    if (scope === undefined || status === undefined || capEvidence === undefined) return null;
    return {
        scope,
        status,
        capEvidence,
        observedAtMs: num(o.observedAtMs),
        used: num(o.used),
        monthlyCap: num(o.monthlyCap),
        remainingAtObservation: num(o.remainingAtObservation),
        extrapolatedMonthUse: num(o.extrapolatedMonthUse)
    };
}
function parseResources(v) {
    const o = rec(v);
    const month = rec(o?.month);
    const tiers = rec(o?.tiers);
    const limits = rec(o?.accountRateLimits);
    const asOfMs = num(o?.asOfMs);
    const [key, startAtMs, nextMs, days] = [
        text(month?.key, 7),
        num(month?.startAtMs),
        num(month?.localNextMonthUtcMs),
        num(month?.days)
    ];
    if (o === null || asOfMs === null || month === null || tiers === null || key === null || startAtMs === null || nextMs === null || days === null) return null;
    const parsed = {};
    for (const id of [
        "free",
        "basic",
        "premium"
    ]){
        const t = rec(tiers[id]);
        const local = parseMeter(t?.local);
        const account = parseMeter(t?.account);
        if (local === null || account === null) return null;
        parsed[id] = {
            local,
            account
        };
    }
    return {
        asOfMs,
        month: {
            key,
            startAtMs,
            localNextMonthUtcMs: nextMs,
            days
        },
        accountRateLimits: {
            requestsPerSecond: num(limits?.requestsPerSecond),
            tokensPerSecond: num(limits?.tokensPerSecond)
        },
        tiers: parsed
    };
}
function parseInFlight(v) {
    const o = rec(v);
    const [orderKey, symbol, chainIndex] = [
        text(o?.orderKey, 300),
        text(o?.symbol, 40),
        text(o?.chainIndex, 20)
    ];
    const [atMs, usd] = [
        num(o?.atMs),
        num(o?.usd)
    ];
    if (o === null || orderKey === null || !/^[A-Za-z0-9_.:@|-]{1,300}$/.test(orderKey) || symbol === null || chainIndex === null || atMs === null || usd === null) return null;
    if (o.stage !== "enviando" && o.stage !== "incerta" || o.side !== "buy" && o.side !== "sell") return null;
    return {
        orderKey,
        atMs,
        stage: o.stage,
        side: o.side,
        symbol,
        chainIndex,
        usd,
        source: o.source === "protecao" ? "protecao" : "modelo",
        reason: text(o.reason, 60),
        detail: text(o.detail, 200),
        ref: text(o.ref, 120)
    };
}
function parsePlan(v) {
    const o = rec(v);
    const [key, symbol, profile] = [
        text(o?.key, 200),
        text(o?.symbol, 40),
        text(o?.profile, 40)
    ];
    const [entry, at] = [
        num(o?.entryPriceUsd),
        num(o?.entryAtMs)
    ];
    if (o === null || key === null || symbol === null || profile === null || entry === null || at === null) return null;
    return {
        key,
        symbol,
        profile,
        entryPriceUsd: entry,
        entryAtMs: at,
        targetHit: o.targetHit === true,
        trimmed: o.trimmed === true
    };
}
const NEXT = [
    "instalar",
    "entrar",
    "depositar",
    "definir_politica",
    "operando"
];
function parseWallet(v) {
    const o = rec(v);
    if (o === null) return null;
    const login = o.login === "nao_iniciado" || o.login === "aguardando" || o.login === "logado" || o.login === "desconhecido" ? o.login : null;
    const policy = o.policy === "ausente" || o.policy === "ok" || o.policy === "desconhecida" ? o.policy : null;
    const next = typeof o.next === "string" && NEXT.includes(o.next) ? o.next : null;
    if (o.cli !== "ausente" && o.cli !== "instalado" || login === null || policy === null || next === null) return null;
    // the page to sign in on is OKX's own, or it is not offered
    const url = text(o.loginUrl, 2000);
    const safeUrl = url !== null && /^https:\/\/web3\.okx\.com\/account\//.test(url) ? url : null;
    const address = text(o.address, 80);
    const solanaAddress = text(o.solanaAddress, 80);
    return {
        cli: o.cli,
        login,
        loginUrl: safeUrl,
        agentic: o.agentic === true,
        address: address !== null && ADDRESS.test(address) ? address : null,
        solanaAddress: solanaAddress !== null && ADDRESS.test(solanaAddress) ? solanaAddress : null,
        policy,
        fundsUsd: num(o.fundsUsd),
        sessionLeftMs: num(o.sessionLeftMs),
        next
    };
}
function parseMandate(v) {
    const o = rec(v);
    if (o === null) return null;
    const risk = [
        "cauteloso",
        "moderado",
        "agressivo"
    ].includes(o.risk) ? o.risk : null;
    const reserve = [
        "baixa",
        "media",
        "alta"
    ].includes(o.reserve) ? o.reserve : null;
    const concentration = [
        "pequena",
        "media",
        "grande"
    ].includes(o.concentration) ? o.concentration : null;
    const look = [
        "rapido",
        "normal",
        "calmo"
    ].includes(o.look) ? o.look : null;
    return risk === null || reserve === null || concentration === null || look === null ? null : {
        risk,
        reserve,
        concentration,
        look
    };
}
function parseAutopilot(v) {
    const o = rec(v);
    const settings = rec(o?.settings);
    const mandate = parseMandate(settings?.mandate);
    const caps = rec(settings?.caps);
    if (o === null || settings === null || mandate === null || caps === null) return null;
    // a ceiling is a number or null (no ceiling); a field that is missing or is anything else is not a core this screen understands
    const cap = (v)=>v === null ? null : num(v) ?? undefined;
    const [maxBuy, maxDailyBuy, maxDailySell, interval, reserve] = [
        cap(caps.maxBuyUsd),
        cap(caps.maxDailyBuyUsd),
        cap(caps.maxDailySellUsd),
        num(settings.intervalMin),
        num(settings.reserveShare)
    ];
    const riskTaken = parseMandate({
        ...mandate,
        risk: settings.riskTaken
    })?.risk ?? null;
    if (maxBuy === undefined || maxDailyBuy === undefined || maxDailySell === undefined || interval === null || reserve === null || riskTaken === null) return null;
    return {
        mandate,
        riskTaken,
        caps: {
            maxBuyUsd: maxBuy,
            maxDailyBuyUsd: maxDailyBuy,
            maxDailySellUsd: maxDailySell
        },
        intervalMin: interval,
        reserveShare: reserve,
        aggressiveOpen: o.aggressiveOpen === true,
        ownerProfile: o.ownerProfile === "arrojado" ? "arrojado" : "livre",
        leverage: (()=>{
            const l = rec(rec(o.authorizations)?.leverage);
            return l !== null && typeof l.granted === "boolean" ? {
                granted: l.granted,
                instruments: arr(l.instruments).length
            } : null;
        })(),
        mandateChangedAtMs: num(o.mandateChangedAtMs),
        capsSource: text(rec(settings.source)?.caps, 40) ?? "automatico",
        guards: parseGuards(o.guards)
    };
}
function triple(v) {
    const o = rec(v);
    const [buy, sell, protecao] = [
        num(o?.buy),
        num(o?.sell),
        num(o?.protecao)
    ];
    return buy === null || sell === null || protecao === null ? null : {
        buy,
        sell,
        protecao
    };
}
function parseGuards(v) {
    const o = rec(v);
    if (o === null) return null;
    const [impact, slippage, tax, share] = [
        triple(o.impactPct),
        triple(o.slippagePct),
        num(o.taxPct),
        num(o.buyCostShareOfStop)
    ];
    const reserve = rec(o.nativeReserve);
    const kind = reserve?.kind === "fixa" || reserve?.kind === "taxa_medida" ? reserve.kind : null;
    if (impact === null || slippage === null || tax === null || share === null || reserve === null || kind === null) return null;
    return {
        impactPct: impact,
        taxPct: tax,
        slippagePct: slippage,
        buyCostShareOfStop: share,
        nativeReserve: {
            kind,
            usd: num(reserve.usd)
        }
    };
}
function parseEvents(v) {
    return arr(v).flatMap((x)=>{
        const e = rec(x);
        const at = num(e?.atMs);
        const reason = text(e?.reason, 40);
        return e !== null && at !== null && reason !== null && (e.kind === "conectou" || e.kind === "desconectou" || e.kind === "pausou" || e.kind === "retomou") ? [
            {
                atMs: at,
                kind: e.kind,
                reason
            }
        ] : [];
    });
}
function parseStatus(body) {
    const root = rec(body);
    const s = rec(root?.status);
    if (root === null || root.ok !== true || s === null) return null;
    const state = rec(s.state);
    const config = rec(s.config);
    const managed = rec(config?.managed);
    const readiness = rec(s.readiness);
    const budget = rec(s.budget);
    const limits = rec(budget?.limits);
    const scheduler = rec(s.scheduler);
    const scoreboard = rec(s.scoreboard);
    const windowsRaw = rec(scoreboard?.windows);
    const health = rec(s.health);
    const wallet = parseWallet(s.wallet);
    const autopilot = parseAutopilot(s.autopilot);
    if (state === null || typeof state.connected !== "boolean" || !isMode(s.mode) || managed === null || managed.kind !== "propria" && managed.kind !== "agentica") return null;
    if (readiness === null || !Array.isArray(readiness.sombra) || !Array.isArray(readiness.limitado) || budget === null || limits === null || scheduler === null || windowsRaw === null || health === null || wallet === null || autopilot === null) return null;
    const windows = {};
    for (const id of __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WINDOW_IDS"]){
        const w = parseWindow(windowsRaw[id]);
        if (w === null) return null;
        windows[id] = w;
    }
    // the decisions not to act: reported by newer cores; a core that does not report them, or reports them badly, simply has none to show
    let inaction = null;
    const inactionRaw = rec(scoreboard?.inaction);
    const inactionWindows = rec(inactionRaw?.windows);
    if (inactionRaw !== null && inactionWindows !== null) {
        const parsed = {};
        let good = true;
        for (const id of __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WINDOW_IDS"]){
            const w = parseWindow(inactionWindows[id]);
            if (w === null) good = false;
            else parsed[id] = w;
        }
        if (good) inaction = {
            decisions: num(inactionRaw.decisions) ?? 0,
            windows: parsed
        };
    }
    const [consults, maxConsults, interval] = [
        num(budget.consults),
        num(limits.maxConsultsPerDay),
        num(scheduler.intervalMin)
    ];
    if (consults === null || maxConsults === null || interval === null) return null;
    const context = {};
    const ctx = rec(s.context);
    if (ctx !== null) {
        for (const [k, v] of Object.entries(ctx))if (v === null || typeof v === "string" || typeof v === "number" && Number.isFinite(v)) context[k] = v;
    }
    // what is in force: a server that does not say (an older one) is read from its mode, and never as money
    const rawAuthority = rec(s.authority);
    let authority;
    if (s.authority === undefined) authority = {
        level: s.mode === "desligado" ? "desligado" : "analise",
        blocked: null,
        ownerPolicy: "exigida"
    };
    else if (rawAuthority !== null && (rawAuthority.level === "desligado" || rawAuthority.level === "analise" || rawAuthority.level === "dinheiro") && (rawAuthority.ownerPolicy === "exigida" || rawAuthority.ownerPolicy === "dispensada")) authority = {
        level: rawAuthority.level,
        blocked: text(rawAuthority.blocked, 60),
        ownerPolicy: rawAuthority.ownerPolicy
    };
    else return null;
    return {
        connected: state.connected,
        connectedAtMs: num(state.connectedAtMs),
        mode: s.mode,
        authority,
        paused: s.paused === true,
        pausedUntilMs: num(state.pausedUntilMs),
        pauseReason: text(state.pauseReason, 40),
        events: parseEvents(state.events),
        managed: {
            kind: managed.kind,
            evm: text(managed.evm, 80),
            solana: text(managed.solana, 80)
        },
        stopFile: s.stopFile === true,
        health: {
            ledgerOk: rec(health.ledger)?.ok === true,
            plansOk: rec(health.plans)?.ok === true,
            configOk: rec(health.config)?.ok === true
        },
        modelConfigured: s.modelConfigured === true,
        credentialsConfigured: s.credentialsConfigured === true,
        readiness: {
            sombra: strings(readiness.sombra),
            limitado: strings(readiness.limitado)
        },
        wallet,
        autopilot,
        budget: {
            consults,
            maxConsultsPerDay: maxConsults
        },
        resources: parseResources(s.resources),
        scheduler: {
            started: scheduler.started === true,
            nextAtMs: num(scheduler.nextAtMs),
            lastAtMs: num(scheduler.lastAtMs),
            intervalMin: interval
        },
        last: parseCycle(s.last),
        plans: arr(s.plans).map(parsePlan).filter((x)=>x !== null),
        windows,
        inaction,
        decisions: num(scoreboard?.decisions) ?? 0,
        protective: num(scoreboard?.protective) ?? 0,
        inFlight: arr(s.inFlight).map(parseInFlight).filter((x)=>x !== null).slice(0, 40),
        lock: s.lock !== false,
        book: parseBook(s.book),
        context: ctx === null ? null : context,
        ledger: arr(s.ledger).map(parseLedger).filter((x)=>x !== null),
        performance: parsePerformance(s.performance)
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/agent/status-poll.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "STATUS_REQUEST_TIMEOUT_MS",
    ()=>STATUS_REQUEST_TIMEOUT_MS,
    "coalesceStatusRequest",
    ()=>coalesceStatusRequest,
    "statusPollFailed",
    ()=>statusPollFailed,
    "statusPollSucceeded",
    ()=>statusPollSucceeded
]);
const statusPollSucceeded = (status)=>({
        status,
        stale: false
    });
const statusPollFailed = (previous)=>({
        status: previous.status,
        stale: previous.status !== null
    });
const STATUS_REQUEST_TIMEOUT_MS = 10_000;
function coalesceStatusRequest(active, start, timeoutMs = STATUS_REQUEST_TIMEOUT_MS) {
    const pending = active.current;
    if (pending !== null) return pending;
    let timeout;
    const request = new Promise((resolve, reject)=>{
        let settled = false;
        const finish = (action)=>{
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (active.current === request) active.current = null;
            action();
        };
        timeout = setTimeout(()=>finish(()=>reject(new Error("status_request_timeout"))), timeoutMs);
        void Promise.resolve().then(start).then((value)=>finish(()=>resolve(value)), (error)=>finish(()=>reject(error)));
    });
    active.current = request;
    return request;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/agent/types.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * What the screen of the autonomous agent knows, as the core's `GET /agent/status` gives it (src/agent/service.ts). The web does not import the core, so the shape is written here and checked by `parseStatus`:
 * a body that is not what is expected is no status at all, never a half-filled one. Numbers the core did not know are null and stay null on screen. There is no mode to pick and no setting to change: the person
 * connects a wallet, and everything else is the agent's.
 */ /** What the agent is doing with the money right now. It follows from what is ready and is not a switch: desligado (no wallet connected), sombra (analysing and measuring), limitado (trading). */ __turbopack_context__.s([
    "WINDOW_IDS",
    ()=>WINDOW_IDS
]);
const WINDOW_IDS = [
    "15m",
    "1h",
    "4h",
    "24h"
];
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/agent/view.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CONCENTRATION_TEXT",
    ()=>CONCENTRATION_TEXT,
    "CONTEXT_LABEL",
    ()=>CONTEXT_LABEL,
    "FAMILY_TEXT",
    ()=>FAMILY_TEXT,
    "LOOK_TEXT",
    ()=>LOOK_TEXT,
    "MODE_TEXT",
    ()=>MODE_TEXT,
    "POLICY_URL",
    ()=>POLICY_URL,
    "POSTURE_TEXT",
    ()=>POSTURE_TEXT,
    "PROFILE_SPEC",
    ()=>PROFILE_SPEC,
    "PROFILE_TEXT",
    ()=>PROFILE_TEXT,
    "RESERVE_TEXT",
    ()=>RESERVE_TEXT,
    "RISK_TEXT",
    ()=>RISK_TEXT,
    "SOURCE_TEXT",
    ()=>SOURCE_TEXT,
    "STAGE_TEXT",
    ()=>STAGE_TEXT,
    "STANCE_TEXT",
    ()=>STANCE_TEXT,
    "WALLET_STEP",
    ()=>WALLET_STEP,
    "agoText",
    ()=>agoText,
    "budgetText",
    ()=>budgetText,
    "chainName",
    ()=>chainName,
    "consultLine",
    ()=>consultLine,
    "contextRows",
    ()=>contextRows,
    "currentOrders",
    ()=>currentOrders,
    "cycleOrdersLine",
    ()=>cycleOrdersLine,
    "cycleSummary",
    ()=>cycleSummary,
    "effectiveMode",
    ()=>effectiveMode,
    "eventLine",
    ()=>eventLine,
    "evidenceLines",
    ()=>evidenceLines,
    "evidenceText",
    ()=>evidenceText,
    "hasTxRef",
    ()=>hasTxRef,
    "headline",
    ()=>headline,
    "inFlightLine",
    ()=>inFlightLine,
    "inText",
    ()=>inText,
    "ledgerLine",
    ()=>ledgerLine,
    "modeLead",
    ()=>modeLead,
    "moneyEvidence",
    ()=>moneyEvidence,
    "needsPersonWord",
    ()=>needsPersonWord,
    "orderLine",
    ()=>orderLine,
    "pctText",
    ()=>pctText,
    "planLine",
    ()=>planLine,
    "planProgress",
    ()=>planProgress,
    "profileText",
    ()=>profileText,
    "radarRows",
    ()=>radarRows,
    "readinessText",
    ()=>readinessText,
    "reasonText",
    ()=>reasonText,
    "sessionText",
    ()=>sessionText,
    "shortAddress",
    ()=>shortAddress,
    "signedPctText",
    ()=>signedPctText,
    "signedUsdText",
    ()=>signedUsdText,
    "stanceText",
    ()=>stanceText,
    "strategyRows",
    ()=>strategyRows,
    "usdText",
    ()=>usdText,
    "windowLabel",
    ()=>windowLabel
]);
/**
 * The words and numbers of the agent's screen, pure (no clock but the one handed in, no network). Every code the core sends has a plain Portuguese sentence; a code nobody knows is "motivo nao reconhecido"
 * and never echoed. Text is written without accents and without the three characters the desk forbids. The screen never says the agent earned what the Placar did not measure.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$onchain$2f$chains$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/onchain/chains.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent/types.ts [app-client] (ecmascript)");
;
;
const MODE_TEXT = {
    desligado: {
        title: "Esperando a carteira",
        does: "Nada roda ate voce conectar uma carteira."
    },
    sombra: {
        title: "Analisando",
        does: "Le a carteira e o mercado, decide o que faria e mede se acertou. Ainda nao move dinheiro."
    },
    limitado: {
        title: "Operando",
        does: "Decide e executa sozinho na carteira do agente."
    }
};
const REASONS = {
    // the gate and the cycle
    desligado: "Nenhuma carteira conectada.",
    parado: "O agente foi parado.",
    recibo_sucesso: "Confirmada pelo historico da OKX.",
    recibo_erro: "O historico da OKX diz que a transacao nao saiu.",
    recibo_recuperado: "A OKX recusou sem provar nada e nao guardou o codigo da transacao. O agente a achou na rede publica pela carteira, pelo token e pelo valor, e ela foi confirmada. Nada foi enviado de novo.",
    conta_nao_lida: "Ainda nao li a conta da OKX. Em instantes o agente sabe se ja pode operar.",
    sem_login: "A conta da OKX nao esta com a sessao aberta. Entre de novo na conta.",
    carteira_agentica: "A carteira que o agente cuida ainda nao e a carteira do agente da OKX.",
    cli_instalado: "O programa da OKX ainda nao foi instalado.",
    credenciais_okx: "As chaves da OnchainOS ainda nao foram configuradas.",
    carteira_gerida: "Nenhuma carteira foi escolhida para o agente cuidar.",
    execucao_bloqueada: "O agente analisa e decide, mas nao executa ainda: falta algo do lado do dinheiro.",
    compras_pausadas: "As compras novas estao pausadas pelo proprio agente; as saidas e os stops continuam.",
    disjuntor_de_perda: "Pausa de compras gravada por uma versao antiga da regra, a partir de uma medicao que comparava decisoes com o que o preco fez depois. Isso nao e dinheiro perdido da carteira, e o agente reavalia essa pausa sozinho.",
    pausa_reavaliada: "A pausa de compras vinha de uma medicao que comparava vendas com manter o token. Isso nao e dinheiro perdido, so uma alternativa que nao aconteceu. O agente reavaliou a pausa com a regra atual e retomou as compras.",
    queda_do_dia: "A carteira perdeu mais de 5% de valor nas ultimas 24 horas, entao o agente pausou as compras novas.",
    queda_do_pico: "A carteira caiu mais de 12% desde o melhor momento da semana, entao o agente pausou as compras novas.",
    evidencia_perdida: "Pausa de compras gravada por uma versao antiga da regra, a partir da medicao da semana contra manter dolares (uma alternativa que nao aconteceu). O agente reavalia essa pausa sozinho.",
    token_marcado_risco: "A OKX marcou como risco um token que o agente mantem.",
    saida_do_plano_falhou: "Uma saida do plano nao saiu desta vez e sera tentada no proximo ciclo.",
    mandato_nao_gravou: "A estrategia escolhida pelo agente nao pode ser gravada.",
    retomou: "As compras novas voltaram.",
    conectou: "Carteira conectada.",
    desconectou: "Carteira desconectada.",
    aviso_desatualizado: "O aviso mudou. Leia de novo e conecte.",
    carteira_invalida: "Esse endereco de carteira nao e valido.",
    cli_ausente: "O programa da OKX ainda nao foi instalado.",
    sem_link_de_login: "O programa da OKX nao devolveu a pagina de entrada.",
    sem_enderecos: "A conta entrou, mas o programa da OKX nao devolveu os enderecos da carteira.",
    plataforma_nao_suportada: "Este computador ainda nao e suportado pelo instalador do programa da OKX.",
    download_falhou: "Nao foi possivel baixar o programa da OKX agora.",
    checksums_ilegivel: "A lista de verificacao da OKX nao trouxe esse programa.",
    hash_divergente: "O programa baixado nao confere com a assinatura publicada pela OKX, e foi descartado.",
    wallet_falhou: "Esse passo da carteira do agente nao deu certo.",
    cli_indisponivel: "O programa da OKX nao respondeu.",
    parar_antes_de_trocar_binario: "O programa da OKX nao troca enquanto o agente opera com ele.",
    valor_invalido: "O valor da ordem nao era um numero valido.",
    gasto_desconhecido: "O gasto de hoje nao pode ser somado, entao a ordem esperou.",
    ordem_em_voo: "Havia uma ordem enviada sem confirmacao para esse token.",
    arquivo_stop: "O arquivo STOP esta na pasta do agente. Apague-o para liberar.",
    ledger_corrompido: "O registro do agente esta corrompido, entao ele nao age.",
    ledger_nao_gravou: "Nao foi possivel gravar o registro, entao nada foi feito.",
    planos_ilegiveis: "Os planos de saida das posicoes nao puderam ser lidos.",
    relogio: "O relogio do computador esta fora de hora em relacao a OKX.",
    carteira_antiga: "Nao foi possivel ler a carteira agora.",
    ordens_em_voo: "Ha uma ordem enviada sem confirmacao. Nada novo sai desse token antes de voce conferir.",
    outra_instancia: "Outra janela do app esta com a pasta do agente. Os ciclos rodam so nela.",
    nao_conectado: "Conecte a carteira primeiro: o agente so instala e entra na conta depois que voce conecta.",
    conta_ilegivel: "A conta da OKX nao respondeu: o agente segue analisando e volta a operar quando ela responder.",
    politica_ausente: "Os limites da conta OKX nao estao ligados no portal. O agente segue em analise ate voce ligar os limites.",
    politica_frouxa: "Os limites da conta OKX estao frouxos demais para o app (acima do que ele aceita). O agente segue em analise ate voce apertar os limites no portal.",
    sessao_expirando: "A sessao da conta OKX esta perto de expirar.",
    endereco_divergente: "O endereco da subcarteira nao confere com o configurado.",
    binario_divergente: "O programa da OKX nao e o que foi verificado, entao nao foi executado.",
    sem_candidatos: "Nao havia o que decidir neste ciclo.",
    nada_a_decidir: "Nada tinha mais de uma opcao, entao o modelo nao foi consultado.",
    sem_modelo: "A chave do modelo nao esta configurada.",
    sem_mudanca: "Nada mudou desde a ultima consulta ao modelo.",
    consultas_esgotadas: "As consultas ao modelo de hoje acabaram.",
    tokens_esgotados: "Os tokens do modelo de hoje acabaram.",
    ritmo_do_dia: "As consultas ao modelo sao distribuidas ao longo do dia: esta ficou para a proxima, e as saidas por stop continuam.",
    orcamento_nao_gravou: "O contador de consultas nao pode ser gravado.",
    modelo_erro: "O modelo nao respondeu a tempo ou falhou.",
    agente_forma: "A resposta do modelo nao tinha o formato esperado.",
    agente_postura: "O modelo escolheu uma postura que nao existe.",
    agente_estados: "A resposta do modelo nao cobriu todos os candidatos.",
    agente_postura_invalida: "O modelo escolheu algo que nao foi oferecido.",
    agente_postura_incoerente: "O modelo quis comprar mais do que a postura permite.",
    agente_compra_e_venda: "O modelo quis comprar e vender o mesmo ativo.",
    agente_perfil_invalido: "A compra veio sem um alvo e uma saida validos.",
    ja_em_andamento: "Ja havia um ciclo em andamento.",
    excecao: "O ciclo falhou por um erro interno.",
    parado_no_ciclo: "Voce parou ou baixou o modo no meio do ciclo, e o resto foi cancelado.",
    sem_executor: "Nao ha programa de execucao configurado.",
    ordem_incerta: "Uma ordem ficou sem confirmacao e as outras foram seguradas.",
    ordem_falhou: "Uma ordem falhou e as outras foram seguradas.",
    // the signing tool
    carteira_nao_gerida: "A ordem era de uma carteira que o agente nao opera.",
    carteira_nao_agentica: "So a carteira da conta OKX conectada pode ser operada.",
    sem_endereco: "Falta o endereco da carteira nessa rede.",
    sem_moeda_de_liquidacao: "Nao ha moeda em dolar para pagar ou receber nessa rede.",
    ordem_invalida: "A ordem nao pode ser montada.",
    quote_demorou: "A cotacao demorou demais.",
    quote_recusada: "A cotacao foi recusada.",
    quote_ilegivel: "A cotacao veio ilegivel.",
    confirmando: "A OKX pediu confirmacao de risco. O agente nao confirma sozinho.",
    simulacao_falhou: "A rede recusou a simulacao da troca antes de enviar: nada saiu da carteira. O agente espera um tempo e tenta de novo sozinho.",
    gas_station_pendente: "A carteira do agente ficou com pouco SOL para pagar a taxa da rede. A OKX oferece pagar essa taxa em USDC (cerca de US$ 0,01 por operacao): e uma escolha sua e o agente nao ativa sozinho. Envie um pouco de SOL a carteira do agente ou ative o Gas Station na OKX.",
    honeypot: "O token parece uma armadilha de venda.",
    honeypot_desconhecido: "A cotacao nao garantiu que o token e seguro para vender, entao nao foi trocado.",
    cli_bloqueou: "O programa da OKX bloqueou a troca antes de assinar.",
    sessao_invalida: "A sessao da conta OKX nao esta valida: entre de novo na conta.",
    transmitida: "A transacao foi enviada a rede. O agente espera a confirmacao dela no historico da OKX.",
    recusa_sem_prova: "O programa da OKX respondeu que nao, mas nao ha prova de que nada saiu. Confira o historico da carteira.",
    quote_bloqueada: "A OKX bloqueou a troca.",
    quote_aviso: "A OKX avisou de risco na troca.",
    imposto_alto: "O token cobra um imposto alto na troca.",
    impacto_desconhecido: "O impacto no preco nao veio na cotacao.",
    impacto_alto: "O impacto no preco era alto demais.",
    saldo_insuficiente: "Faltou saldo na subcarteira.",
    taxa_sem_saldo: "Faltou moeda nativa para pagar a taxa da rede.",
    cli_recusou: "O programa da OKX recusou a troca.",
    tempo_esgotado: "A troca nao respondeu a tempo e pode ter sido enviada.",
    sem_resposta: "A troca ficou sem resposta e pode ter sido enviada.",
    sem_recibo: "A troca respondeu sem recibo e pode ter sido enviada.",
    // what was dropped
    sem_ordem: "A ordem nao podia ser montada.",
    limite_de_ordens: "Passou do maximo de ordens por ciclo.",
    sem_saldo: "Sem saldo lido para dimensionar a compra.",
    caixa_insuficiente: "O caixa nao cobria a compra.",
    teto_diario: "Passou do teto do dia.",
    // notes
    postura_limitou: "A postura do Jev limitou o tamanho de uma compra (ou segurou a segunda compra do ciclo).",
    topo_visto_pelo_jev: "O Jev avaliou que o preco ja estava no alto e preferiu nao comprar.",
    topo_sem_resposta: "O Jev nao respondeu se o preco estava no alto, e sem essa resposta o agente nao compra um preco esticado.",
    queda_vista_pelo_jev: "O Jev avaliou que o preco ainda estava caindo e preferiu esperar.",
    queda_sem_resposta: "O Jev nao respondeu se a queda tinha parado, e sem essa resposta o agente nao compra um preco em queda.",
    conviccao_reduziu: "O Jev nao estava seguro o bastante e a compra saiu menor.",
    conviccao_recusou: "O Jev nao estava seguro o bastante e a compra nao saiu.",
    conviccao_desconhecida: "O Jev nao disse o quanto estava seguro, entao a compra saiu no menor tamanho.",
    conviccao_moderou: "O Jev estava dividido sobre a venda e o agente vendeu o passo do meio.",
    fatos_indisponiveis: "Os dados de mercado das posicoes nao vieram.",
    ecossistema_indisponivel: "A varredura do ecossistema nao respondeu.",
    placar_nao_gravou: "A medicao de uma decisao nao foi gravada.",
    protecao_sem_preco: "Uma posicao com plano ficou sem preco, e o plano esperou.",
    protecao_sem_ordem: "Uma saida do plano nao pode ser montada.",
    plano_nao_gravou: "O plano de saida de uma compra nao foi gravado, e por isso a compra nao saiu.",
    plano_orfao: "O plano de uma posicao que ja saiu da carteira foi encerrado.",
    tokens_nao_comprovados: "Tokens sem liquidez que prove o valor ficaram de fora das contas.",
    // errors of the screen
    confirmacao_necessaria: "A frase digitada nao confere.",
    subir_um_nivel: "O modo sobe um degrau de cada vez.",
    nao_gravou: "Nao foi possivel gravar a mudanca.",
    modo_invalido: "Esse modo nao existe.",
    nao_esta_em_voo: "Essa ordem nao esta mais em voo. A tela vai se atualizar.",
    resolvida_pelo_usuario: "Resolvida por voce depois de conferir a carteira.",
    configuracao_invalida: "Algum valor da configuracao esta fora do permitido.",
    sem_conexao: "O servidor do agente nao respondeu.",
    servidor_sem_rota: "O servidor do agente esta desatualizado e nao conhece o agente.",
    origem_negada: "O servidor do agente recusou o pedido desta origem.",
    servidor_com_erro: "O servidor do agente respondeu com erro.",
    resposta_invalida: "O servidor do agente respondeu algo que nao se entende."
};
function sessionText(leftMs) {
    if (leftMs === null || !Number.isFinite(leftMs)) return "Sessao da conta OKX: nao foi possivel ler.";
    if (leftMs <= 0) return "Sessao da conta OKX: expirou. Entre de novo na conta.";
    const hours = leftMs / 3_600_000;
    if (hours >= 48) return `Sessao da conta OKX: vale por mais ${Math.floor(hours / 24)} dias.`;
    if (hours >= 1) return `Sessao da conta OKX: acaba em ${Math.floor(hours)} horas. Entre de novo na conta antes disso.`;
    return `Sessao da conta OKX: acaba em ${Math.max(1, Math.floor(leftMs / 60_000))} minutos. Entre de novo na conta antes disso.`;
}
const reasonText = (code)=>code === null ? "" : REASONS[code] ?? "Motivo nao reconhecido.";
const READINESS = {
    carteira_gerida: "Informe o endereco da carteira que o agente vai gerir",
    credenciais_okx: "Cadastre as chaves da OKX nas configuracoes",
    chave_do_modelo: "Cadastre a chave do modelo nas configuracoes",
    cli_instalado: "Instale o programa da OKX e informe onde ele esta e o seu SHA256",
    carteira_agentica: "Use uma subcarteira do Agentic Wallet como carteira gerida"
};
const readinessText = (code)=>READINESS[code] ?? "Requisito nao reconhecido";
const STANCE_TEXT = {
    hold: "Manter",
    trim_third: "Vender um terco",
    trim_half: "Vender metade",
    exit_all: "Sair de tudo",
    skip: "Nao comprar",
    buy_tenth: "Comprar um decimo do maximo",
    buy_third: "Comprar um terco do maximo",
    buy_two_thirds: "Comprar dois tercos do maximo",
    buy_full: "Comprar o maximo"
};
const stanceText = (stance)=>STANCE_TEXT[stance] ?? "Acao nao reconhecida";
const PROFILE_TEXT = {
    alvo_2: "Alvo de 2%, saida se cair 1,5%, ate 24 horas",
    alvo_5: "Alvo de 5%, saida se cair 4%, ate 12 horas",
    alvo_10: "Alvo de 10%, saida se cair 6%, ate 36 horas",
    alvo_20: "Alvo de 20%, saida se cair 10%, ate 5 dias"
};
const profileText = (profile)=>profile === null ? "" : PROFILE_TEXT[profile] ?? "Plano nao reconhecido";
const POSTURE_TEXT = {
    defensiva: "Defensiva",
    neutra: "Neutra",
    ofensiva: "Ofensiva"
};
const STAGE_TEXT = {
    preparada: "Preparada",
    enviando: "Enviando",
    executada: "Executada",
    falhou: "Falhou",
    incerta: "Sem confirmacao"
};
const SOURCE_TEXT = {
    modelo: "Escolha do modelo",
    protecao: "Plano da posicao"
};
function usdText(value, digits = 2) {
    if (value === null || !Number.isFinite(value)) return "sem valor";
    const sign = value < 0 ? "-" : "";
    const fixed = Math.abs(value).toFixed(digits);
    const [whole, fraction] = fixed.split(".");
    return `${sign}US$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${fraction === undefined ? "" : `,${fraction}`}`;
}
function signedUsdText(value) {
    return `${value > 0 ? "+" : ""}${usdText(value)}`;
}
const pctText = (value, digits = 1)=>value === null || !Number.isFinite(value) ? "sem valor" : `${value.toFixed(digits).replace(".", ",")}%`;
const signedPctText = (value, digits = 1)=>value === null || !Number.isFinite(value) ? "sem valor" : `${value > 0 ? "+" : ""}${pctText(value, digits)}`;
function agoText(atMs, nowMs) {
    if (atMs === null) return "nunca";
    const s = Math.max(0, Math.round((nowMs - atMs) / 1000));
    if (s < 45) return "agora";
    if (s < 3600) return `ha ${Math.max(1, Math.round(s / 60))} min`;
    if (s < 86400) return `ha ${Math.round(s / 3600)} h`;
    return `ha ${Math.round(s / 86400)} d`;
}
function inText(atMs, nowMs) {
    if (atMs === null) return "sem data";
    const s = Math.round((atMs - nowMs) / 1000);
    if (s <= 30) return "agora";
    if (s < 3600) return `em ${Math.max(1, Math.round(s / 60))} min`;
    const h = Math.floor(s / 3600);
    const m = Math.round(s % 3600 / 60);
    return m === 0 ? `em ${h} h` : `em ${h} h ${m} min`;
}
function shortAddress(address) {
    if (address === null) return "nao informado";
    return address.length <= 12 ? address : `${address.slice(0, 6)}...${address.slice(-4)}`;
}
function effectiveMode(status) {
    // the server says what is in force; the derived mode only says what the agent is ELIGIBLE to do
    return status.authority.level === "dinheiro" ? "limitado" : status.authority.level === "analise" ? "sombra" : "desligado";
}
function modeLead(status) {
    const mode = effectiveMode(status);
    if (mode === "limitado") {
        return status.authority.ownerPolicy === "dispensada" ? "Decide e executa sozinho na carteira do agente, dentro dos tetos do proprio app. Os limites do portal da OKX estao dispensados, por escolha sua." : "Decide e executa sozinho na carteira do agente, dentro dos limites da conta OKX.";
    }
    if (mode === "sombra") return `${MODE_TEXT.sombra.does}${status.authority.blocked === null ? "" : ` ${reasonText(status.authority.blocked)}`}`;
    return MODE_TEXT.desligado.does;
}
function consultLine(last) {
    if (!last.consulted) return null;
    const open = last.view.filter((v)=>v.kind === "buy" && v.closed === null);
    if (open.length === 0) return null;
    const count = `${open.length} ${open.length === 1 ? "compra aberta" : "compras abertas"}`;
    let best = null;
    for (const v of open){
        const lean = Object.entries(v.probs ?? {}).reduce((sum, [key, p])=>key.startsWith("buy_") && Number.isFinite(p) ? sum + p : sum, 0);
        if (lean > 0 && (best === null || lean > best.lean)) best = {
            symbol: v.symbol.slice(0, 12),
            lean
        };
    }
    if (best === null) return `o Jev olhou ${count} e preferiu esperar`;
    const pct = Math.round(best.lean * 100);
    if (best.lean >= 0.5 && last.notes.includes("conviccao_recusou")) return `o Jev olhou ${count}, inclinou para comprar ${best.symbol} (${pct}% a favor), mas a confianca nao bastou`;
    return `o Jev olhou ${count} e preferiu esperar; a mais perto de comprar foi ${best.symbol}, com ${pct}% a favor`;
}
function currentOrders(status) {
    const last = status.last;
    if (last === null) return [];
    return last.orders.map((o)=>{
        let latest = null;
        for (const r of status.ledger){
            if (r.kind !== "order" || r.stage === undefined || r.cycleId !== last.cycleId || r.side !== o.order.side || r.symbol !== o.order.symbol) continue;
            if (latest === null || r.atMs >= latest.atMs) latest = r;
        }
        return latest === null || latest.stage === undefined || latest.stage === o.stage ? o : {
            ...o,
            stage: latest.stage,
            reason: latest.reason
        };
    });
}
function cycleOrdersLine(orders) {
    if (orders.length === 0) return "";
    const phrase = (o)=>{
        const { side, stance, symbol, usd } = o.order;
        const what = side === "buy" ? "comprar" : stance === "exit_all" ? "sair de" : stance === "trim_half" ? "vender metade de" : stance === "trim_third" ? "vender um terco de" : "vender";
        return `${what} ${symbol.slice(0, 12)} (US$ ${Math.round(usd)})`;
    };
    const byPlan = orders.every((o)=>o.order.source === "protecao");
    const who = byPlan ? "o plano de protecao mandou" : "o Jev mandou";
    const named = orders.slice(0, 2).map(phrase);
    const rest = orders.length - named.length;
    const list = rest > 0 ? `${named.join(", ")} e mais ${rest}` : named.join(" e ");
    return `${orders.length === 1 ? "Ordem" : "Ordens"}: ${who} ${list}.`;
}
function headline(status, nowMs) {
    if (!status.connected) return "Conecte a carteira e o agente comeca a trabalhar.";
    if (status.stopFile) return "O arquivo STOP esta na pasta do agente. Apague-o para liberar.";
    if (status.managed.evm === null && status.managed.solana === null) return "Conectado. O agente espera uma carteira para cuidar: entre com a conta OKX.";
    const last = status.last;
    const mode = effectiveMode(status);
    const waitingLimits = status.authority.blocked === "politica_ausente" || status.authority.blocked === "politica_frouxa" ? " Falta ligar os limites da carteira no portal da OKX, ou dispensa-los, para ele passar a executar." : "";
    const pause = status.paused ? ` Compras novas pausadas${status.pausedUntilMs === null ? "" : ` ${inText(status.pausedUntilMs, nowMs)}`}: ${reasonText(status.pauseReason).toLowerCase()}` : "";
    if (last === null) return `${MODE_TEXT[mode].title}. O primeiro ciclo ${inText(status.scheduler.nextAtMs, nowMs)}.${waitingLimits}${pause}`;
    const when = agoText(last.atMs, nowMs);
    if (last.outcome === "bloqueado") return `Esperando ${when}. ${reasonText(last.reason)}${pause}`;
    if (last.outcome === "erro") return `Erro ${when}. ${reasonText(last.reason)}${pause}`;
    const nowOrders = currentOrders(status);
    const orders = nowOrders.length;
    const executed = nowOrders.filter((o)=>o.stage === "executada").length;
    if (last.outcome === "decidido") {
        const posture = last.posture === null ? "" : `postura ${POSTURE_TEXT[last.posture].toLowerCase()}, `;
        if (orders === 0) {
            const saw = consultLine(last);
            return `${MODE_TEXT[mode].title}. Decidiu ${when}: ${saw === null ? `${posture}nada a fazer agora` : saw}.${pause}`;
        }
        const sent = cycleOrdersLine(nowOrders);
        if (mode === "limitado") return `Operando. Decidiu ${when}: ${posture}${executed} de ${orders} ${orders === 1 ? "ordem executada" : "ordens executadas"}.${sent === "" ? "" : ` ${sent}`}${pause}`;
        return `Analisando. Decidiu ${when}: ${posture}${orders} ${orders === 1 ? "ordem seria feita" : "ordens seriam feitas"} quando a carteira do agente estiver pronta.${sent === "" ? "" : ` ${sent}`}${waitingLimits}${pause}`;
    }
    return `${MODE_TEXT[mode].title}. Ciclo ${when}: ${reasonText(last.reason) || "nada a fazer"}${pause}`;
}
function windowLabel(id) {
    return id === "15m" ? "15 minutos" : id === "1h" ? "1 hora" : id === "4h" ? "4 horas" : "24 horas";
}
function evidenceText(w) {
    if (w.claim === "acima_de_manter" || w.claim === "nao_acima_de_manter") {
        // the cost of an order is the one its quote announced (network fee and price impact on the size): an estimate, never what the chain charged, and the text says so
        const basis = w.claimBasis === "bruto" ? " (bruto, custo ainda nao medido)" : w.claimBasis === "liquido" ? " (liquido do custo estimado pela cotacao)" : "";
        const value = w.claimBasis === "liquido" && w.netUsd !== null ? w.netUsd : w.grossUsd;
        const verdict = w.claim === "acima_de_manter" ? "Acima de manter em dolares" : "Nao acima de manter em dolares";
        return `${verdict}: ${signedUsdText(value)} em ${w.settled} decisoes, acerto de ${pctText(w.hitRate === null ? null : w.hitRate * 100, 0)}${basis}.`;
    }
    switch(w.claimReason){
        case "sem_decisoes":
            return "Ainda sem decisoes para medir.";
        case "janela_incompleta":
            return `Janela ainda aberta: ${w.pending} decisoes esperando o preco.`;
        case "amostra_pequena":
            return `Amostra pequena: ${w.settled} decisoes medidas, e menos de 30 nao prova nada.${w.overlapping > 0 ? ` ${w.overlapping} repeticoes da mesma aposta nao contam.` : ""}`;
        case "precos_faltando":
            return "Faltaram precos para medir a janela.";
        case "modos_misturados":
            return "Sombra, assistido e limitado misturados: cada modo e medido sozinho.";
        default:
            return "Sem afirmacao possivel.";
    }
}
function evidenceLines(windows) {
    return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WINDOW_IDS"].map((id)=>({
            id,
            label: windowLabel(id),
            settled: windows[id].settled,
            pending: windows[id].pending,
            grossUsd: windows[id].grossUsd,
            hitRate: windows[id].hitRate,
            text: evidenceText(windows[id]),
            claim: windows[id].claim
        }));
}
function moneyEvidence(windows) {
    const day = windows["24h"];
    if (day.claim === "acima_de_manter") return {
        supported: true,
        text: `A sombra mediu ${signedUsdText(day.claimBasis === "liquido" && day.netUsd !== null ? day.netUsd : day.grossUsd)} acima de manter em dolares em 24 horas.`
    };
    return {
        supported: false,
        text: `Ainda sem evidencia medida de ganho: ${evidenceText(day)}`
    };
}
function orderLine(o) {
    const order = "order" in o ? o.order : o;
    const verb = order.side === "buy" ? "Comprar" : "Vender";
    const who = order.wallet === "principal" ? " (carteira principal, so com a sua mao)" : "";
    return `${verb} ${usdText(order.usd, 0)} de ${order.symbol}, ${stanceText(order.stance).toLowerCase()}${who}`;
}
function ledgerLine(r, nowMs) {
    const when = agoText(r.atMs, nowMs);
    if (r.kind === "cycle") {
        const base = r.outcome === "decidido" ? "Decidiu" : r.outcome === "mantido" ? "Manteve" : r.outcome === "bloqueado" ? "Bloqueado" : "Erro";
        const why = r.reason === null ? "" : `: ${reasonText(r.reason)}`;
        return `${when}. ${base}${why}`;
    }
    const verb = r.side === "buy" ? "Compra" : "Venda";
    const stage = r.stage === undefined ? "" : STAGE_TEXT[r.stage].toLowerCase();
    const who = r.source === "protecao" ? " (plano da posicao)" : "";
    const why = r.reason === null ? "" : `: ${reasonText(r.reason)}`;
    return `${when}. ${verb} de ${r.symbol ?? "?"}, ${r.usd === undefined ? "" : `${usdText(r.usd, 0)}, `}${stage}${who}${why}`;
}
const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const EVM_HASH = /^0x[0-9a-fA-F]{64}$/;
function hasTxRef(o) {
    const ref = o.ref;
    return typeof ref === "string" && (o.chainIndex === "501" ? SOLANA_SIGNATURE : EVM_HASH).test(ref);
}
function needsPersonWord(o) {
    return !hasTxRef(o);
}
/** A wait this long is said in plain words, still without a question. */ const LONG_WAIT_MS = 60 * 60_000;
function inFlightLine(o, nowMs) {
    const verb = o.side === "buy" ? "Compra" : "Venda";
    const who = o.source === "protecao" ? " do plano da posicao" : "";
    const state = o.stage === "enviando" ? "enviada, sem resposta" : "sem confirmacao";
    const why = o.reason === null ? "" : ` ${reasonText(o.reason)}`;
    const said = o.detail === null || o.detail === undefined ? "" : ` A OKX disse: ${o.detail}`;
    const long = hasTxRef(o) && nowMs - o.atMs >= LONG_WAIT_MS ? " A confirmacao esta demorando; o agente continua procurando sozinho e nao precisa de nenhum clique." : "";
    return `${verb}${who} de ${usdText(o.usd, 0)} em ${o.symbol} na rede ${chainName(o.chainIndex)}, ${state} ${agoText(o.atMs, nowMs)}.${why}${said}${long}`;
}
function budgetText(b) {
    return `${b.consults} de ${b.maxConsultsPerDay} consultas ao modelo hoje`;
}
const CONTEXT_LABEL = {
    btc_24h: "BTC em 24 horas",
    eth_24h: "ETH em 24 horas",
    tendencia: "Tendencia do mercado",
    vol_btc: "Volatilidade do BTC",
    fund_btc_bps: "Funding do BTC perpetuo (pontos-base)",
    oi_btc_1h: "Posicoes abertas do BTC em 1 hora",
    s1_escolha: "Leitura do System One",
    s1_regime: "Regime do System One",
    s1_idade_min: "Idade da leitura do System One"
};
function contextRows(context) {
    if (context === null) return [];
    const rows = [];
    for (const [key, label] of Object.entries(CONTEXT_LABEL)){
        const v = context[key];
        if (v === undefined || v === null) continue;
        rows.push({
            label,
            value: typeof v === "number" ? key.endsWith("_min") ? `${v} min` : signedPctText(v) : v
        });
    }
    return rows;
}
function cycleSummary(c) {
    const parts = [];
    if (c.consulted) parts.push(c.modelo === null ? "modelo consultado" : `consultou ${c.modelo}`);
    parts.push(`${c.considered.holdings} posicoes e ${c.considered.buys} compras avaliadas`);
    if (c.considered.protected > 0) parts.push(`${c.considered.protected} pelo plano`);
    return parts.join(", ");
}
const chainName = (chainIndex)=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$onchain$2f$chains$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CHAIN_ORDER"].find((c)=>c.chainIndex === chainIndex)?.name ?? `Rede ${chainIndex}`;
const PROFILE_SPEC = {
    alvo_2: {
        target: 2,
        stop: 1.5
    },
    alvo_5: {
        target: 5,
        stop: 4
    },
    alvo_10: {
        target: 10,
        stop: 6
    },
    alvo_20: {
        target: 20,
        stop: 10
    }
};
function planProgress(profile, sinceEntryPct) {
    const spec = PROFILE_SPEC[profile];
    if (spec === undefined || sinceEntryPct === null || !Number.isFinite(sinceEntryPct)) return null;
    return Math.min(1, Math.max(0, (sinceEntryPct + spec.stop) / (spec.target + spec.stop)));
}
function planLine(plan) {
    if (plan === null) return "";
    const parts = [
        profileText(plan.profile)
    ];
    if (plan.sinceEntryPct !== null) parts.push(`${signedPctText(plan.sinceEntryPct)} desde a entrada`);
    if (plan.targetHit) parts.push(plan.trimmed ? "metade ja realizada, o resto segue o recuo maximo" : "alvo atingido");
    else if (plan.toTargetPct !== null && plan.toTargetPct > 0) parts.push(`faltam ${pctText(plan.toTargetPct)} para o alvo`);
    parts.push(`${Math.round(plan.hoursLeft)} h restantes`);
    return parts.join(", ");
}
const RISK_TEXT = {
    cauteloso: "Cauteloso",
    moderado: "Moderado",
    agressivo: "Agressivo"
};
const RESERVE_TEXT = {
    baixa: "Pouco caixa guardado",
    media: "Caixa normal",
    alta: "Muito caixa guardado"
};
const CONCENTRATION_TEXT = {
    pequena: "Apostas pequenas",
    media: "Apostas medias",
    grande: "Apostas grandes"
};
const LOOK_TEXT = {
    rapido: "Olha o mercado a cada 5 minutos",
    normal: "Olha o mercado a cada 10 minutos",
    calmo: "Olha o mercado a cada 20 minutos"
};
function strategyRows(a) {
    const risk = a.mandate.risk === a.riskTaken ? RISK_TEXT[a.riskTaken] : `${RISK_TEXT[a.riskTaken]} (pediu ${RISK_TEXT[a.mandate.risk].toLowerCase()}, falta medir mais)`;
    return [
        {
            label: "Risco por operacao",
            value: risk,
            note: a.ownerProfile === "arrojado" ? "Perfil arrojado, definido por voce: o agente nao espera a medicao para assumir o risco. Os tetos, o stop de cada posicao e a parada do dia continuam valendo." : a.aggressiveOpen ? "O historico medido liberou o perfil agressivo." : "O perfil agressivo so entra quando a medicao provar vantagem."
        },
        {
            label: "Caixa guardado",
            value: `${RESERVE_TEXT[a.mandate.reserve]} (${Math.round(a.reserveShare * 100)}%)`,
            note: ""
        },
        {
            label: "Tamanho de cada compra",
            value: a.caps.maxBuyUsd === null ? "O Jev escolhe, sem teto fixo" : `${CONCENTRATION_TEXT[a.mandate.concentration]}, ate ${usdText(a.caps.maxBuyUsd, 0)}`,
            note: a.capsSource === "politica_do_dono" ? "Limitado pela politica da sua conta OKX." : a.caps.maxBuyUsd === null ? "Sem teto diario nem por compra, por decisao sua. A trava da sua conta OKX continua valendo." : ""
        },
        {
            label: "Ritmo",
            value: LOOK_TEXT[a.mandate.look],
            note: ""
        }
    ];
}
const POLICY_URL = "https://web3.okx.com/portfolio/agentic-wallet-policy";
const WALLET_STEP = {
    instalar: {
        title: "Instalando o programa da OKX",
        body: "O agente baixa o programa oficial da OKX e confere a assinatura de integridade que a propria OKX publica. Sem ele o agente analisa, mas nao executa.",
        action: "Instalar agora"
    },
    entrar: {
        title: "Entrar na conta OKX",
        body: "A entrada acontece na pagina da propria OKX. O agente passa a gerir a carteira da conta em que voce entrar, com a chave guardada no cofre da OKX: se voce ja usa a carteira da OKX com essa conta, e a mesma carteira, com os mesmos ativos.",
        action: "Abrir a pagina de entrada"
    },
    depositar: {
        title: "Saldo na carteira do agente",
        body: "O agente negocia o que estiver na carteira da conta OKX em que voce entrou, nos enderecos abaixo. Se voce ja usa a carteira da OKX com esta conta, os seus ativos ja estao aqui e nao ha nada para enviar. Ativos que estiverem em outra carteira (outro aplicativo ou extensao) so entram se voce os transferir para estes enderecos, como estao, sem vender: escolha o quanto.",
        action: null
    },
    definir_politica: {
        title: "Ligar os limites de seguranca no portal da OKX",
        body: "Para executar, o agente exige que os limites da carteira dele estejam ligados no portal da OKX. E uma trava da propria OKX que nem este app consegue desfazer: mesmo que algo de errado aconteca aqui, a carteira nao passa dos limites. Abra a pagina, entre com a mesma conta e ligue os tres limites: por transacao (sugestao US$ 25), por dia em compras e vendas (sugestao US$ 100) e por dia em transferencias (sugestao US$ 1, ja que o agente nunca transfere para fora). Depois volte aqui: esta tela percebe sozinha.",
        action: "Abrir os limites na OKX"
    },
    operando: {
        title: "Operando",
        body: "A carteira do agente esta pronta e ele executa sozinho.",
        action: null
    }
};
function eventLine(e, nowMs) {
    const what = e.kind === "conectou" ? "Carteira conectada" : e.kind === "desconectou" ? "Carteira desconectada" : e.kind === "pausou" ? "Compras novas pausadas" : "Compras novas voltaram";
    return `${agoText(e.atMs, nowMs)}. ${what}${e.kind === "pausou" ? `: ${reasonText(e.reason).toLowerCase()}` : ""}`;
}
const FAMILY_TEXT = {
    carteiras: "carteiras rastreadas comprando",
    fluxo: "fluxo comprador",
    liquidez: "liquidez boa",
    tracao: "tracao de volume",
    distribuicao: "distribuicao saudavel",
    retracao: "retracao dentro da alta",
    alta_com_folego: "alta com folego"
};
/** Why the code closed a purchase (the model was offered only to skip it). */ const CLOSED_TEXT = {
    entrada_esticada: "preco esticado, entrar agora seria comprar no alto",
    sem_historico: "sem historico de preco suficiente",
    sem_perfil: "volatilidade sem alvo e stop que se sustentem",
    estagnado: "parado ha horas, prenderia o capital a toa",
    sem_tamanho: "sem caixa nessa rede para uma ordem minima",
    abaixo_do_minimo: "o caixa dessa rede existe, mas nem a menor fatia chega na ordem minima da rede"
};
function radarRows(view) {
    return view.map((v)=>{
        const closed = v.kind === "buy" && v.closed !== null && v.closed !== undefined;
        const verdict = v.stance === null ? "Avaliando" : closed ? "Fechada pelo codigo" : v.kind === "buy" && v.stance === "skip" ? "Nao comprar" : stanceText(v.stance);
        const reasons = [
            ...closed ? [
                CLOSED_TEXT[v.closed] ?? v.closed.replace(/_/g, " ")
            ] : [],
            ...v.families.map((f)=>FAMILY_TEXT[f] ?? f.replace(/_/g, " ")),
            ...v.marks.map((m)=>m.replace(/_/g, " "))
        ].slice(0, 3);
        return {
            id: v.id,
            symbol: v.symbol,
            chain: chainName(v.chainIndex),
            kind: v.kind,
            verdict,
            why: reasons.join(", ")
        };
    });
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/agent/wallet-connect.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Connecting the wallet from the browser: the one click the person makes. The OKX extension injects `window.okxwallet` (an EIP-1193 provider for the EVM networks, and `okxwallet.solana` for Solana). The
 * addresses it gives are public; nothing here signs anything or asks for a signature. Pure over the window it is handed, so the tests run without a browser. An absent extension is not an error of the
 * connection: the agent's own wallet comes with the sign-in that follows, and the extension only adds the person's own wallet to the picture.
 */ __turbopack_context__.s([
    "connectBrowserWallet",
    ()=>connectBrowserWallet
]);
const EVM = /^0x[0-9a-fA-F]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
async function connectBrowserWallet(win) {
    const provider = win?.okxwallet;
    if (provider === undefined || typeof provider.request !== "function") return {
        ok: false,
        reason: "sem_extensao"
    };
    let evm = null;
    try {
        const accounts = await provider.request({
            method: "eth_requestAccounts"
        });
        const first = Array.isArray(accounts) ? accounts.find((a)=>typeof a === "string" && EVM.test(a)) : undefined;
        evm = first === undefined ? null : first.toLowerCase();
    } catch  {
        return {
            ok: false,
            reason: "recusada"
        };
    }
    let solana = null;
    try {
        const sol = provider.solana;
        if (sol !== undefined && typeof sol.connect === "function") {
            const answer = await sol.connect();
            const key = (answer?.publicKey ?? sol.publicKey)?.toString();
            solana = key !== undefined && SOLANA.test(key) ? key : null;
        }
    } catch  {
        // Solana is optional: a refusal there does not undo the EVM connection
        solana = null;
    }
    return evm === null && solana === null ? {
        ok: false,
        reason: "sem_conta"
    } : {
        ok: true,
        wallet: {
            evm,
            solana
        }
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/draw/analysis.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** The analysis panels for wide screens: where every decision, asset and result can be examined. Each panel draws in local coordinates; the size is in the comment of each. */ __turbopack_context__.s([
    "createAnalysis",
    ()=>createAnalysis
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$insights$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/insights.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/h.ts [app-client] (ecmascript)");
;
;
const ribbon = (x0, y0, h0, x1, y1, h1)=>{
    const xm = (x0 + x1) / 2;
    return `M${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x0)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y0)}C${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(xm)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y0)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(xm)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y1)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x1)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y1)}L${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x1)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y1 + h1)}C${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(xm)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y1 + h1)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(xm)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y0 + h0)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x0)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y0 + h0)}Z`;
};
const NO_ANALYSIS = "A VERSAO DO NUCLEO NAO ENVIA A ANALISE";
const NO_BAR = "O CODIGO NAO TEM BARRA DE CONVICCAO: A ESCOLHA DO JEV E A DECISAO";
const HISTORY = "ATE 14/10 HAVIA UMA BARRA DE 20 (P 60%), JA RETIRADA: SO HISTORICO, NAO REGRA";
const ALLOC_COLORS = [
    "#2ee6ff",
    "#38ffb4",
    "#7df3ff",
    "#ffb23e",
    "#5fa3b5",
    "#a58cff",
    "#ff6048",
    "#8fd3ff"
];
function createAnalysis(D) {
    const A = D.a;
    const cands = D.candidates;
    const net = A.trips.reduce((a, t)=>a + (t.out - t.in), 0);
    // from every item of purchase down to the order that really went out. natural size 1100 x 400
    function funnel() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(1100, 400, "DO ITEM AO RECIBO", NO_ANALYSIS);
        const F = A.funnel;
        const scale = 132 / Math.max(1, F.items);
        const hh = (c)=>Math.max(6, c * scale);
        const cy = 208;
        const blocked = blockedLine();
        // no bar of conviction stands between what the Jev asked for and the order: what the code drops is blocked by its own checks (cash, minimum of the network, ceilings, the order of the cycle), and each is said as that
        const stages = [
            [
                "ITENS DE COMPRA",
                F.items
            ],
            [
                "ABERTOS AO JEV",
                F.open
            ],
            [
                "PEDIDOS PELO JEV",
                F.asked
            ],
            [
                "ORDENS ENVIADAS",
                F.applied
            ],
            [
                "EXECUTADAS",
                F.executed
            ]
        ];
        const drops = [
            [
                "FECHADOS PELO CODIGO",
                F.items - F.open,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute
            ],
            [
                "PULADOS PELO JEV",
                F.open - F.asked,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy
            ],
            [
                "BLOQUEADOS PELO CODIGO",
                F.asked - F.applied,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ],
            [
                "NAO EXECUTADOS",
                F.applied - F.executed,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].red
            ]
        ];
        const xs = [
            90,
            310,
            530,
            750,
            970
        ];
        const bw = 26;
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(1100, "DO ITEM AO RECIBO", `AS ULTIMAS ${F.consults} CONSULTAS: ONDE CADA CANDIDATO FICOU PELO CAMINHO`);
        stages.forEach(([name, c], i)=>{
            const h = hh(c), y = cy - h / 2, x = xs[i];
            s += `<rect class="grow-y" x="${x}" y="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y)}" width="${bw}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(h)}" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy}" opacity=".9" style="animation-delay:${(i * 0.12).toFixed(2)}s"/>`;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + bw / 2, 84, name, "t-sub", "font-size:10px;fill:#7df3ff", "middle") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["countText"])(x + bw / 2, 112, c, 0, "", "", "t-num", "font-size:22px", "middle");
            if (i < stages.length - 1) {
                const cn = stages[i + 1][1], hn = hh(cn), yn = cy - hn / 2, x1 = xs[i + 1];
                s += `<path d="${ribbon(x + bw, y, hn, x1, yn, hn)}" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy}" opacity=".22"/>`;
                s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])((x + bw + x1) / 2, cy + 4, c ? Math.round(cn / c * 100) + "%" : "-", "t-mono", "font-size:11px;fill:#bfefff", "middle");
                const [dn, dc, dcol] = drops[i];
                const dh = hh(dc), dy = 296, dx = x + 90;
                s += `<path d="${ribbon(x + bw, y + hn, Math.max(2, Math.min(dh, h - hn)), dx, dy, dh)}" fill="${dcol}" opacity=".25"/>`;
                s += `<rect class="grow-y" x="${dx}" y="${dy}" width="${bw}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(dh)}" fill="${dcol}" opacity=".9" style="animation-delay:${(0.5 + i * 0.12).toFixed(2)}s"/>`;
                s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(dx + bw + 10, dy + 12, String(dc), "t-num", `font-size:17px;fill:${dcol}`) + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(dx + bw + 10, dy + 28, dn, "t-sub", "font-size:9.5px");
                // the reason the code gave for what it dropped in the last cycle, under the count
                if (i === 2 && blocked.length > 0) s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(dx + bw + 10, dy + 42, blocked[0], "t-mono", `font-size:9.5px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}`);
            }
        });
        const flow = `M${xs[0] + bw} ${cy}` + xs.slice(1).map((x)=>`L${x} ${cy}`).join("");
        s += `<circle r="4" fill="#e9fbff" class="glow"><animateMotion dur="5s" repeatCount="indefinite" path="${flow}"/></circle>`;
        s += `<circle r="3" fill="#2ee6ff"><animateMotion dur="5s" begin="-2.5s" repeatCount="indefinite" path="${flow}"/></circle>`;
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 382, "CADA ITEM E UM TOKEN OFERECIDO EM UMA CONSULTA. O MESMO TOKEN PODE APARECER EM VARIAS CONSULTAS", "t-sub", "font-size:9.5px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 397, "FECHADOS PELO CODIGO: SEM CAIXA OU ABAIXO DO MINIMO DA REDE. BLOQUEADOS PELO CODIGO: PEDIDOS DO JEV QUE O CODIGO NAO ENVIOU", "t-sub", "font-size:9.5px");
    }
    /** What the code dropped in the last cycle, as a short line for under a count (empty when it dropped nothing): the first symbols and the reason. */ function blockedLine() {
        const g = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$insights$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["blockedGroups"])(D)[0];
        return g === undefined ? [] : [
            `ULTIMO: ${g.names}, ${g.text}`.slice(0, 40)
        ];
    }
    // how much the Jev wanted to buy, over every answer. natural size 700 x 400
    function hist() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(700, 400, "O QUANTO O JEV QUIS COMPRAR", NO_ANALYSIS);
        const all = A.hist.all, nw = A.hist.fresh;
        const x0 = 30, W = 640, y1 = 330, Hh = 240, bw = W / 20;
        const max = Math.max(...all, 1);
        const total = all.reduce((a, b)=>a + b, 0);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(700, "O QUANTO O JEV QUIS COMPRAR", `PREFERENCIA DE COMPRA EM ${total} RESPOSTAS, DE 0 A 100%`);
        for(let i = 0; i < 4; i++)s += `<line x1="${x0}" x2="${x0 + W}" y1="${y1 - i * Hh / 3}" y2="${y1 - i * Hh / 3}" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].grid}" stroke-dasharray="2 6"/>`;
        all.forEach((c, i)=>{
            const h = c / max * Hh, x = x0 + i * bw;
            s += `<rect class="grow-y" x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x + 3)}" y="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y1 - h)}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(bw - 6)}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(Math.max(h, 0.5))}" fill="#136a80" style="animation-delay:${(i * 0.03).toFixed(2)}s"/>`;
            const hn = (nw[i] ?? 0) / max * Hh;
            if (nw[i]) s += `<rect class="grow-y" x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x + 8)}" y="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y1 - hn)}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(bw - 16)}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(hn)}" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy}" style="animation-delay:${(0.4 + i * 0.03).toFixed(2)}s"/>`;
            if (c >= max * 0.45) s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + bw / 2, y1 - h - 6, String(c), "t-mono", "font-size:10.5px", "middle");
        });
        for (const v of [
            0,
            20,
            40,
            60,
            80,
            100
        ])s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0 + v / 100 * W, y1 + 18, v + "%", "t-sub", "font-size:10px", "middle");
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0, 372, "ESCURO: TODAS AS RESPOSTAS. CLARO: DEPOIS DA REDACAO NOVA DAS PERGUNTAS", "t-sub", "font-size:9.5px");
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0, 388, "A ALTURA E QUANTAS VEZES O JEV DEU ESSA PREFERENCIA. NAO E CHANCE DE LUCRO", "t-sub", "font-size:9.5px");
    }
    // the six judgments of the Jev about each candidate. natural size 1100 x 420
    function matrix() {
        const open = cands.filter((c)=>!c.closed).sort((a, b)=>(b.pbuy ?? 0) - (a.pbuy ?? 0));
        const rows = [
            ...open,
            ...cands.filter((c)=>c.closed)
        ].slice(0, 9);
        const cols = [
            [
                "late_entry",
                "ATRASADO",
                "risk"
            ],
            [
                "still_falling",
                "AINDA CAINDO",
                "risk"
            ],
            [
                "accumulating",
                "ACUMULANDO",
                "good"
            ],
            [
                "exit_easy",
                "SAIDA FACIL",
                "good"
            ],
            [
                "distribution",
                "DISTRIB.",
                "risk"
            ],
            [
                "fading",
                "PERDE FORCA",
                "risk"
            ]
        ];
        const x0 = 200, cw = 100, y0 = 98, rh = 34;
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(1100, "O QUE O JEV JULGOU, CANDIDATO POR CANDIDATO", "CADA CELULA E UMA PERGUNTA FECHADA, DE 0 A 100. AMBAR: RISCO. CIANO: FAVOR");
        if (rows.length === 0) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 120, "AINDA SEM CONSULTA COM CANDIDATOS NESTA SESSAO", "t-sub", "font-size:10px");
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y0 - 14, "CANDIDATO", "t-sub", "font-size:10px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(112, y0 - 14, "COMPRA", "t-sub", "font-size:9.5px");
        cols.forEach(([, lab], i)=>{
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0 + i * cw + cw / 2 - 4, y0 - 14, lab, "t-sub", "font-size:9.5px", "middle");
        });
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0 + 6 * cw + 20, y0 - 14, "SITUACAO", "t-sub", "font-size:10px");
        rows.forEach((c, r)=>{
            const y = y0 + r * rh, dim = c.closed;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y + 20, c.s, "t-num", `font-size:15px;fill:${dim ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white}`);
            if (!dim) s += `<rect x="112" y="${y + 12}" width="48" height="6" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].dim}"/><rect class="grow-x" x="112" y="${y + 12}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clamp"])((c.pbuy ?? 0) / 0.8, 0, 1) * 48)}" height="6" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy}" style="animation-delay:${(r * 0.05).toFixed(2)}s"/>`;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0 - 10, y + 19, dim || c.pbuy === null ? "-" : Math.round(c.pbuy * 100) + "%", "t-mono", `font-size:12px;fill:${dim ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute : "#7df3ff"}`, "end");
            const vals = cols.map(([k])=>c.facets[k]);
            const mx = Math.max(...vals.filter((v)=>typeof v === "number"), -1);
            cols.forEach(([k, , kind], i)=>{
                const v = c.facets[k], x = x0 + i * cw, has = typeof v === "number";
                const col = kind === "good" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber;
                s += `<rect x="${x + 2}" y="${y + 2}" width="${cw - 8}" height="${rh - 6}" fill="${has ? col : "#0b2c38"}" opacity="${has ? (0.1 + 0.8 * v).toFixed(2) : "0.25"}" ${has && v === mx ? `stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white}" stroke-width="1.4"` : ""}/>`;
                s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + cw / 2 - 4, y + 21, has ? String(Math.round(v * 100)) : "-", "t-mono", `font-size:13px;fill:${has ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute}`, "middle");
            });
            // what the Jev asked for is his own choice; a request the code dropped afterwards is not a decision carried out, and the screen says who stopped it
            const asked = c.applied !== null && c.applied !== "skip";
            const status = dim ? "FECHADO PELO CODIGO" : c.blocked !== null ? "PEDIU E O CODIGO BLOQUEOU" : asked ? "PEDIU COMPRAR" : "O JEV PULOU";
            const scol = dim ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute : c.blocked !== null ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber : asked ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0 + 6 * cw + 20, y + (c.blocked !== null ? 17 : 20), status, "t-sub", `font-size:10px;fill:${scol}`);
            if (c.blocked !== null && !dim) s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0 + 6 * cw + 20, y + 30, c.blocked.text, "t-mono", `font-size:9.5px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}`);
        });
        s += `<g style="--h:${rows.length * rh}px;animation:hud-scany 6s linear infinite"><rect x="0" y="${y0 - 8}" width="1100" height="3" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy}" opacity=".35"/><rect x="0" y="${y0 - 30}" width="1100" height="22" fill="url(#sweepV)"/></g>`;
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 412, "A CELULA COM CONTORNO E A MAIOR DA LINHA. NENHUMA REGRA DO CODIGO LE A FACETA PERDE FORCA HOJE", "t-sub", "font-size:9.5px");
    }
    // the Jev's own preference for each purchase he asked for, with no bar line: his choice is the decision. natural size 700 x 420
    function preferences() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(700, 420, "PREFERENCIA DO JEV POR PEDIDO", NO_ANALYSIS);
        const asks = A.asks.slice(-10).reverse();
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(700, "PREFERENCIA DO JEV POR PEDIDO", `${A.asks.length} PEDIDOS DE COMPRA NAS ULTIMAS CONSULTAS, COM A PROBABILIDADE QUE ELE MESMO DEU`);
        const gx = 220, gw = 280;
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(gx, 80, "PREFERENCIA DE COMPRA, 0 A 100%", "t-sub", "font-size:9.5px");
        asks.forEach((a, i)=>{
            const y = 94 + i * 30, pass = a.ok;
            // a request of the last cycle that the code then dropped is not a decision carried out, so it says who stopped it
            const held = pass && D.last.atMs !== null && Math.abs(a.t - D.last.atMs) < 1000 && D.last.dropped.some((d)=>d.side === "buy" && d.s === (a.s ?? "").slice(0, 14));
            const shade = held ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber : pass ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y + 12, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(a.t), "t-mono", "font-size:11.5px;fill:#5fa3b5") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(58, y + 12, (a.s ?? "-").slice(0, 9), "t-num", "font-size:14px");
            s += `<rect x="${gx}" y="${y + 3}" width="${gw}" height="10" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].dim}"/><rect class="grow-x" x="${gx}" y="${y + 3}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clamp"])(a.p, 0, 1) * gw)}" height="10" fill="${shade}" style="animation-delay:${(i * 0.06).toFixed(2)}s"/>`;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(gx + gw + 14, y + 13, "P " + Math.round(a.p * 100) + "%", "t-mono", "font-size:12px;fill:#bfefff") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(700, y + 13, held ? "BLOQUEADA" : pass ? "PEDIDA" : "SEM ORDEM", "t-sub", `font-size:10px;fill:${shade}`, "end");
        });
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 396, NO_BAR, "t-sub", "font-size:9.5px");
        // older requests that did not become an order are history: until 2026-10-14 a bar of 20 (P 60%) stood there, and it is gone
        return A.asks.some((a)=>!a.ok) ? s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 411, HISTORY, "t-sub", `font-size:9.5px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute}`) : s;
    }
    // every consult of the last hours, as a strip. natural size 1840 x 84
    function timeline() {
        if (!D.analysisOk || A.timeline.length === 0) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 14, D.analysisOk ? "AINDA SEM CONSULTAS NESTA SESSAO" : "LINHA DO TEMPO: " + NO_ANALYSIS, "t-sub", "font-size:10px");
        const T = A.timeline, w = 1840 / T.length, mx = Math.max(...T.map((t)=>t.open), 1);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 12, `ULTIMAS ${T.length} CONSULTAS: ABERTOS AO JEV (CIANO), PEDIDOS DE COMPRA (AMBAR), ORDENS ENVIADAS (VERDE)`, "t-sub", "font-size:10px");
        T.forEach((t, i)=>{
            const x = i * w;
            const h = (v)=>Math.max(v ? 3 : 0, v / mx * 30);
            s += `<rect class="grow-y" x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x + 3)}" y="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(54 - h(t.open))}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(w * 0.3)}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(h(t.open))}" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy}" opacity=".85" style="animation-delay:${(i * 0.02).toFixed(2)}s"/>`;
            s += `<rect class="grow-y" x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x + 3 + w * 0.34)}" y="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(54 - h(t.asked))}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(w * 0.3)}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(h(t.asked))}" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}" style="animation-delay:${(i * 0.02).toFixed(2)}s"/>`;
            s += `<rect class="grow-y" x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x + 3 + w * 0.68)}" y="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(54 - h(t.applied))}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(w * 0.25)}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(h(t.applied))}" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green}" style="animation-delay:${(i * 0.02).toFixed(2)}s"/>`;
            if (i % 5 === 0) s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 3, 68, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(t.t), "t-sub", "font-size:9px");
        });
        return s;
    }
    // the wallet by asset. natural size 900 x 480
    function allocation() {
        const ps = D.wallet.positions.filter((p)=>p.usd !== null && p.usd > 0).sort((a, b)=>(b.usd ?? 0) - (a.usd ?? 0));
        const total = D.wallet.total ?? ps.reduce((a, p)=>a + (p.usd ?? 0), 0);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(900, "A CARTEIRA, ATIVO POR ATIVO", total > 0 ? `US$ ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(total)} NA CARTEIRA GERIDA, SO O QUE TEM PRECO` : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNote"])(D.wallet.lastReadMs));
        if (!(total > 0)) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 100, "SEM LEITURA DA CARTEIRA", "t-sub", "font-size:10px");
        const cx = 190, cy = 275, R = 128;
        let acc = 0;
        let donut = "";
        ps.forEach((p, i)=>{
            const sw = (p.usd ?? 0) / total * 360;
            if (sw > 0.4) donut += `<path class="draw" pathLength="1" d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, R, acc + 0.8, acc + sw - 0.8)}" stroke="${ALLOC_COLORS[i % ALLOC_COLORS.length]}" stroke-width="34" fill="none" style="animation-delay:${(i * 0.12).toFixed(2)}s"/>`;
            acc += sw;
        });
        s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].dim}" stroke-width="34"/>${donut}`;
        s += `<g class="spin-d" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="${R + 30}" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="3 9"/></g><g class="spin-c" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="${R - 30}" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="1 7"/></g>`;
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["countText"])(cx, cy - 4, total, 2, "US$ ", "", "t-big", "font-size:30px", "middle") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 22, ps.length + " ATIVOS COM PRECO", "t-sub", "font-size:10.5px", "middle");
        ps.slice(0, 8).forEach((p, i)=>{
            const y = 100 + i * 42, share = (p.usd ?? 0) / total, col = ALLOC_COLORS[i % ALLOC_COLORS.length];
            s += `<rect x="400" y="${y - 12}" width="14" height="14" fill="${col}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(426, y, p.s, "t-num", "font-size:17px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(700, y, "US$ " + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(p.usd), "t-mono", "font-size:14px", "end");
            s += `<rect x="716" y="${y - 10}" width="120" height="8" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].dim}"/><rect class="grow-x" x="716" y="${y - 10}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(Math.max(2, share * 120))}" height="8" fill="${col}" style="animation-delay:${(i * 0.08).toFixed(2)}s"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(900, y, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(share * 100, 1) + "%", "t-mono", "font-size:13px", "end");
            const tag = p.cash ? "CAIXA EM USDC" : p.plan ? "COM PLANO DE SAIDA" : "SEM PLANO DE SAIDA";
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(426, y + 16, tag, "t-sub", `font-size:9.5px;fill:${p.cash ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft : p.plan ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}`);
        });
        const unpriced = D.wallet.positions.filter((p)=>p.usd === null || p.usd <= 0).length;
        return unpriced ? s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(400, 100 + Math.min(8, ps.length) * 42 + 4, `+ ${unpriced} TOKENS SEM PRECO NA LEITURA, FORA DESTA SOMA`, "t-sub", "font-size:10px") : s;
    }
    // the equity curve with every order on it. natural size 900 x 480
    function equityMarks() {
        const eq = D.equity;
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(900, "O PATRIMONIO E AS ORDENS", "CADA TRIANGULO E UMA ORDEM EXECUTADA. VALORES DA CARTEIRA GERIDA");
        if (eq.length < 2) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 100, "AINDA SEM HISTORICO DA CARTEIRA", "t-sub", "font-size:10px");
        const x0 = 20, x1 = 880, y0 = 100, y1 = 380;
        const vmin = Math.min(...eq.map((p)=>p.v)), vmax = Math.max(...eq.map((p)=>p.v));
        const t0 = eq[0].t, t1 = eq[eq.length - 1].t;
        const px = (t)=>x0 + (t - t0) / (t1 - t0 || 1) * (x1 - x0);
        const py = (v)=>y1 - (v - vmin) / (vmax - vmin || 1) * (y1 - y0);
        const line = eq.map((p, i)=>`${i ? "L" : "M"}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(px(p.t))} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(py(p.v))}`).join("");
        for(let i = 0; i < 5; i++){
            const y = y0 + i * (y1 - y0) / 4;
            s += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].grid}" stroke-dasharray="2 6"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x1, y - 4, "US$ " + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(vmax - i * (vmax - vmin) / 4), "t-sub", "font-size:9.5px", "end");
        }
        s += `<path d="${line}L${x1} ${y1}L${x0} ${y1}Z" fill="url(#areaGrad)"/><path class="draw glow" pathLength="1" d="${line}" fill="none" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy}" stroke-width="2.2"/><circle r="4" fill="#e9fbff" class="glow"><animateMotion dur="12s" repeatCount="indefinite" path="${line}"/></circle>`;
        const labelled = [];
        // the latest orders first, so the label that stays is the newest one
        [
            ...D.events
        ].filter((e)=>e.t >= t0).reverse().forEach((e)=>{
            const x = px(e.t), y = py(eq.reduce((m, p)=>Math.abs(p.t - e.t) < Math.abs(m.t - e.t) ? p : m).v), ok = e.stage === "executada";
            const col = !ok ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].red : e.side === "buy" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber;
            s += ok ? e.side === "buy" ? `<path d="M${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y - 12)}l7 12h-14z" fill="${col}"/>` : `<path d="M${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y + 12)}l7 -12h-14z" fill="${col}"/>` : `<path d="M${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x - 5)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y - 5)}l10 10M${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x + 5)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y - 5)}l-10 10" stroke="${col}" stroke-width="2"/>`;
            if (e.t > t1 - 150 * 60000 && !labelled.some((lx)=>Math.abs(lx - x) < 64)) {
                labelled.push(x);
                s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x, y + (e.side === "buy" ? -18 : 26), e.s, "t-sub", `font-size:9.5px;fill:${col}`, "middle");
            }
        });
        s += `<g style="--w:${x1 - x0}px;animation:hud-scan 11s linear infinite"><line x1="${x0}" x2="${x0}" y1="${y0 - 10}" y2="${y1 + 10}" stroke="#bff6ff" stroke-width="1.3" opacity=".5"/></g>`;
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0, y1 + 24, new Date(t0).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        }), "t-sub", "font-size:10px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x1, y1 + 24, "AGORA", "t-sub", "font-size:10px", "end");
        s += `<path d="M${x0} 440l9 -10h14z" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0 + 28, 440, "COMPRA", "t-sub", "font-size:10px") + `<path d="M${x0 + 110} 430l9 10h14z" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0 + 138, 440, "VENDA", "t-sub", "font-size:10px");
        s += `<path d="M${x0 + 215} 432l10 10M${x0 + 225} 432l-10 10" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].red}" stroke-width="2"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0 + 236, 440, "ORDEM COM FALHA", "t-sub", "font-size:10px");
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0, 466, "A CURVA MISTURA APORTES, PRECOS DOS TOKENS QUE JA ESTAVAM NA CARTEIRA E O RESULTADO DAS ORDENS. NAO E LUCRO DO SISTEMA", "t-sub", "font-size:9.5px");
    }
    // each closed position, entry to exit. natural size 900 x 380
    function tripCards() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(900, 380, "POSICOES JA ENCERRADAS", NO_ANALYSIS);
        const rows = A.trips.slice(-2);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(900, "POSICOES JA ENCERRADAS", "DA COMPRA A VENDA, COM O CAIXA QUE ENTROU E O QUE VOLTOU");
        if (!rows.length) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 100, "AINDA NAO HA VOLTA FECHADA", "t-sub", "font-size:11px");
        rows.forEach((t, i)=>{
            const x = i * 450, col = t.pct >= 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber, mins = Math.round((t.sellAt - t.buyAt) / 60000), len = Math.min(190, Math.abs(t.pct) * 60);
            s += `<g transform="translate(${x} 70)"><rect x="0" y="0" width="420" height="250" fill="#031820" stroke="#124c5f" stroke-width="1"/><path d="M0 0h30M0 0v30M420 250h-30M420 250v-30" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy}" stroke-width="2" fill="none"/>
        ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(20, 38, t.s, "t-big", `font-size:${Math.min(28, Math.floor(245 / (Math.max(1, t.s.length) * 0.74)))}px`)}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(400, 36, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pct"])(t.pct), "t-big", `font-size:28px;fill:${col}`, "end")}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(20, 60, `FICOU ${mins} MINUTOS, ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(t.buyAt)} ATE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(t.sellAt)}`, "t-sub", "font-size:10px")}
        <line x1="40" y1="120" x2="380" y2="120" stroke="#124c5f" stroke-width="2"/><line x1="40" y1="120" x2="380" y2="120" stroke="${col}" stroke-width="2" class="flow-fast"/>
        <circle cx="40" cy="120" r="8" fill="#031820" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green}" stroke-width="2"/><circle cx="380" cy="120" r="8" fill="#031820" stroke="${col}" stroke-width="2"/>
        <circle r="4.5" fill="#e9fbff" class="glow"><animateMotion dur="${(3 + i).toFixed(1)}s" repeatCount="indefinite" path="M40 120L380 120"/></circle>
        ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(40, 148, "COMPRA", "t-sub", "font-size:9.5px", "middle")}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(380, 148, "VENDA", "t-sub", "font-size:9.5px", "middle")}
        ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(40, 98, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(t.in) + " USDC", "t-mono", "font-size:12.5px;fill:#bfefff", "middle")}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(380, 98, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(t.out) + " USDC", "t-mono", `font-size:12.5px;fill:${col}`, "middle")}
        ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(20, 190, "RESULTADO DO CAIXA", "t-sub", "font-size:10px")}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(400, 192, (t.out - t.in >= 0 ? "+" : "") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(t.out - t.in, 4) + " USDC", "t-num", `font-size:19px;fill:${col}`, "end")}
        <rect x="20" y="206" width="380" height="8" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].dim}"/><rect class="grow-x" x="${t.pct >= 0 ? 210 : 210 - len}" y="206" width="${len}" height="8" fill="${col}"/><line x1="210" x2="210" y1="200" y2="220" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft}"/>
        ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(20, 238, "ANTES DA TAXA EM SOL. QUEM VENDEU FOI A DECISAO DO MODELO", "t-sub", "font-size:9.5px")}</g>`;
        });
        const withPlan = D.wallet.positions.filter((p)=>p.plan !== null);
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 360, withPlan.length ? `${withPlan.length} POSICAO(OES) ABERTA(S) COM PLANO, VEJA ONDE ESTA O CAPITAL` : "SEM POSICAO ABERTA COM PLANO AGORA. QUANDO HOUVER, O PLANO (ALVO, STOP, PRAZO) APARECE AQUI", "t-sub", "font-size:10px");
    }
    // the limits of the day. natural size 900 x 380
    function limits() {
        const sp = A.orders.spentToday;
        const cap = D.agent.caps ?? {
            maxBuyUsd: undefined,
            maxDailyBuyUsd: undefined,
            maxDailySellUsd: undefined
        };
        const total = D.wallet.total ?? 0;
        // a wallet nobody read has no share of cash: the ring stays empty and says so, instead of a zero that looks like a fact
        const unread = D.wallet.cash === null || !(total > 0);
        const cashShare = unread ? 0 : D.wallet.cash / total;
        const known = D.analysisOk;
        // A placeholder zero is not a reported spend; ceilings still come from core status.
        const gauges = [
            [
                "COMPRAS HOJE",
                known ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capUse"])(sp.buy, cap.maxDailyBuyUsd) : null,
                known ? `US$ ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(sp.buy, 0)} DE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capText"])(cap.maxDailyBuyUsd)}` : `SEM DADO DO NUCLEO, LIMITE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capText"])(cap.maxDailyBuyUsd)}`,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy,
                known ? undefined : "SEM DADO"
            ],
            [
                "VENDAS HOJE",
                known ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capUse"])(sp.sell, cap.maxDailySellUsd) : null,
                known ? `US$ ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(sp.sell, 0)} DE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capText"])(cap.maxDailySellUsd)}` : `SEM DADO DO NUCLEO, LIMITE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capText"])(cap.maxDailySellUsd)}`,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft,
                known ? undefined : "SEM DADO"
            ],
            [
                "CONSULTAS DO MODELO",
                D.budget.max > 0 ? D.budget.consults / D.budget.max : 0,
                `${D.budget.consults} DE ${D.budget.max}`,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy
            ],
            [
                "CAIXA LIVRE",
                cashShare,
                unread ? "SEM LEITURA DA CARTEIRA" : `${Math.round(cashShare * 100)}% DA CARTEIRA`,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green,
                unread ? "-" : undefined
            ]
        ];
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(900, "LIMITES E RISCO DO DIA", "ATE ONDE O AGENTE PODE IR SEM PEDIR NADA A VOCE");
        gauges.forEach(([lab, f, val, col, centre], i)=>{
            const cx = 100 + i * 230, cy = 140, fr = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clamp"])(f ?? 0, 0, 1);
            s += `<circle cx="${cx}" cy="${cy}" r="52" fill="none" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].dim}" stroke-width="12"/><path class="draw" pathLength="1" d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, 52, 0, Math.max(2, fr * 359))}" fill="none" stroke="${col}" stroke-width="12" style="animation-delay:${(i * 0.15).toFixed(2)}s"/>
        <g class="${i % 2 ? "spin-c" : "spin-d"}" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="66" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="3 9"/></g>
        ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 6, centre ?? (f === null ? "LIVRE" : Math.round(fr * 100) + "%"), "t-num", `font-size:${f === null ? 14 : 20}px`, "middle")}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 92, lab, "t-sub", "font-size:10px", "middle")}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 108, val, "t-mono", "font-size:11.5px;fill:#7df3ff", "middle")}`;
        });
        // only what the core says: no risk per operation and no minimum order are rules of the code any more (the Jev sizes the order), and a ceiling is shown as it is, "SEM TETO" when there is none
        const rules = [
            [
                "TETO DE UMA COMPRA",
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capText"])(cap.maxBuyUsd)
            ],
            [
                "RESERVA EM CAIXA",
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(D.agent.reserveShare * 100, 0) + "%"
            ],
            [
                "ALAVANCAGEM",
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["leverageText"])(D.agent.leverage)
            ],
            [
                "AUTORIDADE",
                D.agent.authority.toUpperCase() + ", PERFIL " + D.agent.profile.toUpperCase()
            ]
        ];
        rules.forEach(([a, b], i)=>{
            const x = i % 3 * 300, y = 290 + Math.floor(i / 3) * 44;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x, y, a, "t-sub", "font-size:10px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x, y + 18, b, "t-mono", "font-size:12.5px;fill:#bfefff");
        });
        return s;
    }
    function kpis() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(1840, 150, "RESULTADO", NO_ANALYSIS);
        const neg = A.trips.filter((t)=>t.pct < 0).length, o = A.orders.outcomes;
        const eq = D.equity;
        const win = eq.length > 1 ? (eq[eq.length - 1].v / eq[0].v - 1) * 100 : null;
        const ok = o.executada ?? 0, fail = o.falhou ?? 0;
        const blocks = [
            [
                "VOLTAS FECHADAS",
                String(A.trips.length),
                `${neg} DE ${A.trips.length} NEGATIVAS`,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white,
                [
                    A.trips.length,
                    0,
                    "",
                    ""
                ]
            ],
            [
                "CAIXA DAS VOLTAS",
                (net > 0 ? "+" : "") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(net, 3) + " USDC",
                "ANTES DA TAXA EM SOL",
                net >= 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber,
                [
                    net,
                    3,
                    net > 0 ? "+" : "",
                    " USDC"
                ]
            ],
            [
                "TAXAS DE REDE",
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(A.fees.lamports / 1e9, 5) + " SOL",
                `${A.fees.fills} RECIBOS, SO A REDE`,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white,
                [
                    A.fees.lamports / 1e9,
                    5,
                    "",
                    " SOL"
                ]
            ],
            [
                "ORDENS",
                `${ok} OK DE ${ok + fail}`,
                `${fail} FALHARAM NA CADEIA`,
                fail ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green
            ],
            [
                "CARTEIRA NA JANELA",
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pct"])(win, 1),
                "INCLUI APORTES, NAO E LUCRO",
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft,
                win === null ? undefined : [
                    win,
                    1,
                    win > 0 ? "+" : "",
                    "%"
                ]
            ]
        ];
        let s = "";
        blocks.forEach(([lab, val, sub, col, count], i)=>{
            const x = i * 372;
            s += `<path d="M${x} 6V0H${x + 332}" fill="none" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy}" stroke-width="1.4"/>${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 4, 28, lab, "t-title", "font-size:12.5px")}${count === undefined ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 4, 82, val, "t-big", `font-size:36px;fill:${col}`) : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["countText"])(x + 4, 82, count[0], count[1], count[2], count[3], "t-big", `font-size:36px;fill:${col}`)}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 4, 108, sub, "t-sub", "font-size:10.5px")}
        <rect x="${x + 4}" y="124" width="300" height="2" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].dim}"/><rect class="grow-x" x="${x + 4}" y="124" width="300" height="2" fill="${col}" style="animation-delay:${(i * 0.1).toFixed(2)}s"/>`;
        });
        return s;
    }
    function cumulative() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(900, 400, "CAIXA ACUMULADO DAS VOLTAS", NO_ANALYSIS);
        const tr = A.trips, x0 = 60, x1 = 860, y0 = 80, y1 = 330;
        let cum = 0;
        const pts = [
            [
                0,
                0,
                "INICIO"
            ]
        ];
        tr.forEach((t)=>{
            cum += t.out - t.in;
            pts.push([
                t.sellAt,
                cum,
                t.s
            ]);
        });
        const vmin = Math.min(0, ...pts.map((p)=>p[1])) - 0.05, vmax = Math.max(0, ...pts.map((p)=>p[1])) + 0.05;
        // one step per round trip, evenly spaced: trips that closed minutes apart would otherwise sit on top of each other
        const px = (_t, i)=>x0 + i * (x1 - x0 - 40) / Math.max(1, pts.length - 1);
        const py = (v)=>y1 - (v - vmin) / (vmax - vmin) * (y1 - y0);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(900, "CAIXA ACUMULADO DAS VOLTAS", "SOMA DO QUE SAIU MENOS O QUE ENTROU, EM USDC, ANTES DA TAXA EM SOL");
        s += `<line x1="${x0}" x2="${x1}" y1="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(py(0))}" y2="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(py(0))}" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft}" stroke-width="1.4" stroke-dasharray="5 5"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x1, py(0) - 6, "EMPATE", "t-sub", "font-size:10px;fill:#7df3ff", "end");
        let path = "";
        pts.forEach((p, i)=>{
            const x = px(p[0], i), y = py(p[1]);
            path += i ? `L${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(py(pts[i - 1][1]))}L${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y)}` : `M${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y)}`;
        });
        s += `<path class="draw glow" pathLength="1" d="${path}L${x1} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(py(cum))}" fill="none" stroke="${cum >= 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}" stroke-width="2.4"/><path d="${path}L${x1} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(py(cum))}L${x1} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(py(0))}L${x0} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(py(0))}Z" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}" opacity=".12"/>`;
        // the labels of the steps are written only where they have room: the newest first
        const steps = pts.slice(1).map((p, k)=>({
                p,
                x: px(p[0], k + 1),
                y: py(p[1])
            }));
        const nameOn = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["thinLabels"])(steps.map((t)=>t.x), steps.map((t)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["approxWidth"])(t.p[2], 10, 0.14, false, false)));
        const valueW = steps.map((t)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["approxWidth"])((t.p[1] > 0 ? "+" : "") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(t.p[1], 3), 12, 0.02, true, false));
        const valueOn = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["thinLabels"])(steps.map((t, k)=>t.x + 10 + valueW[k] / 2), valueW);
        steps.forEach((t, k)=>{
            s += `<circle cx="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(t.x)}" cy="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(t.y)}" r="6" fill="#031820" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}" stroke-width="2"/>` + (nameOn[k] ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(t.x, t.y + 24, t.p[2], "t-sub", "font-size:10px", "middle") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(t.x, t.y + 38, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(t.p[0]), "t-sub", "font-size:9px", "middle") : "") + (valueOn[k] ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(t.x + 10, t.y - 9, (t.p[1] > 0 ? "+" : "") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(t.p[1], 3), "t-mono", `font-size:12px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}`) : "");
        });
        s += `<g style="--w:${x1 - x0}px;animation:hud-scan 10s linear infinite"><line x1="${x0}" x2="${x0}" y1="${y0 - 6}" y2="${y1 + 6}" stroke="#bff6ff" stroke-width="1.2" opacity=".45"/></g>`;
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 372, `PARA VOLTAR AO EMPATE O CAIXA PRECISA GANHAR ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(Math.abs(Math.min(0, cum)), 3)} USDC, MAIS O CUSTO DA REDE`, "t-sub", "font-size:10px");
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 390, A.trips.length < 5 ? `${A.trips.length} VOLTAS SAO POUCAS PARA CONCLUIR QUALQUER COISA SOBRE O AGENTE` : `${A.trips.length} VOLTAS FECHADAS ATE AGORA`, "t-sub", "font-size:10px;fill:#7df3ff");
    }
    function outcomes() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(900, 400, "O QUE ACONTECEU COM AS ORDENS", NO_ANALYSIS);
        const o = A.orders.outcomes, rs = A.orders.reasons;
        const parts = [
            [
                "EXECUTADAS",
                o.executada ?? 0,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green
            ],
            [
                "FALHARAM",
                o.falhou ?? 0,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ],
            [
                "INCERTAS",
                o.incerta ?? 0,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute
            ]
        ];
        const tot = parts.reduce((a, p)=>a + p[1], 0) || 1;
        const cx = 160, cy = 220, R = 90;
        let acc = 0;
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(900, "O QUE ACONTECEU COM AS ORDENS", "DE TODAS AS ORDENS ENVIADAS A CADEIA, COMO TERMINARAM");
        s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].dim}" stroke-width="26"/>`;
        parts.forEach(([, n, col], i)=>{
            const sw = n / tot * 360;
            if (n) s += `<path class="draw" pathLength="1" d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, R, acc + 1, acc + sw - 1)}" stroke="${col}" stroke-width="26" fill="none" style="animation-delay:${(i * 0.2).toFixed(2)}s"/>`;
            acc += sw;
        });
        s += `<g class="spin-d" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="${R + 24}" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="3 9"/></g>`;
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 4, String(parts.reduce((a, p)=>a + p[1], 0)), "t-big", "font-size:34px", "middle") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 24, "ORDENS", "t-sub", "font-size:10px", "middle");
        parts.forEach(([lab, n, col], i)=>{
            s += `<rect x="330" y="${96 + i * 34}" width="12" height="12" fill="${col}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(352, 107 + i * 34, lab, "t-sub", "font-size:11px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(560, 107 + i * 34, String(n), "t-num", "font-size:18px", "end");
        });
        const names = {
            simulacao_falhou: "A SIMULACAO FALHOU ANTES DE ASSINAR",
            recibo_erro: "O RECIBO VOLTOU COM ERRO",
            confirmando: "A FERRAMENTA PEDIU CONFIRMACAO",
            resolvida_pelo_usuario: "RESOLVIDA A MAO PELO DONO"
        };
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(330, 222, "POR QUE FALHARAM", "t-sub", `font-size:10.5px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}`);
        Object.entries(rs).slice(0, 6).forEach(([k, n], i)=>{
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(330, 246 + i * 26, names[k] ?? k.replace(/_/g, " ").toUpperCase(), "t-sub", "font-size:10.5px") + `<rect x="660" y="${236 + i * 26}" width="${Math.min(200, n * 40)}" height="8" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}" opacity=".8"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(900, 246 + i * 26, String(n), "t-mono", "font-size:13px", "end");
        });
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 394, "FALHA NA CADEIA E CUSTO SEM RESULTADO: CADA UMA DESPERDICA UMA CONSULTA DO MODELO E UMA CHANCE", "t-sub", "font-size:9.5px");
    }
    function activity() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(1840, 230, "A ATIVIDADE DO AGENTE", NO_ANALYSIS);
        const F = A.funnel;
        const items = [
            [
                "CONSULTAS DO DIA",
                D.budget.consults,
                Math.max(1, D.budget.max),
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy
            ],
            [
                "ITENS AVALIADOS",
                F.items,
                Math.max(1, F.items),
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft
            ],
            [
                "PEDIDOS DE COMPRA",
                F.asked,
                Math.max(1, F.open),
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ],
            [
                "BLOQUEADOS PELO CODIGO",
                F.asked - F.applied,
                Math.max(1, F.asked),
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ],
            [
                "ORDENS EXECUTADAS",
                F.executed,
                Math.max(1, F.applied),
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green
            ],
            [
                "FALHAS NA CADEIA",
                F.failed,
                Math.max(1, F.applied),
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].red
            ]
        ];
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 18, `A ATIVIDADE DO AGENTE (ITENS E PEDIDOS: ULTIMAS ${F.consults} CONSULTAS)`, "t-title", "font-size:12.5px");
        items.forEach(([lab, v, mx, col], i)=>{
            const cx = 150 + i * 308, cy = 112;
            s += `<circle cx="${cx}" cy="${cy}" r="56" fill="none" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].dim}" stroke-width="10"/><path class="draw" pathLength="1" d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, 56, 0, Math.max(2, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clamp"])(v / mx, 0, 1) * 359))}" fill="none" stroke="${col}" stroke-width="10" style="animation-delay:${(i * 0.12).toFixed(2)}s"/>
        <g class="${i % 2 ? "spin-c" : "spin-d"}" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="70" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="2 8"/></g>
        ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["countText"])(cx, cy + 8, v, 0, "", "", "t-big", "font-size:28px", "middle")}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 96, lab, "t-sub", "font-size:10.5px", "middle")}`;
        });
        return s;
    }
    function moves(win) {
        const name = win === "15m" ? "O PRECO 15 MINUTOS DEPOIS" : "O PRECO 1 HORA DEPOIS";
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(900, 420, name, NO_ANALYSIS);
        const G = [
            [
                "PULADAS PELO JEV",
                A.placar.skipped[win],
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy
            ],
            [
                "FECHADAS PELO CODIGO",
                A.placar.closed[win],
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ],
            [
                "PEDIDAS E SEM ORDEM",
                A.placar.gated[win],
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white
            ]
        ];
        const lo = -20, hi = 20, nb = 10, bw = (hi - lo) / nb, x0 = 20, W = 860, y1 = 330, Hh = 230, slot = W / nb;
        const bins = G.map(([, g])=>{
            const b = new Array(nb).fill(0);
            g.vals.forEach((v)=>{
                const k = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clamp"])(Math.floor(((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clamp"])(v, lo, hi - 0.001) - lo) / bw), 0, nb - 1);
                b[k] = (b[k] ?? 0) + 1;
            });
            const n = g.vals.length || 1;
            return b.map((c)=>c / n);
        });
        const mx = Math.max(0.05, ...bins.flat());
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(900, name, "PARA O QUE NAO FOI COMPRADO. CONTRAFACTUAL, ANTES DE CUSTO E IMPACTO");
        s += `<line x1="${x0 + (0 - lo) / (hi - lo) * W}" x2="${x0 + (0 - lo) / (hi - lo) * W}" y1="72" y2="${y1}" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft}" stroke-width="1.4" stroke-dasharray="5 5"/>`;
        for(let i = 0; i <= nb; i += 2)s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0 + i * slot, y1 + 18, lo + i * bw + "%", "t-sub", "font-size:10px", "middle");
        G.forEach(([, g, col], gi)=>{
            if (g.n < 5) return;
            bins[gi].forEach((v, bi)=>{
                const h = v / mx * Hh, x = x0 + bi * slot + 6 + gi * (slot - 12) / 3;
                s += `<rect class="grow-y" x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x)}" y="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y1 - h)}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])((slot - 12) / 3 - 2)}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(Math.max(h, 0.4))}" fill="${col}" opacity=".85" style="animation-delay:${(bi * 0.04 + gi * 0.1).toFixed(2)}s"/>`;
            });
            if (g.mean !== null) {
                const mxp = x0 + ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clamp"])(g.mean, lo, hi) - lo) / (hi - lo) * W;
                s += `<line x1="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(mxp)}" x2="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(mxp)}" y1="84" y2="${y1}" stroke="${col}" stroke-width="1.6" stroke-dasharray="2 4"/>`;
            }
        });
        G.forEach(([lab, g, col], gi)=>{
            const x = gi * 300;
            s += `<rect x="${x}" y="368" width="12" height="12" fill="${col}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 20, 378, lab, "t-sub", "font-size:10px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 20, 394, g.n < 5 ? `${g.n} CASOS, POUCOS PARA DESENHAR` : `${g.n} CASOS, ${g.up} SUBIRAM, MEDIA ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pct"])(g.mean, 1)}`, "t-mono", `font-size:11.5px;fill:${col}`);
        });
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 414, "ALTURA = PARTE DE CADA GRUPO NA FAIXA. TRACEJADO = MEDIA DO GRUPO", "t-sub", "font-size:9px");
    }
    function recent() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(1840, 440, "AS ULTIMAS DECISOES DE NAO COMPRAR", NO_ANALYSIS);
        const measured = (r)=>r.m15 !== null || r.m1h !== null ? 1 : 0;
        const R = [
            ...A.recent
        ].sort((a, b)=>measured(b) - measured(a) || b.t - a.t).slice(0, 14);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(1840, "AS ULTIMAS DECISOES DE NAO COMPRAR, E O QUE O PRECO FEZ", "CADA LINHA: A HORA, O ATIVO, QUEM DECIDIU E O MOVIMENTO DEPOIS. CONTRAFACTUAL, ANTES DE CUSTO");
        if (R.length === 0) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 100, "AINDA SEM DECISOES MEDIDAS", "t-sub", "font-size:11px");
        const kinds = {
            "pulada pelo Jev": [
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy,
                "O JEV PULOU"
            ],
            "puxada pelo codigo": [
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber,
                "FECHADO PELO CODIGO"
            ],
            "pedida e recusada": [
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white,
                "PEDIU E NAO VIROU ORDEM"
            ]
        };
        const cell = (x, y, label, v)=>{
            const head = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x, y - 14, label, "t-sub", "font-size:9px");
            if (v === null) return head + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x, y + 1, "AINDA MEDINDO", "t-sub", `font-size:10px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute}`);
            const w = Math.min(100, Math.abs(v) * 7), col = v >= 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber;
            return head + `<line x1="${x + 110}" x2="${x + 110}" y1="${y - 10}" y2="${y + 6}" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute}"/><rect class="grow-x" x="${v >= 0 ? x + 110 : x + 110 - w}" y="${y - 7}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(Math.max(w, 1))}" height="9" fill="${col}" opacity=".9"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 280, y + 3, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pct"])(v, 1), "t-mono", `font-size:12.5px;fill:${col}`, "end");
        };
        R.forEach((r, i)=>{
            const col = Math.floor(i / 7), row = i % 7, x = col * 920, y = 108 + row * 44;
            const [kc, kl] = kinds[r.kind] ?? [
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute,
                r.kind.toUpperCase()
            ];
            s += `<circle cx="${x + 6}" cy="${y - 4}" r="5" fill="${kc}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 20, y, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(r.t), "t-mono", "font-size:12px;fill:#5fa3b5") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 74, y, (r.s ?? "-").slice(0, 10), "t-num", "font-size:15px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 74, y + 16, kl, "t-sub", `font-size:9px;fill:${kc}`);
            s += cell(x + 250, y, "15 MIN", r.m15) + cell(x + 580, y, "1 HORA", r.m1h);
        });
        return s;
    }
    return {
        funnel,
        hist,
        matrix,
        preferences,
        timeline,
        allocation,
        equityMarks,
        tripCards,
        limits,
        kpis,
        cumulative,
        outcomes,
        activity,
        moves,
        recent
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/draw/command.ts [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

/** The panels of the command view: the Inonu at the centre, the instruments around it. Each panel draws in its own local coordinates (origin top left). */ __turbopack_context__.s([
    "FACET_META",
    ()=>FACET_META,
    "createCommand",
    ()=>createCommand
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$insights$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/insights.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/h.ts [app-client] (ecmascript)");
;
;
const FACET_META = [
    [
        "late_entry",
        "ATRASADO"
    ],
    [
        "still_falling",
        "AINDA CAINDO"
    ],
    [
        "accumulating",
        "ACUMULANDO"
    ],
    [
        "exit_easy",
        "SAIDA FACIL"
    ],
    [
        "distribution",
        "DISTRIBUICAO"
    ],
    [
        "fading",
        "PERDENDO FORCA"
    ]
];
const PROFILE_TEXT = {
    alvo_2: "ALVO 2 STOP 1,5",
    alvo_5: "ALVO 5 STOP 4",
    alvo_10: "ALVO 10 STOP 6",
    alvo_20: "ALVO 20 STOP 10"
};
function createCommand(D) {
    const cands = D.candidates;
    const trips = D.a.trips;
    const net = trips.reduce((a, t)=>a + (t.out - t.in), 0);
    const feeSol = D.a.fees.lamports / 1e9;
    // what the wallet did and what the closed round trips gave. natural size 480 x 250
    function results() {
        const eq = D.equity;
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "RESULTADO REAL", "O QUE A CARTEIRA FEZ E O QUE AS VOLTAS DERAM");
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 80, "PATRIMONIO GERIDO", "t-sub", "font-size:10px");
        if (D.wallet.total === null) {
            // no reading: say so and when the last one was, never a figure that was not read
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 104, "SEM LEITURA", "t-big", "font-size:22px");
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 126, D.wallet.lastReadMs === null ? "A CARTEIRA NUNCA FOI LIDA" : `ULTIMA LEITURA ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(D.wallet.lastReadMs)}`, "t-sub", "font-size:9px");
        } else {
            // the number takes the room the stats leave it: a big wallet is written smaller instead of running into them
            const size = Math.max(16, Math.min(30, 238 / (("US$ " + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(D.wallet.total, 2)).length * 0.62)));
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["countText"])(0, 106, D.wallet.total, 2, "US$ ", "", "t-big", `font-size:${size.toFixed(1)}px`);
        }
        if (D.wallet.total !== null && D.wallet.readAtMs !== null) s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 126, `ATUALIZADA HA ${Math.max(0, Math.round((D.snapshotAtMs - D.wallet.readAtMs) / 60000))} MIN`, "t-sub", "font-size:9px");
        // the two figures of the round trips are stacked on the right (each is a label, a number and a note of its own), so no note can run into the other figure
        const stat = (y, label, value, d, pre, suf, sub, col)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(250, y, label, "t-sub", "font-size:10px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["countText"])(250, y + 21, value, d, pre, suf, "t-num", `font-size:18px;fill:${col}`) + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(250, y + 36, sub, "t-sub", "font-size:9px");
        if (D.analysisOk) {
            s += stat(66, "VOLTAS FECHADAS", net, 3, net > 0 ? "+" : "", " USDC", trips.length + " VOLTAS, ANTES DA TAXA", net >= 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber);
            s += stat(124, "TAXA DE REDE", feeSol, 5, "", " SOL", "SO A REDE, EM SOL", "#bfefff");
        } else s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(250, 96, "VOLTAS E TAXAS:", "t-sub", "font-size:10px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(250, 112, "SEM DADOS DO NUCLEO", "t-sub", "font-size:10px");
        if (eq.length < 2) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 210, "AINDA SEM HISTORICO DA CARTEIRA", "t-sub", "font-size:10px");
        const x0 = 0, x1 = 480, y0 = 176, y1 = 226;
        const vmin = Math.min(...eq.map((p)=>p.v)), vmax = Math.max(...eq.map((p)=>p.v));
        const t0 = eq[0].t, t1 = eq[eq.length - 1].t;
        const px = (t)=>x0 + (t - t0) / (t1 - t0 || 1) * (x1 - x0);
        const py = (v)=>y1 - (v - vmin) / (vmax - vmin || 1) * (y1 - y0);
        const line = eq.map((p, i)=>`${i ? "L" : "M"}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(px(p.t))} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(py(p.v))}`).join("");
        const last = eq[eq.length - 1], first = eq[0];
        const marks = D.events.filter((e)=>e.t >= t0 && e.stage === "executada").map((e)=>{
            const x = px(e.t);
            const y = py(eq.reduce((m, p)=>Math.abs(p.t - e.t) < Math.abs(m.t - e.t) ? p : m).v);
            return e.side === "buy" ? `<path d="M${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y - 9)}l5 8h-10z" fill="#38ffb4"/>` : `<path d="M${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y + 9)}l5 -8h-10z" fill="#ffb23e"/>`;
        }).join("");
        s += `<path d="${line}L${x1} ${y1}L${x0} ${y1}Z" fill="url(#areaGrad)" opacity=".8"/><path d="${line}" fill="none" stroke="#2ee6ff" stroke-width="1.8" class="glow"/>${marks}<circle r="3.4" fill="#e9fbff" class="glow"><animateMotion dur="9s" repeatCount="indefinite" path="${line}"/></circle>`;
        s += `<g style="--w:${x1}px;animation:hud-scan 9s linear infinite"><line x1="0" x2="0" y1="${y0 - 6}" y2="${y1 + 6}" stroke="#bff6ff" stroke-width="1.2" opacity=".5"/></g>`;
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 244, new Date(t0).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        }), "t-sub", "font-size:9.5px");
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(240, 244, `JANELA ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pct"])((last.v / first.v - 1) * 100, 1)} (INCLUI APORTES E PRECOS)`, "t-sub", "font-size:9.5px", "middle");
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(480, 244, "AGORA", "t-sub", "font-size:9.5px", "end");
        return s;
    }
    // where the capital sits, and which part has an exit plan. natural size 480 x 232
    function positions() {
        const ps = D.wallet.positions;
        const total = D.wallet.total ?? ps.reduce((a, p)=>a + (p.usd ?? 0), 0);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "ONDE ESTA O CAPITAL", "CAIXA, TOKENS E O QUE TEM PLANO DE SAIDA");
        if (!(total > 0)) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 100, "SEM LEITURA DA CARTEIRA", "t-sub", "font-size:10px");
        const cash = ps.filter((p)=>p.cash).reduce((a, p)=>a + (p.usd ?? 0), 0);
        const tok = ps.filter((p)=>!p.cash && p.usd !== null && p.usd > 0);
        const withPlan = tok.filter((p)=>p.plan !== null).reduce((a, p)=>a + (p.usd ?? 0), 0);
        const noPlan = tok.filter((p)=>p.plan === null).reduce((a, p)=>a + (p.usd ?? 0), 0);
        const w = (v)=>v / total * 480;
        s += `<rect x="0" y="66" width="480" height="14" fill="#0b2c38"/>
      <rect class="grow-x" x="0" y="66" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(w(cash))}" height="14" fill="#2ee6ff"/>
      <rect class="grow-x" x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(w(cash))}" y="66" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(w(withPlan))}" height="14" fill="#38ffb4"/>
      <rect class="grow-x" x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(w(cash + withPlan))}" y="66" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(w(noPlan))}" height="14" fill="#ffb23e"/>`;
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 98, `CAIXA ${Math.round(cash / total * 100)}%`, "t-sub", "font-size:10px;fill:#2ee6ff") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(150, 98, `COM PLANO ${Math.round(withPlan / total * 100)}%`, "t-sub", "font-size:10px;fill:#38ffb4") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(330, 98, `SEM PLANO ${Math.round(noPlan / total * 100)}%`, "t-sub", "font-size:10px;fill:#ffb23e");
        const rows = [
            ...tok
        ].sort((a, b)=>(b.usd ?? 0) - (a.usd ?? 0)).slice(0, 4);
        rows.forEach((p, i)=>{
            const y = 126 + i * 24;
            const tag = p.plan === null ? "SEM PLANO" : `${PROFILE_TEXT[p.plan.profile] ?? "COM PLANO"}`;
            // the name has the room of its longest possible spelling (14 letters), then the dollars, then a bar that never reaches the plan's words on the right
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y, p.s, "t-num", "font-size:13px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(250, y, "US$ " + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(p.usd), "t-mono", "", "end");
            s += `<rect x="262" y="${y - 10}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(Math.max(2, Math.min(96, (p.usd ?? 0) / total * 300)))}" height="8" fill="${p.plan === null ? "#ffb23e" : "#38ffb4"}" opacity=".85"/>`;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(480, y, tag, "t-sub", `font-size:9.5px;fill:${p.plan === null ? "#ffb23e" : "#38ffb4"}`, "end");
        });
        const unpriced = ps.filter((p)=>!p.cash && (p.usd === null || p.usd <= 0)).length;
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 126 + rows.length * 24 + 4, `${unpriced ? "+ " + unpriced + " TOKENS SEM PRECO. " : ""}SEM PLANO, O AGENTE NAO ADMINISTRA`, "t-sub", "font-size:9.5px");
        return s;
    }
    // the candidates of the last look: a radar and a ranked list. natural size 480 x 310
    function decision() {
        const cx = 112, cy = 186, R = 84, pmax = 1;
        const open = cands.map((c, i)=>[
                c,
                i
            ]).filter(([c])=>!c.closed);
        const closed = cands.map((c, i)=>[
                c,
                i
            ]).filter(([c])=>c.closed);
        const ranked = [
            ...open
        ].sort((a, b)=>(b[0].pbuy ?? 0) - (a[0].pbuy ?? 0));
        const best = ranked[0] ? ranked[0][0] : null;
        const nDropped = D.last.dropped.length;
        // an agent that runs no cycles has no "now": the panel is the last consult, and says so
        const posture = (D.last.posture ?? "-").toUpperCase();
        let s = !D.agent.cycling ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "ULTIMA DECISAO", D.last.atMs === null ? "SEM CONSULTA NESTA SESSAO, AGENTE PARADO" : `ULTIMA CONSULTA ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(D.last.atMs)}, AGENTE PARADO`) : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "DECISAO AGORA", nDropped > 0 ? `POSTURA ${posture}, ${open.length} ABERTOS, ${nDropped} BLOQUEADO(S) PELO CODIGO` : `POSTURA ${posture}, ${open.length} ABERTOS DE ${cands.length} CANDIDATOS`);
        s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#031820" stroke="#17687f" stroke-width="1.2"/>`;
        for (const f of [
            0.25,
            0.5,
            0.75
        ])s += `<circle cx="${cx}" cy="${cy}" r="${R * f}" fill="none" stroke="#0f4a5c" stroke-width="1" stroke-dasharray="2 5"/>`;
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ticks"])(cx, cy, R - 5, R, 60, 'stroke="#2c7e93" stroke-width="1"');
        s += `<line x1="${cx - R}" x2="${cx + R}" y1="${cy}" y2="${cy}" stroke="#0f4a5c"/><line x1="${cx}" x2="${cx}" y1="${cy - R}" y2="${cy + R}" stroke="#0f4a5c"/>`;
        s += `<g class="spin-c" style="transform-origin:${cx}px ${cy}px"><path d="M${cx} ${cy}L${cx} ${cy - R}A${R} ${R} 0 0 0 ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pt"])(cx, cy, R, -50)[0])} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pt"])(cx, cy, R, -50)[1])}Z" fill="url(#sweepGrad)" opacity=".55"/><line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - R}" stroke="#bff6ff" stroke-width="1.5"/></g>`;
        const dot = (closedOne, i, a, r, held = false)=>{
            const [bx, by] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pt"])(cx, cy, r, a);
            return `<circle class="blip" data-i="${i}" cx="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(bx)}" cy="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(by)}" r="5.5" fill="${closedOne ? "#031820" : held ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber : "#2ee6ff"}" stroke="${closedOne ? "#5fa3b5" : "#e9fbff"}" stroke-width="1.5"/>`;
        };
        open.forEach(([c, i], k)=>{
            s += dot(false, i, 25 + k * (310 / Math.max(1, open.length)), Math.max(14, Math.min(R, (c.pbuy ?? 0) / pmax * R)), c.blocked !== null);
        });
        closed.forEach(([, i], k)=>{
            s += dot(true, i, 160 + k * (200 / Math.max(1, closed.length)), R);
        });
        const x = 236;
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x, 76, "PREFERENCIA DE COMPRA, 0 A 100%", "t-sub", "font-size:9.5px");
        const list = [
            ...ranked.map(([c])=>[
                    c,
                    "open"
                ]),
            ...closed.map(([c])=>[
                    c,
                    "closed"
                ])
        ].slice(0, 8);
        // the bar is 100 wide and the reading is right aligned at the panel's edge, so the longest word ("BLOQUEADO") never leaves the panel and never lands on the bar
        const barW = 100, barX = x + 82;
        list.forEach(([c, kind], k)=>{
            const yy = 76 + 22 + k * 25;
            const p = c.pbuy ?? 0;
            const w = Math.min(barW, p / pmax * barW);
            // the Jev's choice is the decision: a purchase he asked for is green, one the code dropped after that is amber and says so where the preference would be written, the rest are cyan
            const held = kind === "open" && c.blocked !== null;
            const asked = kind === "open" && !held && c.applied !== null && c.applied !== "skip";
            const shade = held ? "#ffb23e" : asked ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : "#2ee6ff";
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x, yy, c.s.slice(0, 9), "t-mono", `font-size:12px;fill:${kind === "closed" ? "#5fa3b5" : "#e9fbff"}`);
            s += `<rect x="${barX}" y="${yy - 9}" width="${barW}" height="8" fill="#0b2c38"/>`;
            if (kind === "open") s += `<rect class="grow-x" x="${barX}" y="${yy - 9}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(w)}" height="8" fill="${shade}" style="animation-delay:${(k * 0.05).toFixed(2)}s"/>`;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(480, yy, kind === "closed" ? "FECHADO" : held ? "BLOQUEADO" : c.pbuy === null ? "-" : Math.round(p * 100) + "%", "t-mono", `font-size:${held ? 10.5 : 11}px;fill:${kind === "closed" ? "#5fa3b5" : held ? "#ffb23e" : asked ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : "#7df3ff"}`, "end");
        });
        const bg = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$insights$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["blockedGroups"])(D);
        if (bg.length > 0) {
            const g = bg[0], run = D.last.streak !== null && D.last.streak.exact && D.last.streak.cycles >= 2 ? `, ${D.last.streak.cycles} CICLOS SEGUIDOS` : "";
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 308, `PEDIU ${g.side === "buy" ? "COMPRAR" : "VENDER"} ${g.names}, O CODIGO BLOQUEOU: ${g.text}${run}${bg.length > 1 ? " E MAIS" : ""}`, "t-mono", `font-size:11px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}`);
        }
        // the strongest preference is said once, with no bar to compare it with: what the Jev asked for is the decision
        if (best && best.pbuy !== null) s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 290, `MAIOR PREFERENCIA DE COMPRA: ${best.s} ${Math.round(best.pbuy * 100)}%`, "t-sub", "font-size:10px;fill:#7df3ff");
        return s;
    }
    // the health of the system, the alerts first. natural size 480 x 196
    function health() {
        const rows = healthRows();
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "SAUDE DO SISTEMA", rows.some((r)=>r.col === __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber && r.frac === null) ? "HA ITENS QUE PEDEM ATENCAO" : "NADA PEDE ATENCAO AGORA");
        rows.slice(0, 8).forEach((r, i)=>{
            const y = 78 + i * 17;
            const bar = r.frac === null ? "" : `<rect x="0" y="${y + 4}" width="480" height="1.5" fill="#0b2c38"/><rect class="grow-x" x="0" y="${y + 4}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(Math.max(1, Math.min(1, r.frac) * 480))}" height="1.5" fill="${r.col}" opacity=".85"/>`;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y, r.label, "t-sub", "font-size:10px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(480, y, r.value, "t-mono", `fill:${r.col};font-size:12px`, "end") + bar;
        });
        return s;
    }
    /** The rows of the health panel, the ones that ask for attention first. */ function healthRows() {
        const H = D.health;
        const rows = [];
        // an agent that runs no cycles is the first thing that needs attention: nothing decides and no order leaves, whatever else is green
        if (!D.agent.cycling) rows.push({
            label: "ATENCAO",
            value: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$insights$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["STOPPED_TEXT"],
            col: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber,
            frac: null
        });
        if (D.agent.paused) rows.push({
            label: "COMPRAS PAUSADAS",
            value: (D.agent.pauseReason ?? "PELO PROPRIO AGENTE").replace(/_/g, " ").toUpperCase(),
            col: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber,
            frac: null
        });
        if (!H.lock) rows.push({
            label: "OUTRO PROCESSO",
            value: "TEM A PASTA DO AGENTE",
            col: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber,
            frac: null
        });
        if (H.inFlight > 0) rows.push({
            label: "ORDEM SEM RESPOSTA",
            value: H.inFlight + " AGUARDANDO O RECIBO",
            col: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber,
            frac: null
        });
        if (!H.ledgerOk || !H.plansOk) rows.push({
            label: "REGISTROS",
            value: "COM PROBLEMA, VEJA OS CONTROLES",
            col: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber,
            frac: null
        });
        rows.push({
            label: "CONEXAO COM A CARTEIRA",
            value: H.login === "logado" ? "LOGADA" + (H.sessionDays === null ? "" : ", SESSAO " + Math.max(0, Math.round(H.sessionDays)) + " DIAS") : H.login.replace(/_/g, " ").toUpperCase(),
            col: H.login === "logado" && (H.sessionDays === null || H.sessionDays > 3) ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber,
            frac: null
        });
        rows.push({
            label: "MODELO",
            value: `${(D.agent.model ?? "-").toUpperCase()}, ${D.budget.tokens === null ? "-" : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(D.budget.tokens / 1e6, 2) + "M"} TOKENS HOJE`,
            col: H.modelOk ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber,
            frac: null
        });
        rows.push({
            label: "CONSULTAS DO DIA",
            value: `${D.budget.consults} DE ${D.budget.max}`,
            col: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy,
            frac: D.budget.max > 0 ? D.budget.consults / D.budget.max : null
        });
        if (D.analysisOk) {
            const ok = D.a.orders.outcomes.executada ?? 0, fail = D.a.orders.outcomes.falhou ?? 0;
            rows.push({
                label: "ORDENS NA CADEIA",
                value: `${ok} OK, ${fail} COM FALHA`,
                col: fail > ok / 3 ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green,
                frac: null
            });
            const dayCap = D.agent.caps === null ? undefined : D.agent.caps.maxDailyBuyUsd;
            rows.push({
                label: "COMPRAS DO DIA",
                value: `US$ ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(D.a.orders.spentToday.buy, 0)}, LIMITE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capText"])(dayCap)}`,
                col: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy,
                frac: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capUse"])(D.a.orders.spentToday.buy, dayCap)
            });
        }
        rows.push({
            label: "ALAVANCAGEM",
            value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["leverageText"])(D.agent.leverage, true),
            col: D.agent.leverage !== null && D.agent.leverage.granted ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute,
            frac: null
        });
        return rows;
    }
    /** The height the health panel needs for its rows (the scenes that stack panels go by it). */ const healthH = ()=>80 + Math.min(8, healthRows().length) * 17 + 6;
    // what was skipped, measured afterwards. natural size 480 x 270
    function placar() {
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "O QUE FOI PULADO", "O PRECO DEPOIS DA DECISAO DE NAO COMPRAR");
        if (!D.analysisOk) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 100, "SEM DADOS DO NUCLEO NESTA VERSAO", "t-sub", "font-size:10px");
        const g = [
            [
                "PULADAS PELO JEV",
                "15 MIN",
                D.a.placar.skipped["15m"]
            ],
            [
                "PULADAS PELO JEV",
                "1 HORA",
                D.a.placar.skipped["1h"]
            ],
            [
                "FECHADAS PELO CODIGO",
                "15 MIN",
                D.a.placar.closed["15m"]
            ],
            [
                "FECHADAS PELO CODIGO",
                "1 HORA",
                D.a.placar.closed["1h"]
            ]
        ];
        g.forEach(([a, b, v], i)=>{
            const cx = 36 + i % 2 * 244, cy = 112 + Math.floor(i / 2) * 92;
            const share = v.n ? v.up / v.n : 0;
            const col = (v.mean ?? 0) >= 0 ? "#2ee6ff" : "#ffb23e";
            s += `<circle cx="${cx}" cy="${cy}" r="30" fill="none" stroke="#0e3948" stroke-width="7"/>
        <path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, 30, 0, Math.max(1, share * 359))}" fill="none" stroke="${col}" stroke-width="7" class="glow"/>
        <g class="${i % 2 ? "spin-c" : "spin-d"}" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="39" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="3 8"/></g>`;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 5, Math.round(share * 100) + "%", "t-num", "font-size:15px", "middle") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx + 52, cy - 14, a, "t-sub", "font-size:10px;letter-spacing:.06em") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx + 52, cy - 1, b, "t-sub", "font-size:10px;fill:#7df3ff");
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx + 52, cy + 17, `${v.up} DE ${v.n} SUBIRAM`, "t-mono", `font-size:11.5px;fill:${(v.mean ?? 0) >= 0 ? "#7df3ff" : "#ffb23e"}`) + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx + 52, cy + 31, `MEDIA ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pct"])(v.mean, 1)}`, "t-mono", "font-size:11.5px;fill:#5fa3b5");
        });
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 262, "ANTES DE CUSTO E IMPACTO. NAO E RESULTADO REAL", "t-sub", "font-size:10px");
    }
    // the six judgments of the Jev about one candidate, as a hexagon flower. natural size 480 x 256
    function facets() {
        const cx = 240, cy = 148, r = 28, dist = r * 1.78;
        const pos = [
            [
                0,
                -1
            ],
            [
                0.87,
                -0.5
            ],
            [
                0.87,
                0.5
            ],
            [
                0,
                1
            ],
            [
                -0.87,
                0.5
            ],
            [
                -0.87,
                -0.5
            ]
        ];
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "FACETAS DO JEV", "O QUE ELE JULGOU DO CANDIDATO");
        s += `<g class="spin-e" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(dist + r + 1)}" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="3 9"/></g>`;
        s += `<path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hex"])(cx, cy, r * 0.95)}" fill="#031820" stroke="#2ee6ff" stroke-width="1.4" class="glow"/>`;
        FACET_META.forEach(([k, lab], i)=>{
            const x = cx + pos[i][0] * dist, y = cy + pos[i][1] * dist;
            const side = pos[i][0] >= 0 ? 1 : -1;
            const vertical = i === 0 || i === 3;
            s += `<path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hex"])(x, y, r * 0.95)}" fill="#031820" stroke="#17687f" stroke-width="1.2"/>
        <path class="hexfill" data-k="${k}" d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hex"])(x, y, r * 0.95)}" fill="#2ee6ff" opacity=".1" stroke="#2ee6ff" stroke-width="1.4"/>
        <text class="t-num" data-v="${k}" x="${x}" y="${y + 6}" text-anchor="middle" style="font-size:15px">-</text>`;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(vertical ? x : x + side * (r + 12), vertical ? i === 0 ? y - r - 6 : y + r + 15 : y + 4, lab, "t-sub", "font-size:10px", vertical ? "middle" : side > 0 ? "start" : "end");
        });
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(480, 28, "-", "t-num flowerName", "font-size:17px", "end") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(480, 46, "-", "t-sub flowerSub", "font-size:10px", "end");
        return s;
    }
    // order receipts, scrolling. natural size 480 x 142
    function feed() {
        const cid = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["id"])("feedClip");
        const lines = D.events.slice(-8).map((e)=>{
            const ok = e.stage === "executada";
            const col = e.stage === "incerta" ? "#7df3ff" : ok ? e.side === "buy" ? "#38ffb4" : "#7df3ff" : "#ffb23e";
            const what = e.stage === "incerta" ? "EM VOO" : ok ? e.side === "buy" ? "COMPRA" : "VENDA" : "FALHOU";
            const why = !ok && e.stage !== "incerta" ? (e.reason ?? "").replace(/_/g, " ").toUpperCase() : e.stage === "incerta" ? "AGUARDANDO O RECIBO" : e.src === "protecao" ? "PROTECAO DO PLANO" : "DECISAO DO MODELO";
            return {
                col,
                line: `${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(e.t)}  ${what} ${e.s} US$ ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(e.usd, 0)}`,
                why
            };
        }).reverse();
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "FLUXO DE ORDENS", "RECIBOS DA CADEIA, DO MAIS NOVO AO MAIS ANTIGO");
        if (lines.length === 0) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 100, "NENHUMA ORDEM AINDA", "t-sub", "font-size:10px");
        const rowH = 44, listH = lines.length * rowH;
        const rows = (off)=>lines.map((l, i)=>`<g transform="translate(0 ${off + i * rowH})"><circle cx="8" cy="8" r="4.5" fill="${l.col}"/><line x1="8" x2="8" y1="15" y2="${rowH - 4}" stroke="#124c5f"/>${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(24, 12, l.line, "t-mono", `fill:${l.col};font-size:13px`)}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(24, 28, l.why, "t-sub", "font-size:10px")}</g>`).join("");
        return `${s}<clipPath id="${cid}"><rect x="0" y="62" width="480" height="80"/></clipPath>
      <g clip-path="url(#${cid})"><g transform="translate(0 66)"><g style="--h:-${listH}px;animation:hud-rise ${Math.max(16, lines.length * 4)}s linear infinite">${rows(0)}${rows(listH)}</g></g></g>`;
    }
    // the last cycles, with motion. natural size 480 x 124
    function cyclesPanel() {
        const cyc = D.cycles.slice(-48);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "CICLOS RECENTES", "CADA BARRA E UM OLHAR DO AGENTE, DO MAIS ANTIGO AO MAIS NOVO");
        if (cyc.length === 0) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 100, "AINDA SEM CICLOS", "t-sub", "font-size:10px");
        const step = Math.min(40, 480 / cyc.length);
        const hOf = (c)=>c.o === "decidido" ? 30 : c.o === "mantido" ? 18 : 9;
        const bars = cyc.map((c, i)=>{
            const h = hOf(c);
            const col = c.p > 0 ? "#ffb23e" : c.o === "decidido" ? "#2ee6ff" : "#17687f";
            return `<g class="wave" style="animation-delay:-${(i * 0.14).toFixed(2)}s"><rect class="grow-y" x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(i * step + 1)}" y="${94 - h}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(Math.max(3, step - 4))}" height="${h}" fill="${col}" opacity=".92" style="animation-delay:${(i * 0.02).toFixed(2)}s"/></g>`;
        }).join("");
        const top = cyc.map((c, i)=>`${i ? "L" : "M"}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(i * step + (step - 3) / 2)} ${94 - hOf(c) - 3}`).join("");
        const n = (k)=>cyc.filter((c)=>c.o === k).length;
        const orders = cyc.filter((c)=>c.p > 0).length;
        s += `<path d="${top}" fill="none" stroke="#7df3ff" stroke-width="1.2" class="flow-fast" opacity=".8"/>${bars}`;
        s += `<g style="--w:480px;animation:hud-scan 5s linear infinite"><rect x="-34" y="52" width="34" height="46" fill="url(#sweepGrad)" opacity=".7"/><line x1="0" x2="0" y1="52" y2="98" stroke="#e9fbff" stroke-width="1.2" opacity=".6"/></g>`;
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 114, n("decidido") + " DECIDIDOS", "t-sub", "font-size:9.5px;fill:#2ee6ff") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(128, 114, n("mantido") + " MANTIDOS", "t-sub", "font-size:9.5px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(236, 114, orders + " COM ORDEM", "t-sub", "font-size:9.5px;fill:#ffb23e");
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(480, 114, `${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(cyc[cyc.length - 1].t)} O ULTIMO`, "t-sub", "font-size:9.5px", "end");
    }
    const lines = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$insights$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["insights"])(D);
    const TONE = {
        warn: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber,
        ok: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green,
        info: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft
    };
    // the model at work: the line the Inonu "says" and what it reads from its own numbers, scrolling, on a solid plate, with a thin waveform in a band of its own under the text (y 108 to 118), so nothing animated is ever
    // behind a letter. natural size 700 x 150: the plate is the room between the two brackets (y 10 to 120 at the middle); the text ends at y 105 and the band begins at 108
    function command() {
        let wave = "";
        for(let i = 0; i < 52; i++){
            const h = 3 + 7 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21));
            wave += `<rect class="bar" x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(60 + i * 11.6)}" y="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(113 - h / 2)}" width="5" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(h)}" fill="#2ee6ff" opacity=".4" style="animation-duration:${(1.6 + i % 7 * 0.23).toFixed(2)}s;animation-delay:-${(i * 0.17).toFixed(2)}s"/>`;
        }
        const open = cands.filter((c)=>!c.closed).length;
        const head = !D.agent.cycling ? `INONU > AGENTE PARADO, SO ACOMPANHAMENTO${D.last.atMs === null ? "" : `. ULTIMA CONSULTA ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(D.last.atMs)}`}` : D.last.atMs === null ? "INONU > AINDA SEM CONSULTA NESTA SESSAO" : `INONU > ULTIMA CONSULTA ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(D.last.atMs)}, POSTURA ${(D.last.posture ?? "-").toUpperCase()}, ${cands.length} CANDIDATOS, ${open} ABERTOS`;
        const cid = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["id"])("tickClip");
        const rowH = 19;
        const row = (l, i)=>`<g transform="translate(0 ${i * rowH})"><path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hex"])(60, 8, 4)}" fill="${TONE[l.tone]}"/>${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(74, 12, l.text, "t-mono", `font-size:11.5px;fill:${TONE[l.tone]}`)}</g>`;
        const scrolling = lines.length > 3;
        const listH = lines.length * rowH;
        const rows = lines.map(row).join("");
        const list = lines.length === 0 ? "" : scrolling ? `<g style="--h:-${listH}px;animation:hud-rise ${Math.max(14, lines.length * 4)}s linear infinite">${rows}<g transform="translate(0 ${listH})">${rows}</g></g>` : rows;
        return `<path d="M0 36h30l18 -26h604l18 26h30" fill="none" stroke="#17687f" stroke-width="1.3"/><path d="M0 146h30l18 -26h604l18 26h30" fill="none" stroke="#17687f" stroke-width="1.3"/>
      <rect x="48" y="13" width="604" height="106" fill="#02101a" opacity=".94"/>${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(350, 34, head, "t-mono", "fill:#7df3ff", "middle")}${wave}
      <clipPath id="${cid}"><rect x="30" y="46" width="650" height="59"/></clipPath><g clip-path="url(#${cid})"><g transform="translate(30 52)">${list}</g></g>`;
    }
    // the reading of the Inonu, written out, for narrow screens. natural size 480 x 290
    function reading() {
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "LEITURA DO INONU", "O QUE OS NUMEROS DIZEM AGORA, SEM PROMESSA DE LUCRO");
        if (lines.length === 0) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 100, "AINDA SEM O QUE LER", "t-sub", "font-size:10px");
        let y = 84;
        lines.slice(0, 6).forEach((l, i)=>{
            const parts = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])(l.text, 66);
            s += `<g class="slide" style="animation-delay:${(i * 0.08).toFixed(2)}s"><path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hex"])(6, y - 4, 4)}" fill="${TONE[l.tone]}"/>`;
            parts.forEach((part, k)=>{
                s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(20, y + k * 14, part, "t-mono", `font-size:11px;fill:${TONE[l.tone]}`);
            });
            s += "</g>";
            y += parts.length * 14 + 12;
        });
        return s;
    }
    /** The height the reading needs for its lines (the scenes that stack panels go by it). */ const readingH = ()=>lines.length === 0 ? 110 : 84 + lines.slice(0, 6).reduce((a, l)=>a + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])(l.text, 66).length * 14 + 12, 0);
    // counters. natural size 440 x 100
    function counters() {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 16, "CONSULTAS DO DIA") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 44, String(D.budget.consults), "t-num") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(34, 44, "DE " + D.budget.max, "t-sub", "font-size:11px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(170, 16, "TOKENS DO MODELO") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(170, 44, D.budget.tokens === null ? "-" : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(D.budget.tokens / 1e6, 2) + "M", "t-num") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(440, 16, "RITMO", "t-sub", "", "end") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(440, 44, D.agent.cycling ? D.rhythm.intervalMin + " MIN" : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["STOPPED_COUNT"], "t-num", "", "end") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 72, `TETO DE COMPRA ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capText"])(D.agent.caps === null ? undefined : D.agent.caps.maxBuyUsd)}`, "t-sub", "font-size:10px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 90, "A ESCOLHA DO JEV NAO E CHANCE DE LUCRO", "t-sub", "font-size:10px");
    }
    // the core: the Inonu itself, with its rings. natural size 700 x 820, centre (350, 380)
    /** `boost` enlarges the type of the labels (not the drawing) for the scenes that draw the core smaller than its own size, so what is written on it keeps the size it has on the stage. */ function core(boost = 1) {
        const b = (n)=>Math.round(n * boost * 10) / 10;
        const cx = 350, cy = 380;
        const total = D.wallet.total ?? 0;
        const quotaShare = D.budget.max > 0 ? D.budget.consults / D.budget.max : 0;
        const priced = D.wallet.positions.filter((p)=>p.usd !== null && p.usd > 0);
        const colors = [
            "#2ee6ff",
            "#38ffb4",
            "#7df3ff",
            "#ffb23e",
            "#5fa3b5",
            "#a58cff"
        ];
        let acc = 0;
        let donut = "";
        let sats = "";
        if (total > 0) priced.forEach((p, i)=>{
            const sw = (p.usd ?? 0) / total * 360;
            if (sw > 0.6) {
                donut += `<path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, 112, acc + 1, acc + sw - 1)}" stroke="${colors[i % colors.length]}" stroke-width="9" fill="none"/>`;
                // a satellite per holding, starting at the middle of its slice and turning at its own pace
                if (i < 6) sats += `<g style="transform-origin:${cx}px ${cy}px;animation:hud-spin ${46 + i * 11}s linear infinite${i % 2 ? " reverse" : ""}"><g transform="rotate(${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(acc + sw / 2)} ${cx} ${cy})"><circle cx="${cx}" cy="${cy - 127}" r="3.8" fill="${colors[i % colors.length]}" class="glow"/></g></g>`;
            }
            acc += sw;
        });
        let quota = "";
        for(let i = 0; i < 60; i++){
            const on = i < Math.round(quotaShare * 60);
            quota += `<path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, 218, i * 6 + 0.8, i * 6 + 5.2)}" stroke="${on ? "#2ee6ff" : "#103e4e"}" stroke-width="11" fill="none" ${on ? 'class="glow"' : ""}/>`;
        }
        const lastEv = D.events[D.events.length - 1];
        const nodes = [
            {
                n: "BRIEF",
                s: "ok"
            },
            {
                n: "JEV",
                s: "ok"
            },
            {
                n: "COTACAO",
                s: lastEv ? "ok" : "idle"
            },
            {
                n: "EXECUTOR",
                s: lastEv ? "ok" : "idle"
            },
            {
                n: "RECIBO",
                s: lastEv ? lastEv.stage === "executada" ? "ok" : lastEv.stage === "incerta" ? "wait" : "erro" : "idle"
            }
        ];
        let pipe = "";
        let labels = "";
        nodes.forEach((nd, i)=>{
            // five stations, clockwise: the one that was between the Jev and the quote is gone, and its place at the top left is left free for the quota text
            const a = [
                -150,
                -90,
                30,
                90,
                150
            ][i];
            const [x, y] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pt"])(cx, cy, 262, a);
            const col = nd.s === "ok" ? "#2ee6ff" : nd.s === "erro" ? "#ffb23e" : nd.s === "wait" ? "#7df3ff" : "#1b5266";
            const side = Math.abs(a) === 90;
            const [lx, ly] = side ? [
                x + (a < 0 ? 26 : -26),
                y
            ] : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pt"])(cx, cy, 236, a);
            const anchor = side ? a < 0 ? "start" : "end" : "middle";
            const plateW = nd.n.length * 8.2 * boost + 18;
            const plateX = anchor === "start" ? lx - 9 : anchor === "end" ? lx - plateW + 9 : lx - plateW / 2;
            pipe += `<path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hex"])(x, y, 14)}" fill="#031820" stroke="${col}" stroke-width="2" ${nd.s === "idle" ? "" : 'class="glow"'}/><circle cx="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x)}" cy="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y)}" r="4.5" fill="${col}"/>`;
            labels += `<rect x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(plateX)}" y="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(ly - 10 * boost)}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(plateW)}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(17 * boost)}" fill="#02101a" opacity=".92" stroke="#124c5f" stroke-width="1"/>${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(lx, ly + 4 * boost, nd.n, "t-sub", `fill:${col};font-size:${b(10.5)}px`, anchor)}`;
        });
        return `<circle cx="${cx}" cy="${cy}" r="350" fill="url(#coreHalo)"/>
      <g class="spin-f" style="transform-origin:${cx}px ${cy}px" fill="none" stroke="#17687f" stroke-width="1.2"><circle cx="${cx}" cy="${cy}" r="340" stroke-dasharray="2 9" opacity=".7"/>${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ticks"])(cx, cy, 330, 340, 120, 'stroke="#1c8aa3"')}</g>
      <g class="spin-b" style="transform-origin:${cx}px ${cy}px" fill="none" stroke-linecap="round">
        <path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, 322, 10, 70)}" stroke="#2ee6ff" stroke-width="3" class="glow"/><path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, 322, 130, 150)}" stroke="#2ee6ff" stroke-width="3"/>
        <path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, 322, 200, 262)}" stroke="#17687f" stroke-width="3"/><path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, 322, 290, 330)}" stroke="#2ee6ff" stroke-width="3" class="glow"/></g>
      <circle cx="${cx}" cy="${cy}" r="262" fill="none" stroke="#124c5f" stroke-width="1.4"/>
      <circle cx="${cx}" cy="${cy}" r="262" fill="none" stroke="#2ee6ff" stroke-width="2" class="flow" opacity=".85"/>
      <g class="spin-c" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy - 262}" r="5" fill="#e9fbff" class="glow"/><circle cx="${cx}" cy="${cy + 262}" r="3.5" fill="#2ee6ff"/></g>
      ${quota}${pipe}
      ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy - 232, `COTA DO DIA ${D.budget.consults} DE ${D.budget.max}`, "t-sub", `font-size:${b(10)}px`, "middle")}
      <circle cx="${cx}" cy="${cy}" r="170" fill="none" stroke="#0e3948" stroke-width="11"/>
      <path class="countArc glow" d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, 170, 0, 1)}" fill="none" stroke="#2ee6ff" stroke-width="11"/>
      <circle class="countHead" r="7" cx="${cx}" cy="${cy - 170}" fill="#e9fbff" style="filter:url(#glow)"/>
      <g class="spin-d" style="transform-origin:${cx}px ${cy}px" fill="none" stroke="#2ee6ff" stroke-width="1" opacity=".55"><circle cx="${cx}" cy="${cy}" r="148"/>${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ticks"])(cx, cy, 141, 148, 96)}</g>
      <circle cx="${cx}" cy="${cy}" r="112" fill="none" stroke="#0b2c38" stroke-width="9"/>${donut}${sats}
      <g class="spin-e" style="transform-origin:${cx}px ${cy}px" fill="none" stroke="#7df3ff" stroke-width="1.4" opacity=".7"><path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, 99, 0, 80)}"/><path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, 99, 180, 260)}"/></g>
      <circle cx="${cx}" cy="${cy}" r="88" fill="url(#coreFill)" class="glow2"/>
      <circle cx="${cx}" cy="${cy}" r="88" fill="none" stroke="#bff6ff" stroke-width="1.5" opacity=".7"/>
      <g class="spin-d" style="transform-origin:${cx}px ${cy}px" opacity=".85"><path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hex"])(cx, cy, 80)}" fill="none" stroke="#02161d" stroke-width="1.4"/></g>
      ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy - 34, "INONU", "t-title", `fill:#02222c;font-weight:700;font-size:${b(13)}px`, "middle")}
      ${D.wallet.total === null ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 6, "SEM LEITURA", "t-big", "fill:#02222c;font-size:17px", "middle") : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["countText"])(cx, cy + 6, D.wallet.total, 2, "US$ ", "", "t-big", "fill:#02222c;font-size:23px", "middle")}
      ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 28, "CARTEIRA GERIDA", "t-sub", "fill:#03323f;font-size:10px", "middle")}
      ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 48, D.wallet.cash === null ? D.wallet.lastReadMs === null ? "NUNCA LIDA" : "LIDA AS " + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(D.wallet.lastReadMs) : "CAIXA US$ " + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(D.wallet.cash), "t-sub", "fill:#03323f;font-size:10px", "middle")}
      ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 372, D.agent.cycling ? "AGUARDANDO O PROXIMO OLHAR" : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["STOPPED_STATE"], "t-title coreState", `font-size:${b(15)}px`, "middle")}
      ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 404, D.agent.cycling ? "00:00" : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["STOPPED_COUNT"], "t-num coreCount", `fill:#2ee6ff;font-size:${b(22)}px`, "middle")}
      ${labels}`;
    }
    return {
        results,
        positions,
        decision,
        health,
        healthH,
        placar,
        facets,
        feed,
        cycles: cyclesPanel,
        command,
        reading,
        readingH,
        counters,
        core
    };
}
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/draw/compact.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** The analysis panels redrawn for a narrow column: every one is 480 wide, so the type stays readable on a phone or a side pane. Same data and same honesty as analysis.ts; only the arrangement changes. */ __turbopack_context__.s([
    "COMPACT_H",
    ()=>COMPACT_H,
    "createCompact",
    ()=>createCompact
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$insights$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/insights.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/h.ts [app-client] (ecmascript)");
;
;
const ribbon = (x0, y0, h0, x1, y1, h1)=>{
    const xm = (x0 + x1) / 2;
    return `M${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x0)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y0)}C${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(xm)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y0)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(xm)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y1)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x1)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y1)}L${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x1)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y1 + h1)}C${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(xm)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y1 + h1)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(xm)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y0 + h0)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x0)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y0 + h0)}Z`;
};
const NO_ANALYSIS = "A VERSAO DO NUCLEO NAO ENVIA A ANALISE";
const NO_BAR = "O CODIGO NAO TEM BARRA DE CONVICCAO: A ESCOLHA DO JEV E A DECISAO";
const HISTORY = "ATE 14/10 HAVIA UMA BARRA DE 20 (P 60%), JA RETIRADA: SO HISTORICO, NAO REGRA";
const ALLOC_COLORS = [
    "#2ee6ff",
    "#38ffb4",
    "#7df3ff",
    "#ffb23e",
    "#5fa3b5",
    "#a58cff",
    "#ff6048",
    "#8fd3ff"
];
const COMPACT_H = {
    funnel: 412,
    hist: 370,
    matrix: 500,
    preferences: 450,
    timeline: 110,
    allocation: 620,
    equityMarks: 370,
    tripCards: 500,
    limits: 500,
    kpis: 340,
    cumulative: 370,
    outcomes: 430,
    activity: 350,
    moves: 410,
    recent: 560
};
function createCompact(D) {
    const A = D.a;
    const cands = D.candidates;
    const net = A.trips.reduce((a, t)=>a + (t.out - t.in), 0);
    function funnel() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(480, COMPACT_H.funnel, "DO ITEM AO RECIBO", NO_ANALYSIS);
        const F = A.funnel;
        const scale = 120 / Math.max(1, F.items);
        const hh = (c)=>Math.max(6, c * scale);
        const cy = 158;
        const stages = [
            [
                "ITENS",
                F.items
            ],
            [
                "ABERTOS",
                F.open
            ],
            [
                "PEDIDOS",
                F.asked
            ],
            [
                "ENVIADAS",
                F.applied
            ],
            [
                "EXECUT.",
                F.executed
            ]
        ];
        const drops = [
            [
                "FECHADOS PELO CODIGO",
                F.items - F.open,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute
            ],
            [
                "PULADOS PELO JEV",
                F.open - F.asked,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy
            ],
            [
                "BLOQUEADOS PELO CODIGO",
                F.asked - F.applied,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ],
            [
                "NAO EXECUTADOS",
                F.applied - F.executed,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].red
            ]
        ];
        const xs = [
            30,
            140,
            250,
            360,
            450
        ];
        const bw = 18;
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "DO ITEM AO RECIBO", `AS ULTIMAS ${F.consults} CONSULTAS, CANDIDATO A CANDIDATO`);
        stages.forEach(([name, c], i)=>{
            const h = hh(c), y = cy - h / 2, x = xs[i];
            s += `<rect class="grow-y" x="${x}" y="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y)}" width="${bw}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(h)}" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy}" opacity=".9" style="animation-delay:${(i * 0.1).toFixed(2)}s"/>`;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + bw / 2, 68, name, "t-sub", "font-size:9.5px;fill:#7df3ff", "middle") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + bw / 2, 86, String(c), "t-num", "font-size:18px", "middle");
            if (i < stages.length - 1) {
                const cn = stages[i + 1][1], hn = hh(cn), yn = cy - hn / 2, x1 = xs[i + 1];
                s += `<path d="${ribbon(x + bw, y, hn, x1, yn, hn)}" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy}" opacity=".22"/>`;
                s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])((x + bw + x1) / 2, cy + 4, c ? Math.round(cn / c * 100) + "%" : "-", "t-mono", "font-size:9.5px;fill:#bfefff", "middle");
            }
        });
        const flow = `M${xs[0] + bw} ${cy}` + xs.slice(1).map((x)=>`L${x} ${cy}`).join("");
        s += `<circle r="3.5" fill="#e9fbff" class="glow"><animateMotion dur="5s" repeatCount="indefinite" path="${flow}"/></circle>`;
        // what the code dropped in the last cycle is named under its count: the symbols and the reason
        const why = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$insights$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["blockedGroups"])(D)[0];
        drops.forEach(([n, c, col], i)=>{
            const y = 258 + i * 34;
            s += `<rect x="0" y="${y - 12}" width="14" height="14" fill="${col}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(26, y, n, "t-sub", "font-size:10.5px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(480, y, String(c), "t-num", `font-size:19px;fill:${col}`, "end");
            if (i === 2 && why !== undefined) s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(26, y + 13, `ULTIMO: ${why.names}, ${why.text}`.slice(0, 52), "t-mono", `font-size:10px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}`);
        });
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 396, "CADA ITEM E UM TOKEN OFERECIDO EM UMA CONSULTA", "t-sub", "font-size:9.5px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 411, "FECHADOS: SEM CAIXA OU ABAIXO DO MINIMO DA REDE", "t-sub", "font-size:9.5px");
    }
    function hist() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(480, COMPACT_H.hist, "O QUANTO O JEV QUIS COMPRAR", NO_ANALYSIS);
        const all = A.hist.all, nw = A.hist.fresh;
        const x0 = 10, W = 460, y1 = 250, Hh = 160, bw = W / 20;
        const max = Math.max(...all, 1);
        const total = all.reduce((a, b)=>a + b, 0);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "O QUANTO O JEV QUIS COMPRAR", `PREFERENCIA DE COMPRA EM ${total} RESPOSTAS`);
        for(let i = 0; i < 4; i++)s += `<line x1="${x0}" x2="${x0 + W}" y1="${y1 - i * Hh / 3}" y2="${y1 - i * Hh / 3}" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].grid}" stroke-dasharray="2 6"/>`;
        all.forEach((c, i)=>{
            const h = c / max * Hh, x = x0 + i * bw;
            s += `<rect class="grow-y" x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x + 2)}" y="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y1 - h)}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(bw - 4)}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(Math.max(h, 0.5))}" fill="#136a80" style="animation-delay:${(i * 0.03).toFixed(2)}s"/>`;
            const hn = (nw[i] ?? 0) / max * Hh;
            if (nw[i]) s += `<rect class="grow-y" x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x + 5)}" y="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y1 - hn)}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(bw - 10)}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(hn)}" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy}" style="animation-delay:${(0.4 + i * 0.03).toFixed(2)}s"/>`;
        });
        for (const v of [
            0,
            20,
            40,
            60,
            80,
            100
        ])s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0 + v / 100 * W, y1 + 16, v + "%", "t-sub", "font-size:9.5px", "middle");
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 302, "ESCURO: TODAS AS RESPOSTAS. CLARO: REDACAO NOVA", "t-sub", "font-size:9.5px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 320, "A ALTURA E QUANTAS VEZES O JEV DEU ESSA PREFERENCIA", "t-sub", "font-size:9.5px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 338, "NAO E CHANCE DE LUCRO", "t-sub", "font-size:9.5px");
    }
    function matrix() {
        const open = cands.filter((c)=>!c.closed).sort((a, b)=>(b.pbuy ?? 0) - (a.pbuy ?? 0));
        const rows = [
            ...open,
            ...cands.filter((c)=>c.closed)
        ].slice(0, 9);
        const cols = [
            [
                "late_entry",
                "ATRAS.",
                "risk"
            ],
            [
                "still_falling",
                "CAINDO",
                "risk"
            ],
            [
                "accumulating",
                "ACUM.",
                "good"
            ],
            [
                "exit_easy",
                "SAIDA",
                "good"
            ],
            [
                "distribution",
                "DISTR.",
                "risk"
            ],
            [
                "fading",
                "FORCA",
                "risk"
            ]
        ];
        const x0 = 156, cw = 54, y0 = 92, rh = 42;
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "O QUE O JEV JULGOU", "AMBAR: RISCO. CIANO: FAVOR. DE 0 A 100");
        if (rows.length === 0) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 120, "AINDA SEM CONSULTA COM CANDIDATOS NESTA SESSAO", "t-sub", "font-size:10px");
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y0 - 12, "CANDIDATO", "t-sub", "font-size:9px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0 - 6, y0 - 12, "COMPRA", "t-sub", "font-size:9px", "end");
        cols.forEach(([, lab], i)=>{
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0 + i * cw + cw / 2 - 2, y0 - 12, lab, "t-sub", "font-size:8.5px", "middle");
        });
        rows.forEach((c, r)=>{
            const y = y0 + r * rh, dim = c.closed;
            const asked = c.applied !== null && c.applied !== "skip";
            const status = dim ? "FECHADO PELO CODIGO" : c.blocked !== null ? "PEDIU, CODIGO BLOQUEOU" : asked ? "PEDIU COMPRAR" : "O JEV PULOU";
            const scol = dim ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute : c.blocked !== null ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber : asked ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y + 16, c.s.slice(0, 10), "t-num", `font-size:14px;fill:${dim ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white}`) + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y + 36, status, "t-sub", `font-size:9.5px;letter-spacing:.06em;fill:${scol}`);
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0 - 6, y + 22, dim || c.pbuy === null ? "-" : Math.round(c.pbuy * 100) + "%", "t-mono", `font-size:12px;fill:${dim ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute : "#7df3ff"}`, "end");
            const vals = cols.map(([k])=>c.facets[k]);
            const mx = Math.max(...vals.filter((v)=>typeof v === "number"), -1);
            cols.forEach(([k, , kind], i)=>{
                const v = c.facets[k], has = typeof v === "number", x = x0 + i * cw, col = kind === "good" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber;
                s += `<rect x="${x + 1}" y="${y + 4}" width="${cw - 5}" height="${rh - 12}" fill="${has ? col : "#0b2c38"}" opacity="${has ? (0.1 + 0.8 * v).toFixed(2) : "0.25"}" ${has && v === mx ? `stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white}" stroke-width="1.3"` : ""}/>`;
                s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + cw / 2 - 2, y + 24, has ? String(Math.round(v * 100)) : "-", "t-mono", `font-size:12px;fill:${has ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute}`, "middle");
            });
        });
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y0 + rows.length * rh + 14, "CONTORNO: A MAIOR DA LINHA. NENHUMA REGRA LE PERDE FORCA", "t-sub", "font-size:9px");
    }
    // the Jev's own preference for each purchase he asked for, with no bar line: his choice is the decision
    function preferences() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(480, COMPACT_H.preferences, "PREFERENCIA DO JEV POR PEDIDO", NO_ANALYSIS);
        const asks = A.asks.slice(-8).reverse();
        const gx = 118, gw = 190;
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "PREFERENCIA DO JEV POR PEDIDO", `${A.asks.length} PEDIDOS, COM A PROBABILIDADE QUE ELE DEU`);
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(gx, 82, "PREFERENCIA DE COMPRA, 0 A 100%", "t-sub", "font-size:9px");
        asks.forEach((a, i)=>{
            const y = 100 + i * 34, pass = a.ok;
            // a request of the last cycle that the code then dropped is not a decision carried out, so it says who stopped it
            const held = pass && D.last.atMs !== null && Math.abs(a.t - D.last.atMs) < 1000 && D.last.dropped.some((d)=>d.side === "buy" && d.s === (a.s ?? "").slice(0, 14));
            const shade = held ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber : pass ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y + 12, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(a.t), "t-mono", "font-size:11px;fill:#5fa3b5") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(46, y + 12, (a.s ?? "-").slice(0, 8), "t-num", "font-size:13px");
            s += `<rect x="${gx}" y="${y + 3}" width="${gw}" height="10" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].dim}"/><rect class="grow-x" x="${gx}" y="${y + 3}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clamp"])(a.p, 0, 1) * gw)}" height="10" fill="${shade}" style="animation-delay:${(i * 0.06).toFixed(2)}s"/>`;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(gx + gw + 10, y + 13, "P " + Math.round(a.p * 100) + "%", "t-mono", "font-size:11.5px;fill:#bfefff") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(480, y + 13, held ? "BLOQUEADA" : pass ? "PEDIDA" : "SEM ORDEM", "t-sub", `font-size:9px;fill:${shade}`, "end");
        });
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])(NO_BAR, 62).reduce((acc, l, i)=>acc + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 394 + i * 14, l, "t-sub", "font-size:9.5px"), "");
        // older requests that did not become an order are history: until 2026-10-14 a bar of 20 (P 60%) stood there, and it is gone
        return A.asks.some((a)=>!a.ok) ? s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])(HISTORY, 62).reduce((acc, l, i)=>acc + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 424 + i * 14, l, "t-sub", `font-size:9.5px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute}`), "") : s;
    }
    function timeline() {
        if (!D.analysisOk || A.timeline.length === 0) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 14, D.analysisOk ? "AINDA SEM CONSULTAS NESTA SESSAO" : "LINHA DO TEMPO: " + NO_ANALYSIS, "t-sub", "font-size:9.5px");
        const T = A.timeline, w = 480 / T.length, mx = Math.max(...T.map((t)=>t.open), 1);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 12, `ULTIMAS ${T.length} CONSULTAS: ABERTOS, PEDIDOS, ENVIADAS`, "t-sub", "font-size:9.5px");
        const kinds = [
            [
                "open",
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy
            ],
            [
                "asked",
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ],
            [
                "applied",
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green
            ]
        ];
        T.forEach((t, i)=>{
            const x = i * w;
            const h = (v)=>Math.max(v ? 3 : 0, v / mx * 40);
            kinds.forEach(([k, col], j)=>{
                s += `<rect class="grow-y" x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x + 1 + j * (w - 2) / 3)}" y="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(76 - h(t[k]))}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])((w - 2) / 3 - 0.5)}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(h(t[k]))}" fill="${col}" opacity=".9" style="animation-delay:${(i * 0.02).toFixed(2)}s"/>`;
            });
            if (i % 8 === 0) s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x, 92, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(t.t), "t-sub", "font-size:8.5px");
        });
        return s;
    }
    function allocation() {
        const ps = D.wallet.positions.filter((p)=>p.usd !== null && p.usd > 0).sort((a, b)=>(b.usd ?? 0) - (a.usd ?? 0));
        const total = D.wallet.total ?? ps.reduce((a, p)=>a + (p.usd ?? 0), 0);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "A CARTEIRA, ATIVO POR ATIVO", total > 0 ? `US$ ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(total)} NA CARTEIRA GERIDA` : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNote"])(D.wallet.lastReadMs));
        if (!(total > 0)) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 100, "SEM LEITURA DA CARTEIRA", "t-sub", "font-size:10px");
        const cx = 240, cy = 180, R = 98;
        let acc = 0;
        let donut = "";
        ps.forEach((p, i)=>{
            const sw = (p.usd ?? 0) / total * 360;
            if (sw > 0.4) donut += `<path class="draw" pathLength="1" d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, R, acc + 0.8, acc + sw - 0.8)}" stroke="${ALLOC_COLORS[i % ALLOC_COLORS.length]}" stroke-width="26" fill="none" style="animation-delay:${(i * 0.12).toFixed(2)}s"/>`;
            acc += sw;
        });
        s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].dim}" stroke-width="26"/>${donut}<g class="spin-d" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="${R + 22}" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="3 9"/></g>`;
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy, "US$ " + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(total), "t-big", "font-size:24px", "middle") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 20, ps.length + " ATIVOS", "t-sub", "font-size:10px", "middle");
        ps.slice(0, 8).forEach((p, i)=>{
            const y = 330 + i * 36, share = (p.usd ?? 0) / total, col = ALLOC_COLORS[i % ALLOC_COLORS.length];
            s += `<rect x="0" y="${y - 12}" width="12" height="12" fill="${col}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(20, y, p.s, "t-num", "font-size:15px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(296, y, "US$ " + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(p.usd), "t-mono", "font-size:12.5px", "end");
            s += `<rect x="306" y="${y - 9}" width="110" height="7" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].dim}"/><rect class="grow-x" x="306" y="${y - 9}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(Math.max(2, share * 110))}" height="7" fill="${col}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(480, y, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(share * 100, 1) + "%", "t-mono", "font-size:12px", "end");
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(20, y + 14, p.cash ? "CAIXA EM USDC" : p.plan ? "COM PLANO DE SAIDA" : "SEM PLANO DE SAIDA", "t-sub", `font-size:8.5px;fill:${p.cash ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft : p.plan ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}`);
        });
        return s;
    }
    function equityMarks() {
        const eq = D.equity;
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "O PATRIMONIO E AS ORDENS", "TRIANGULO = ORDEM EXECUTADA");
        if (eq.length < 2) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 100, "AINDA SEM HISTORICO DA CARTEIRA", "t-sub", "font-size:10px");
        const x0 = 8, x1 = 472, y0 = 96, y1 = 270;
        const vmin = Math.min(...eq.map((p)=>p.v)), vmax = Math.max(...eq.map((p)=>p.v));
        const t0 = eq[0].t, t1 = eq[eq.length - 1].t;
        const px = (t)=>x0 + (t - t0) / (t1 - t0 || 1) * (x1 - x0);
        const py = (v)=>y1 - (v - vmin) / (vmax - vmin || 1) * (y1 - y0);
        const line = eq.map((p, i)=>`${i ? "L" : "M"}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(px(p.t))} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(py(p.v))}`).join("");
        for (const i of [
            0,
            2,
            4
        ]){
            const y = y0 + i * (y1 - y0) / 4;
            s += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].grid}" stroke-dasharray="2 6"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x1, y - 4, "US$ " + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(vmax - i * (vmax - vmin) / 4), "t-sub", "font-size:9px", "end");
        }
        s += `<path d="${line}L${x1} ${y1}L${x0} ${y1}Z" fill="url(#areaGrad)"/><path d="${line}" fill="none" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy}" stroke-width="2" class="glow"/>`;
        D.events.filter((e)=>e.t >= t0).forEach((e)=>{
            const x = px(e.t), y = py(eq.reduce((m, p)=>Math.abs(p.t - e.t) < Math.abs(m.t - e.t) ? p : m).v), ok = e.stage === "executada";
            const col = !ok ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].red : e.side === "buy" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber;
            s += ok ? e.side === "buy" ? `<path d="M${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y - 10)}l6 10h-12z" fill="${col}"/>` : `<path d="M${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y + 10)}l6 -10h-12z" fill="${col}"/>` : `<path d="M${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x - 4)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y - 4)}l8 8M${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x + 4)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y - 4)}l-8 8" stroke="${col}" stroke-width="2"/>`;
        });
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0, y1 + 20, new Date(t0).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        }), "t-sub", "font-size:9.5px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x1, y1 + 20, "AGORA", "t-sub", "font-size:9.5px", "end");
        s += `<path d="M0 318l8 -10h12z" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(26, 318, "COMPRA", "t-sub", "font-size:9.5px") + `<path d="M110 308l8 10h12z" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(136, 318, "VENDA", "t-sub", "font-size:9.5px") + `<path d="M210 308l9 9M219 308l-9 9" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].red}" stroke-width="2"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(230, 318, "ORDEM COM FALHA", "t-sub", "font-size:9.5px");
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 344, "A CURVA MISTURA APORTES E PRECOS COM AS ORDENS.", "t-sub", "font-size:9px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 358, "NAO E LUCRO DO SISTEMA", "t-sub", "font-size:9px");
    }
    function tripCards() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(480, COMPACT_H.tripCards, "POSICOES JA ENCERRADAS", NO_ANALYSIS);
        const rows = A.trips.slice(-2);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "POSICOES JA ENCERRADAS", "DA COMPRA A VENDA");
        if (!rows.length) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 100, "AINDA NAO HA VOLTA FECHADA", "t-sub", "font-size:11px");
        rows.forEach((t, i)=>{
            const y = 70 + i * 212, col = t.pct >= 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber, mins = Math.round((t.sellAt - t.buyAt) / 60000);
            s += `<g transform="translate(0 ${y})"><rect x="0" y="0" width="480" height="196" fill="#031820" stroke="#124c5f"/><path d="M0 0h24M0 0v24M480 196h-24M480 196v-24" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy}" stroke-width="2" fill="none"/>
        ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(16, 36, t.s, "t-big", "font-size:26px")}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(464, 34, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pct"])(t.pct), "t-big", `font-size:26px;fill:${col}`, "end")}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(16, 56, `FICOU ${mins} MIN, ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(t.buyAt)} ATE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(t.sellAt)}`, "t-sub", "font-size:10px")}
        <line x1="50" y1="112" x2="430" y2="112" stroke="#124c5f" stroke-width="2"/><line x1="50" y1="112" x2="430" y2="112" stroke="${col}" stroke-width="2" class="flow-fast"/>
        <circle cx="50" cy="112" r="7" fill="#031820" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green}" stroke-width="2"/><circle cx="430" cy="112" r="7" fill="#031820" stroke="${col}" stroke-width="2"/>
        <circle r="4" fill="#e9fbff" class="glow"><animateMotion dur="${(3 + i).toFixed(1)}s" repeatCount="indefinite" path="M50 112L430 112"/></circle>
        ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(50, 90, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(t.in) + " USDC", "t-mono", "font-size:12px;fill:#bfefff", "middle")}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(430, 90, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(t.out) + " USDC", "t-mono", `font-size:12px;fill:${col}`, "middle")}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(50, 138, "COMPRA", "t-sub", "font-size:9px", "middle")}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(430, 138, "VENDA", "t-sub", "font-size:9px", "middle")}
        ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(16, 172, "RESULTADO DO CAIXA", "t-sub", "font-size:9.5px")}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(464, 175, (t.out - t.in >= 0 ? "+" : "") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(t.out - t.in, 4) + " USDC", "t-num", `font-size:17px;fill:${col}`, "end")}</g>`;
        });
        return s;
    }
    function limits() {
        const sp = A.orders.spentToday;
        const cap = D.agent.caps ?? {
            maxBuyUsd: undefined,
            maxDailyBuyUsd: undefined,
            maxDailySellUsd: undefined
        };
        const total = D.wallet.total ?? 0;
        // a wallet nobody read has no share of cash: the ring stays empty and says so, instead of a zero that looks like a fact
        const unread = D.wallet.cash === null || !(total > 0);
        const cashShare = unread ? 0 : D.wallet.cash / total;
        const known = D.analysisOk;
        // A placeholder zero is not a reported spend; ceilings still come from core status.
        const gauges = [
            [
                "COMPRAS HOJE",
                known ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capUse"])(sp.buy, cap.maxDailyBuyUsd) : null,
                known ? `US$ ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(sp.buy, 0)} DE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capText"])(cap.maxDailyBuyUsd)}` : `SEM DADO DO NUCLEO, LIMITE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capText"])(cap.maxDailyBuyUsd)}`,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy,
                known ? undefined : "SEM DADO"
            ],
            [
                "VENDAS HOJE",
                known ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capUse"])(sp.sell, cap.maxDailySellUsd) : null,
                known ? `US$ ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(sp.sell, 0)} DE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capText"])(cap.maxDailySellUsd)}` : `SEM DADO DO NUCLEO, LIMITE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capText"])(cap.maxDailySellUsd)}`,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft,
                known ? undefined : "SEM DADO"
            ],
            [
                "CONSULTAS",
                D.budget.max > 0 ? D.budget.consults / D.budget.max : 0,
                `${D.budget.consults} DE ${D.budget.max}`,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy
            ],
            [
                "CAIXA LIVRE",
                cashShare,
                unread ? "SEM LEITURA DA CARTEIRA" : `${Math.round(cashShare * 100)}% DA CARTEIRA`,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green,
                unread ? "-" : undefined
            ]
        ];
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "LIMITES E RISCO DO DIA", "ATE ONDE O AGENTE VAI SEM PEDIR");
        gauges.forEach(([lab, f, val, col, centre], i)=>{
            const cx = 120 + i % 2 * 240, cy = 150 + Math.floor(i / 2) * 160, fr = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clamp"])(f ?? 0, 0, 1);
            s += `<circle cx="${cx}" cy="${cy}" r="44" fill="none" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].dim}" stroke-width="10"/><path class="draw" pathLength="1" d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, 44, 0, Math.max(2, fr * 359))}" fill="none" stroke="${col}" stroke-width="10"/><g class="${i % 2 ? "spin-c" : "spin-d"}" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="56" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="3 9"/></g>`;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 6, centre ?? (f === null ? "LIVRE" : Math.round(fr * 100) + "%"), "t-num", `font-size:${f === null ? 13 : 17}px`, "middle") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 76, lab, "t-sub", "font-size:9.5px", "middle") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 92, val, "t-mono", "font-size:11px;fill:#7df3ff", "middle");
        });
        // only what the core says: no risk per operation and no minimum order are rules of the code any more (the Jev sizes the order)
        const rules = [
            [
                "TETO DE COMPRA",
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capText"])(cap.maxBuyUsd)
            ],
            [
                "RESERVA EM CAIXA",
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(D.agent.reserveShare * 100, 0) + "%"
            ],
            [
                "ALAVANCAGEM",
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["leverageText"])(D.agent.leverage, true)
            ],
            [
                "AUTORIDADE",
                D.agent.authority.toUpperCase()
            ]
        ];
        rules.forEach(([a, b], i)=>{
            const x = i % 2 * 240, y = 428 + Math.floor(i / 2) * 38;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x, y, a, "t-sub", "font-size:9.5px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x, y + 15, b, "t-mono", "font-size:12px;fill:#bfefff");
        });
        return s;
    }
    function kpis() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(480, COMPACT_H.kpis, "RESULTADO", NO_ANALYSIS);
        const neg = A.trips.filter((t)=>t.pct < 0).length, o = A.orders.outcomes;
        const eq = D.equity;
        const win = eq.length > 1 ? (eq[eq.length - 1].v / eq[0].v - 1) * 100 : null;
        const ok = o.executada ?? 0, fail = o.falhou ?? 0;
        const blocks = [
            [
                "VOLTAS FECHADAS",
                String(A.trips.length),
                `${neg} DE ${A.trips.length} NEGATIVAS`,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white
            ],
            [
                "CAIXA DAS VOLTAS",
                (net > 0 ? "+" : "") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(net, 3),
                "USDC, ANTES DA TAXA",
                net >= 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ],
            [
                "TAXAS DE REDE",
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(A.fees.lamports / 1e9, 5),
                "SOL, SO A REDE",
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white
            ],
            [
                "ORDENS",
                `${ok} DE ${ok + fail}`,
                `${fail} FALHARAM`,
                fail ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green
            ],
            [
                "CARTEIRA NA JANELA",
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pct"])(win, 1),
                "NAO E LUCRO",
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft
            ]
        ];
        let s = "";
        blocks.forEach(([lab, val, sub, col], i)=>{
            const x = i % 2 * 250, y = Math.floor(i / 2) * 108;
            s += `<path d="M${x} ${y + 6}V${y}H${x + 220}" fill="none" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy}" stroke-width="1.3"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 2, y + 24, lab, "t-title", "font-size:10.5px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 2, y + 66, val, "t-big", `font-size:28px;fill:${col}`) + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 2, y + 86, sub, "t-sub", "font-size:9.5px") + `<rect class="grow-x" x="${x + 2}" y="${y + 94}" width="200" height="2" fill="${col}"/>`;
        });
        return s;
    }
    function cumulative() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(480, COMPACT_H.cumulative, "CAIXA ACUMULADO DAS VOLTAS", NO_ANALYSIS);
        const tr = A.trips, x0 = 20, x1 = 440, y0 = 80, y1 = 250;
        let cum = 0;
        const pts = [
            [
                0,
                0,
                "INICIO"
            ]
        ];
        tr.forEach((t)=>{
            cum += t.out - t.in;
            pts.push([
                t.sellAt,
                cum,
                t.s
            ]);
        });
        const vmin = Math.min(0, ...pts.map((p)=>p[1])) - 0.05, vmax = Math.max(0, ...pts.map((p)=>p[1])) + 0.05;
        const px = (_t, i)=>x0 + i * (x1 - x0 - 30) / Math.max(1, pts.length - 1);
        const py = (v)=>y1 - (v - vmin) / (vmax - vmin) * (y1 - y0);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "CAIXA ACUMULADO DAS VOLTAS", "USDC, ANTES DA TAXA EM SOL");
        s += `<line x1="${x0}" x2="${x1}" y1="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(py(0))}" y2="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(py(0))}" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft}" stroke-dasharray="5 5"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x1, py(0) - 6, "EMPATE", "t-sub", "font-size:9.5px;fill:#7df3ff", "end");
        let path = "";
        pts.forEach((p, i)=>{
            const x = px(p[0], i), y = py(p[1]);
            path += i ? `L${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(py(pts[i - 1][1]))}L${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y)}` : `M${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y)}`;
        });
        s += `<path d="${path}L${x1} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(py(cum))}" fill="none" stroke="${cum >= 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}" stroke-width="2.2" class="glow draw" pathLength="1"/>`;
        // the labels of the steps are written only where they have room: the newest first, a crowded run keeps every other one that fits
        const steps = pts.slice(1).map((p, k)=>({
                p,
                x: px(p[0], k + 1),
                y: py(p[1])
            }));
        const nameOn = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["thinLabels"])(steps.map((t)=>Math.min(t.x, 440)), steps.map((t)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["approxWidth"])(t.p[2], 10.5, 0.14, false, false)));
        const valueW = steps.map((t)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["approxWidth"])((t.p[1] > 0 ? "+" : "") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(t.p[1], 3), 11.5, 0.02, true, false));
        const valueOn = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["thinLabels"])(steps.map((t, k)=>Math.min(t.x, 420) + 8 + valueW[k] / 2), valueW);
        steps.forEach((t, k)=>{
            s += `<circle cx="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(t.x)}" cy="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(t.y)}" r="5" fill="#031820" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}" stroke-width="2"/>` + (nameOn[k] ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(Math.min(t.x, 440), t.y + 22, t.p[2], "t-sub", "font-size:9.5px", "middle") : "") + (valueOn[k] ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(Math.min(t.x, 420) + 8, t.y - 9, (t.p[1] > 0 ? "+" : "") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(t.p[1], 3), "t-mono", `font-size:11.5px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}`) : "");
        });
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 296, `PARA O EMPATE FALTAM ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(Math.abs(Math.min(0, cum)), 3)} USDC, MAIS A REDE`, "t-sub", "font-size:9.5px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 314, A.trips.length < 5 ? `${A.trips.length} VOLTAS SAO POUCAS PARA CONCLUIR` : `${A.trips.length} VOLTAS FECHADAS`, "t-sub", "font-size:9.5px;fill:#7df3ff");
    }
    function outcomes() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(480, COMPACT_H.outcomes, "O QUE ACONTECEU COM AS ORDENS", NO_ANALYSIS);
        const o = A.orders.outcomes, rs = A.orders.reasons;
        const parts = [
            [
                "EXECUTADAS",
                o.executada ?? 0,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green
            ],
            [
                "FALHARAM",
                o.falhou ?? 0,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ],
            [
                "INCERTAS",
                o.incerta ?? 0,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute
            ]
        ];
        const tot = parts.reduce((a, p)=>a + p[1], 0) || 1;
        const cx = 240, cy = 150, R = 70;
        let acc = 0;
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "O QUE ACONTECEU COM AS ORDENS", "COMO TERMINARAM AS ORDENS ENVIADAS");
        s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].dim}" stroke-width="22"/>`;
        parts.forEach(([, n, col], i)=>{
            const sw = n / tot * 360;
            if (n) s += `<path class="draw" pathLength="1" d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, R, acc + 1, acc + sw - 1)}" stroke="${col}" stroke-width="22" fill="none" style="animation-delay:${(i * 0.2).toFixed(2)}s"/>`;
            acc += sw;
        });
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 4, String(parts.reduce((a, p)=>a + p[1], 0)), "t-big", "font-size:28px", "middle") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 22, "ORDENS", "t-sub", "font-size:9.5px", "middle");
        parts.forEach(([lab, n, col], i)=>{
            const x = 40 + i * 150;
            s += `<rect x="${x}" y="250" width="11" height="11" fill="${col}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 18, 260, lab, "t-sub", "font-size:10px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 18, 282, String(n), "t-num", "font-size:18px");
        });
        const names = {
            simulacao_falhou: "SIMULACAO FALHOU ANTES DE ASSINAR",
            recibo_erro: "RECIBO VOLTOU COM ERRO",
            confirmando: "FERRAMENTA PEDIU CONFIRMACAO",
            resolvida_pelo_usuario: "RESOLVIDA A MAO PELO DONO"
        };
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 316, "POR QUE FALHARAM", "t-sub", `font-size:10px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}`);
        Object.entries(rs).slice(0, 4).forEach(([k, n], i)=>{
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 342 + i * 24, names[k] ?? k.replace(/_/g, " ").toUpperCase(), "t-sub", "font-size:10px") + `<rect x="360" y="${334 + i * 24}" width="${Math.min(80, n * 36)}" height="8" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}" opacity=".8"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(480, 342 + i * 24, String(n), "t-mono", "font-size:12px", "end");
        });
        return s;
    }
    function activity() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(480, COMPACT_H.activity, "A ATIVIDADE DO AGENTE", NO_ANALYSIS);
        const F = A.funnel;
        const items = [
            [
                "CONSULTAS DO DIA",
                D.budget.consults,
                Math.max(1, D.budget.max),
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy
            ],
            [
                "ITENS AVALIADOS",
                F.items,
                Math.max(1, F.items),
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft
            ],
            [
                "PEDIDOS DE COMPRA",
                F.asked,
                Math.max(1, F.open),
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ],
            [
                "BLOQUEADOS PELO CODIGO",
                F.asked - F.applied,
                Math.max(1, F.asked),
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ],
            [
                "EXECUTADAS",
                F.executed,
                Math.max(1, F.applied),
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green
            ],
            [
                "FALHAS NA CADEIA",
                F.failed,
                Math.max(1, F.applied),
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].red
            ]
        ];
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "A ATIVIDADE DO AGENTE", `ITENS E PEDIDOS: ULTIMAS ${F.consults} CONSULTAS`);
        items.forEach(([lab, v, mx, col], i)=>{
            const cx = 80 + i % 3 * 160, cy = 130 + Math.floor(i / 3) * 140;
            s += `<circle cx="${cx}" cy="${cy}" r="40" fill="none" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].dim}" stroke-width="8"/><path class="draw" pathLength="1" d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(cx, cy, 40, 0, Math.max(2, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clamp"])(v / mx, 0, 1) * 359))}" fill="none" stroke="${col}" stroke-width="8"/><g class="${i % 2 ? "spin-c" : "spin-d"}" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="51" fill="none" stroke="#2c7e93" stroke-width="1" stroke-dasharray="2 8"/></g>`;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 7, String(v), "t-big", "font-size:22px", "middle") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(cx, cy + 68, lab, "t-sub", "font-size:9px", "middle");
        });
        return s;
    }
    function moves(win) {
        const name = win === "15m" ? "O PRECO 15 MINUTOS DEPOIS" : "O PRECO 1 HORA DEPOIS";
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(480, COMPACT_H.moves, name, NO_ANALYSIS);
        const G = [
            [
                "PULADAS PELO JEV",
                A.placar.skipped[win],
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy
            ],
            [
                "FECHADAS PELO CODIGO",
                A.placar.closed[win],
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ],
            [
                "PEDIDAS E SEM ORDEM",
                A.placar.gated[win],
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white
            ]
        ];
        const lo = -20, hi = 20, nb = 10, bw = (hi - lo) / nb, x0 = 10, W = 460, y1 = 250, Hh = 150, slot = W / nb;
        const bins = G.map(([, g])=>{
            const b = new Array(nb).fill(0);
            g.vals.forEach((v)=>{
                const k = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clamp"])(Math.floor(((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clamp"])(v, lo, hi - 0.001) - lo) / bw), 0, nb - 1);
                b[k] = (b[k] ?? 0) + 1;
            });
            const n = g.vals.length || 1;
            return b.map((c)=>c / n);
        });
        const mx = Math.max(0.05, ...bins.flat());
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, name, "DO QUE NAO FOI COMPRADO. CONTRAFACTUAL");
        s += `<line x1="${x0 + W / 2}" x2="${x0 + W / 2}" y1="72" y2="${y1}" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft}" stroke-width="1.3" stroke-dasharray="5 5"/>`;
        for(let i = 0; i <= nb; i += 5)s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x0 + i * slot, y1 + 16, lo + i * bw + "%", "t-sub", "font-size:9.5px", "middle");
        G.forEach(([, g, col], gi)=>{
            if (g.n < 5) return;
            bins[gi].forEach((v, bi)=>{
                const h = v / mx * Hh, x = x0 + bi * slot + 3 + gi * (slot - 6) / 3;
                s += `<rect class="grow-y" x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x)}" y="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y1 - h)}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])((slot - 6) / 3 - 1)}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(Math.max(h, 0.4))}" fill="${col}" opacity=".85" style="animation-delay:${(bi * 0.04 + gi * 0.1).toFixed(2)}s"/>`;
            });
            if (g.mean !== null) {
                const mxp = x0 + ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clamp"])(g.mean, lo, hi) - lo) / (hi - lo) * W;
                s += `<line x1="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(mxp)}" x2="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(mxp)}" y1="84" y2="${y1}" stroke="${col}" stroke-width="1.5" stroke-dasharray="2 4"/>`;
            }
        });
        G.forEach(([lab, g, col], gi)=>{
            const y = 296 + gi * 36;
            s += `<rect x="0" y="${y - 10}" width="11" height="11" fill="${col}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(18, y, lab, "t-sub", "font-size:10px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(480, y, g.n < 5 ? `${g.n} CASOS, POUCOS PARA DESENHAR` : `${g.n} CASOS, ${g.up} SUBIRAM, MEDIA ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pct"])(g.mean, 1)}`, "t-mono", `font-size:11px;fill:${col}`, "end");
        });
        return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 398, "ALTURA = PARTE DE CADA GRUPO. TRACEJADO = MEDIA", "t-sub", "font-size:9px");
    }
    function recent() {
        if (!D.analysisOk) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["unavailable"])(480, COMPACT_H.recent, "ULTIMAS DECISOES DE NAO COMPRAR", NO_ANALYSIS);
        const measured = (r)=>r.m15 !== null || r.m1h !== null ? 1 : 0;
        const R = [
            ...A.recent
        ].sort((a, b)=>measured(b) - measured(a) || b.t - a.t).slice(0, 8);
        const kinds = {
            "pulada pelo Jev": [
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy,
                "O JEV PULOU"
            ],
            "puxada pelo codigo": [
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber,
                "FECHADO PELO CODIGO"
            ],
            "pedida e recusada": [
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white,
                "PEDIU, NAO VIROU ORDEM"
            ]
        };
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(480, "ULTIMAS DECISOES DE NAO COMPRAR", "E O QUE O PRECO FEZ DEPOIS. CONTRAFACTUAL");
        if (R.length === 0) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 100, "AINDA SEM DECISOES MEDIDAS", "t-sub", "font-size:11px");
        const cell = (x, y, label, v)=>{
            const head = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x, y, label, "t-sub", "font-size:8.5px");
            if (v === null) return head + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 60, y, "AINDA MEDINDO", "t-sub", `font-size:9px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute}`);
            // the zero is at the middle of the bar zone, clear of the label on its left and of the figure on its right
            const w = Math.min(44, Math.abs(v) * 3.6), col = v >= 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber;
            return head + `<line x1="${x + 124}" x2="${x + 124}" y1="${y - 8}" y2="${y + 3}" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute}"/><rect class="grow-x" x="${v >= 0 ? x + 124 : x + 124 - w}" y="${y - 6}" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(Math.max(w, 1))}" height="8" fill="${col}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 214, y + 2, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pct"])(v, 1), "t-mono", `font-size:11px;fill:${col}`, "end");
        };
        R.forEach((r, i)=>{
            const y = 86 + i * 58, [kc, kl] = kinds[r.kind] ?? [
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute,
                r.kind.toUpperCase()
            ];
            s += `<circle cx="6" cy="${y - 4}" r="5" fill="${kc}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(20, y, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(r.t), "t-mono", "font-size:11.5px;fill:#5fa3b5") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(76, y, (r.s ?? "-").slice(0, 10), "t-num", "font-size:14px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(480, y, kl, "t-sub", `font-size:9px;fill:${kc}`, "end") + cell(20, y + 24, "15 MIN", r.m15) + cell(258, y + 24, "1 HORA", r.m1h);
        });
        return s;
    }
    return {
        funnel,
        hist,
        matrix,
        preferences,
        timeline,
        allocation,
        equityMarks,
        tripCards,
        limits,
        kpis,
        cumulative,
        outcomes,
        activity,
        moves,
        recent
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/draw/h.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** Drawing helpers shared by every panel of the command centre. Only drawing here: no data, no clock. */ __turbopack_context__.s([
    "COL",
    ()=>COL,
    "STOPPED_COUNT",
    ()=>STOPPED_COUNT,
    "STOPPED_STATE",
    ()=>STOPPED_STATE,
    "approxWidth",
    ()=>approxWidth,
    "arc",
    ()=>arc,
    "at",
    ()=>at,
    "capText",
    ()=>capText,
    "capUse",
    ()=>capUse,
    "clamp",
    ()=>clamp,
    "countText",
    ()=>countText,
    "fmt",
    ()=>fmt,
    "fx",
    ()=>fx,
    "hex",
    ()=>hex,
    "hhmm",
    ()=>hhmm,
    "id",
    ()=>id,
    "leverageText",
    ()=>leverageText,
    "minFont",
    ()=>minFont,
    "pct",
    ()=>pct,
    "plain",
    ()=>plain,
    "pt",
    ()=>pt,
    "rad",
    ()=>rad,
    "readNote",
    ()=>readNote,
    "resetIds",
    ()=>resetIds,
    "text",
    ()=>text,
    "thinLabels",
    ()=>thinLabels,
    "ticks",
    ()=>ticks,
    "title",
    ()=>title,
    "unavailable",
    ()=>unavailable,
    "wrap",
    ()=>wrap
]);
const rad = (a)=>a * Math.PI / 180;
const fx = (n)=>Number(n).toFixed(2);
const pt = (cx, cy, r, a)=>[
        cx + r * Math.sin(rad(a)),
        cy - r * Math.cos(rad(a))
    ];
const arc = (cx, cy, r, a0, a1)=>{
    const [x0, y0] = pt(cx, cy, r, a0);
    const [x1, y1] = pt(cx, cy, r, a1);
    return `M${fx(x0)} ${fx(y0)}A${r} ${r} 0 ${(a1 - a0) % 360 > 180 ? 1 : 0} 1 ${fx(x1)} ${fx(y1)}`;
};
const ticks = (cx, cy, r1, r2, n, extra = "")=>{
    let s = "";
    for(let i = 0; i < n; i++){
        const a = 360 * i / n;
        const [x0, y0] = pt(cx, cy, r1, a);
        const [x1, y1] = pt(cx, cy, r2, a);
        s += `<line x1="${fx(x0)}" y1="${fx(y0)}" x2="${fx(x1)}" y2="${fx(y1)}" ${extra}/>`;
    }
    return s;
};
const hex = (cx, cy, r)=>{
    let p = "";
    for(let i = 0; i < 6; i++){
        const [x, y] = pt(cx, cy, r, 60 * i + 30);
        p += (i ? "L" : "M") + fx(x) + " " + fx(y);
    }
    return p + "Z";
};
const fmt = (n, d = 2)=>n === null || n === undefined || Number.isNaN(n) ? "-" : Number(n).toLocaleString("pt-BR", {
        minimumFractionDigits: d,
        maximumFractionDigits: d
    });
const pct = (n, d = 2)=>n === null || n === undefined ? "-" : (n > 0 ? "+" : "") + fmt(n, d) + "%";
const hhmm = (t)=>new Date(t).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
    });
const STOPPED_COUNT = "PARADO";
const STOPPED_STATE = "ACOMPANHAMENTO: NENHUMA ORDEM SAI";
const readNote = (lastReadMs)=>lastReadMs === null ? "SEM LEITURA" : `SEM LEITURA DA CARTEIRA, ULTIMA LEITURA ${hhmm(lastReadMs)}`;
const plain = (s)=>s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const clamp = (v, a, b)=>Math.max(a, Math.min(b, v));
let uid = 0;
const id = (p)=>p + uid++;
const resetIds = ()=>{
    uid = 0;
};
const title = (w, text, sub)=>`
    <path class="draw" pathLength="1" d="M0 38V12Q0 5 7 5H${w - 44}l14 14H${w}" fill="none" stroke="#2ee6ff" stroke-width="1.4"/>
    <text class="t-title" x="14" y="29">${text}</text>
    ${sub ? `<text class="t-sub" x="14" y="48" style="font-size:10.5px">${sub}</text>` : ""}`;
/** Advance widths of Arial in thousandths of an em for what the screen writes (the widest font the screen can fall back to, so a measure made with it is never short): capitals, digits and signs (lower case is there for the few words that are not capitals). */ const ARIAL = {
    A: 667,
    B: 667,
    C: 722,
    D: 722,
    E: 667,
    F: 611,
    G: 778,
    H: 722,
    I: 278,
    J: 500,
    K: 667,
    L: 556,
    M: 833,
    N: 722,
    O: 778,
    P: 667,
    Q: 778,
    R: 722,
    S: 667,
    T: 611,
    U: 722,
    V: 667,
    W: 944,
    X: 667,
    Y: 667,
    Z: 611,
    a: 556,
    b: 556,
    c: 500,
    d: 556,
    e: 556,
    f: 278,
    g: 556,
    h: 556,
    i: 222,
    j: 222,
    k: 500,
    l: 222,
    m: 833,
    n: 556,
    o: 556,
    p: 556,
    q: 556,
    r: 333,
    s: 500,
    t: 278,
    u: 556,
    v: 500,
    w: 722,
    x: 500,
    y: 500,
    z: 500,
    " ": 278,
    ".": 278,
    ",": 278,
    ":": 278,
    ";": 278,
    "%": 889,
    $: 556,
    "+": 584,
    "-": 333,
    "(": 333,
    ")": 333,
    "/": 278,
    "=": 584,
    ">": 584,
    "<": 584,
    _: 556,
    "#": 556,
    "@": 1015,
    "|": 260
};
const MONO = 550;
function approxWidth(text, fs, ls, mono, bold) {
    let w = 0;
    for (const ch of text)w += (mono ? MONO : ARIAL[ch] ?? 556) * (bold && !mono ? 1.06 : 1);
    return w / 1000 * fs + ls * fs * text.length;
}
function thinLabels(xs, widths, gap = 6) {
    const keep = new Array(xs.length).fill(false);
    let edge = Number.POSITIVE_INFINITY;
    for(let i = xs.length - 1; i >= 0; i--){
        const right = xs[i] + widths[i] / 2;
        if (right + gap <= edge) {
            keep[i] = true;
            edge = xs[i] - widths[i] / 2;
        }
    }
    return keep;
}
const minFont = (svg, floor)=>svg.replace(/font-size:(\d+(?:\.\d+)?)px/g, (m, n)=>Number(n) < floor ? `font-size:${floor}px` : m);
const at = (x, y, s, body)=>`<g transform="translate(${fx(x)} ${fx(y)}) scale(${s})">${body}</g>`;
const text = (x, y, s, cls = "t-sub", style = "", anchor = "start")=>`<text class="${cls}" x="${fx(x)}" y="${fx(y)}" text-anchor="${anchor}" style="${style}">${s}</text>`;
const countText = (x, y, value, d, prefix = "", suffix = "", cls = "t-num", style = "", anchor = "start")=>value === null || !Number.isFinite(value) ? text(x, y, "-", cls, style, anchor) : `<text class="${cls}" x="${fx(x)}" y="${fx(y)}" text-anchor="${anchor}" style="${style}" data-count="${value}" data-dec="${d}" data-pre="${prefix}" data-suf="${suffix}">${prefix}${fmt(value, d)}${suffix}</text>`;
function wrap(s, n) {
    const lines = [];
    let line = "";
    for (const word of s.split(" ")){
        if (line !== "" && (line + " " + word).length > n) {
            lines.push(line);
            line = word;
        } else line = line === "" ? word : line + " " + word;
    }
    if (line !== "") lines.push(line);
    return lines;
}
const capText = (cap)=>cap === undefined ? "SEM DADO" : cap === null ? "SEM TETO" : "US$ " + fmt(cap, 0);
const capUse = (spent, cap)=>typeof cap === "number" && cap > 0 ? Math.min(1, spent / cap) : null;
const leverageText = (l, short = false)=>{
    if (l === null || l === undefined) return "SEM DADO DO NUCLEO";
    if (!l.granted) return "NAO AUTORIZADA";
    if (l.instruments === 0) return short ? "AUTORIZADA, SEM INSTRUMENTO" : "AUTORIZADA POR VOCE, SEM INSTRUMENTO LIGADO";
    return `AUTORIZADA, ${l.instruments} INSTRUMENTO(S) LIGADO(S)`;
};
const COL = {
    cy: "#2ee6ff",
    soft: "#7df3ff",
    amber: "#ffb23e",
    green: "#38ffb4",
    mute: "#5fa3b5",
    white: "#e9fbff",
    dim: "#0b2c38",
    grid: "#0e3948",
    red: "#ff6048"
};
const unavailable = (w, h, name, why)=>`${title(w, name, why)}
    <rect x="0" y="70" width="${w}" height="${Math.max(40, h - 90)}" fill="#031820" stroke="#124c5f" stroke-dasharray="4 6"/>
    ${text(w / 2, 70 + Math.max(40, h - 90) / 2 + 4, "SEM DADOS DO NUCLEO NESTA VERSAO", "t-sub", "font-size:11px;fill:#5fa3b5", "middle")}`;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/draw/layout.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Which shape the command centre takes for a window, and the arithmetic of each shape. Pure: the window size comes in, a choice comes out; nothing here touches the document.
 *
 * Three shapes, one rule (the owner's: the whole screen is seen at once, and a window that has to be scrolled is the exception):
 *  - the STAGE is the 1920 x 1080 drawing (it grows to the shape of the screen) fitted to the window with no scrolling, centred. It is used for every window that is at least as wide as it is tall by 1.2 and where the
 *    fit scale (the smaller of width / 1920 and height / 1080) is STAGE_MIN_SCALE (one half) or more: a 960 x 540 window and up at 16:9. The type is smaller the smaller the window (its 9 px at one half is 4.5 px),
 *    which the owner accepts: fitting comes first;
 *  - the BOARD is for what the stage cannot hold: a window that is not wide (a tablet held upright, a nearly square one) or one the stage would shrink below one half. It lays the panels that are 480 wide in the
 *    compact drawing in 2 to 4 columns (each short panel under the shortest column), with the core on top, and it scrolls down. Its labels are never smaller than BOARD_MIN_FONT in its own units, and a column is added
 *    only while the window still shows the board at BOARD_MIN_SCALE or more;
 *  - the COLUMN is one narrow canvas that scrolls down: a phone, or a window under BOARD_MIN_WIDTH that the stage cannot hold.
 */ /** Below this width-to-height ratio the old rule drew a column and above it the stage; it is kept as the rule of a caller that knows only the ratio. */ __turbopack_context__.s([
    "BOARD_GAP",
    ()=>BOARD_GAP,
    "BOARD_MARGIN",
    ()=>BOARD_MARGIN,
    "BOARD_MAX_COLUMNS",
    ()=>BOARD_MAX_COLUMNS,
    "BOARD_MIN_FONT",
    ()=>BOARD_MIN_FONT,
    "BOARD_MIN_SCALE",
    ()=>BOARD_MIN_SCALE,
    "BOARD_MIN_WIDTH",
    ()=>BOARD_MIN_WIDTH,
    "COLUMN",
    ()=>COLUMN,
    "COLUMN_MIN_FONT",
    ()=>COLUMN_MIN_FONT,
    "PANEL_W",
    ()=>PANEL_W,
    "STAGE",
    ()=>STAGE,
    "STAGE_H",
    ()=>STAGE_H,
    "STAGE_MIN_FONT",
    ()=>STAGE_MIN_FONT,
    "STAGE_MIN_SCALE",
    ()=>STAGE_MIN_SCALE,
    "STAGE_W",
    ()=>STAGE_W,
    "TALL_BELOW",
    ()=>TALL_BELOW,
    "board",
    ()=>board,
    "boardWidth",
    ()=>boardWidth,
    "layoutKey",
    ()=>layoutKey,
    "legacyLayout",
    ()=>legacyLayout,
    "pickLayout",
    ()=>pickLayout,
    "smallestLabelPx",
    ()=>smallestLabelPx,
    "stageScale",
    ()=>stageScale,
    "stageSize",
    ()=>stageSize,
    "stickyOffset",
    ()=>stickyOffset
]);
const TALL_BELOW = 1.2;
const STAGE_W = 1920;
const STAGE_H = 1080;
const STAGE_MIN_SCALE = 0.5;
const STAGE_MIN_FONT = 9;
const PANEL_W = 480;
const BOARD_GAP = 28;
const BOARD_MARGIN = 24;
const BOARD_MAX_COLUMNS = 4;
const BOARD_MIN_WIDTH = 1000;
const BOARD_MIN_SCALE = 1.15;
const BOARD_MIN_FONT = 10.5;
const COLUMN_MIN_FONT = 10.5;
const STAGE = {
    kind: "stage"
};
const COLUMN = {
    kind: "column"
};
const board = (columns)=>({
        kind: "board",
        columns: Math.max(2, Math.min(BOARD_MAX_COLUMNS, Math.round(columns)))
    });
function stageSize(aspect) {
    return {
        w: aspect > 1.78 ? Math.min(2600, 1080 * aspect) : STAGE_W,
        h: aspect < 1.78 ? STAGE_W / aspect : STAGE_H
    };
}
const boardWidth = (columns)=>columns * PANEL_W + (columns - 1) * BOARD_GAP + 2 * BOARD_MARGIN;
function stageScale(width, height) {
    const s = stageSize(width / height);
    return Math.min(width / s.w, height / s.h);
}
const usable = (n)=>Number.isFinite(n) && n > 0;
function pickLayout(width, height) {
    if (!usable(width) || !usable(height)) return STAGE;
    if (width / height >= TALL_BELOW && stageScale(width, height) >= STAGE_MIN_SCALE) return STAGE;
    if (width < BOARD_MIN_WIDTH) return COLUMN;
    let columns = 2;
    while(columns < BOARD_MAX_COLUMNS && width / boardWidth(columns + 1) >= BOARD_MIN_SCALE)columns++;
    return board(columns);
}
const legacyLayout = (aspect)=>aspect < TALL_BELOW ? COLUMN : STAGE;
const layoutKey = (l)=>l.kind === "board" ? `board${l.columns}` : l.kind;
function stickyOffset(scrollTop, unit, top) {
    if (!(unit > 0) || !Number.isFinite(scrollTop) || !Number.isFinite(top)) return 0;
    return Math.max(0, scrollTop / unit - top);
}
function smallestLabelPx(layout, width, height) {
    if (layout.kind === "stage") return STAGE_MIN_FONT * stageScale(width, height);
    if (layout.kind === "board") return BOARD_MIN_FONT * (width / boardWidth(layout.columns));
    return COLUMN_MIN_FONT * (640 / PANEL_W) * (width / 720);
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/draw/pack.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** Places panels of equal width into columns, each one under the column that is shortest at that moment (a masonry). Pure: sizes in, positions out. */ __turbopack_context__.s([
    "pack",
    ()=>pack
]);
function pack(items, columns, top, gap) {
    const n = Math.max(1, Math.floor(columns));
    const ends = new Array(n).fill(top);
    const placed = [];
    for (const it of items){
        let col = 0;
        for(let c = 1; c < n; c++)if (ends[c] < ends[col]) col = c;
        placed.push({
            name: it.name,
            col,
            y: ends[col],
            h: it.h
        });
        ends[col] = ends[col] + it.h + gap;
    }
    const bottom = placed.length === 0 ? top : Math.max(...placed.map((p)=>p.y + p.h));
    return {
        placed,
        bottom
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/draw/scene.ts [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

/**
 * The whole screen as one SVG string: the top bar with its tabs and, per tab, one of three shapes (layout.ts says which, for the window): the STAGE, a 1920 x 1080 placement that grows to the shape of the screen and
 * needs no scrolling; the BOARD, the compact 480 wide panels in two to four columns under the core, which scrolls down; and the COLUMN, one narrow canvas of the same panels. Pure: the model, the aspect ratio and the shape
 * come in, the markup comes out; the clock and the countdown are written by live.ts after it is on screen.
 */ __turbopack_context__.s([
    "TABS",
    ()=>TABS,
    "buildScene",
    ()=>buildScene,
    "isTab",
    ()=>isTab
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/analysis.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/compact.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$command$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/command.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/layout.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$pack$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/pack.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$system$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/system.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/h.ts [app-client] (ecmascript)");
;
;
;
;
;
;
;
;
const TABS = [
    [
        "comando",
        "COMANDO"
    ],
    [
        "decisoes",
        "DECISOES"
    ],
    [
        "carteira",
        "CARTEIRA"
    ],
    [
        "resultado",
        "RESULTADO"
    ],
    [
        "pulados",
        "PULADOS"
    ],
    [
        "sistema",
        "SISTEMA"
    ]
];
const isTab = (v)=>TABS.some((t)=>t[0] === v);
const DEFS = `<defs>
    <radialGradient id="bgGlow" cx="50%" cy="46%" r="62%"><stop offset="0" stop-color="#06222e" stop-opacity=".78"/><stop offset=".55" stop-color="#03111a" stop-opacity=".5"/><stop offset="1" stop-color="#02070d" stop-opacity=".18"/></radialGradient>
    <radialGradient id="coreFill" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#bff6ff" stop-opacity=".95"/><stop offset=".35" stop-color="#2ee6ff" stop-opacity=".55"/><stop offset=".8" stop-color="#07586e" stop-opacity=".55"/><stop offset="1" stop-color="#03202b" stop-opacity=".9"/></radialGradient>
    <radialGradient id="coreHalo" cx="50%" cy="50%" r="50%"><stop offset=".55" stop-color="#2ee6ff" stop-opacity="0"/><stop offset=".8" stop-color="#2ee6ff" stop-opacity=".18"/><stop offset="1" stop-color="#2ee6ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2ee6ff" stop-opacity="0"/><stop offset="1" stop-color="#2ee6ff" stop-opacity=".5"/></linearGradient>
    <linearGradient id="sweepV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2ee6ff" stop-opacity="0"/><stop offset="1" stop-color="#2ee6ff" stop-opacity=".22"/></linearGradient>
    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2ee6ff" stop-opacity=".45"/><stop offset="1" stop-color="#2ee6ff" stop-opacity="0"/></linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="glow2" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <pattern id="grid" width="96" height="96" patternUnits="userSpaceOnUse"><path d="M96 0H0V96" fill="none" stroke="#0b3140" stroke-width=".8" opacity=".55"/><path d="M48 0V96M0 48H96" fill="none" stroke="#0b3140" stroke-width=".4" opacity=".35"/></pattern>
  </defs>`;
/** A small drawing for each tab, in a 14 by 14 box centred on the origin: a target, a funnel, a ring, bars, a skip, a hexagon. Strokes only. */ const TAB_ICON = {
    comando: `<circle r="6"/><circle r="1.6"/>`,
    decisoes: `<path d="M-6 -5h12l-4.5 5.5v5.5h-3v-5.5z"/>`,
    carteira: `<path d="M0 -6a6 6 0 1 1 -6 6"/><path d="M0 -6v6h-6"/>`,
    resultado: `<path d="M-5 6v-4M0 6v-8M5 6v-6"/>`,
    pulados: `<path d="M-6 -5l5 5l-5 5M0 -5l5 5l-5 5"/>`,
    sistema: `<path d="M0 -6.5l5.6 3.25v6.5l-5.6 3.25l-5.6 -3.25v-6.5z"/><circle r="1.6"/>`
};
const frame = (W, H)=>`<g fill="none" stroke="#17687f" stroke-width="1.6" opacity=".9">
      <path d="M24 118V40Q24 24 40 24H430"/><path d="M${W - 24} 118V40Q${W - 24} 24 ${W - 40} 24H${W - 430}"/>
      <path d="M24 ${H - 118}v78q0 16 16 16h390"/><path d="M${W - 24} ${H - 118}v78q0 16 -16 16h-390"/></g>`;
/** A link between two panels, with a small light travelling along it (the direction of the data). */ const link = (x0, y0, x1, y1, rev = false, dur = 4)=>{
    const xm = (x0 + x1) / 2;
    const d = `M${x0} ${y0}C${xm} ${y0} ${xm} ${y1} ${x1} ${y1}`;
    const back = `M${x1} ${y1}C${xm} ${y1} ${xm} ${y0} ${x0} ${y0}`;
    return `<path d="${d}" class="${rev ? "flow-rev" : "flow"}" stroke="#2ee6ff"/><circle r="2.8" fill="#bff6ff" class="glow"><animateMotion dur="${dur}s" repeatCount="indefinite" path="${rev ? back : d}"/></circle>`;
};
/** A ruler of ticks that slides along an edge, like the margin of an instrument. Geometry only: no number on it is a reading. */ const ruler = (x, y0, y1, mirror)=>{
    let ticks = "";
    for(let y = y0 - 70; y <= y1 + 70; y += 14){
        const long = Math.round((y - y0) / 14) % 5 === 0;
        ticks += `<line x1="${x}" x2="${mirror ? x - (long ? 10 : 5) : x + (long ? 10 : 5)}" y1="${y}" y2="${y}"/>`;
    }
    const id = `rl${Math.round(x)}`;
    return `<clipPath id="${id}"><rect x="${x - 14}" y="${y0}" width="28" height="${y1 - y0}"/></clipPath><g clip-path="url(#${id})" stroke="#1c8aa3" stroke-width="1" opacity=".7"><g style="--h:70px;animation:hud-rise 6s linear infinite">${ticks}</g></g>`;
};
/** The height of a row of tabs, the space between rows included. */ const TAB_ROW = 52;
const STAGE_TABS = {
    plate: 132,
    gap: 8,
    icon: true,
    fs: 11,
    ls: ".13em",
    perRow: 6
};
const COLUMN_TABS = {
    plate: 206,
    gap: 8,
    icon: true,
    fs: 13,
    ls: ".08em",
    perRow: 3
};
const boardTabs = (W)=>({
        plate: Math.max(132, Math.min(170, Math.floor((W - 2 * __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BOARD_MARGIN"] - 5 * 8) / 6))),
        gap: 8,
        icon: true,
        fs: 12,
        ls: ".12em",
        perRow: 6
    });
const tabsWidth = (k)=>k.perRow * k.plate + (k.perRow - 1) * k.gap;
const tabsHeight = (k)=>Math.ceil(TABS.length / k.perRow) * TAB_ROW;
/** The plate of a tab is as wide as `plate` and its label is centred on what is left of it after the drawing. */ const tabs = (x, y0, tab, k)=>TABS.map(([key, lab], i)=>{
        const on = key === tab, tx = x + i % k.perRow * (k.plate + k.gap), P = k.plate;
        const y = y0 + Math.floor(i / k.perRow) * TAB_ROW;
        const outline = `M${tx} ${y + 14}l9 -12h${P - 18}l9 12v16l-9 12h-${P - 18}l-9 -12z`;
        const icon = k.icon ? `<g transform="translate(${tx + 22} ${y + 22})" class="tab-icon" fill="none">${TAB_ICON[key] ?? ""}</g>` : "";
        const cx = k.icon ? tx + (P + 25) / 2 : tx + P / 2;
        return `<g class="tab" data-tab="${key}" role="tab" tabindex="0" aria-selected="${on}" aria-label="${lab}"><path class="plate" d="${outline}" fill="${on ? "#0b4252" : "#041a23"}" stroke="${on ? "#2ee6ff" : "#17687f"}" stroke-width="${on ? 2 : 1.2}" ${on ? 'filter="url(#glow)"' : ""}/>
        <path class="tab-flow" d="${outline}" pathLength="100" fill="none" stroke-width="1.8"/>${icon}
        <text x="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(cx)}" y="${y + 26}" text-anchor="middle" class="t-sub" style="font-size:${k.fs}px;letter-spacing:${k.ls}">${lab}</text></g>`;
    }).join("");
const logo = (x, y)=>`<circle cx="${x + 34}" cy="${y + 34}" r="26" fill="none" stroke="#2ee6ff" stroke-width="2"/>
      <g class="spin-c" style="transform-origin:${x + 34}px ${y + 34}px" fill="none" stroke="#2ee6ff" stroke-width="2"><path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(x + 34, y + 34, 18, 0, 90)}"/><path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(x + 34, y + 34, 18, 180, 270)}"/></g>
      <circle cx="${x + 34}" cy="${y + 34}" r="6" fill="#bff6ff" class="glow"/>
      <text x="${x + 76}" y="${y + 32}" class="t-big" style="font-size:24px;letter-spacing:.18em">INONU TRADER</text>
      <text x="${x + 78}" y="${y + 52}" class="t-sub">AGENTE AUTONOMO DE CARTEIRA</text>`;
/** The words of the top bar that say what the agent is: connected or only watched, the money it is on, the market, and anything that waits for the person. */ function status(D) {
    // an agent that runs no cycles is not "connected" in the sense that matters: it is only being watched, and the bar says so
    const state = D.agent.cycling ? `${D.agent.paused ? "PAUSADO" : "CONECTADO"}  ${D.agent.authority.toUpperCase()}  ${D.agent.profile.toUpperCase()}  ${(D.agent.model ?? "").toUpperCase()}` : "ACOMPANHAMENTO, AGENTE PARADO";
    return {
        state,
        dot: !D.agent.cycling || D.agent.paused ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green,
        market: `MERCADO 24H  BTC ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pct"])(D.context.btc, 1)}  ETH ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pct"])(D.context.eth, 1)}  ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["plain"])(D.context.trend ?? "").toUpperCase()}`,
        // an order that never showed a transaction waits for the person's word: said on every tab, in the colour of attention, with the way to it
        waiting: D.system.inFlight.filter((o)=>o.needsWord).length
    };
}
const waitingText = (n)=>`${n} ORDEM(NS) ESPERAM A SUA PALAVRA: ABA SISTEMA`;
function stageHeader(D, tab, W) {
    const S = status(D);
    const attention = S.waiting === 0 ? "" : `<text class="t-mono" x="1345" y="102" style="fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber};font-size:11px">${waitingText(S.waiting)}</text>`;
    return `${logo(40, 24)}<g role="tablist" aria-label="Telas">${tabs(470, 40, tab, STAGE_TABS)}</g>
        <circle cx="1345" cy="54" r="5" fill="${S.dot}"/>
        <text class="t-mono" x="1360" y="58" style="fill:#bfefff;font-size:12.5px">${S.state}</text>
        <text class="t-sub" x="1345" y="82" style="font-size:10.5px">${S.market}</text>${attention}
        <text class="clock t-big" x="${W - 40}" y="64" text-anchor="end" style="font-size:34px">--:--:--</text>
        <text class="date t-sub" x="${W - 40}" y="86" text-anchor="end">--</text>`;
}
/** The tabs that follow the person down the page: a plate behind them (shown only once they have left their own place) and the six tabs. `data-top` is where the plate starts, for the script that moves the group. */ const stickyTabs = (W, y, tab, k)=>{
    const top = y - 6;
    const x = Math.round((W - tabsWidth(k)) / 2);
    const bottom = y + tabsHeight(k);
    return `<g class="sticky-head" data-top="${top}"><rect class="sticky-plate" x="0" y="${top}" width="${W}" height="${bottom - top}" fill="#02070d"/><line class="sticky-plate" x1="0" x2="${W}" y1="${bottom}" y2="${bottom}" stroke="#17687f" stroke-width="1.2"/><g role="tablist" aria-label="Telas">${tabs(x, y, tab, k)}</g></g>`;
};
function boardHeader(D, tab, W) {
    const S = status(D);
    const x0 = 380;
    const attention = S.waiting === 0 ? "" : `<text class="t-mono" x="${x0}" y="88" style="fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber};font-size:11px">${waitingText(S.waiting)}</text>`;
    const top = `${logo(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BOARD_MARGIN"], 14)}
      <circle cx="${x0 + 5}" cy="42" r="5" fill="${S.dot}"/><text class="t-mono" x="${x0 + 18}" y="46" style="fill:#bfefff;font-size:12px">${S.state}</text>
      <text class="t-sub" x="${x0}" y="68" style="font-size:10.5px">${S.market}</text>${attention}
      <text class="clock t-big" x="${W - __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BOARD_MARGIN"]}" y="52" text-anchor="end" style="font-size:30px">--:--:--</text><text class="date t-sub" x="${W - __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BOARD_MARGIN"]}" y="74" text-anchor="end" style="font-size:10.5px">--</text>`;
    return {
        top,
        sticky: stickyTabs(W, 96, tab, boardTabs(W)),
        height: 166
    };
}
function columnHeader(D, tab, W) {
    const S = status(D);
    // the logo and the clock, then the tabs (two rows of three), then the words of the bar under them
    const below = 88 + tabsHeight(COLUMN_TABS) + 22;
    const attention = S.waiting === 0 ? "" : `<text class="t-mono" x="30" y="${below + 42}" style="fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber};font-size:11px">${waitingText(S.waiting)}</text>`;
    const top = `${logo(30, 14)}<text class="clock t-big" x="${W - 30}" y="52" text-anchor="end" style="font-size:30px">--:--:--</text><text class="date t-sub" x="${W - 30}" y="74" text-anchor="end" style="font-size:10px">--</text>
      <circle cx="40" cy="${below}" r="5" fill="${S.dot}"/><text class="t-mono" x="54" y="${below + 4}" style="fill:#bfefff;font-size:11.5px">${S.state}</text>
      <text class="t-sub" x="30" y="${below + 26}" style="font-size:10.5px">${S.market}</text>${attention}`;
    return {
        top,
        sticky: stickyTabs(W, 88, tab, COLUMN_TABS),
        height: below + (S.waiting === 0 ? 50 : 66)
    };
}
function buildScene(D, tab, aspect, layout = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["legacyLayout"])(aspect)) {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["resetIds"])();
    const C = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$command$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createCommand"])(D);
    const A = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createAnalysis"])(D);
    const N = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createCompact"])(D);
    const Y = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$system$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createSystem"])(D);
    const key = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["layoutKey"])(layout);
    if (layout.kind === "stage") {
        const { w: W, h: Hh } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["stageSize"])(aspect);
        const ox = (W - 1920) / 2, oy = (Hh - 1080) / 2;
        const wide = {
            comando: ()=>`
        <g fill="none" stroke="#2ee6ff" stroke-width="1.3" opacity=".6">
          ${link(520, 250, 650, 440, false, 4.2)}${link(520, 500, 640, 520, true, 5)}${link(520, 780, 660, 640, false, 4.6)}
          ${link(1400, 270, 1290, 440, true, 4.4)}${link(1400, 560, 1290, 520, false, 5.2)}${link(1400, 800, 1280, 640, true, 4.8)}
          <path d="M960 112V166" class="flow-fast"/></g>
        ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(610, 112, 1, C.core())}
        ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(40, 128, 1, C.results())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(40, 396, 1, C.positions())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(40, 646, 1, C.placar())}
        ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(1400, 128, 1, C.decision())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(1400, 450, 1, C.facets())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(1400, 706, 1, C.health())}
        ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(40, 928, 1, C.cycles())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(610, 912, 1, C.command())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(1400, 890, 1, C.feed())}`,
            decisoes: ()=>`${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(40, 128, 1, A.funnel())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(1180, 128, 1, A.hist())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(40, 548, 1, A.matrix())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(1180, 548, 1, A.preferences())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(40, 982, 1, A.timeline())}`,
            carteira: ()=>`${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(40, 128, 1, A.allocation())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(980, 128, 1, A.equityMarks())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(40, 640, 1, A.tripCards())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(980, 640, 1, A.limits())}`,
            resultado: ()=>`${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(40, 140, 1, A.kpis())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(40, 310, 1, A.cumulative())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(980, 310, 1, A.outcomes())}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(40, 760, 1, A.activity())}`,
            pulados: ()=>`${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(40, 128, 1, A.moves("15m"))}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(980, 128, 1, A.moves("1h"))}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(40, 596, 1, A.recent())}`,
            sistema: ()=>{
                // an agent that runs no cycles says so across the top, in the gap between the top bar and the panels, so nothing under it has to move
                const banner = D.agent.cycling ? "" : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(40, 97, 1, Y.stopped(1840, true));
                // three columns of panels 580 wide, each panel under the shortest column and in the order that matters (the wallet, the orders without a receipt, the actions, the limits and the choices of the code, the
                // resources, the log); the log is the one that is left out when the stage has no room for it, because the stage does not scroll
                const top = 128, w = 580, gap = 30, xs = [
                    40,
                    670,
                    1300
                ];
                const parts = [
                    {
                        name: "wallet",
                        h: Y.walletH(w),
                        draw: ()=>Y.wallet(w)
                    },
                    {
                        name: "inflight",
                        h: Y.inflightH(w),
                        draw: ()=>Y.inflight(w)
                    },
                    {
                        name: "actions",
                        h: Y.actionsH(w),
                        draw: ()=>Y.actions(w)
                    },
                    {
                        name: "limits",
                        h: Y.limitsH(w),
                        draw: ()=>Y.limits(w)
                    },
                    {
                        name: "resources",
                        h: Y.resourcesH(w),
                        draw: ()=>Y.resources(w)
                    },
                    {
                        name: "log",
                        h: Y.logH(w),
                        draw: ()=>Y.log(w)
                    }
                ];
                let placed = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$pack$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pack"])(parts, 3, top, gap);
                if (placed.bottom > __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$system$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SYSTEM_WIDE"].bottom) placed = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$pack$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pack"])(parts.filter((p)=>p.name !== "log"), 3, top, gap);
                return `${banner}${placed.placed.map((p)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(xs[p.col], p.y, 1, parts.find((x)=>x.name === p.name).draw())).join("")}`;
            }
        };
        const html = `${DEFS}<rect width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(W)}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(Hh)}" fill="url(#bgGlow)"/><g style="overflow:hidden"><rect class="drift" width="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(W + 400)}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(Hh + 400)}" fill="url(#grid)"/></g>
      <g transform="translate(${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(ox)} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(oy)})">${frame(1920, 1080)}${ruler(10, 140, 940, false)}${ruler(1910, 140, 940, true)}${stageHeader(D, tab, 1920)}<g class="enter">${wide[tab]()}</g></g>
      <g style="--w:${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(W + 480)}px" class="boot-sweep"><rect x="-240" y="0" width="240" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(Hh)}" fill="url(#sweepGrad)" opacity=".5"/><line x1="0" x2="0" y1="0" y2="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(Hh)}" stroke="#bff6ff" stroke-width="1.5" opacity=".6"/></g>`;
        return {
            html,
            width: W,
            height: Hh,
            tall: false,
            layout,
            key
        };
    }
    // the panels that are 480 wide in the compact drawing, by name; the board and the column choose, order and place them
    const panel = {
        reading: C.reading,
        results: C.results,
        positions: C.positions,
        decision: C.decision,
        health: C.health,
        placar: C.placar,
        facets: C.facets,
        feed: C.feed,
        cycles: C.cycles,
        counters: C.counters,
        funnel: N.funnel,
        hist: N.hist,
        matrix: N.matrix,
        preferences: N.preferences,
        timeline: N.timeline,
        allocation: N.allocation,
        equityMarks: N.equityMarks,
        tripCards: N.tripCards,
        limits: N.limits,
        kpis: N.kpis,
        cumulative: N.cumulative,
        outcomes: N.outcomes,
        activity: N.activity,
        moves15: ()=>N.moves("15m"),
        moves1h: ()=>N.moves("1h"),
        recent: N.recent,
        sysStopped: ()=>Y.stopped(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"]),
        sysWallet: ()=>Y.wallet(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"]),
        sysInflight: ()=>Y.inflight(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"]),
        sysActions: ()=>Y.actions(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"]),
        sysLimits: ()=>Y.limits(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"]),
        sysResources: ()=>Y.resources(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"]),
        sysLog: ()=>Y.log(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"])
    };
    // the height each one needs: the ones whose rows depend on the data say so themselves
    const heights = ()=>({
            reading: C.readingH(),
            results: 250,
            positions: 232,
            decision: 310,
            health: C.healthH(),
            placar: 270,
            facets: 256,
            feed: 150,
            cycles: 124,
            counters: 100,
            funnel: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].funnel,
            hist: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].hist,
            matrix: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].matrix,
            preferences: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].preferences,
            timeline: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].timeline,
            allocation: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].allocation,
            equityMarks: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].equityMarks,
            tripCards: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].tripCards,
            limits: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].limits,
            kpis: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].kpis,
            cumulative: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].cumulative,
            outcomes: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].outcomes,
            activity: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].activity,
            moves15: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].moves,
            moves1h: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].moves,
            recent: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$compact$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COMPACT_H"].recent,
            sysStopped: Y.stoppedH(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"]),
            sysWallet: Y.walletH(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"]),
            sysInflight: Y.inflightH(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"]),
            sysActions: Y.actionsH(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"]),
            sysLimits: Y.limitsH(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"]),
            sysResources: Y.resourcesH(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"]),
            sysLog: Y.logH(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"])
        });
    const names = {
        comando: [
            "decision",
            "results",
            "positions",
            "reading",
            "facets",
            "placar",
            "health",
            "feed",
            "cycles",
            "counters"
        ],
        decisoes: [
            "funnel",
            "hist",
            "matrix",
            "preferences",
            "timeline"
        ],
        carteira: [
            "allocation",
            "equityMarks",
            "tripCards",
            "limits"
        ],
        resultado: [
            "kpis",
            "cumulative",
            "outcomes",
            "activity"
        ],
        pulados: [
            "moves15",
            "moves1h",
            "recent"
        ],
        sistema: [
            "sysWallet",
            "sysInflight",
            "sysActions",
            "sysLimits",
            "sysResources",
            "sysLog"
        ]
    };
    if (layout.kind === "board") {
        const n = layout.columns;
        const W = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["boardWidth"])(n);
        const head = boardHeader(D, tab, W);
        const h = heights();
        let y = head.height;
        let hero = "";
        if (tab === "comando") {
            // the core on top, at the middle of the board: the first thing seen, and the one drawing that has no compact form
            const k = n === 2 ? 0.85 : 0.9;
            hero = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])((W - 700 * k) / 2, y - 22 * k, k, C.core(1.25));
            y += 770 * k + __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BOARD_GAP"];
        }
        if (tab === "sistema" && !D.agent.cycling) {
            const inner = W - 2 * __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BOARD_MARGIN"];
            hero = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BOARD_MARGIN"], y, 1, Y.stopped(inner));
            y += Y.stoppedH(inner) + __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BOARD_GAP"];
        }
        const items = names[tab].map((name)=>({
                name,
                h: h[name]
            }));
        const { placed, bottom } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$pack$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pack"])(items, n, y, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BOARD_GAP"]);
        const panels = placed.map((p)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BOARD_MARGIN"] + p.col * (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"] + __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BOARD_GAP"]), p.y, 1, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["minFont"])(panel[p.name](), __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BOARD_MIN_FONT"]))).join("");
        const H = bottom + __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BOARD_GAP"] + 8;
        const html = `${DEFS}<rect width="${W}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(H)}" fill="url(#bgGlow)"/><rect width="${W}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(H)}" fill="url(#grid)" opacity=".6"/>${head.top}<g class="enter">${hero}${panels}</g>${head.sticky}`;
        return {
            html,
            width: W,
            height: H,
            tall: true,
            layout: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["board"])(n),
            key
        };
    }
    // the narrow column: a 720 wide canvas, the panels one under the other at 640 wide (scaled from their 480), the core at its own size
    const W = 720;
    const head = columnHeader(D, tab, W);
    const h = heights();
    let y = head.height;
    let panels = "";
    // in the column the system tab keeps the order it always had (what the person can do first), with the line that says the agent is stopped above it
    const order = tab === "sistema" ? [
        ...D.agent.cycling ? [] : [
            "sysStopped"
        ],
        "sysActions",
        "sysInflight",
        "sysWallet",
        "sysLimits",
        "sysResources",
        "sysLog"
    ] : [
        ...tab === "comando" ? [
            "core"
        ] : [],
        ...names[tab]
    ];
    for (const name of order){
        const core = name === "core";
        const s = core ? 1 : 640 / __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PANEL_W"];
        panels += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["at"])(core ? 10 : 40, y, s, core ? C.core(1.3) : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["minFont"])(panel[name](), __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$layout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COLUMN_MIN_FONT"]));
        y += (core ? 820 : h[name]) * s + 34;
    }
    const html = `${DEFS}<rect width="${W}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y)}" fill="url(#bgGlow)"/><rect width="${W}" height="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(y)}" fill="url(#grid)" opacity=".6"/>${head.top}<g class="enter">${panels}</g>${head.sticky}`;
    return {
        html,
        width: W,
        height: y,
        tall: true,
        layout,
        key
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/draw/system.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SYSTEM_H",
    ()=>SYSTEM_H,
    "SYSTEM_WIDE",
    ()=>SYSTEM_WIDE,
    "createSystem",
    ()=>createSystem
]);
/**
 * The Sistema tab: what the person owns of the machine. The connection of the wallet and what is missing of it, the orders the core sent and has no answer for (the one place the person's word is asked), the two things
 * the person can tell the agent to do (look now, stop), and the limits and rhythm in force. Every button is drawn here and carries a `data-action`; the page that owns the connection carries the action out.
 * Panels take their width: 880 on the wide stage, 480 in the narrow column. Text from outside the code is cleaned in model.ts or here, never put in as it came.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent/view.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$insights$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/insights.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/h.ts [app-client] (ecmascript)");
;
;
;
const pctText = (n)=>`${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(n, Number.isInteger(n) ? 0 : 1)}%`;
/** A share written as the words a person would say it in when it is a simple fraction, else as a percentage. */ const shareWords = (share)=>{
    const near = (x)=>Math.abs(share - x) < 0.005;
    return near(1 / 3) ? "UM TERCO" : near(0.5) ? "METADE" : near(0.25) ? "UM QUARTO" : near(0.2) ? "UM QUINTO" : near(2 / 3) ? "DOIS TERCOS" : near(0.75) ? "TRES QUARTOS" : pctText(share * 100);
};
const count = (n)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(n, 0);
/** How long ago a reading was taken, in the unit that reads best: minutes under an hour, hours under two days, days after. */ const ageWords = (ms)=>{
    const m = Math.round(ms / 60_000);
    if (m < 1) return "LIDO AGORA";
    if (m < 60) return `LIDO HA ${m} MIN`;
    const h = Math.round(m / 60);
    return h < 48 ? `LIDO HA ${h} H` : `LIDO HA ${Math.round(h / 24)} DIAS`;
};
const METER_WORDS = {
    corrupt: "LEITURA CORROMPIDA",
    unreadable: "LEITURA ILEGIVEL",
    month_mismatch: "LEITURA DE OUTRO MES",
    invalid: "LEITURA INVALIDA"
};
const TIER_WORDS = {
    free: "FREE",
    basic: "BASIC",
    premium: "PREMIUM"
};
const STEPS = [
    "instalar",
    "entrar",
    "depositar",
    "definir_politica"
];
/** The room a second row of steps takes when the panel is narrow. */ const STEP_ROW = 34;
const STEP_LABEL = {
    instalar: "PROGRAMA DA OKX",
    entrar: "ENTRAR NA CONTA",
    depositar: "SALDO NA CARTEIRA",
    definir_politica: "LIMITES NA OKX",
    operando: "OPERANDO"
};
const up = (s)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["plain"])(s).toUpperCase();
/** A button: a cut-corner plate with a label and a small line under it, a faint light running along its edge that wakes up under the pointer, and a sheen that crosses it once when it is looked at. `off` greys it and drops the action. */ function button(x, y, w, h, label, sub, action, opts = {}) {
    const col = opts.off === true ? "#2c5563" : ({
        cy: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy,
        amber: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber,
        green: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green,
        red: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].red
    })[opts.tone ?? "cy"];
    const data = Object.entries(opts.data ?? {}).map(([k, v])=>` data-${k}="${v}"`).join("");
    const cut = Math.min(14, h / 3);
    const outline = `M${x + cut} ${y}H${x + w}V${y + h - cut}L${x + w - cut} ${y + h}H${x}V${y + cut}Z`;
    const attrs = opts.off === true ? ` aria-disabled="true"` : ` data-action="${action}"${data} role="button" tabindex="0"`;
    const clip = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["id"])("btnClip");
    const live = opts.off === true ? "" : `<path class="btn-flow" d="${outline}" pathLength="100" fill="none" stroke="${col}" stroke-width="2.4"/>
      <clipPath id="${clip}"><path d="${outline}"/></clipPath><rect class="btn-shine" x="${x - 60}" y="${y}" width="60" height="${h}" fill="url(#sweepGrad)" clip-path="url(#${clip})" style="--w:${w + 120}px"/>`;
    return `<g class="btn${opts.off === true ? " off" : ""}"${attrs} aria-label="${label}">
      <path class="plate" d="${outline}" fill="#041a23" stroke="${col}" stroke-width="1.6" ${opts.off === true ? "" : 'filter="url(#glow)"'}/>${live}
      ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + w / 2, y + h / 2 + (sub === "" ? 5 : -2), label, "t-title", `fill:${opts.off === true ? "#5fa3b5" : col};font-size:${h >= 70 ? 16 : 12.5}px;letter-spacing:.2em`, "middle")}
      ${sub === "" ? "" : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + w / 2, y + h / 2 + 16, sub, "t-sub", "font-size:9px", "middle")}</g>`;
}
function createSystem(D) {
    const S = D.system;
    const W = S.wallet;
    const busy = D.ui.busy !== null;
    /** Where everything of the wallet panel goes, so its height is known to the scene before it is drawn. */ function walletLayout(w) {
        const wide = w > 640;
        const operating = W.next === "operando";
        const body = operating ? [] : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])(up(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WALLET_STEP"][W.next].body), wide ? 118 : 56).slice(0, wide ? 3 : 5);
        const hasButton = !operating && (W.next === "instalar" || W.next === "entrar" && (W.loginUrl !== null || W.cli === "instalado") || W.next === "definir_politica");
        const base = 214 + (wide ? 0 : STEP_ROW);
        const buttonY = base + body.length * 14 + 10;
        const afterStep = operating ? base : hasButton ? buttonY + 40 + 22 : buttonY;
        const addrY = afterStep + 14;
        const addresses = (W.solana !== null ? 1 : 0) + (W.evm !== null ? 1 : 0);
        return {
            wide,
            operating,
            body,
            buttonY,
            hasButton,
            addrY,
            h: addrY + addresses * 40 + 8
        };
    }
    /** The wallet of the agent: where it stands in the four steps, what is missing, and the addresses to fund. */ function wallet(w) {
        const L = walletLayout(w);
        const { wide, operating } = L;
        const at = STEPS.indexOf(W.next);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(w, "CARTEIRA DO AGENTE", operating ? "PRONTA: O AGENTE EXECUTA SOZINHO" : "O QUE FALTA PARA ELE EXECUTAR SOZINHO");
        // four steps in a row when there is room for the words, two by two when there is not
        const per = wide ? STEPS.length : 2;
        const sw = w / per;
        const dy = wide ? 0 : STEP_ROW;
        STEPS.forEach((id, i)=>{
            const done = operating || at >= 0 && i < at, now_ = !operating && i === at;
            const col = done ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : now_ ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute;
            const x = i % per * sw, y = 94 + Math.floor(i / per) * STEP_ROW;
            s += `<path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hex"])(x + 16, y, 10)}" fill="${done ? col : "#031820"}" stroke="${col}" stroke-width="1.6"/>`;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 34, y - 4, STEP_LABEL[id], "t-sub", `font-size:${wide ? 10.5 : 10}px;fill:${col}`);
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 34, y + 10, done ? "FEITO" : now_ ? "AGORA" : "DEPOIS", "t-sub", `font-size:9px;fill:${col}`);
            if (wide && i < STEPS.length - 1) s += `<line x1="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x + sw - 22)}" x2="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(x + sw - 6)}" y1="94" y2="94" stroke="#17687f" stroke-dasharray="3 4"/>`;
        });
        const rows = [
            [
                "ENTRADA NA CONTA OKX",
                W.login === "logado" ? "LOGADA" + (W.sessionDays === null ? "" : `, A SESSAO DURA MAIS ${Math.max(0, Math.round(W.sessionDays))} DIAS`) : up(W.login).replace(/_/g, " "),
                W.login === "logado" && (W.sessionDays === null || W.sessionDays > 3) ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ],
            [
                "PROGRAMA OFICIAL DA OKX",
                W.cli === "instalado" ? "INSTALADO E CONFERIDO" : "AINDA NAO INSTALADO",
                W.cli === "instalado" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ],
            [
                "LIMITES DA CARTEIRA NA OKX",
                W.policy === "ok" ? "LIGADOS (TRAVA DA PROPRIA OKX)" : up(W.policy),
                W.policy === "ok" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ]
        ];
        rows.forEach(([a, b, col], i)=>{
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 144 + dy + i * 24, a, "t-sub", "font-size:10px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(w, 144 + dy + i * 24, b, "t-mono", `font-size:${wide ? 12 : 10.5}px;fill:${col}`, "end");
        });
        // the step that needs the person, as one button
        const step = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WALLET_STEP"][W.next];
        L.body.forEach((l, i)=>{
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 214 + dy + i * 14, l, "t-sub", "font-size:9.5px;fill:#7df3ff");
        });
        const by = L.buttonY, bw = wide ? 360 : w;
        if (L.hasButton) {
            if (W.next === "instalar") s += button(0, by, bw, 40, up(step.action ?? "INSTALAR"), "", "wallet", {
                data: {
                    step: "install"
                },
                off: busy
            });
            else if (W.next === "entrar" && W.loginUrl !== null) s += button(0, by, bw, 40, up(step.action ?? "ENTRAR"), "A PAGINA E DA PROPRIA OKX", "open", {
                data: {
                    url: encodeURIComponent(W.loginUrl)
                },
                tone: "green"
            });
            else if (W.next === "entrar") s += button(0, by, bw, 40, "PREPARAR A ENTRADA", "", "wallet", {
                data: {
                    step: "login"
                },
                off: busy
            });
            else if (W.next === "definir_politica") s += button(0, by, bw, 40, up(step.action ?? "ABRIR LIMITES"), "A PAGINA E DA PROPRIA OKX", "open", {
                data: {
                    url: encodeURIComponent(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["POLICY_URL"])
                },
                tone: "amber"
            });
        }
        let y = L.addrY;
        if (W.solana !== null) {
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y, "ENDERECO NA SOLANA (SOL, USDC E OS OUTROS ATIVOS DA SOLANA)", "t-sub", "font-size:9px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y + 16, W.solana, "t-mono", `font-size:${wide ? 12 : 10}px`);
            y += 40;
        }
        if (W.evm !== null) s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y, "ENDERECO NAS REDES EVM (ETHEREUM, BASE, BNB CHAIN E OUTRAS)", "t-sub", "font-size:9px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y + 16, W.evm, "t-mono", `font-size:${wide ? 12 : 10}px`);
        return s;
    }
    /** The line at the top of the tab when the core runs no cycles: this tab is about what the person owns of the machine, and the first thing to know is that nothing decides now. */ function stopped(w, slim = false) {
        const wide = w > 640;
        const lines = wide ? [
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$insights$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["STOPPED_TEXT"]
        ] : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$insights$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["STOPPED_TEXT"], 40);
        const h = stoppedH(w, slim);
        const cut = slim ? 9 : 12;
        const outline = `M${cut} 0H${w}V${h - cut}L${w - cut} ${h}H0V${cut}Z`;
        let s = `<path d="${outline}" fill="#1a1204" stroke="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}" stroke-width="1.6"/><path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hex"])(24, h / 2, slim ? 7 : 9)}" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}"/>`;
        lines.forEach((l, i)=>{
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(46, h / 2 + 4 + (i - (lines.length - 1) / 2) * 17, l, "t-mono", `font-size:${slim ? 13 : wide ? 14 : 12.5}px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}`);
        });
        return s;
    }
    /** The height of the line: a slim one fits in the gap between the top bar and the panels of the stage, so nothing under it has to move. */ const stoppedH = (w, slim = false)=>slim ? 28 : w > 640 ? 44 : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$insights$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["STOPPED_TEXT"], 40).length * 17 + 24;
    const walletH = (w)=>walletLayout(w).h;
    const inflightH = (w)=>{
        const wide = w > 640;
        const shown = Math.min(S.inFlight.length, wide ? 3 : 2);
        return S.inFlight.length === 0 ? wide ? 190 : 218 : 84 + shown * (wide ? 112 : 128) + (S.inFlight.length > shown ? 24 : 0) + 8;
    };
    /** Orders sent with no answer. Only an order that never showed a transaction asks for the person's word; the others the core confirms by itself. */ function inflight(w) {
        const wide = w > 640;
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(w, "ORDENS SEM RECIBO", "O AGENTE ENVIOU E AINDA NAO SABE SE SAIU");
        if (S.inFlight.length === 0) {
            s += `<path d="${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hex"])(18, 104, 12)}" fill="${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(40, 109, "NENHUMA ORDEM AGUARDANDO RECIBO", "t-mono", `font-size:13px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green}`);
            const note = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])("QUANDO UMA ORDEM SAIR SEM RESPOSTA, ELA APARECE AQUI. AS QUE FORAM A REDE O AGENTE CONFIRMA SOZINHO PELO RECIBO DA OKX; SO PEDE A SUA PALAVRA QUANDO A TRANSACAO NUNCA FOI VISTA.", wide ? 104 : 56);
            return note.reduce((acc, l, i)=>acc + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 150 + i * 16, l, "t-sub", "font-size:9.5px"), s);
        }
        S.inFlight.slice(0, wide ? 3 : 2).forEach((o, i)=>{
            const y = 84 + i * (wide ? 112 : 128);
            const col = o.side === "buy" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft;
            s += `<rect x="0" y="${y}" width="${w}" height="${wide ? 100 : 116}" fill="#031820" stroke="#124c5f"/>`;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(14, y + 26, `${o.side === "buy" ? "COMPRA" : "VENDA"} ${o.symbol} US$ ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(o.usd, 0)}`, "t-num", `font-size:${wide ? 18 : 15}px;fill:${col}`);
            // the age of the order is written beside the order's name when there is room, and on the line under it when there is not
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(w - 14, y + (wide ? 26 : 46), `${o.stage === "enviando" ? "ENVIADA, SEM RESPOSTA" : "SEM CONFIRMACAO"}, HA ${o.ageMin} MIN`, "t-sub", "font-size:9.5px", "end");
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(14, y + 46, o.source === "protecao" ? "ORDEM DO PLANO DA POSICAO" : "ESCOLHA DO MODELO", "t-sub", "font-size:9.5px");
            if (o.said !== null) s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(14, y + 62, "A OKX DISSE: " + up(o.said).slice(0, wide ? 100 : 48), "t-sub", "font-size:9px;fill:#7df3ff");
            if (o.needsWord) {
                const bw = wide ? 250 : (w - 38) / 2;
                s += button(14, y + (wide ? 70 : 76), bw, 34, "CONFERI: SAIU", "", "resolve", {
                    data: {
                        key: o.key,
                        outcome: "executada"
                    },
                    tone: "green",
                    off: busy
                });
                s += button(24 + bw, y + (wide ? 70 : 76), bw, 34, "CONFERI: NAO SAIU", "", "resolve", {
                    data: {
                        key: o.key,
                        outcome: "falhou"
                    },
                    tone: "amber",
                    off: busy
                });
            } else s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(14, y + (wide ? 90 : 96), "A TRANSACAO FOI A REDE: O AGENTE CONFIRMA SOZINHO, SEM CLIQUE", "t-sub", `font-size:9.5px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green}`);
        });
        if (S.inFlight.length > (wide ? 3 : 2)) s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 84 + (wide ? 3 : 2) * (wide ? 112 : 128) + 14, `+ ${S.inFlight.length - (wide ? 3 : 2)} ORDEM(NS) NA FILA`, "t-sub", "font-size:10px");
        return s;
    }
    /** Where the parts of the actions panel go. On the stage they have fixed places; in a narrow panel each one follows the one above it, so nothing leaves a hole when there is no notice to show. */ function actionsLayout(w) {
        if (w > 640) return {
            ny: 196,
            sy: 236,
            noteY: 304,
            h: 320
        };
        const bottom = D.ui.confirmStop ? 204 : 158;
        const said = D.ui.busy !== null ? 1 : D.ui.notice === null ? 0 : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])(up(D.ui.notice.text), 56).slice(0, 4).length;
        const sy = bottom + 18 + (said > 0 ? said * 16 + 8 : 0);
        return {
            ny: bottom + 22,
            sy,
            noteY: sy + 44 + 22,
            h: sy + 44 + 22 + 2 * 14 + 8
        };
    }
    const actionsH = (w)=>actionsLayout(w).h;
    /** What the person can tell the agent: look now, stop. The stop asks twice. */ function actions(w) {
        const wide = w > 640;
        const L = actionsLayout(w);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(w, "ACOES", "O QUE VOCE PODE PEDIR AO AGENTE");
        const bw = wide ? 420 : w;
        // the agent decides when to look: there is no button that forces a cycle, and the screen says so
        if (!D.ui.confirmStop) s += button(0, 80, bw, 78, "PARAR O AGENTE", "DESCONECTA A CARTEIRA. O AGENTE PARA NA HORA", "stop", {
            tone: "red",
            off: busy
        });
        else {
            s += button(0, 80, bw, 78, "CONFIRMAR: PARAR", "AS POSICOES ABERTAS CONTINUAM NA CARTEIRA", "stop-confirm", {
                tone: "red",
                off: busy
            });
            s += button(wide ? 440 : 0, wide ? 80 : 170, wide ? 200 : bw, 34, "CANCELAR", "", "stop-cancel", {
                tone: "cy"
            });
        }
        const ny = L.ny;
        if (D.ui.busy !== null) s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, ny, {
            stop: "PARANDO O AGENTE",
            resolve: "ANOTANDO A SUA PALAVRA",
            wallet: "FAZENDO O PASSO DA CARTEIRA"
        }[D.ui.busy], "t-mono", `font-size:12px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft}`);
        else if (D.ui.notice !== null) {
            const col = D.ui.notice.tone === "ok" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber;
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])(up(D.ui.notice.text), wide ? 110 : 56).slice(0, 4).forEach((l, i)=>{
                s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, ny + i * 16, l, "t-mono", `font-size:12px;fill:${col}`);
            });
        }
        s += button(0, L.sy, wide ? 420 : w, 44, "CHAVES E CONFIGURACOES", "ONDE FICAM AS CHAVES DA OKX E DO MODELO", "settings", {
            tone: "cy"
        });
        // the note is wrapped to the room it has: on the stage the limits are next to it
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])("O INONU DECIDE SOZINHO QUANDO OLHAR O MERCADO: NAO HA BOTAO PARA FORCAR UM CICLO", wide ? 200 : 56).forEach((l, i)=>{
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, L.noteY + i * 14, l, "t-sub", "font-size:9px;fill:#7df3ff");
        });
        return s;
    }
    /** The limits and the rhythm in force, read from the core: what stops the agent and what does not. */ function limits(w) {
        const wide = w > 640;
        const cap = D.agent.caps ?? {
            maxBuyUsd: undefined,
            maxDailyBuyUsd: undefined,
            maxDailySellUsd: undefined
        };
        const usd = (n)=>"US$ " + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(n, 0);
        const spent = D.analysisOk ? D.a.orders.spentToday : null;
        const rows = [
            [
                "AUTORIDADE E MODO",
                `${up(S.authority)}, ${up(S.mode)}`,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white
            ],
            [
                "PERFIL DO DONO",
                up(S.profile),
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white
            ],
            [
                "RITMO DOS OLHARES",
                D.agent.cycling ? `A CADA ${D.rhythm.intervalMin} MIN, E ANTES SE O MERCADO MUDAR` : "PARADO",
                D.agent.cycling ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber
            ],
            [
                "COMPRAS DO DIA",
                `${spent === null ? "SEM DADO DO NUCLEO" : `${usd(spent.buy)} GASTOS`}, LIMITE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capText"])(cap.maxDailyBuyUsd)}`,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy
            ],
            [
                "VENDAS DO DIA",
                `${spent === null ? "SEM DADO DO NUCLEO" : `${usd(spent.sell)} FEITAS`}, LIMITE ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capText"])(cap.maxDailySellUsd)}`,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy
            ],
            [
                "TETO DE UMA COMPRA",
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["capText"])(cap.maxBuyUsd),
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy
            ],
            [
                "ALAVANCAGEM",
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["leverageText"])(D.agent.leverage, w < 560),
                D.agent.leverage !== null && D.agent.leverage.granted ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute
            ]
        ];
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(w, "LIMITES E RITMO EM VIGOR", "O QUE O CODIGO AINDA DEFENDE E O QUE O JEV DECIDE");
        const L = limitsLayout(w, rows.length);
        rows.forEach(([a, b, col], i)=>{
            const y = 88 + i * L.pitch;
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y, a, "t-sub", "font-size:10px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(w, y, b, "t-mono", `font-size:${wide ? 12 : 10}px;fill:${col}`, "end");
        });
        s = L.note.reduce((acc, l, i)=>acc + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, L.noteY + i * 14, l, "t-sub", "font-size:9.5px;fill:#7df3ff"), s);
        return s + guardsBlock(w, L.guardsY);
    }
    /** Where the parts of the limits panel go: the rows, the footnote of the owner's lock, and the choices of the code under them. */ function limitsLayout(w, rows = 8) {
        const wide = w > 640;
        const pitch = wide ? 28 : 32;
        const note = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])("A TRAVA DA CARTEIRA NA OKX E DELA: O APLICATIVO NAO CONSEGUE DESFAZER", wide ? 90 : Math.floor(w / 8.2));
        const noteY = 88 + rows * pitch + 10;
        const guardsY = noteY + note.length * 14 + 24;
        return {
            pitch,
            note,
            noteY,
            guardsY,
            h: guardsY + guardsH(w)
        };
    }
    const limitsH = (w)=>limitsLayout(w, 8).h;
    /** The numbers of the code's own checks after the quote of an order, all from the core: a heading that says they are the code's choice and under review, and one row for each. Without them the core's word is missing, not zero. */ function guardsRows() {
        const G = D.guards;
        if (G === null) return [];
        const trio = (t)=>`COMPRA ${pctText(t.buy)}, VENDA ${pctText(t.sell)}, PROTECAO ${pctText(t.protecao)}`;
        const reserve = G.nativeReserve;
        const fixed = reserve.kind === "fixa";
        return [
            {
                label: "VETO DE IMPACTO NA COTACAO",
                value: trio(G.impactPct),
                note: `A COMPRA ACEITA NO MAXIMO ${shareWords(G.buyCostShareOfStop)} DO STOP DO PERFIL`
            },
            {
                label: "VETO DE IMPOSTO DO TOKEN",
                value: pctText(G.taxPct),
                note: null
            },
            {
                label: "DERRAPAGEM ACEITA",
                value: trio(G.slippagePct),
                note: null
            },
            {
                label: "RESERVA DE TAXA EM MOEDA NATIVA",
                value: fixed ? reserve.usd === null ? "FIXA, VALOR NAO LIDO" : `US$ ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(reserve.usd, Number.isInteger(reserve.usd) ? 0 : 2)} FIXO` : "TAXA MEDIDA POR REDE",
                note: fixed ? null : reserve.usd === null ? "SEM TAXA MEDIDA AINDA" : `ULTIMA TAXA MEDIDA: US$ ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(reserve.usd, 2)}`
            }
        ];
    }
    const guardsH = (w)=>36 + (D.guards === null ? 24 : guardsRows().reduce((a, r)=>a + 28 + (r.note === null ? 0 : 14), 0));
    function guardsBlock(w, y0) {
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y0, "ESCOLHAS DO CODIGO, EM REVISAO", "t-title", `font-size:11.5px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft}`) + `<line x1="0" x2="${w}" y1="${y0 + 8}" y2="${y0 + 8}" stroke="#124c5f"/>`;
        if (D.guards === null) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y0 + 28, "SEM DADO DO NUCLEO", "t-mono", `font-size:11px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute}`);
        let y = y0 + 30;
        for (const r of guardsRows()){
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y, r.label, "t-sub", "font-size:10px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(w, y, r.value, "t-mono", `font-size:11px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white}`, "end");
            if (r.note !== null) {
                s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y + 14, r.note, "t-sub", `font-size:9.5px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft}`);
                y += 14;
            }
            y += 28;
        }
        return s;
    }
    /** Where each part of the resources panel goes, so its height is known to the scene before it is drawn. */ function resourcesLayout(w) {
        const R = D.resources;
        const per = Math.floor(w / 7.6);
        const notes = [];
        if (R !== null) {
            const evidence = new Set();
            for (const id of [
                "free",
                "basic",
                "premium"
            ])for (const m of [
                R.tiers[id].local,
                R.tiers[id].account
            ])if (m.status === "valid") evidence.add(m.capEvidence);
            if (evidence.has("local_configuration")) notes.push(...(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])("TETO CONFIGURADO LOCALMENTE", per));
            if (evidence.has("provider_reported")) notes.push(...(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])("TETO INFORMADO PELO PROVEDOR", per));
            if (R.rate.requestsPerSecond !== null || R.rate.tokensPerSecond !== null) notes.push(...(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])(`LIMITES DA CONTA: ${R.rate.requestsPerSecond === null ? "-" : count(R.rate.requestsPerSecond)} PEDIDOS POR SEGUNDO, ${R.rate.tokensPerSecond === null ? "-" : count(R.rate.tokensPerSecond)} TOKENS POR SEGUNDO`, per));
            notes.push(...(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])("A IDADE DE CADA LEITURA SOBE COM O RELOGIO DESTA TELA, SEM NOVA LEITURA", per));
        }
        const legendY = 86;
        const tierY = R === null ? legendY + 8 : 126;
        const tierPitch = 64;
        const notesY = R === null ? tierY + 30 : tierY + 3 * tierPitch + 4;
        const modelY = notesY + notes.length * 14 + 24;
        return {
            legendY,
            tierY,
            tierPitch,
            notesY,
            notes,
            modelY,
            h: modelY + 70 + 28
        };
    }
    const resourcesH = (w)=>resourcesLayout(w).h;
    /** The quota of the data provider by tier, what this machine sent against what the account says, and the model side from the budget the screen already has. Unknown is a dash, never a zero. */ function resources(w) {
        const R = D.resources;
        const L = resourcesLayout(w);
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(w, "RECURSOS E CONSUMO", R === null ? "O QUE O AGENTE CONSOME DOS DADOS E DO MODELO" : `COTA MENSAL DO PROVEDOR DE DADOS, MES ${R.monthKey} (${R.days} DIAS)`);
        if (R === null) s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, L.tierY + 14, "NUCLEO NAO ENVIA OS RECURSOS", "t-mono", `font-size:12px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}`);
        else {
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, L.legendY, "LOCAL = CONTADOR LOCAL: O QUE ESTA MAQUINA ENVIOU", "t-sub", "font-size:9.5px;fill:#7df3ff");
            s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, L.legendY + 14, "CONTA = O QUE A CONTA DO PROVEDOR INFORMA", "t-sub", "font-size:9.5px;fill:#7df3ff");
            [
                "free",
                "basic",
                "premium"
            ].forEach((id, i)=>{
                const y = L.tierY + i * L.tierPitch;
                s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, y, TIER_WORDS[id], "t-title", `font-size:11.5px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft}`) + `<line x1="62" x2="${w}" y1="${y - 4}" y2="${y - 4}" stroke="#124c5f"/>`;
                [
                    "local",
                    "account"
                ].forEach((scope, k)=>{
                    const m = R.tiers[id][scope];
                    const ry = y + 20 + k * 20;
                    const valid = m.status === "valid";
                    const used = valid ? `${count(m.used ?? 0)} DE ${m.monthlyCap === null ? scope === "local" ? "SEM TETO LOCAL" : "SEM TETO" : count(m.monthlyCap)}` : m.status === "unreported" ? scope === "account" ? "CONTA NAO LIDA" : "CONTADOR LOCAL NAO LIDO" : METER_WORDS[m.status] ?? "LEITURA INVALIDA";
                    const remain = valid && m.remaining !== null ? `RESTAM ${count(m.remaining)}` : "RESTAM -";
                    const age = valid && m.ageMs !== null ? ageWords(m.ageMs) : "-";
                    s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, ry, scope === "local" ? "LOCAL" : "CONTA", "t-sub", "font-size:9.5px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(52, ry, valid && m.used === null ? "-" : used, "t-mono", `font-size:11px;fill:${valid ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber}`);
                    s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(w - 232, ry, remain, "t-mono", `font-size:11px;fill:${valid && m.remaining !== null ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].cy : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute}`) + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(w, ry, age, "t-mono", `font-size:11px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute}`, "end");
                });
            });
            s = L.notes.reduce((acc, l, i)=>acc + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, L.notesY + i * 14, l, "t-sub", "font-size:9.5px;fill:#7df3ff"), s);
        }
        // the model side, from the budget the screen already has: the tokens and the cost of each attempt are not measured apart yet, and the screen says so
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, L.modelY, "MODELO", "t-title", `font-size:11.5px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft}`) + `<line x1="62" x2="${w}" y1="${L.modelY - 4}" y2="${L.modelY - 4}" stroke="#124c5f"/>`;
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, L.modelY + 20, "CONSULTAS DO DIA", "t-sub", "font-size:10px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(w, L.modelY + 20, `${D.budget.consults} DE ${D.budget.max}`, "t-mono", `font-size:11px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white}`, "end");
        s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, L.modelY + 40, "TOKENS DO DIA", "t-sub", "font-size:10px") + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(w, L.modelY + 40, D.budget.tokens === null ? "SEM MEDIDA" : `${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fmt"])(D.budget.tokens / 1e6, 2)}M`, "t-mono", `font-size:11px;fill:${D.budget.tokens === null ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].white}`, "end");
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])("TOKENS E CUSTO POR TENTATIVA AINDA NAO SAO MEDIDOS SEPARADAMENTE", Math.floor(w / 7.6)).reduce((acc, l, i)=>acc + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, L.modelY + 60 + i * 14, l, "t-sub", `font-size:9.5px;fill:${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].mute}`), s);
    }
    /** What the agent did, newest first: cycles, orders at their last stage, the person's own connect and disconnect. */ function log(w) {
        const wide = w > 1000;
        let s = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["title"])(w, "REGISTRO DO AGENTE", "GRAVADO ANTES DE CADA ACAO, DO MAIS NOVO AO MAIS ANTIGO");
        if (S.log.length === 0) return s + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(0, 100, "NADA REGISTRADO AINDA", "t-sub", "font-size:10px");
        const per = wide ? 4 : 8;
        // a narrow panel wraps a long line of the log under its own time, so the text never runs out of the panel; each line keeps the room it needs
        let yNarrow = 92;
        S.log.slice(0, 8).forEach((l, i)=>{
            const col = wide ? Math.floor(i / per) : 0, row = wide ? i % per : i;
            const parts = wide ? [
                l.text
            ] : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])(l.text, LOG_NARROW);
            const x = col * (w / 2 + 10), y = wide ? 92 + row * 24 : yNarrow;
            const c = l.tone === "ok" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].green : l.tone === "warn" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].amber : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COL"].soft;
            s += `<circle cx="${x + 5}" cy="${y - 4}" r="4" fill="${c}"/>` + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 18, y, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hhmm"])(l.t), "t-mono", "font-size:11.5px;fill:#5fa3b5");
            parts.forEach((part, k)=>{
                s += (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["text"])(x + 74, y + k * 14, part, "t-mono", `font-size:${wide ? 12 : 10.5}px;fill:${c}`);
            });
            yNarrow += parts.length * 14 + 10;
        });
        return s;
    }
    /** The height of the log in a narrow panel: its lines, the longer ones wrapped. */ const logH = (w)=>w > 1000 ? SYSTEM_WIDE.log : S.log.length === 0 ? 130 : 92 + S.log.slice(0, 8).reduce((a, l)=>a + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["wrap"])(l.text, LOG_NARROW).length * 14 + 10, 0);
    return {
        wallet,
        walletH,
        inflight,
        inflightH,
        actions,
        actionsH,
        limits,
        limitsH,
        resources,
        resourcesH,
        log,
        logH,
        stopped,
        stoppedH
    };
}
const SYSTEM_H = {
    wallet: 470,
    inflight: 330,
    actions: 450,
    limits: 420,
    log: 290
};
/** How many characters of a line of the log fit beside its time in a panel that is 480 wide. */ const LOG_NARROW = 56;
const SYSTEM_WIDE = {
    actions: 320,
    limits: 330,
    log: 190,
    bottom: 1040
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/insights.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "INSIGHT_MAX",
    ()=>INSIGHT_MAX,
    "STOPPED_TEXT",
    ()=>STOPPED_TEXT,
    "blockedGroups",
    ()=>blockedGroups,
    "insights",
    ()=>insights
]);
/**
 * What the Inonu "reads" from its own numbers, as short lines for the person who owns the capital: why nothing was bought, where the money sits, which position is close to its target or its stop, whether the skipped
 * purchases kept rising, what failed. Every line is derived from the model of the screen (never from a guess), says the size of the sample when the sample is small, and promises nothing: no line speaks of profit
 * to come. Pure: the same model gives the same lines, so a test can pin them.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/h.ts [app-client] (ecmascript)");
;
const INSIGHT_MAX = 92;
const STOPPED_TEXT = "AGENTE PARADO, SO ACOMPANHAMENTO, NENHUMA ORDEM SAI";
const pc = (n, d = 0)=>n.toFixed(d).replace(".", ",");
const cut = (s)=>s.length <= INSIGHT_MAX ? s : s.slice(0, INSIGHT_MAX - 1) + ".";
function blockedGroups(D) {
    const groups = new Map();
    for (const d of D.last.dropped){
        const key = `${d.side}|${d.code}`;
        const g = groups.get(key) ?? {
            side: d.side,
            text: d.text,
            symbols: []
        };
        if (!g.symbols.includes(d.s)) g.symbols.push(d.s);
        groups.set(key, g);
    }
    return [
        ...groups.values()
    ].map((g)=>({
            ...g,
            names: g.symbols.slice(0, 2).join(" E ") + (g.symbols.length > 2 ? ` E MAIS ${g.symbols.length - 2}` : "")
        }));
}
/** One line per reason the code gave (at most two), then how long nothing has gone out. The symbols are the ones the Jev chose; the reason is the code's own. */ function blockedLines(D) {
    const lines = [];
    const streak = D.last.streak;
    const run = streak !== null && streak.exact && streak.cycles >= 2 ? `, ${streak.cycles} CICLOS SEGUIDOS` : "";
    for (const g of blockedGroups(D).slice(0, 2))lines.push({
        tone: "warn",
        text: `O JEV PEDIU ${g.side === "buy" ? "COMPRAR" : "VENDER"} ${g.names} E O CODIGO BLOQUEOU: ${g.text}${run}`
    });
    if (streak !== null && !streak.exact && streak.cycles >= 2) lines.push({
        tone: "warn",
        text: `NENHUMA ORDEM SAIU NOS ULTIMOS ${streak.cycles} CICLOS SEGUIDOS`
    });
    return lines;
}
function insights(D) {
    const out = [];
    const open = D.candidates.filter((c)=>!c.closed);
    const closed = D.candidates.length - open.length;
    // what the Jev asked for is his own stance on a purchase (his choice is the decision: the code has no bar of its own to pass)
    const asked = open.filter((c)=>c.applied !== null && c.applied !== "skip");
    // an agent that runs no cycles says so first, and nothing the last consult chose is told as if it were happening now
    const live = D.agent.cycling;
    if (!live) out.push({
        tone: "warn",
        text: STOPPED_TEXT
    });
    // 0. what the Jev chose and the code did not turn into an order comes first: a request that was dropped is not a decision carried out, and it must never look as if nothing was decided
    if (live) out.push(...blockedLines(D));
    // 1. why nothing was bought, or what went through
    const best = [
        ...open
    ].filter((c)=>c.pbuy !== null).sort((a, b)=>(b.pbuy ?? 0) - (a.pbuy ?? 0))[0];
    const sent = asked.filter((c)=>c.blocked === null);
    if (live) {
        if (sent.length > 0) out.push({
            tone: "ok",
            text: `O JEV PEDIU COMPRAR NA ULTIMA CONSULTA: ${sent.map((c)=>c.s).slice(0, 3).join(", ")}`
        });
        else if (asked.length === 0 && best !== undefined && best.pbuy !== null) out.push({
            tone: "info",
            text: `O JEV NAO PEDIU COMPRA NA ULTIMA CONSULTA, MAIOR PREFERENCIA: ${best.s} ${pc(best.pbuy * 100)}%`
        });
        else if (D.candidates.length === 0) out.push({
            tone: "info",
            text: "AINDA SEM CANDIDATOS NA ULTIMA CONSULTA"
        });
    }
    // 2. how much the code closed before the model could choose
    if (live && D.candidates.length >= 3 && closed / D.candidates.length >= 0.5) out.push({
        tone: "info",
        text: `${closed} DE ${D.candidates.length} CANDIDATOS FORAM FECHADOS PELO CODIGO ANTES DO JEV`
    });
    // 3. the position nearest to its target or to its stop
    const planned = D.wallet.positions.filter((p)=>p.plan !== null && !p.cash);
    const near = planned.map((p)=>({
            p,
            toT: p.plan.toTargetPct,
            toS: p.plan.toStopPct
        })).filter((x)=>x.toT !== null || x.toS !== null).sort((a, b)=>Math.min(a.toT ?? 99, a.toS ?? 99) - Math.min(b.toT ?? 99, b.toS ?? 99))[0];
    if (near !== undefined) {
        const c = near.toS !== null && near.toS < 2;
        out.push({
            tone: c ? "warn" : "info",
            text: cut(`${near.p.s}: FALTAM ${near.toT === null ? "-" : pc(Math.max(0, near.toT), 1)}% AO ALVO E ${near.toS === null ? "-" : pc(Math.max(0, near.toS), 1)}% AO STOP, ${Math.max(0, Math.round(near.p.plan.hoursLeft))} H DE PRAZO`)
        });
    }
    const loose = D.wallet.positions.filter((p)=>!p.cash && p.plan === null && p.usd !== null && p.usd > 0);
    if (loose.length > 0) out.push({
        tone: "warn",
        text: `${loose.length} TOKEN(S) SEM PLANO DE SAIDA: O AGENTE NAO ADMINISTRA ESSA PARTE`
    });
    // 4. the money that is idle
    const total = D.wallet.total ?? 0;
    if (D.wallet.total === null) out.push({
        tone: "warn",
        text: D.wallet.lastReadMs === null ? "SEM LEITURA DA CARTEIRA ATE AGORA" : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNote"])(D.wallet.lastReadMs)
    });
    if (total > 0 && D.wallet.cash !== null) {
        const share = D.wallet.cash / total;
        if (share >= 0.7) out.push({
            tone: "info",
            text: `CAIXA LIVRE ${pc(share * 100)}% DA CARTEIRA, EM USDC E SEM RENDIMENTO`
        });
    }
    // 5. the skipped purchases, measured afterwards (a counterfactual, with its sample size)
    if (D.analysisOk) {
        const g = D.a.placar.skipped["1h"];
        if (g.n >= 5 && g.mean !== null) out.push({
            tone: "info",
            text: `DAS PULADAS: ${g.up} DE ${g.n} SUBIRAM EM 1 H, MEDIA ${g.mean > 0 ? "+" : ""}${pc(g.mean, 1)}%, ANTES DE CUSTO`
        });
        else if (g.n > 0) out.push({
            tone: "info",
            text: `SO ${g.n} PULADA(S) JA MEDIDA(S) EM 1 H: POUCAS PARA CONCLUIR`
        });
        const fail = D.a.orders.outcomes.falhou ?? 0;
        const ok = D.a.orders.outcomes.executada ?? 0;
        if (fail > 0) out.push({
            tone: "warn",
            text: `${fail} ORDEM(NS) FALHARAM NA CADEIA CONTRA ${ok} EXECUTADA(S)`
        });
        const net = D.a.trips.reduce((a, t)=>a + (t.out - t.in), 0);
        if (D.a.trips.length > 0) out.push({
            tone: net >= 0 ? "ok" : "warn",
            text: `${D.a.trips.length} VOLTA(S) FECHADA(S): CAIXA ${net > 0 ? "+" : ""}${pc(net, 3)} USDC, ANTES DA TAXA EM SOL`
        });
    }
    // 6. the things that need the person
    if (D.agent.paused) out.push({
        tone: "warn",
        text: `COMPRAS NOVAS PAUSADAS${D.agent.pauseReason === null ? "" : ": " + D.agent.pauseReason.replace(/_/g, " ").toUpperCase()}`
    });
    if (D.health.inFlight > 0) out.push({
        tone: "warn",
        text: `${D.health.inFlight} ORDEM(NS) SEM RECIBO: ABRA OS CONTROLES PARA RESOLVER`
    });
    if (D.health.sessionDays !== null && D.health.sessionDays < 3) out.push({
        tone: "warn",
        text: `A SESSAO DA CARTEIRA ACABA EM ${Math.max(0, Math.round(D.health.sessionDays))} DIA(S)`
    });
    // the lines that ask for attention come first, the rest keep their order
    const rank = {
        warn: 0,
        ok: 1,
        info: 2
    };
    return out.map((x, i)=>({
            x,
            i
        })).sort((a, b)=>rank[a.x.tone] - rank[b.x.tone] || a.i - b.i).map(({ x })=>({
            tone: x.tone,
            text: cut(x.text)
        }));
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/live.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "countdownAt",
    ()=>countdownAt,
    "easeOut",
    ()=>easeOut,
    "formatCount",
    ()=>formatCount,
    "nextLook",
    ()=>nextLook,
    "showCandidate",
    ()=>showCandidate,
    "startCountUp",
    ()=>startCountUp,
    "tickLive",
    ()=>tickLive,
    "withFacets",
    ()=>withFacets
]);
/**
 * The parts of the screen that move with the clock and not with the data: the countdown to the next look, the clock, the candidate shown in the flower of facets, the numbers that count up when a scene is drawn. The
 * arithmetic is pure (`countdownAt`, `easeOut`, `formatCount`) so a test can pin it; the functions that touch the document only copy those results into the elements the scene marked.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$command$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/command.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/draw/h.ts [app-client] (ecmascript)");
;
;
/** The centre and the radius of the countdown ring in the core (draw/command.ts `core`). */ const CX = 350;
const CY = 380;
const RING = 170;
function nextLook(model, nowMs) {
    const next = model.rhythm.nextAtMs;
    const interval = model.rhythm.intervalMin * 60_000;
    if (next === null || !(interval > 0)) return null;
    return next >= nowMs ? next : next + Math.ceil((nowMs - next) / interval) * interval;
}
function countdownAt(model, nowMs) {
    // a core that runs no cycles has no next look: counting to a stale time would say the agent is about to act
    if (!model.agent.cycling) return {
        leftMs: null,
        frac: 0.002,
        label: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["STOPPED_COUNT"],
        state: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["STOPPED_STATE"]
    };
    const target = nextLook(model, nowMs);
    const interval = model.rhythm.intervalMin * 60_000;
    if (target === null) return {
        leftMs: null,
        frac: 0.002,
        label: "--:--",
        state: "SEM HORA DO PROXIMO OLHAR"
    };
    const left = target - nowMs;
    const s = Math.max(0, Math.round(left / 1000));
    return {
        leftMs: left,
        frac: Math.min(1, Math.max(0.002, 1 - left / interval)),
        label: `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`,
        state: left < 6000 ? "MONTANDO O BRIEF" : "AGUARDANDO O PROXIMO OLHAR"
    };
}
const easeOut = (t)=>1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const formatCount = (value, decimals, prefix, suffix)=>prefix + value.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }) + suffix;
const all = (svg, selector)=>Array.from(svg.querySelectorAll(selector));
function tickLive(svg, model, nowMs) {
    const c = countdownAt(model, nowMs);
    const sweep = c.frac * 359.5;
    const [hx, hy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pt"])(CX, CY, RING, sweep);
    for (const n of all(svg, ".countArc"))n.setAttribute("d", (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["arc"])(CX, CY, RING, 0, sweep));
    for (const n of all(svg, ".countHead")){
        n.setAttribute("cx", (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(hx));
        n.setAttribute("cy", (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fx"])(hy));
    }
    for (const n of all(svg, ".coreCount"))n.textContent = c.label;
    for (const n of all(svg, ".coreState"))n.textContent = c.state;
    const d = new Date(nowMs);
    for (const n of all(svg, ".clock"))n.textContent = d.toLocaleTimeString("pt-BR");
    for (const n of all(svg, ".date"))n.textContent = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$h$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["plain"])(d.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long"
    })).toUpperCase();
}
function showCandidate(svg, model, index) {
    const c = model.candidates[index];
    if (c === undefined) return;
    for (const n of all(svg, ".flowerName"))n.textContent = c.s;
    for (const n of all(svg, ".flowerSub"))n.textContent = c.pbuy === null ? c.closed ? "FECHADO" : "SEM PREFERENCIA" : "P COMPRA " + Math.round(c.pbuy * 100) + "%";
    for (const [k] of __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$draw$2f$command$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["FACET_META"]){
        const v = c.facets[k];
        const has = typeof v === "number";
        for (const n of all(svg, `.hexfill[data-k="${k}"]`)){
            n.setAttribute("opacity", has ? (0.12 + 0.85 * v).toFixed(2) : "0.05");
            n.setAttribute("fill", k === "accumulating" || k === "exit_easy" ? "#38ffb4" : "#ffb23e");
        }
        for (const n of all(svg, `[data-v="${k}"]`))n.textContent = has ? String(Math.round(v * 100)) : "-";
    }
    for (const b of all(svg, ".blip")){
        const on = Number(b.getAttribute("data-i")) === index;
        b.setAttribute("r", on ? "9" : "5.5");
        b.setAttribute("stroke-width", on ? "2.6" : "1.5");
    }
}
const withFacets = (model)=>model.candidates.map((c, i)=>[
            c,
            i
        ]).filter(([c])=>Object.keys(c.facets).length > 0).map(([, i])=>i);
function startCountUp(svg, durationMs = 1100) {
    const items = all(svg, "[data-count]").map((el)=>({
            el,
            value: Number(el.getAttribute("data-count")),
            dec: Number(el.getAttribute("data-dec") ?? "0"),
            pre: el.getAttribute("data-pre") ?? "",
            suf: el.getAttribute("data-suf") ?? ""
        })).filter((x)=>Number.isFinite(x.value));
    if (items.length === 0 || typeof requestAnimationFrame !== "function") return ()=>{};
    const t0 = performance.now();
    let raf = 0;
    const step = (now)=>{
        const k = easeOut((now - t0) / durationMs);
        for (const x of items)x.el.textContent = formatCount(x.value * k, x.dec, x.pre, x.suf);
        if (now - t0 < durationMs) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return ()=>cancelAnimationFrame(raf);
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/model.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * What the command centre draws, built from the core's status and its analysis. One place where every text that came from outside is cleaned (a token symbol is letters, digits and a few signs, never markup) and where
 * everything the core did not say stays null. Pure: no clock, no network.
 */ __turbopack_context__.s([
    "blockText",
    ()=>blockText,
    "buildHudModel",
    ()=>buildHudModel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/parse-analysis.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/agent/view.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/types.ts [app-client] (ecmascript)");
;
;
;
const DAY_MS = 86_400_000;
const CYCLES_KEPT = 48;
const EVENTS_KEPT = 14;
/** The preference for buying: the largest probability among the options that are purchases. Null when the model sent none. */ function buyPreference(probs) {
    if (probs === null || probs === undefined) return null;
    let best = null;
    for (const [option, p] of Object.entries(probs))if (option.startsWith("buy") && Number.isFinite(p)) best = Math.max(best ?? 0, p);
    return best;
}
/** The option the model preferred (its most likely one, what a Choice picks); null when it sent no probabilities. */ function preferred(probs) {
    if (probs === null || probs === undefined) return null;
    let top = null;
    for (const [option, p] of Object.entries(probs))if (Number.isFinite(p) && (top === null || p > top[1])) top = [
        option,
        p
    ];
    return top === null ? null : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(top[0], 24);
}
/** The words for the reasons the code gives when it drops what the Jev chose, in capital letters without accents. The ones the agent page already words (reasonText) are reused; these few are too long for a line of the screen. */ const BLOCK_SHORT = {
    sem_saldo: "SEM SALDO LIDO PARA A COMPRA",
    valor_invalido: "VALOR DA ORDEM INVALIDO",
    gasto_desconhecido: "GASTO DO DIA DESCONHECIDO",
    ordem_em_voo: "ORDEM EM VOO PARA O TOKEN",
    abaixo_do_minimo_da_rede: "ABAIXO DO MINIMO DA REDE"
};
const NO_ACCENT = /[̀-ͯ]/g;
function blockText(code) {
    const short = BLOCK_SHORT[code];
    if (short !== undefined) return short;
    const said = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["reasonText"])(code);
    if (said === "" || said === (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["reasonText"])("<unknown>")) return code.replace(/[._-]+/g, " ").toUpperCase().slice(0, 40);
    return said.normalize("NFD").replace(NO_ACCENT, "").toUpperCase().replace(/[^A-Z0-9 ,]/g, "").trim().slice(0, 48);
}
/** The chain and the address of a candidate id (`buy:token:501:<mint>` or `hold:token:1:<address>@agente`), so the same token is found whichever way its id is written. */ const tokenKey = (id)=>{
    const parts = id.split(":");
    return `${parts[2] ?? ""}:${parts.slice(3).join(":").split("@")[0] ?? ""}`.toLowerCase();
};
/** What the Jev chose in the last cycle and the code dropped before it became an order, each with its symbol (from the cycle's own view of the candidates, found by id or by the token's address). */ function dropped(status) {
    const last = status.last;
    if (last === null) return [];
    const byId = new Map(last.view.map((v)=>[
            v.id,
            v
        ]));
    const byToken = new Map(last.view.map((v)=>[
            tokenKey(v.id),
            v
        ]));
    return last.dropped.slice(0, 8).map((d)=>{
        const v = byId.get(d.candidateId) ?? byToken.get(tokenKey(d.candidateId));
        const address = tokenKey(d.candidateId).split(":").slice(1).join(":");
        const shown = address.length > 10 ? `${address.slice(0, 4)}..${address.slice(-4)}` : address;
        const code = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(d.reason, 40) ?? "motivo";
        return {
            s: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(v?.symbol, 14) ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(shown, 12) ?? "token",
            side: d.candidateId.startsWith("hold:") ? "sell" : "buy",
            code,
            text: blockText(code)
        };
    });
}
/**
 * How many consecutive cycles nothing went out for what the Jev chose. When the record of each past cycle says what it dropped (the ledger carries `dropped`), the count is of the cycles that dropped the SAME token's
 * request. When it does not, the count is only of the latest cycles that decided and sent no order, and says so (`exact` false): it never claims a past cycle was blocked that the record does not show.
 */ function streak(status, now, cycleRows) {
    const last = status.last;
    if (last === null || now.length === 0) return null;
    const wanted = new Set(last.dropped.map((d)=>tokenKey(d.candidateId)));
    const past = status.ledger.filter((r)=>r.kind === "cycle" && r.cycleId !== last.cycleId).sort((a, b)=>b.atMs - a.atMs);
    const recordsDrops = past.length > 0 && past.every((r)=>Array.isArray(r.dropped));
    if (recordsDrops) {
        let n = 1;
        for (const r of past){
            const list = r.dropped;
            if (!list.some((d)=>typeof d.candidateId === "string" && wanted.has(tokenKey(d.candidateId)))) break;
            n++;
        }
        return {
            cycles: n,
            exact: true
        };
    }
    // an agent that only watches sends nothing in any cycle: "no order went out" would say nothing there
    if (status.mode === "sombra") return null;
    let n = 0;
    for(let i = cycleRows.length - 1; i >= 0; i--){
        const c = cycleRows[i];
        if (c.o !== "decidido" || c.p > 0) break;
        n++;
    }
    return {
        cycles: Math.max(1, n),
        exact: false
    };
}
function candidates(status) {
    const out = [];
    const drops = new Map((status.last?.dropped ?? []).map((d)=>[
            d.candidateId,
            d.reason
        ]));
    for (const v of status.last?.view ?? []){
        if (v.kind !== "buy") continue;
        const facets = {};
        for (const [k, x] of Object.entries(v.facets ?? {})){
            const key = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(k, 24);
            if (key !== null && Number.isFinite(x)) facets[key] = x;
        }
        const why = drops.get(v.id);
        const blocked = why === undefined ? null : {
            code: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(why, 40) ?? "motivo",
            text: blockText((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(why, 40) ?? "motivo")
        };
        out.push({
            s: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(v.symbol, 14) ?? "token",
            pbuy: buyPreference(v.probs),
            closed: v.closed !== null,
            facets,
            marks: v.marks.map((m)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(m, 30)).filter((m)=>m !== null).slice(0, 6),
            requested: preferred(v.probs),
            applied: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(v.stance, 24),
            blocked
        });
    }
    return out;
}
function events(ledger) {
    // the last stage of each order: the same order is written at every stage of its life
    const last = new Map();
    for (const r of ledger)if (r.kind === "order" && r.symbol !== undefined && r.side !== undefined) last.set(`${r.cycleId}|${r.symbol}|${r.side}`, r);
    const out = [];
    for (const r of [
        ...last.values()
    ].sort((a, b)=>a.atMs - b.atMs)){
        if (r.stage !== "executada" && r.stage !== "falhou" && r.stage !== "incerta") continue;
        out.push({
            t: r.atMs,
            side: r.side,
            s: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(r.symbol, 14) ?? "token",
            usd: r.usd ?? 0,
            stage: r.stage,
            src: r.source === "protecao" ? "protecao" : "modelo",
            reason: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(r.reason, 40)
        });
    }
    return out.slice(-EVENTS_KEPT);
}
function cycles(ledger) {
    const sent = new Set(ledger.filter((r)=>r.kind === "order" && (r.stage === "executada" || r.stage === "incerta" || r.stage === "enviando")).map((r)=>r.cycleId));
    return ledger.filter((r)=>r.kind === "cycle").map((r)=>({
            t: r.atMs,
            o: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(r.outcome ?? "mantido", 12) ?? "mantido",
            p: sent.has(r.cycleId) ? 1 : 0
        })).slice(-CYCLES_KEPT);
}
function positions(status) {
    return (status.book?.positions ?? []).filter((p)=>p.wallet === "agente").map((p)=>({
            s: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(p.symbol, 14) ?? "token",
            usd: p.usd,
            share: p.sharePct,
            cash: p.isCash,
            plan: p.plan === null ? null : {
                profile: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(p.plan.profile, 12) ?? "",
                sinceEntryPct: p.plan.sinceEntryPct,
                toTargetPct: p.plan.toTargetPct,
                toStopPct: p.plan.toStopPct,
                hoursHeld: p.plan.hoursHeld,
                hoursLeft: p.plan.hoursLeft
            }
        }));
}
/** An https address and nothing else: a button that opens a page for the person must never open anything the core did not mean as a web page. */ const httpsOnly = (v)=>{
    if (v === null) return null;
    try {
        const u = new URL(v);
        return u.protocol === "https:" && u.username === "" && u.password === "" ? u.toString() : null;
    } catch  {
        return null;
    }
};
function inFlight(status, nowMs) {
    return status.inFlight.map((o)=>({
            key: o.orderKey,
            symbol: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(o.symbol, 14) ?? "token",
            side: o.side,
            usd: o.usd,
            ageMin: Math.max(0, Math.round((nowMs - o.atMs) / 60_000)),
            stage: o.stage,
            needsWord: o.ref === undefined || o.ref === null || o.ref === "",
            source: o.source,
            said: o.detail === null || o.detail === undefined ? null : o.detail.replace(/[^A-Za-z0-9 .,;:()%/_-]/g, "").slice(0, 120) || null
        }));
}
const STAGE_WORD = {
    preparada: "PREPARADA",
    enviando: "ENVIANDO",
    executada: "EXECUTADA",
    falhou: "FALHOU",
    incerta: "SEM CONFIRMACAO"
};
const EVENT_WORD = {
    conectou: "CARTEIRA CONECTADA",
    desconectou: "CARTEIRA DESCONECTADA",
    pausou: "COMPRAS NOVAS PAUSADAS",
    retomou: "COMPRAS NOVAS VOLTARAM"
};
/** The newest records of the agent in plain capital letters: the last stage of each order, each cycle and the person's own events. Words from outside never come in raw. */ function systemLog(status) {
    const lines = [];
    const lastStage = new Map();
    for (const r of status.ledger){
        if (r.kind === "order") lastStage.set(`${r.cycleId}|${r.symbol}|${r.side}`, r);
        else if (r.kind === "cycle") {
            const outcome = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(r.outcome ?? "mantido", 14) ?? "mantido";
            const why = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(r.reason ?? null, 40);
            lines.push({
                t: r.atMs,
                tone: outcome === "erro" ? "warn" : "info",
                text: `CICLO ${outcome.toUpperCase()}${why === null ? "" : ", " + (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$agent$2f$view$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["reasonText"])(why).toUpperCase().replace(/\./g, "")}`
            });
        }
    }
    for (const r of lastStage.values()){
        const stage = r.stage ?? "";
        lines.push({
            t: r.atMs,
            tone: stage === "executada" ? "ok" : stage === "falhou" ? "warn" : "info",
            text: `${r.side === "sell" ? "VENDA" : "COMPRA"} ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(r.symbol, 14) ?? "TOKEN"} US$ ${Math.round(r.usd ?? 0)}: ${STAGE_WORD[stage] ?? "REGISTRADA"}`
        });
    }
    for (const e of status.events)lines.push({
        t: e.atMs,
        tone: e.kind === "pausou" ? "warn" : "info",
        text: EVENT_WORD[e.kind] ?? "EVENTO"
    });
    return lines.sort((a, b)=>b.t - a.t).slice(0, 8).map((l)=>({
            ...l,
            text: l.text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 .,:$()%/-]/g, "").slice(0, 84)
        }));
}
function system(status, nowMs) {
    const w = status.wallet;
    return {
        wallet: {
            next: w.next,
            cli: w.cli,
            login: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(w.login, 20) ?? "desconhecido",
            loginUrl: httpsOnly(w.loginUrl),
            policy: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(w.policy, 20) ?? "desconhecida",
            sessionDays: w.sessionLeftMs === null ? null : w.sessionLeftMs / DAY_MS,
            evm: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(w.address, 64),
            solana: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(w.solanaAddress, 64)
        },
        inFlight: inFlight(status, nowMs),
        log: systemLog(status),
        mode: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(status.mode, 20) ?? "-",
        authority: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(status.authority.level, 20) ?? "-",
        profile: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(status.autopilot?.ownerProfile ?? "livre", 20) ?? "livre"
    };
}
function guards(status) {
    const g = status.autopilot.guards;
    return g === null ? null : {
        impactPct: {
            ...g.impactPct
        },
        taxPct: g.taxPct,
        slippagePct: {
            ...g.slippagePct
        },
        buyCostShareOfStop: g.buyCostShareOfStop,
        nativeReserve: {
            kind: g.nativeReserve.kind,
            usd: g.nativeReserve.usd
        }
    };
}
/** The quota of the provider: the age of each reading is the screen's clock minus the moment it was observed, so it advances without a new observation. */ function resources(status, nowMs) {
    const r = status.resources;
    if (r === null) return null;
    const meter = (m)=>({
            status: m.status,
            capEvidence: m.capEvidence,
            used: m.used,
            monthlyCap: m.monthlyCap,
            remaining: m.remainingAtObservation,
            ageMs: m.observedAtMs === null ? null : Math.max(0, nowMs - m.observedAtMs)
        });
    const tier = (id)=>({
            local: meter(r.tiers[id].local),
            account: meter(r.tiers[id].account)
        });
    return {
        monthKey: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(r.month.key, 7) ?? "-",
        days: r.month.days,
        rate: {
            ...r.accountRateLimits
        },
        tiers: {
            free: tier("free"),
            basic: tier("basic"),
            premium: tier("premium")
        }
    };
}
const numberOf = (v)=>typeof v === "number" && Number.isFinite(v) ? v : null;
function buildHudModel(status, analysis, nowMs, ui = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$types$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["IDLE_UI"]) {
    const a = analysis ?? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["EMPTY_ANALYSIS"];
    const ctx = status.context ?? {};
    const book = status.book;
    const cycleRows = cycles(status.ledger);
    const drops = dropped(status);
    return {
        snapshotAtMs: nowMs,
        analysisOk: analysis !== null,
        agent: {
            mode: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(status.mode, 20) ?? "-",
            authority: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(status.authority.level, 20) ?? "-",
            paused: status.paused,
            pauseReason: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(status.pauseReason, 40),
            profile: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(status.autopilot?.ownerProfile ?? "livre", 20) ?? "livre",
            model: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(status.last?.modelo ?? null, 24),
            caps: status.autopilot?.caps ?? null,
            riskPct: a.runtime.riskPct,
            reserveShare: status.autopilot?.reserveShare ?? 0,
            leverage: status.autopilot?.leverage ?? null,
            cycling: status.scheduler.started
        },
        wallet: {
            total: book?.agentUsd ?? null,
            cash: book?.cashUsd ?? null,
            positions: positions(status),
            unpriced: book?.unpriced ?? 0,
            observedAtMs: book?.observedAtMs ?? null,
            readAtMs: book?.observedAtMs ?? null,
            lastReadMs: book?.observedAtMs ?? null,
            quality: ui.walletPollFailed && book?.quality !== "unavailable" ? book === null ? "unavailable" : "stale" : book?.quality ?? "unavailable"
        },
        equity: status.performance.series.map((p)=>({
                t: p.t,
                v: p.v
            })),
        rhythm: {
            lastAtMs: status.scheduler.lastAtMs,
            nextAtMs: status.scheduler.nextAtMs,
            intervalMin: status.scheduler.intervalMin
        },
        budget: {
            consults: status.budget.consults,
            max: status.budget.maxConsultsPerDay,
            tokens: a.runtime.tokensToday
        },
        context: {
            btc: numberOf(ctx.btc_24h),
            eth: numberOf(ctx.eth_24h),
            trend: typeof ctx.tendencia === "string" ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(ctx.tendencia, 20) : null
        },
        last: {
            atMs: status.last?.atMs ?? null,
            posture: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(status.last?.posture ?? null, 12),
            dropped: drops,
            streak: streak(status, drops, cycleRows)
        },
        candidates: candidates(status),
        events: events(status.ledger),
        cycles: cycleRows,
        health: {
            login: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$analysis$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clean"])(status.wallet.login, 20) ?? "desconhecido",
            sessionDays: status.wallet.sessionLeftMs === null ? null : status.wallet.sessionLeftMs / DAY_MS,
            modelOk: status.modelConfigured,
            ledgerOk: status.health.ledgerOk,
            plansOk: status.health.plansOk,
            lock: status.lock,
            inFlight: status.inFlight.length
        },
        a,
        system: system(status, nowMs),
        guards: guards(status),
        resources: resources(status, nowMs),
        ui
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/morph.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Brings a piece of the document to look like another one by changing only what differs. The screen is drawn as a string every time the core answers; putting that string in place whole would replace every element, and
 * every animation (the rings, the flows, the bars growing, the sweep of the entrance) would start again from its first frame at each answer. Here the elements that are the same stay the same element: a text is
 * rewritten only when it changed, an attribute only when it changed, and an element is replaced only when it is another kind of element. Nothing here knows what the drawing means.
 */ /** Makes the attributes of `from` the attributes of `to`: the ones that differ are set, the ones `to` does not have are removed. */ __turbopack_context__.s([
    "morphChildren",
    ()=>morphChildren,
    "syncAttributes",
    ()=>syncAttributes
]);
function syncAttributes(from, to) {
    for (const name of Array.from(from.getAttributeNames()))if (!to.hasAttribute(name)) from.removeAttribute(name);
    for (const name of to.getAttributeNames()){
        const value = to.getAttribute(name);
        if (from.getAttribute(name) !== value) from.setAttribute(name, value);
    }
}
function morphChildren(from, to) {
    const a = Array.from(from.childNodes);
    const b = Array.from(to.childNodes);
    const shared = Math.min(a.length, b.length);
    for(let i = 0; i < shared; i++){
        const x = a[i], y = b[i];
        if (x.nodeType !== y.nodeType || x.nodeType === 1 && x.nodeName !== y.nodeName) {
            from.replaceChild(y.cloneNode(true), x);
        } else if (x.nodeType === 1) {
            syncAttributes(x, y);
            morphChildren(x, y);
        } else if (x.nodeValue !== y.nodeValue) {
            x.nodeValue = y.nodeValue;
        }
    }
    for(let i = a.length - 1; i >= shared; i--)from.removeChild(a[i]);
    for(let i = shared; i < b.length; i++)from.appendChild(b[i].cloneNode(true));
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/parse-analysis.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * The reading of `GET /agent/analysis`. The core is not imported, so the shape is written in types.ts and checked here: a body that is not what is expected is no analysis at all (the screen then says it has none),
 * never a half-filled one. Texts that came from outside are cleaned once (`clean`): a token symbol is letters, digits and a few signs, never markup.
 */ __turbopack_context__.s([
    "EMPTY_ANALYSIS",
    ()=>EMPTY_ANALYSIS,
    "clean",
    ()=>clean,
    "parseAnalysis",
    ()=>parseAnalysis
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$cycle$2d$review$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hud/parse-cycle-review.ts [app-client] (ecmascript)");
;
const rec = (v)=>v !== null && typeof v === "object" && !Array.isArray(v) ? v : null;
const num = (v)=>typeof v === "number" && Number.isFinite(v) ? v : null;
const arr = (v)=>Array.isArray(v) ? v : [];
function clean(v, max = 16) {
    if (typeof v !== "string") return null;
    const s = v.replace(/[^A-Za-z0-9._-]/g, "").slice(0, max);
    return s.length > 0 ? s : null;
}
const windowStats = (v)=>{
    const r = rec(v);
    const n = num(r?.n), up = num(r?.up);
    if (r === null || n === null || up === null || !Array.isArray(r.vals)) return null;
    const vals = r.vals.map(num).filter((x)=>x !== null).slice(0, 400);
    return {
        n,
        up,
        mean: num(r.mean),
        vals
    };
};
const group = (v)=>{
    const r = rec(v);
    const a = windowStats(r?.["15m"]), b = windowStats(r?.["1h"]);
    return a === null || b === null ? null : {
        "15m": a,
        "1h": b
    };
};
const counts = (v)=>{
    const out = {};
    for (const [k, x] of Object.entries(rec(v) ?? {})){
        const key = clean(k, 40);
        const n = num(x);
        if (key !== null && n !== null) out[key] = n;
    }
    return out;
};
function parseAnalysis(body) {
    const root = rec(body);
    const a = rec(root?.analysis);
    if (root === null || root.ok !== true || a === null) return null;
    const f = rec(a.funnel);
    const keys = [
        "consults",
        "items",
        "closed",
        "open",
        "asked",
        "applied",
        "executed",
        "failed"
    ];
    if (f === null || keys.some((k)=>num(f[k]) === null)) return null;
    const hist = rec(a.hist);
    const all = arr(hist?.all).map(num), fresh = arr(hist?.fresh).map(num);
    if (all.length !== 20 || fresh.length !== 20 || all.some((x)=>x === null) || fresh.some((x)=>x === null)) return null;
    const skipped = group(rec(a.placar)?.skipped), closed = group(rec(a.placar)?.closed), gated = group(rec(a.placar)?.gated);
    const fees = rec(a.fees), orders = rec(a.orders), spent = rec(orders?.spentToday), runtime = rec(a.runtime);
    if (skipped === null || closed === null || gated === null || fees === null || orders === null || spent === null || num(spent.buy) === null || num(spent.sell) === null) return null;
    const cycleReviews = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hud$2f$parse$2d$cycle$2d$review$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["parseCycleReviews"])(a.cycleReviews);
    const pageInfo = rec(a.cycleReviewPage);
    const page = num(pageInfo?.page), pageSize = num(pageInfo?.pageSize), total = num(pageInfo?.total), totalPages = num(pageInfo?.totalPages);
    const cycleReviewPage = page !== null && pageSize === 12 && total !== null && totalPages !== null && Number.isSafeInteger(page) && page >= 1 && page <= 10 && Number.isSafeInteger(total) && total >= 0 && total <= 120 && totalPages === Math.max(1, Math.ceil(total / pageSize)) && page <= totalPages && cycleReviews.length <= pageSize && total >= cycleReviews.length ? {
        page,
        pageSize,
        total,
        totalPages
    } : undefined;
    return {
        atMs: num(a.atMs) ?? 0,
        funnel: Object.fromEntries(keys.map((k)=>[
                k,
                num(f[k])
            ])),
        asks: arr(a.asks).flatMap((x)=>{
            const r = rec(x);
            const t = num(r?.t), p = num(r?.p);
            return r !== null && t !== null && p !== null && typeof r.ok === "boolean" ? [
                {
                    t,
                    s: clean(r.s),
                    p,
                    ok: r.ok
                }
            ] : [];
        }).slice(-40),
        hist: {
            all: all,
            fresh: fresh
        },
        timeline: arr(a.timeline).flatMap((x)=>{
            const r = rec(x);
            const t = num(r?.t), o = num(r?.open), q = num(r?.asked), p = num(r?.applied);
            return t !== null && o !== null && q !== null && p !== null ? [
                {
                    t,
                    open: o,
                    asked: q,
                    applied: p
                }
            ] : [];
        }).slice(-60),
        trips: arr(a.trips).flatMap((x)=>{
            const r = rec(x);
            const s = clean(r?.s), i = num(r?.in), o = num(r?.out), p = num(r?.pct), b = num(r?.buyAt), e = num(r?.sellAt);
            return s !== null && i !== null && o !== null && p !== null && b !== null && e !== null ? [
                {
                    s,
                    in: i,
                    out: o,
                    pct: p,
                    buyAt: b,
                    sellAt: e
                }
            ] : [];
        }).slice(-20),
        fees: {
            lamports: num(fees.lamports) ?? 0,
            fills: num(fees.fills) ?? 0,
            unmatchedSells: num(fees.unmatchedSells) ?? 0
        },
        placar: {
            skipped,
            closed,
            gated
        },
        recent: arr(a.recent).flatMap((x)=>{
            const r = rec(x);
            const t = num(r?.t);
            const kind = clean(typeof r?.kind === "string" ? r.kind.replace(/ /g, "_") : null, 30);
            return r !== null && t !== null && kind !== null ? [
                {
                    t,
                    s: clean(r.s),
                    kind: kind.replace(/_/g, " "),
                    m15: num(r.m15),
                    m1h: num(r.m1h)
                }
            ] : [];
        }).slice(-60),
        orders: {
            outcomes: counts(orders.outcomes),
            reasons: counts(orders.reasons),
            spentToday: {
                buy: num(spent.buy),
                sell: num(spent.sell)
            }
        },
        runtime: {
            tokensToday: num(runtime?.tokensToday),
            riskPct: num(runtime?.riskPct)
        },
        cycleReviews,
        ...cycleReviewPage === undefined ? {} : {
            cycleReviewPage
        }
    };
}
const EMPTY_ANALYSIS = {
    atMs: 0,
    funnel: {
        consults: 0,
        items: 0,
        closed: 0,
        open: 0,
        asked: 0,
        applied: 0,
        executed: 0,
        failed: 0
    },
    asks: [],
    hist: {
        all: new Array(20).fill(0),
        fresh: new Array(20).fill(0)
    },
    timeline: [],
    trips: [],
    fees: {
        lamports: 0,
        fills: 0,
        unmatchedSells: 0
    },
    placar: {
        skipped: emptyGroup(),
        closed: emptyGroup(),
        gated: emptyGroup()
    },
    recent: [],
    orders: {
        outcomes: {},
        reasons: {},
        spentToday: {
            buy: 0,
            sell: 0
        }
    },
    runtime: {
        tokensToday: null,
        riskPct: null
    },
    cycleReviews: [],
    cycleReviewPage: {
        page: 1,
        pageSize: 12,
        total: 0,
        totalPages: 1
    }
};
function emptyGroup() {
    const w = {
        n: 0,
        up: 0,
        mean: null,
        vals: []
    };
    return {
        "15m": w,
        "1h": w
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/parse-cycle-review.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "parseCycleReviews",
    ()=>parseCycleReviews
]);
const rec = (value)=>value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
const num = (value)=>typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000 ? value : null;
const timestamp = (value)=>typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= 8_640_000_000_000_000 && Number.isFinite(new Date(value).getTime()) ? value : null;
const contextNum = (key, value)=>key.endsWith("_asof_ms") ? timestamp(value) : num(value);
const code = (value, max = 32)=>typeof value === "string" && /^[a-z][a-z0-9_-]*$/.test(value) && value.length <= max ? value : null;
const fieldPath = (value)=>typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value) ? value : null;
const sourceField = (value)=>value === "evidence.ag" || value === "evidence.mo.ag" || value === "evidence.tm.ag" || value === "context.s1_idade_min" ? value : null;
const id = (value, max = 80)=>typeof value === "string" && /^[A-Za-z0-9:._@-]+$/.test(value) && value.length > 0 && value.length <= max ? value : null;
const canonicalKey = (value, cycleId, candidateId, inaction = false)=>value === `${cycleId}:${candidateId}${inaction ? "|inacao" : ""}` && typeof value === "string" && value.length <= 168 ? value : null;
const windowName = (value)=>value === "15m" || value === "1h" || value === "4h" || value === "24h" ? value : null;
const stance = (value, kind)=>{
    const values = kind === "buy" ? [
        "skip",
        "buy_tenth",
        "buy_third",
        "buy_two_thirds",
        "buy_full"
    ] : [
        "hold",
        "trim_third",
        "trim_half",
        "exit_all"
    ];
    return typeof value === "string" && values.includes(value) ? value : null;
};
const strings = (value, maxItems = 24)=>Array.isArray(value) ? value.slice(0, maxItems).map((entry)=>code(entry)).filter((entry)=>entry !== null) : [];
function evidenceValue(value) {
    if (value === null || typeof value === "boolean" || num(value) !== null || typeof value === "string" && value.length <= 80) return {
        ok: true,
        value: value
    };
    if (Array.isArray(value) && value.length <= 24 && value.every((entry)=>entry === null || typeof entry === "boolean" || num(entry) !== null || typeof entry === "string" && entry.length <= 80)) return {
        ok: true,
        value: value
    };
    const object = rec(value);
    if (object !== null) {
        const entries = Object.entries(object);
        if (entries.length <= 24 && entries.every(([key, entry])=>/^[a-z][a-z0-9_]{0,23}$/.test(key) && (entry === null || typeof entry === "boolean" || num(entry) !== null || typeof entry === "string" && entry.length <= 80))) return {
            ok: true,
            value: object
        };
    }
    return {
        ok: false,
        value: null
    };
}
function evidenceRecord(value, kind) {
    const object = rec(value);
    if (object === null) return null;
    const entries = Object.entries(object);
    if (entries.length > 32) return null;
    const allowed = kind === "buy" ? [
        "s",
        "n",
        "w",
        "p",
        "b",
        "l",
        "v",
        "c",
        "h",
        "t",
        "d",
        "u",
        "r",
        "m",
        "f",
        "x",
        "y",
        "o",
        "pf",
        "mo",
        "k",
        "ult",
        "wu",
        "sp",
        "inf",
        "ut",
        "lp",
        "tm",
        "i"
    ] : [
        "s",
        "wl",
        "w",
        "p",
        "l",
        "i",
        "v",
        "r",
        "m",
        "g",
        "e",
        "h",
        "c5",
        "c1",
        "n5",
        "ag",
        "pt",
        "mo",
        "tm",
        "f",
        "ult",
        "t",
        "o",
        "pl"
    ];
    const nestedAllowed = {
        mo: [
            "r5",
            "r15",
            "r1",
            "rg",
            "vr",
            "ag"
        ],
        tm: [
            "rsi",
            "rp",
            "r4",
            "r24",
            "up",
            "dd",
            "sg",
            "ag"
        ],
        ult: [
            "n",
            "m",
            "p",
            "ag"
        ],
        pl: [
            "pf",
            "e",
            "a",
            "s",
            "hl",
            "th"
        ]
    };
    const result = {};
    for (const [key, raw] of entries){
        if (!allowed.includes(key)) continue;
        const nestedKeys = nestedAllowed[key];
        const nestedRaw = rec(raw);
        if (nestedKeys !== undefined && nestedRaw !== null) {
            const nested = {};
            for (const [nestedKey, nestedValue] of Object.entries(nestedRaw)){
                if (!nestedKeys.includes(nestedKey)) continue;
                const parsed = evidenceValue(nestedValue);
                if (!parsed.ok || typeof parsed.value === "object" && parsed.value !== null) return null;
                nested[nestedKey] = parsed.value;
            }
            result[key] = nested;
            continue;
        }
        if (Array.isArray(raw) && ![
            "m",
            "f",
            "o",
            "pf",
            "t"
        ].includes(key)) return null;
        if (kind === "holding" && key === "pt") {
            if (raw === 0 || raw === 1) result[key] = raw;
            continue;
        }
        const parsed = evidenceValue(raw);
        if (!parsed.ok) return null;
        result[key] = parsed.value;
    }
    return result;
}
function freshness(value) {
    const object = rec(value);
    const status = object?.status;
    if (status !== "age_observed" && status !== "data_stale" && status !== "unknown") return null;
    const source = object?.source === null ? null : sourceField(object?.source);
    const ageMin = object?.ageMin === null ? null : num(object?.ageMin);
    if (object?.source !== null && source === null || object?.ageMin !== null && ageMin === null) return null;
    return {
        status,
        source,
        ageMin
    };
}
function finding(value, cycleId, expectedCandidateId) {
    const object = rec(value);
    const codes = [
        "input_unknown",
        "data_stale",
        "stance_diverged",
        "estimated_cost_unknown",
        "realized_fee_unknown",
        "order_uncertain",
        "outcome_unmeasured"
    ];
    const sources = [
        "brief",
        "context",
        "order",
        "fill",
        "scoreboard"
    ];
    if (object === null || typeof object.code !== "string" || !codes.includes(object.code) || typeof object.source !== "string" || !sources.includes(object.source)) return null;
    const candidateId = object.candidateId === null ? null : id(object.candidateId);
    const orderKey = object.orderKey === null ? null : canonicalKey(object.orderKey, cycleId, expectedCandidateId ?? "");
    const decisionKind = object.decision === null || object.decision === "action" || object.decision === "inaction" ? object.decision : undefined;
    const window = object.window === null ? null : windowName(object.window);
    if (decisionKind === undefined || candidateId !== expectedCandidateId || object.orderKey !== null && orderKey === null || expectedCandidateId === null && object.orderKey !== null || object.window !== null && window === null || object.code === "outcome_unmeasured" && (decisionKind === null || candidateId === null || orderKey === null || window === null) || object.code !== "outcome_unmeasured" && decisionKind !== null || !Array.isArray(object.fields) || object.fields.length > 12) return null;
    const fields = object.fields.map((entry)=>fieldPath(entry) ?? windowName(entry));
    if (fields.some((entry)=>entry === null)) return null;
    return {
        code: object.code,
        source: object.source,
        candidateId,
        decision: decisionKind,
        orderKey,
        window,
        fields: fields
    };
}
function decision(value, kind, cycleId, candidateId, inaction) {
    const object = rec(value);
    if (object === null) return null;
    const key = canonicalKey(object.key, cycleId, candidateId, inaction);
    const orderKey = canonicalKey(object.orderKey, cycleId, candidateId);
    const side = object.side;
    const atMs = timestamp(object.atMs);
    const entryPriceUsd = object.entryPriceUsd === null ? null : num(object.entryPriceUsd);
    const estimatedCostUsd = object.estimatedCostUsd === null ? null : num(object.estimatedCostUsd);
    const stanceValue = object.stance === null ? null : stance(object.stance, kind);
    if (key === null || orderKey === null || side !== "buy" && side !== "sell" || atMs === null || object.entryPriceUsd !== null && entryPriceUsd === null || object.estimatedCostUsd !== null && estimatedCostUsd === null || object.stance !== null && stanceValue === null) return null;
    return {
        key,
        orderKey,
        side,
        stance: stanceValue,
        atMs,
        entryPriceUsd,
        estimatedCostUsd
    };
}
function resultWindow(value) {
    const object = rec(value);
    const window = windowName(object?.window);
    const status = object?.status;
    if (object === null || window === null || status !== "pending" && status !== "measured" && status !== "unknown" && status !== "unmeasured") return null;
    const settledAtMs = object.settledAtMs === null ? null : timestamp(object.settledAtMs);
    const priceUsd = object.priceUsd === null ? null : num(object.priceUsd);
    const movePct = object.movePct === null ? null : num(object.movePct);
    const reason = object.reason === null ? null : code(object.reason, 48);
    if (object.settledAtMs !== null && settledAtMs === null || object.priceUsd !== null && priceUsd === null || object.movePct !== null && movePct === null || object.reason !== null && reason === null) return null;
    return {
        window,
        status,
        settledAtMs,
        priceUsd,
        movePct,
        reason
    };
}
function reviewItem(value, cycleId) {
    const object = rec(value);
    const kind = object?.kind;
    if (object === null || kind !== "holding" && kind !== "buy") return null;
    const candidateId = id(object.candidateId);
    if (candidateId === null) return null;
    const frozen = rec(object.frozen);
    const fresh = freshness(object.freshness);
    const requested = object.requested === null ? null : stance(object.requested, kind);
    const applied = object.applied === null ? null : stance(object.applied, kind);
    const decisionObject = rec(object.decision);
    const action = decisionObject?.action === null ? null : decision(decisionObject?.action, kind, cycleId, candidateId, false);
    const inaction = decisionObject?.inaction === null ? null : decision(decisionObject?.inaction, kind, cycleId, candidateId, true);
    const gateRaw = rec(object.gate);
    let gate = null;
    if (gateRaw !== null) {
        const asked = stance(gateRaw.asked, kind), gateApplied = stance(gateRaw.applied, kind);
        const conviction = gateRaw.conviction === null ? null : num(gateRaw.conviction), bar = gateRaw.bar === null ? null : num(gateRaw.bar);
        const reason = gateRaw.reason === null ? null : code(gateRaw.reason, 48);
        if (asked === null || gateApplied === null || gateRaw.conviction !== null && conviction === null || gateRaw.bar !== null && bar === null || gateRaw.reason !== null && reason === null) return null;
        gate = {
            asked,
            applied: gateApplied,
            conviction,
            bar,
            reason
        };
    }
    let order = null;
    const orderRaw = rec(object.order);
    if (orderRaw !== null) {
        const orderKey = canonicalKey(orderRaw.orderKey, cycleId, candidateId), stage = code(orderRaw.stage, 32), side = orderRaw.side, atMs = timestamp(orderRaw.atMs);
        const orderStance = orderRaw.stance === null ? null : stance(orderRaw.stance, kind);
        const reason = code(orderRaw.reason);
        if (orderKey === null || stage === null || side !== "buy" && side !== "sell" || atMs === null || orderRaw.stance !== null && orderStance === null) return null;
        order = {
            orderKey,
            stage,
            reason,
            side,
            stance: orderStance,
            atMs
        };
    }
    const resultsRaw = rec(object.results);
    if (candidateId === null || frozen === null || fresh === null || object.requested !== null && requested === null || object.applied !== null && applied === null || decisionObject === null || decisionObject.action !== null && action === null || decisionObject.inaction !== null && inaction === null || resultsRaw?.postDecisionOnly !== true) return null;
    const steps = frozen.steps === null ? null : strings(frozen.steps);
    if (frozen.steps !== null && (!Array.isArray(frozen.steps) || steps?.length !== frozen.steps.length)) return null;
    const evidence = frozen.evidence === null ? null : evidenceRecord(frozen.evidence, kind);
    if (frozen.evidence !== null && evidence === null) return null;
    const findings = Array.isArray(object.findings) ? object.findings.slice(0, 24).map((entry)=>finding(entry, cycleId, candidateId)) : [];
    const fillsRaw = Array.isArray(resultsRaw.fills) ? resultsRaw.fills.slice(0, 4) : [];
    const fills = [];
    for (const raw of fillsRaw){
        const fill = rec(raw), orderKey = canonicalKey(fill?.orderKey, cycleId, candidateId), atMs = timestamp(fill?.atMs), side = fill?.side;
        const atSource = fill?.atSource === "chain" || fill?.atSource === "ledger" ? fill.atSource : null;
        const walletFeeLamports = fill?.walletFeeLamports === null ? null : typeof fill?.walletFeeLamports === "string" && /^\d{1,30}$/.test(fill.walletFeeLamports) ? fill.walletFeeLamports : null;
        if (orderKey === null || atMs === null || side !== "buy" && side !== "sell" || fill?.walletFeeLamports !== null && walletFeeLamports === null) return null;
        fills.push({
            orderKey,
            atMs,
            atSource,
            side,
            walletFeeLamports
        });
    }
    const actionResults = Array.isArray(resultsRaw.action) ? resultsRaw.action.slice(0, 4).map(resultWindow) : [];
    const inactionResults = Array.isArray(resultsRaw.inaction) ? resultsRaw.inaction.slice(0, 4).map(resultWindow) : [];
    if (!Array.isArray(frozen.marks) || !Array.isArray(frozen.families) || !Array.isArray(frozen.triggers) || findings.some((entry)=>entry === null) || actionResults.some((entry)=>entry === null) || inactionResults.some((entry)=>entry === null) || typeof resultsRaw.fillsTruncated !== "boolean") return null;
    return {
        candidateId,
        kind,
        frozen: {
            steps,
            marks: strings(frozen.marks),
            families: strings(frozen.families),
            triggers: strings(frozen.triggers),
            evidence
        },
        requested,
        applied,
        gate,
        freshness: fresh,
        decision: {
            action,
            inaction
        },
        order,
        results: {
            postDecisionOnly: true,
            fills,
            fillsTruncated: resultsRaw.fillsTruncated,
            action: actionResults,
            inaction: inactionResults
        },
        findings: findings
    };
}
function review(value) {
    const object = rec(value), cycleId = id(object?.cycleId), atMs = timestamp(object?.atMs), frozen = rec(object?.frozen), fresh = freshness(object?.freshness);
    if (object === null || cycleId === null || atMs === null || frozen === null || fresh === null || typeof object.itemsTruncated !== "boolean") return null;
    const briefHash = frozen.briefHash === null ? null : typeof frozen.briefHash === "string" && /^(?:[a-f0-9]{16}|[a-f0-9]{64})$/.test(frozen.briefHash) ? frozen.briefHash : null;
    if (frozen.briefHash !== null && briefHash === null) return null;
    const contextRaw = rec(frozen.context);
    let context = null;
    if (contextRaw !== null) {
        const entries = Object.entries(contextRaw);
        if (entries.length > 32 || entries.some(([key, item])=>!/^[a-z][a-z0-9_]{0,23}$/.test(key) || item !== null && contextNum(key, item) === null && !(typeof item === "string" && (/^[a-z_]{1,20}$/.test(item) || key.endsWith("_fh") && /^[a-f0-9]{64}$/.test(item))))) return null;
        context = Object.fromEntries(entries);
    } else if (frozen.context !== null) return null;
    const historyRaw = rec(frozen.history);
    let history = null;
    if (historyRaw !== null) {
        const entries = Object.entries(historyRaw);
        if (entries.length > 24) return null;
        const parsed = {};
        for (const [key, raw] of entries){
            const row = rec(raw);
            if (!/^[a-z][a-z0-9_]{0,23}$/.test(key) || row === null || Object.keys(row).some((field)=>![
                    "n",
                    "acerto",
                    "medio",
                    "melhor",
                    "pior"
                ].includes(field)) || Object.keys(row).length > 5 || Object.values(row).some((item)=>item !== null && num(item) === null)) return null;
            parsed[key] = Object.fromEntries(Object.entries(row));
        }
        history = parsed;
    } else if (frozen.history !== null) return null;
    const items = Array.isArray(object.items) ? object.items.slice(0, 32).map((entry)=>reviewItem(entry, cycleId)) : [];
    const findings = Array.isArray(object.findings) ? object.findings.slice(0, 24).map((entry)=>finding(entry, cycleId, null)) : [];
    if (items.some((entry)=>entry === null) || findings.some((entry)=>entry === null)) return null;
    return {
        cycleId,
        atMs,
        frozen: {
            briefHash,
            context,
            history
        },
        freshness: fresh,
        items: items,
        itemsTruncated: object.itemsTruncated,
        findings: findings
    };
}
function parseCycleReviews(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(-120).flatMap((entry)=>{
        const parsed = review(entry);
        return parsed === null ? [] : [
            parsed
        ];
    });
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/rain.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * The columns of the quiet rain behind the screen: strings of binary and hexadecimal digits that fall slowly, a technical texture and nothing else. Decorative on purpose: the digits mean nothing and say nothing about
 * the agent. Each column is made from its own index with a fixed seed, so the same index is always the same column and a wider window only adds columns. Durations are long and every column is faint: the rain moves,
 * it never blinks, and it must never get in the way of what is drawn over it.
 */ __turbopack_context__.s([
    "RAIN_DURATION_S",
    ()=>RAIN_DURATION_S,
    "RAIN_MAX_COLUMNS",
    ()=>RAIN_MAX_COLUMNS,
    "RAIN_OPACITY_MAX",
    ()=>RAIN_OPACITY_MAX,
    "RAIN_STEP_PX",
    ()=>RAIN_STEP_PX,
    "rainColumn",
    ()=>rainColumn,
    "rainColumnCount",
    ()=>rainColumnCount
]);
const RAIN_STEP_PX = 26;
const RAIN_MAX_COLUMNS = 160;
const RAIN_DURATION_S = {
    min: 14,
    max: 38
};
const RAIN_OPACITY_MAX = 0.22;
const ALPHABET = "0101010110ABCDEF0123456789";
/** A small seeded generator (mulberry32): the same seed, the same numbers. */ function seeded(seed) {
    let a = seed >>> 0;
    return ()=>{
        a = a + 0x6d2b79f5 >>> 0;
        let t = a;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
function rainColumn(index) {
    const r = seeded(0x51ed + index * 7919);
    const length = 14 + Math.floor(r() * 18);
    let glyphs = "";
    for(let i = 0; i < length; i++)glyphs += ALPHABET[Math.floor(r() * ALPHABET.length)];
    const durationS = RAIN_DURATION_S.min + r() * (RAIN_DURATION_S.max - RAIN_DURATION_S.min);
    return {
        x: index * RAIN_STEP_PX + Math.floor(r() * 8),
        glyphs,
        sizePx: 11 + Math.floor(r() * 5),
        durationS: Math.round(durationS * 10) / 10,
        delayS: -Math.round(r() * durationS * 10) / 10,
        opacity: Math.round((0.07 + r() * (RAIN_OPACITY_MAX - 0.07)) * 100) / 100
    };
}
const rainColumnCount = (widthPx)=>Number.isFinite(widthPx) && widthPx > 0 ? Math.min(RAIN_MAX_COLUMNS, Math.ceil(widthPx / RAIN_STEP_PX) + 1) : 0;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/hud/types.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * What the command centre screen draws. `HudModel` is built from the core's status and its analysis (model.ts) and holds only what the screen shows: every text that came from outside has been cleaned once, there, and every
 * number the core did not know is null. The analysis part is optional: an older core has none, and the screen then says so instead of drawing empty charts.
 */ __turbopack_context__.s([
    "IDLE_UI",
    ()=>IDLE_UI
]);
const IDLE_UI = {
    busy: null,
    notice: null,
    confirmStop: false,
    walletPollFailed: false
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/onchain/chains.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Static metadata of the networks the desk knows by name (spec CHN-1) and the pure function that
 * turns the two API lists into the chips of a dock tab. The display order is fixed by the user's
 * request: X Layer, Robinhood, Arc, Bitcoin, Ethereum, Solana and Tron first; then Base, BNB Chain
 * and SUI; then every other network the API reported, in the API's own order and name.
 *
 * A chip is disabled only with a stated reason, and only after the corresponding list actually
 * answered: before the lists arrive nothing is disabled, because a missing answer is not a fact.
 */ /** Known networks: chainIndex, display name and the 2-4 letter badge of the chip. */ __turbopack_context__.s([
    "CHAIN_ORDER",
    ()=>CHAIN_ORDER,
    "chainChips",
    ()=>chainChips
]);
const CHAIN_ORDER = [
    {
        chainIndex: "196",
        name: "X Layer",
        short: "XL"
    },
    {
        chainIndex: "4663",
        name: "Robinhood",
        short: "RH"
    },
    {
        chainIndex: "5042",
        name: "Arc",
        short: "ARC"
    },
    {
        chainIndex: "0",
        name: "Bitcoin",
        short: "BTC"
    },
    {
        chainIndex: "1",
        name: "Ethereum",
        short: "ETH"
    },
    {
        chainIndex: "501",
        name: "Solana",
        short: "SOL"
    },
    {
        chainIndex: "195",
        name: "Tron",
        short: "TRX"
    },
    {
        chainIndex: "8453",
        name: "Base",
        short: "BASE"
    },
    {
        chainIndex: "56",
        name: "BNB Chain",
        short: "BNB"
    },
    {
        chainIndex: "784",
        name: "SUI",
        short: "SUI"
    }
];
/** Letters for an unknown chain: the first alphanumerics of the name, uppercased, 2-4 chars. */ function shortOf(name) {
    const clean = name.replace(/[^A-Za-z0-9]/g, "");
    if (clean.length === 0) return "?";
    return clean.slice(0, 4).toUpperCase();
}
function chainChips(support) {
    const apiSet = support.apiChains === null ? null : new Set(support.apiChains.map((c)=>c.chainIndex));
    const resSet = support.resourceChains === null ? null : new Set(support.resourceChains.map((c)=>c.chainIndex));
    const known = new Set(CHAIN_ORDER.map((c)=>c.chainIndex));
    const state = (chainIndex)=>{
        if (apiSet !== null && !apiSet.has(chainIndex)) return {
            enabled: false,
            reason: "Nao listada pela API do OnchainOS"
        };
        if (resSet !== null && !resSet.has(chainIndex)) return {
            enabled: false,
            reason: `Sem suporte a ${support.resourceLabel} nesta rede`
        };
        return {
            enabled: true,
            reason: null
        };
    };
    const chips = CHAIN_ORDER.map((c)=>({
            ...c,
            ...state(c.chainIndex)
        }));
    for (const api of support.apiChains ?? []){
        if (known.has(api.chainIndex)) continue;
        const name = api.name ?? `Rede ${api.chainIndex}`;
        chips.push({
            chainIndex: api.chainIndex,
            name,
            short: shortOf(name),
            ...state(api.chainIndex)
        });
    }
    return chips;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_1qo95oh._.js.map