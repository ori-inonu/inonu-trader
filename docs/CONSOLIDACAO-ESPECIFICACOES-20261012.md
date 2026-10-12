# Consolidação final: especificações revisadas, trabalho concluído e pendências (2026-10-12)

Registro de evidência da etapa pedida pelo usuário em 2026-10-12: revisar a especificação de cada branch e worktree em que o trabalho foi começado, entender o que ainda faltava, concluir o que for seguro, atualizar a `main` e finalizar worktrees e branches. Continua `docs/CONSOLIDACAO-MAIN-20261011.md` (sessão GEV, integração `integ/consolidation` em `8d0611a`). Este arquivo é o checkpoint da etapa; a branch de trabalho foi `final/consolidation` (worktree `C:/Users/gabri/jev-trader-fin`).

Limites que valem para tudo abaixo: nada aqui liga execução real, abre gate, assina, envia ou publica; o estágio 3 do operador (live limitado) continua NÃO liberado (R10); nenhum push foi feito (o remoto `origin` aparece como público nas ferramentas e só o usuário autoriza publicar).

## 1. Método

1. Inventário por git (HEAD, branch, sujeira, adiante e atrás de `main`) de todos os worktrees e branches locais, e busca de trabalho fora do git: pastas do Codex que não são worktrees, arquivos soltos na pasta pessoal e o outro repositório `Documents/GitHub/jeve-trader` (repositório diferente, `ori-inonu/jeve-trader`, não tocado).
2. Cinco revisões de especificação, somente leitura, por agentes distintos de quem implementou, cada uma em cópia isolada e com a mesma regra: checkpoints são fonte, não prova; cada status vem de código e teste; toda pendência recebe uma classe. Classes: **A** implementável agora sem decisão do dono, chave, serviço externo ou dinheiro real; **B** decisão do dono; **C** bloqueada por chave, rede, dinheiro real ou execução ao vivo; **D** obsoleta ou superada. Relatórios completos em `docs/research/spec-review-20261012/` (método em `METODO.md`).
3. Pendências classe A seguras foram implementadas com TDD (teste vermelho primeiro) em worktrees próprios, e cada diff passou por revisor distinto antes de entrar. Gates só foram apertados, nunca afrouxados.
4. Antes de remover qualquer worktree, o que estava sujo, não rastreado ou ignorado foi arquivado fora do git com checagem de restauração: `C:/Users/gabri/jev-trader-archive-20261010/` (subpastas `patches`, `codex-tmp`, `codex-worktrees-nongit`, `worktree-ignored-data`, `primary-checkout`, `home-loose`, `r10-evidencia`, `feed-review-evidencia`).

## 2. Mapa: branch ou worktree, especificação, estado encontrado, destino

