# Revisão independente 1 (T-DOC-9): parecer e disposição dos achados

Revisor: agente `Plan` distinto do implementador, 2026-10-12, contra o código, o espelho de 499 páginas e sondas de leitura. Veredito do revisor: **o SPEC não podia ser congelado antes de resolver 6 bloqueadores e os achados de texto do SPEC e do `flow-engine.md`**. A revisão 2 (esta) resolve ou dispõe de todos; o congelamento está em [FREEZE.json](../FREEZE.json).

**Violação de somente-leitura relatada pelo revisor.** O revisor escreveu três arquivos temporários com redirecionamento de shell (`now.txt` e `then.txt` na pasta temporária do usuário e `/tmp/now.txt`), todos com listas de caminhos do `git status`, nada no repositório; também deixou um `w32tm` que não ficou pendente. Conferi o conteúdo e apaguei os três arquivos. A lição para a próxima revisão: a configuração de papel não prova sandbox; revisar em cópia isolada ou instruir sem `Bash` com escrita.

**Verificado independentemente pelo revisor e por mim:** todos os 10 vetores de `flow-engine.md` estavam corretos; tipografia limpa; textos de interface sem acento; nenhuma autorização de assinatura, difusão, x402, chave privada, Agentic Wallet, SDK, Widget ou chamada paga; exportação estática viável; desvio de relógio de 76,7 s remedido; fatos F5, F6 e a origem do Kuru conferidos.

## Bloqueadores

| # | Achado | Disposição |
| --- | --- | --- |
| 1 | `startServer` não é composável (porta, hostname, estático, `config` do Kuru) | **Resolvido por implementação**: `src/desktop/core.ts` tem o próprio `Bun.serve` em loopback; ADR-1 decisão 2; OWNERSHIP seção 3 |
| 2 | A guarda same-origin cobria só `/settings` e `/onchain` | **Resolvido**: `withOwnOrigin` no núcleo vale para os quatro manipuladores; testes por manipulador; T1.6 |
| 3 | 50011 tratado como cota | **Resolvido**: API-3, API-10, API-12, AC-API-3, ADR-6 (402 = cota, 50011 = taxa); T3.4 reaproveita os códigos existentes |
| 4 | O exe carrega `.env` (que tem `PRIVATE_KEY`) | **Resolvido**: flags de build, WIN-12, CFG-2 (lista de quatro nomes), CFG-6, CFG-9, F12, F22; a fumaça varre o instalador, o exe e a pasta web atrás de valores de credenciais (0 encontrados) |
| 5 | Candidatos com lado fazem o código decidir comprar ou vender | **Resolvido**: SMT-5, ASK-4 (o modelo responde `{action, candidateId}`), ADR-3, flow-engine seções 3 e 5 |
| 6 | Tarefas editando arquivos de outras sessões; faltavam `JevStage.tsx` e `MesaView.tsx` | **Resolvido**: T3.3 e T3.4 em arquivos novos, T2.1 com `vault.ts` novo, T7.6 e OWNERSHIP com os dois arquivos |

## Majores e menores

