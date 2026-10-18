# Revisão independente da proposta V2 — JEV read F5/F6

Autor nativo observado (CODEX_THREAD_ID): `01a12ada-7b55-7fd2-8a20-c940f474c1a1`, distinto do implementador `codex-inonu-system-one-safety`. Não revisei implementação de minha autoria. GPT-6.1 Sol/xhigh solicitado; modelo, esforço, tier e capacidade efetivos desconhecidos. Cópia ordinária exclusiva, sem readonly imposto pelo OS. Nenhum auxiliar. Registro UTC: 2026-10-11T20:03:19.410825+00:00.

Origem somente leitura: `C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader`. Baseline fixo `1f08e6edd589449a82eeb70638987a09572a3bd2`; árvore verificada `15b1fe6b2ac58c5821b9ab77723610d0afe780aa`. Comparação com `2d00d8f789434df83796b381900ea5ce68a9346e` sem seguir HEAD móvel. Aplicados harness/code-review e CONTRIBUTING, proporcionalmente à revisão de proposta. Recuperação da própria conversa: harness revision0, research/idle; nenhuma transição ou mutação de objetivo.

Proposta V2: `docs/JEV-READ-MODEL-SAFETY-SPEC-V2-20261011.md`, SHA256 `f16fce55851a50011239a11bbd8878c072c101035b3304e6fbba251128138262`. Status proposed/freeze pending (linha3).

## Findings e suficiência dos critérios

**Escopo PASS; suficiência proposta M1–M6 PASS.** A correção resolve a lacuna obrigatória apontada em M4 no parecer anterior. Não há nova lacuna obrigatória identificada nesta proposta; isto não certifica implementação ou testes.

| Critério | Verdict | Evidência e cobertura exigida |
|---|---|---|
| M1, SPEC:13 | PASS | Preabort com entrada elegível impede chamada e retorna hold/error, null, 0/0/1, advisory/execution never; preserva insufficient/observe. |
| M2, SPEC:14 | PASS | Cancelamento durante inferência liquida hold/error inclusive modelo ignorando sinal/nunca resolvendo; impede buy/sell posterior e exige cleanup próprio sem modificar sinal externo. |
| M3, SPEC:15 | PASS | Deadline monotônico rejeita resposta após bloqueio síncrono mesmo sem callback do timer; preserva abort interno, timeout comum e erros lançados. |
| M4, SPEC:16 | PASS | Exige total/probabilidades finitos e peso normalizado escolhido estritamente positivo. MIN_VALUE/MAX_VALUE com soma finita e buy normalizado zero retorna hold/malformed/null/0/0/1. Dois MAX_VALUE continuam rejeitados por overflow, sem rescale. Preserva ambos controles buy3:sell1 e buy3:hold1, escolha simples e rejeições anteriores. |
| M5, SPEC:17 | PASS | Preserva schema/statuses, advisory/never, resposta válida tempestiva e cópia de estado; verifica retorno e projeção pública, não apenas ocultação HTTP. |
| M6, SPEC:18 | PASS | Exige RED→GREEN incremental, afetados/typecheck e replay independente dos limites/controles originais no candidato fixo antes de commit/integração. Evidência futura, ainda não cumprida nesta revisão. |

M4 agora satisfaz “chosen action must carry weight” (`decide.ts:3,44–49`) também após normalização e evita depender do descarte por `public-view.ts:67,95`. Não introduz limiar arbitrário de confiança nem enfraquece overflow. M1/M2/M3/M5/M6 permanecem textualmente idênticos à V1.

O contrato `JEV-DECISAO-ONCHAIN-OS.md:56` exige: “Jev indisponível, atrasado ou com resposta inválida significa `hold`.” SPEC:7 mantém F1–F4, economia roundtrip, integrações e qualificação como obrigações do objetivo completo. SPEC:24 restringe produção aos seams read/validator e testes públicos; feed/state/UI e outros escritores ficam fora deste ciclo. Nenhum escopo adicional ou autorização financeira foi inferido.

## Método e limites

Leitura independente dos bytes V2, parecer anterior e contratos; comparação exata V1→V2 e dos nove blobs de baseline contra2d00d8f. A árvore e os hashes foram conferidos. Arquivos físicos atuais equivalem aos blobs apenas após normalizar CRLF para LF na memória; nenhuma alteração de arquivo/configuração. Leituras locais exit0 (incluindo chunk `6c9f5c`); a recuperação de contexto também exit0. Nenhum teste, typecheck, build, browser ou modelo executado nesta revisão de proposta. Resultados históricos F5/F6 são do relatório imutável anterior, não nova execução nem prova de correção.

Recebido Jev `a751459b-350d-4c44-bcf9-072a379f77f6` e seus detalhes estão declarados em SPEC:22; não autentiquei ou reexecutei a consulta em armazenamento privado/provedor. Seams runJevRead/validateTapeDecision são adequados à observação direta. Error para cancelamento externo e timeout para deadline interno preservam statuses e hold; conselho delegado não é resposta humana, aprovação independente ou autoridade financeira.

