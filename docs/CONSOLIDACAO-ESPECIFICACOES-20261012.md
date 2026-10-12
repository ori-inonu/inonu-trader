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

[PREENCHER ao fim com hashes e evidência]

## 5. Pendências

### 5.1 Classe A que continua aberta

[PREENCHER ao fim]

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

Cabeçalhos "Proposed" de especificações já implementadas; checkpoints intermediários; worktree `gev-wallet-pilot-ui` (subconjunto estrito); MODEL-SAFETY V1 (superada pela V2); edições antigas do primário em `src/system-one` (a `main` já bloqueia funding desconhecido); flake do `okx-defi` (falha imediata de `spawnSync` com `ETIMEDOUT` só em suítes grandes sob carga; não reproduz com a máquina quieta, três suítes completas limpas depois disso).

## 6. Estado final

[PREENCHER ao fim]