| # | Disposição |
| --- | --- |
| 7 (U2 sem requisito, matriz) | **Resolvido**: API-13, AC-API-7 e matriz 1.1 do SPEC; o item segue `bloqueado: tela do usuário` |
| 8 (alertas e descoberta do item 15) | **Resolvido**: ASK-12, ASK-13, AC-ASK-7, T7.10 |
| 9 ("Aceitar" indefinido) | **Resolvido**: ASK-14, família token em ASK-4, T7.11 |
| 10 (parâmetros do `signal/list` nos filtros) | **Resolvido**: ASK-8 |
| 11 (varredura Jev para Inonu) | **Resolvido**: ASK-10 com escopo, T7.9 |
| 12 (três sentidos de System One) | **Resolvido**: SPEC 1.2 |
| 13 ("melhor lugar para comprar e vender" diluído) | **Resolvido**: SPEC 1.3 |
| 14 (F9 errado: o modelo foi medido no Kuru) | **Resolvido**: F9, ADR-3, PLAN seção 7; T7.3 usa `JEV_USD_PER_MTOK` até o ledger |
| 15 (enum do `leaderboard`) | **Resolvido**: API-5 |
| 16 (teste da Trade API de 60 dias) | **Resolvido**: F19, API-14, AC-API-7, T0.3, T9.5, wallet.md |
| 17 (CHN-2 só nomeava 3 redes) | **Resolvido**: CHN-2 (as 29 EVM), AC-CHN-1 |
| 18 (código de carteira existente ignorado) | **Resolvido**: F21, WAL-1, WAL-2, T9.1, T9.2, wallet.md |
| 19 (versões 4.18.1 e 4.19.0, detecção por pasta) | **Resolvido**: F5; `browser.ts` lê `Secure Preferences` (carteira habilitada) |
| 20 (WebView2 afirmado sem teste) | **Resolvido**: F4 marca a inferência; ADR-1 |
| 21 (matemática dos vetores) | **Confirmado**; `minVol` agora explícito nos vetores |
| 22 (`sz` de perpétuo em contratos) | **Resolvido**: F18, FLX-11, flow-engine seção 1, V-PERP-1 |
| 23 (aquecimento e backfill) | **Resolvido**: FLX-12, flow-engine 2.8 |
| 24 (vetores faltantes) | **Resolvido**: V-ORD-1, V-QTY-1, V-CVD-1, V-POC-1, V-ZONA-2, V-BIN-1, V-PERP-1, V-CUSTO-1, V-TRAIL-1 |
| 25 a-k (ambiguidades) | **Resolvido**: a em 2.2; b em 2.3; c em seção 1 (ATR14); d em 2.6; e em seção 3 (estados e precedência); f em 2.7; g em seção 3 (E7 modificador, denominador por ativo); h em parâmetros iniciais (cinco); i em seção 1 (inteiros exatos); j em seção 1 (volume por tick); k em seção 4 (duas estimativas) |
| 26 (AC-FLX-2 afirmava fidelidade) | **Resolvido**: reescrito como consistência interna |
| 27 (segurança e regras) | **Confirmado** |
| 28 (API-10 e ADR-6; ADR-2) | **Resolvido**: ADR-2 e ADR-6 reescritos |
| 29 (rótulo de pressão e lista de FLX-10) | **Resolvido**: FLX-10 com lista exata e valor medido; rastreador.md |
| 30 (QLT-3 sem varredura de animação) | **Resolvido**: QLT-3, T10.5 |
| 31 (export estático) | **Confirmado**; F7 reescrito (páginas e layout estáticos) |
| 32 (batimento por timer) | **Resolvido por implementação**: presença por SSE; WIN-6; ADR-1; testes |
| 33 (`Bun.secrets` assíncrono) | **Resolvido**: F20, CFG-1, ADR-2, T2.1 (cache com escrita através) |
| 34 (origem da importação) | **Resolvido**: CFG-9, T2.5, AC-CFG-4 |
| 35 (portas e `NEXT_PUBLIC_API_URL`) | **Resolvido**: F1, T0.2; export com URL relativa (feito) |
| 36 (lacunas de empacotamento) | **Resolvido**: ADR-1 itens 4 e 6; risco do `next build` registrado; `paper-supervisor-store.ts:97` anotado |
| 37 (`/console` no export, `/doctor`) | **Resolvido**: WIN-13, T1.11, nota em T1.3 |
| 38 (tabela de ondas incompleta) | **Resolvido**: PLAN seção 2 |
| 39 (T3.3 e T5.3 grandes) | **Resolvido**: T3.3 dividida em T3.9 a T3.15; T5.3 em T5.3, T5.8, T5.9 |
| 40 (T7.3 reutiliza `readRound`) | **Resolvido**: T7.3 segue `system-one/decide.ts` |
| 41 (reversões de `catalog.ts`) | **Resolvido**: ICO-2 e SMT-4 declaram a reversão |
| 42 (E7 depende de Python) | **Resolvido**: E7 em TypeScript; T5.10 |
| 43 (contagens e redações) | **Resolvido**: contagens atualizadas, "U1 a U17", F16 (`okx-parse.ts:143-147`), nota do glob de Z4 |
| 44 (clientes de assinatura faltantes) | **Resolvido**: API-2 lista os sete |
| 45 (`price-info` sem lado) | **Resolvido**: flow-engine 2.9 |
| 46 (9 canais, 16 mil, 20 chamadas) | **Resolvido**: ADR-6, rastreador.md |
| 47 (resolvedor de ícones ilimitado; AC-ICO-2) | **Resolvido**: ICO-3 restrito a imagens; ICO-4 só para linhas visíveis |
| 48 (WS não verificável sem plano) | **Aceito**: T3.7 vira especificação e chave de desligamento |
| 49 (ACs vácuos) | **Parcial**: AC-SMT-3 aceita "não medido" por decisão do usuário (não afirmar ganho sem medição); AC-FLX-4 ganha varredura em T5.5; AC-ASK-6 depende do usuário por desenho |
| 50 (`Bun.file`, IDs antigos, rotação da chave) | **Parcial**: módulos novos usam `Bun.file`; as ferramentas de documentação usam `node:fs` (aceito); T0.3 inclui girar a chave exposta; IDs antigos aparecem como "do SDD anterior" |
| 51 (matriz: tz-*, dois sentidos de "sob demanda", `dc-qr`) | **Resolvido**: regra `xl-tz`, legenda da matriz, `dc-qr` descrito como reserva |
| 52 (1160 e 500; fatos sem arquivo) | **Resolvido**: rastreador.md (485 com USDT); fatos reexecutados por mim: compilação em segundos, desvio de relógio medido, `Bun.secrets` |
| 53 (o que falta para começar) | **Resolvido**: porta 47321, AppId, chaves do registro (ADR-1), cache de logos (T3.5), ordem de descarte do Brief e contrato de `/inonu/ask` (flow-engine seção 5), linha de base (T0.5). A migração de `data/`: o app instalado começa limpo; a cota do provedor é uma só, então o teto do instalado deve ser dividido com o do desenvolvimento (a decidir em T2.3) |

## Riscos de maior peso apontados pelo revisor e situação

1. Injeção de `window.okxwallet` em janela `--app`: **ainda não provado** (T1.1, tela bloqueada); reserva OKX Connect e janela normal do Edge.
2. Um exe único montado dos manipuladores existentes sem editar arquivos quentes: **provado** (núcleo, instalador, fumaça, navegador real).
3. Economia do plano gratuito (limite de taxa, lote, camadas sem preço, 60 dias da Trade API): medições em T3.8; nada presumido.
4. Footprint pelo canal público como substituto dos dados do Profit Pro: definição operacional própria e vetores; fidelidade só por comparação manual.
5. Árvore concorrente: 110 caminhos de outras sessões intactos; integrador e conferência de data antes de editar.