| Origem | Especificação | Estado encontrado | Destino |
| --- | --- | --- | --- |
| `main` (`f7be047`) | READINESS, PROFIT, OKX-DERIVATIVES, OKX-ONCHAINOS-DADOS, JEV-LABORATORIO, R1 a R9, operador R8 | base verificada | base |
| `integ/consolidation` (`8d0611a`, sessão GEV) | `CONSOLIDACAO-MAIN-20261011.md` | 19 commits sobre `main`, limpa, suíte raiz 2651 passando | base de `final/consolidation` |
| `feature/lab-real-jev` | JEV-LAB-JEV-REAL | em `integ` (`3d60949`) | em `main` |
| `docs/r10-operator-rereview` | R10 | 1 commit de docs | mesclada |
| `docs/sdd-carteira-evidencia` | SDD carteira com evidência (52 tarefas, D1 a D5) | 1 commit de docs | em `integ` |
| Codex `inonu-jev-read-safety-f5-f6` | JEV-READ-MODEL-SAFETY V2 | 100% em `integ` | removido |
| Codex `inonu-jev-tape-data-f1-f4` | JEV-TAPE-DATA F1 a F4 V2 | `integ` tinha o candidato antigo do feed; o worktree tinha a correção e 4 checkpoints de 2026-10-12 sem patch | feed novo, checkpoints e relatórios trazidos (seção 4) |
| Codex `inonu-system-one-safety` | HTTP-PREVIEW, SYSTEM-ONE-EXPOSURE | 100% em `integ` | removido |
| Codex `okx-real-integration` | OKX-ECOSYSTEM, DEFI-DISCOVERY (rascunho), PROXIMAS-ETAPAS | 240 de 251 idênticos, 11 adaptados sem perda | em `integ`; removido |
| Codex `gev-wallet-pilot` e `-ui` | piloto de carteira | `gev-wallet-pilot-ui` é subconjunto estrito do outro | em `integ`; removidos |
| Codex `jev-panel-integration` | CENTRAL-JEV | HEAD já em `main`, limpo | removido |
| Checkout primário (`feature/jev-command-center`, 108 entradas sujas) | CENTRAL-JEV, SYSTEM-ONE, R6, portfolio-evidence | overlay seletivo em `integ` (`fe28f7f`); exclusões justificadas; `portfolio-evidence` e `undefined/contract` sem destino | `portfolio-evidence` e `book-replay` entram; primário passa a `main` |
| Pastas do Codex fora do git (`inonu-operator-c4-research`, `inonu-system-one-review-*`) | notas de pesquisa e revisão | 21 notas de pesquisa só ali | notas em `docs/research/codex-operator-c4-research-20261011/`; pastas arquivadas |
| Arquivos soltos na pasta pessoal | `jev-okx-sdd-threat-model.md` e prompts e logs de auditoria | fora do repositório | modelo de ameaças em `docs/`; prompts e logs arquivados |

## 3. Resultado da revisão das especificações (DONE, PARTIAL, MISSING)

| Cluster (revisor) | Resultado resumido |
| --- | --- |
| Fita do Jev e preview (`spec-review-jev-read.md`) | MODEL-SAFETY V2 M1 a M6: 6/0/0. TAPE-DATA F1 a F4: 5/4/0. HTTP-PREVIEW P1 a P6: 4/2/0. SYSTEM-ONE-EXPOSURE E1 a E3: 3/0/0. |
| Operador (`spec-review-operador.md`) | CLI-LOCK 7/0/0; PERSISTENCE 4/1/1; MODEL-BOUNDARY 4/0/0; DECISION-BOUNDARY 3/0/0; ROUNDTRIP 1/5/6 (proposta nunca congelada); R10 C1 a C9 e N23: 2/5/2. Nada mudou no código do operador entre `f7be047` e `8d0611a`. |
| Painel e interface (`spec-review-central-ui.md`) | ACCEPTANCE C1 a C6 2/3/1; MOBILE-FIX 3/0/0; EXECUTION-COPY 4/0/0; LEDGER 3/0/0; MESA 7/0/0; INONU-DESIGN-SPEC 2/5/0 (e 1 superada); demais N-A ou concluídas. |
| Integração real, piloto, DeFi (`spec-review-real-pilot.md`) | real-integration G01 a G17 2/14/1 (subespecificações 43 DONE); piloto P1 a P7 5/2/0; PROXIMAS aceite PC1 a PC6 6/0/0 e plano E0 a E6 0/3/3; rascunho DeFi G1 a G8 0/6/2; DADOS D1 a D27 27/0/0; derivatives D1 a D17 17/0/0. |
| Feed novo da fita (`spec-review-feed-bounded-recovery.md`) | defeitos A e B, os dois P2 de overflow e de recibo inválido e a promoção sem histórico: corrigidos e reproduzidos. Um P2 aberto (F1, ver 5.1). Sem caminho de execução. |
| Carteira com evidência (revisão própria) | SDD: O0 feito; O1 e partes de O2 e O4 implementadas em `src/portfolio-evidence` (184 testes, manifesto 30 de 30); O2 restante, O3, O5 a O8 não iniciados e dependem de D1 a D5. |