SPEC:30 descreve corretamente que JavaScript síncrono bloqueado não é preemptado pelo timer: o resultado vencido deve ser rejeitado quando o controle retornar. Modelo que nunca resolve deve ser liberado pela corrida de cancelamento/deadline no código futuro; cleanup e rejeições tardias exigem regressões públicas. Testes sintéticos não qualificam lucro, calibração, provedores live ou runtime Desktop.

**Terminal: PASS limitado ao escopo e aos aceites propostos desta V2/hash.** Preview clean-browser gate permanece pendente; revisão do futuro typed cycle template e freeze seguem necessários antes de produção. Não é aprovação automática de begin_cycle, implementação, commit, integração/merge main, push ou conclusão do objetivo amplo. F1–F4, roundtrip e integrações continuam pendentes. Critérios/probes anteriores permanecem imutáveis. Sem providers, inferência externa, rede financeira, signers, credenciais/.env, fundos, instalação ou alterações de fonte/teste/SPEC. Apenas este novo relatório foi escrito.

## Proveniência preservada — SHA256

| Artefato | SHA256 |
|---|---|
| V1 `JEV-READ-MODEL-SAFETY-SPEC-20261011.md` | `03f99a26a7d2432c71d38393fbd5896137cec92bff9ef84848d92073e37b6fa8` |
| Parecer V1 `jev-read-model-safety-scope-review-20261011.md` | `48afc888cd0c84f5d46af1f77ad44b493b8b2cdc76eb5dddef2e6e2e8df4fe10` |
| Regressões `jev-read-0541475-regression-review-20261011.md` | `463a69063c76c32c9543c750b023788d68be7ff9f20113e7bc4ed894b884fae2` |
| Probe `committed-jev-2d00d8f-schjw8q8/reviewer-boundary-probe.ts` | `a7a44e9482c1635bb73307e6bcc2a3c599591548442f1a0843953332c326091e` |

## SHA256 das fontes atuais

Blobs fixos idênticos byte a byte aos de2d00d8f. Coluna física mede o checkout atual, cuja diferença é somente LF/CRLF.

| Fonte | SHA256 blob Git | SHA256 arquivo físico |
|---|---|---|
| `src/jev-read/read.ts` | `100651d19f065279331b897b0134c715d23e4e07953677ba0ff3fc1180623629` | `6513732a9ecb42867b537df2944cb8d3205943e8c12bf68d100ba32139922ff3` |
| `src/jev-read/decide.ts` | `8ae4caeaec7955e811245c7af9e830ffea63c01e7c3ec59ced693c041d9b8cf0` | `37988d6b6012a84f898d712d535b44479e97becec7128ef2cb933c9849ba903f` |
| `src/jev-read/read.test.ts` | `1e8122cd66fb3eb2b6cd59d9c36c8bc12fa396936ec40025520bca9059b19e32` | `ea1d4f47b35e1b530062986e47aeaef9235827f9a4bac8b0f33ce3a9be3e9fac` |
| `src/jev-read/types.ts` | `c6966959aa9dd342d4bf83a11c0a7bcf9d95afba1a7d3b6a1ea7f54191e97c4f` | `6a07dedb9e2535e077e6da7a50a788ecef6b7b4efa5dcfe47d614c78496e8d42` |
| `src/jev-read/public-view.ts` | `8fa5323cb6772f2dacd7ad03dd929a27c8eea6e6ede246b08dbf53326dd62e81` | `9eea06df480ac9b5c647522e1213e5ce803c183fc345b2681289dcb206bc377d` |
| `docs/JEV-DECISAO-ONCHAIN-OS.md` | `0e3819b054a0a231bbb74cb445cf5a8eab0339866c1bafa17e5b33eab7ddbbb6` | `46c9a77493ebe53c24e7f82fc02c6abe9ca9e823559fa1505a95c3cfb10635c4` |
| `docs/GOAL-INONU-TRADER.md` | `968b888890679baa5b0d2d358c36d5bb7fc8ecce690e455fdcddf6da891a35fc` | `ddd733c3b9d51dc8e084a5acdd86ac5d8ac1674448fa0473aaf3266e2d90a04a` |
| `docs/WEB3-INTEGRATION-DELIVERY-SPEC.md` | `dce6610f5fdaffbe98cadd2de35f1bf84cd8a274566657e3a5d163a1d9431515` | `4ae88b6726cd0ab742c334037fc098907af0af7298d368cf374cb5cc622407ee` |
| `CONTRIBUTING.md` | `491e629c515cf69267528de649f19bcb0b3f4425a133d070487d7d4647d402f6` | `77e3d24d12c441f531b8c0311a2299edb1ff42a31460fe390153578586e6c7a1` |