Gates de execução (varredura determinística da árvore final): primitivas de assinatura e envio existem só em `src/operator/executor.ts`, `src/okx-wallet/solana-signer.ts` e `src/market.ts` (fechados por padrão) e em scripts de sonda do autor original idênticos aos de `main`; nenhum módulo novo (`src/real`, `src/pilot`, `src/dashboard`, `src/portfolio-evidence`, `src/jev-read`, `src/lab-jev`, `web/src`) assina, envia ou aprova. Todo servidor novo escuta só em `127.0.0.1`; o servidor original do trader (`src/server.ts`) escuta em todas as interfaces fora do modo preview (decisão do dono, 5.2).

## 4. Concluído nesta etapa

Tudo em `final/consolidation`, sobre a `integ/consolidation` de `8d0611a`:

| Item | Commits | Evidência |
| --- | --- | --- |
| R10, re-revisão independente do operador (estágio 3 não liberado) | `1dfef8a`, merge `309fcf5` | 185 testes, 96 mutações (80 pegas) |
| Feed da fita com recuperação limitada, vindo do worktree Codex (corrige perda de cobertura do fluxo, marca d'água futura, overflow de 257 pendências e recibo com relógio inválido) | `ae5453e` | 187 testes em `src/jev-read` (170 antes); revisão independente REQUEST_CHANGES com um P2 (F1, 5.1), reproduzida em 12 execuções sem oscilar |
| Checkpoints de 2026-10-12, relatórios de revisão do Codex e 21 notas de pesquisa que só existiam fora do git; modelo de ameaças JEV + OKX; replay do livro (perfil 4) | `e319af4`, `7616330`, `b7b4c6b` | arquivo com checagem de restauração |
| `src/portfolio-evidence` (O1 mais leitura OKX, store e coletor) | `8786fd6` | 184 testes; manifesto 30 de 30; revisão independente APPROVE_WITH_NOTES (sem P1, 5 P2, 15 P3), 97 de 108 mutações pegas |
| Mesa: ciclo sintético, mock ou de origem não declarada do System One não aparece como ao vivo | `14a14cd` | teste vermelho primeiro; 48 testes da mesa |
| `.gitignore` cobre `.env.*` (o `.env.operator`, onde o guia manda pôr a chave, não era ignorado) | `e39c669` | `git check-ignore` |
| Web: 65 pontos medianos removidos do texto renderizado (regra congelada) e teste que varre todas as fontes de `web/src` | `1e67f89` | teste vermelho com 47 violações; texto do DOM de `/` e `/console` com 0 ocorrências dos três caracteres |
| Operador, 14 commits (reconcile com resultado único, final e limitado a 2 x o plano; `--realized` obrigatório; retry do `persistCycle`; STOP que falha fechado; token em tempo constante; faixas do `parseLedger`; comparação do endereço da chave; docs) | `256f5d4` a `a47f5ae`, merge `67b2aa2` | 158 para 210 testes; revisão independente APPROVE_WITH_NOTES, gate afrouxado: não; 3000 ledgers do código antigo lidos sem erro |
| Operador, P2-1 e imprecisões do guia (o valor lançado é final; passo de correção manual do ledger) | `45d28f9` | 210 testes |
| Integração real e web, 7 commits (`.env` não chega aos filhos do console; Host de loopback com 421; testes estáticos de isolamento de `src/real` e `src/pilot`; portas do piloto por env; teste de revisão de proposta no glob congelado; "Ordem enviada"; `NEXT_PUBLIC_EVM_RPC_*` chega ao navegador) | `5085012` a `6a9e356`, merge `3b3c7bf` | revisão independente APPROVE_WITH_NOTES, gate afrouxado: não; vazamento reproduzido no código antigo e fechado no novo; 63 de 78 formas de Host hostil recusadas; 105 de 120 mutações pegas |
| Relatórios das revisões e este registro | `cdbd5af` | `docs/research/spec-review-20261012/` |

Verificação da árvore final (`cdbd5af`, máquina sem outra carga): typecheck da raiz e do web sem erro; raiz 2983 testes passando, 2 ignorados (recibos, abertos por `RECEIPT_SAFETY_SOURCE`), 0 falhas (146 s); web 1280 passando, 0 falhas; build de produção ok (`/`, `/_not-found`, `/console`). Conferência visual com a árvore servida em portas próprias (backend em paper e mock, Next em desenvolvimento): a Mesa e o console carregam, o texto renderizado tem 0 ocorrências de ponto mediano, travessão e meia-risca, não há estouro horizontal em 1280, 390 e 320 de largura, e as linhas de capacidade mostram estado honesto (System One, Jev lendo a fita, carteira e OnchainOS bloqueados quando não há dado). Os 404 do console do navegador são as rotas `/jev-read`, `/system-one` e `/operator*` sem produtor gravando, o estado ausente previsto.

## 5. Pendências

### 5.1 Classe A que continua aberta (implementável sem decisão do dono, ainda não feita)

Cada item tem o menor passo e o teste de aceitação nos relatórios de `docs/research/spec-review-20261012/`.

- **Feed da fita, F1 (P2).** O envelope mínimo e máximo dos itens descartados mistura um timestamp futuro com histórico válido (`src/jev-read/feed.ts`, por volta das linhas 652 a 655 e 689 a 694): com um timestamp de fonte no futuro e 256 ou mais amostras válidas entre duas leituras, o livro fica `book_missing` até `stop()` e `start()`. Falha fechada (0 consultas ao Jev). Corrigir excluindo futuros do envelope; reprodutor em `jev-trader-archive-20261010/feed-review-evidencia`. Mais as lacunas de teste M02, M10, M20, M26, M30, M31, M34 e M36 do relatório de revisão.
- **Fita e preview.** Asserções M2 e M3 de `read.test.ts` (limpeza de listener e timer, sinal do chamador intacto); teste de `presentFeed` com modo `read_only`; endurecer o flake de `http-preview.test.ts` (filho com kill fixo em 8 s); remover `FUTURE_TOLERANCE_MS` (código morto, contradiz F1 de tolerância zero); testes de flags e `--help` do `jev-read`, token acolchoado e as dicas "bun run jev-read --jev" que omitem a chave (o script usa `--no-env-file`); migrar os 195 controles independentes do revisor para testes do repositório; refazer a prova visual de P6.
- **Operador.** A-16 (aperta gate, só com revisão distinta): teto de gás aplicado ao valor enviado (N13), checar o RPC antes de `recordExecution` (N14), uma só escrita final da perna concluída (N24). A-17: o mesmo retry de rename em `scripts/system-one.ts`, `src/jev-read/store.ts`, `src/lab/journal.ts` e `src/onchainos/capture.ts`. Testes de R23 e R36 (CLI sintético com os gates de env abertos), L05, L06 e Y04. Confirmação ou limite menor para um `--realized` positivo (erro de sinal dentro de 2 x o plano apaga a parada diária). O prazo de decisão de até 30 s deixa a cotação chegar a cerca de 45 s ao virar plano; o CLI imprime "Nenhum candidato elegível" quando o prazo estoura.
- **Painel e interface.** Base de API própria para o RealPipeline; contraste do token `--ink-4` (3,0 a 3,5 para 1 como cor de texto em 10 seletores, abaixo de 4,5 para 1); copy "5 segundos", contradição README:75 contra :69, loader, parser e error boundary de `/operator`, guarda de fixtures, arquivar `docs/evidence` do primário.
- **Integração real e piloto.** Fronteira legada de DeFi em `src/operator/candidates.ts` (identidade, `quoteAgeMs` 0, custo completo só com a taxa de entrada), com teste vermelho primeiro; rebaselinar E0 do PROXIMAS-ETAPAS; lote de docs (5 links quebrados, cabeçalhos desatualizados, README sem piloto, real e reports, GUIA-LOCAL); texto do catálogo de pagamentos; sondas de pesquisa com caminho fixo; testes que fixem a ligação de `real-start.ts` e `real-console.ts` (o código está correto e foi provado ponta a ponta, mas as mutações X01, X02, X03 e X07 sobrevivem). Deploy: o override `NEXT_PUBLIC_EVM_RPC_*`, antes morto, agora vale; se a Vercel tiver essas variáveis com URL que carregue chave de provedor, ela passa a ir ao navegador.
- **`portfolio-evidence` (P2 do parecer).** O cache devolve evidência `valid` e `fresh` além de `maxAgeMs`; o instante do preço é gravado e nunca avaliado; campos de risco ilegíveis falham abertos; `sumIncluded` descarta em silêncio valores acima dos limites de `parseDec`; lacunas de teste M08, M35, M63, M64, M84 e M71. P3 principais: `--api-key=` e `--address=` ecoados em stderr (`cli.ts:71`), retentativas fora do teto, `plan` sem os endpoints de mercado, `origin` afirmada pelo chamador. Os P2 não bloqueiam o merge e nada importa o módulo hoje; bloqueiam que uma camada superior confie em `status: valid` ou no patrimônio.

### 5.2 Classe B: decisões do dono (com a recomendação das revisões)

**Operador e estágio 3 (R8 D1 a D8, R10)**
- D1 política do repositório: o operador herda o bloqueio de `Market.init` até a revisão independente final e as quatro condições de D11. Recomendação: herdar.
- D2 STOP e prazo no meio do plano: parar só as entradas (aprovação 1 e perna 1) e dar à saída janela própria (`OPERATOR_EXIT_WINDOW_MS`, hoje 0). Recomendação: 60000 ms.
- A1 e N1, perna 2 presa por seleção adversa (tolerância zero contra a cotação do candidato): orçamento de perda por plano (`plan.maxLossUsd`, hoje ignorado) mais pré-verificação da perna 2 antes de qualquer envio; ROUNDTRIP: requote da perna 2 com perda máxima limitada.
- C2 decodificar receiver e minReturn das rotas permitidas (`uniswapV3SwapToWithBaseRequest`, `unxswapToWithBaseRequest`, ABI okxlabs commit `1fc1508`) e excluir rotas opacas. Recomendação: decodificar.
- D3 exposição: `GET /` do trader devolve a carteira com CORS `*` (`src/server.ts`) e `/operator*` escuta em todas as interfaces. Recomendação: remover o campo, escutar em `127.0.0.1` e usar proxy autenticado em qualquer implantação.
- D4 carteira dedicada com teto (100 USD no estágio 3), chave só em `.env.operator` (agora ignorado) e `.env.operator.example` separado, quem cria o STOP. D5 autonomia: manter reconciliação manual no estágio 3. D6 tetos duros para perda semanal, drawdown, taxa e custo por transação (perfil standard 15 e 30 USD). D7 origem de routers e spenders: conferência no explorer agora. D8 rotação do journal e pastas separadas para saída sintética e real.
- Perfil micro 5% contra 1% do R3; manter ou retirar o diagnóstico `observedBalanceDeltaUsd` (nulo no CLI real).

**Fita do Jev**
- Teto de 5000 negócios por minuto (hoje falha fechada): manter e medir. Funding com TTL de 120 s igual ao refresh de 120 s: refresh de 60 s. Destino do probe imutável que sai 1 por fixtures legadas: aceitar os controles migrados e arquivar o probe. Teto de consultas, custo e instrumentos do Jev real (o prompt fixa 20 bps).

**Interface e narrativa do demo**
- Rota e narrativa: a raiz é a Mesa e não cita a Kuru nem os 300 ms; a Central Jev dos critérios C2 a C6 está em `/console`, sem link e fechada num details. Recomendação: Mesa na raiz, link visível para o console e uma linha honesta de que a ordem na Kuru está bloqueada.
- `/central` e construtor de autorização: adiar. Aplicabilidade de INONU D2, D3 e D6 ao desenho atual. Nome GEV contra Jev no piloto. Uma base de API ou várias. Produtor Jev contínuo. Inspeção humana de acessibilidade.

**Integração real e piloto**
- O Jev do runtime real só decide hold e não tem candidatos (G09 e G10 não são atingíveis nem com credenciais): aceitar e emendar a especificação. Remover a pilha duplicada de scanner da raiz (sete assinadores HMAC). Adaptador real do piloto via `src/real/core`. Fatia mínima do rascunho de descoberta DeFi. Extensões sempre desligadas. Replay do livro (perfil 4) fica arquivado em `docs/sdd/book-replay`, sem implementar agora. PROXIMAS E1 a E6: só E0. Portar o endurecimento de recibos (2 testes ignorados, `src/market.receipt.test.ts` e `src/trader.receipt.test.ts`, abertos por `RECEIPT_SAFETY_SOURCE`; o código está no commit `ee4249d`, ramo `hermes/release-v0.0.2-receipt-safety`, que continua alcançável pelo histórico de `main` mesmo sem o nome da branch).

**Carteira com evidência (SDD)**
- D1 aceitar, reordenar ou substituir os objetivos 2 a 8. D2 como o Jev vê dados da carteira (agregados sem endereço, ou consentimento granular). D3 fonte de histórico, preço e custo de aquisição (credenciais OKX, importação local ou só RPC). D4 destino do `valuation-diagnostics` (já em `main`, sem consumidor). D5 moeda (USD) e tolerância (0,01 USD é o padrão do módulo).

**Do dono e do ambiente**
- Chaves do OKX Developer Portal em `data/onchainos.env`; capturas reais para o laboratório; orçamento e chave de inferência do Jev real (`data/jev.env`); teste autenticado de menor valor (C8); medição em shadow da latência e dos pesos do Jev (C9); publicar (push) e CI.

### 5.3 Classe C: bloqueadas

Credenciais Web3; conexão real da carteira com conta real; consumo do Jev pelo app (`TYPESAFE_AI_API_KEY`, custo desconhecido); ordem na Kuru por bloco e qualquer execução (D11); publicar na Vercel; qualificação G01 a G17; saldo por RPC no `--reconcile`; bytecode dos routers; eco de slippage; CI (exige push); reconciliação on-chain automática; unidade da saída da DEX; entitlements e Agentic Wallet/x402.

### 5.4 Classe D: obsoletas ou superadas

Cabeçalhos "Proposed" de especificações já implementadas; checkpoints intermediários; worktree `gev-wallet-pilot-ui` (subconjunto estrito); MODEL-SAFETY V1 (superada pela V2); edições antigas do primário em `src/system-one` (a `main` já bloqueia funding desconhecido); flake do `okx-defi` "D5/D7" (falha imediata de `spawnSync` com `ETIMEDOUT`, 0,11 s, só em suítes completas grandes com a máquina carregada por vários agentes; reproduziu na branch do laboratório e na integração da outra sessão e não em `f7be047`; não reproduz com a máquina quieta: suítes completas limpas na integração, 2651 passando, na árvore final, 2983 passando, e nos dois branches de endurecimento, 2931 passando; hipóteses descartadas por experimento: poluição pelos testes novos, relógio do `spawnSync`, volume ou vazamento de handles; a nota de pesquisa do Codex em `docs/research/codex-operator-c4-research-20261011/full-suite-failure-research.md` registra interferência anterior entre `Bun.spawnSync` com timeout e `node:child_process.spawnSync`; se voltar, rodar a suíte com a máquina quieta antes de tratar como regressão).

## 6. Estado final

[PREENCHER ao fim]
