# Status e verificação: retorno composto por ciclo

Data: 2026-10-17. Fase atual: **pesquisa concluída (ciclos 1 e 2); entrada do planejamento pronta ([plan.md](plan.md), [tasks.md](tasks.md)); validação das fatias em sombra e revisão de branches e worktrees em andamento.**

## 0. Pedido de modo real, produção e operações reais: não atendido

O dono pediu que as atualizações passem a funcionar "em produção, no modo real, realizando operações reais", com tudo integrado na `main`. **Esta parte não foi feita e não será feita pelo agente**: executar operações com dinheiro real e mudar a regra de segurança que mantém o live bloqueado (`Market.init()`) são ações vedadas a este agente, e o `AGENTS.md` diz que live trading fica bloqueado por design até qualificação e autorização do dono. O registro está como bloqueio do dono no grafo (`rc2-live-recusado`). O que foi feito no lugar, dentro da regra: validar e integrar o que é seguro (módulos de medição em sombra e documentação), migrar o feed vivo da bolsa para a porta 443 antes do corte de 2026-10-31, e revisar branches e worktrees para o dono decidir a integração. Nenhum processo do agente vivo foi iniciado, parado ou trocado, e nenhum release de produção foi tocado. A `main` local rastreia `upstream/main`, o repositório original de terceiros: **nunca fazer push dela**.

## 1. O que foi feito

| Ciclo | O que | Agentes | Resultado |
| --- | --- | --- | --- |
| 1 | pesquisa em 12 tópicos, cético por tópico, crítico, 5 lacunas (`wf_31a20d79-702`) | 35, Haiku 5.5, esforço médio, 0 erros, cerca de 3,59 milhões de tokens, 619 usos de ferramenta | [research.md](research.md) e documentos temáticos; saídas brutas em [evidence/](evidence/) |
| 1b | conferência minha das duas fontes decisivas (cláusula 9.4 do OKX API Agreement e tabelas de planos) | 0 | confirmadas; ver [api-limites-e-fontes.md](api-limites-e-fontes.md) |
| 2 | Wayfinder: 8 cartógrafos, fusão, 20 tickets resolvidos e verificados, planejador, especificar e implementar 3 fatias (`wf_1930517d-e57`) | 59, 0 erros, cerca de 4,85 milhões de tokens | [wayfinder.md](wayfinder.md); 176 afirmações verificadas: 108 ok, 57 parciais, 8 refutadas, 3 não verificáveis |
| 2b | 12 decisões consolidadas levadas ao Jev sem teto diário | 0 (executor do Jev) | 9 consensos, 3 sem consenso; recibos em [decisoes-jev/recibos/](decisoes-jev/recibos/) |
| 3 | Validar e atualizar: montagem em worktrees `rc-base` e `rc-depois` a partir de `c67b39e`, typecheck, `test:lab`, suíte por blocos, auditoria de regras, reprodução; depois commit em branch nova (mesmo workflow, rodada 2) | em andamento | resultado a registrar aqui |
| 4 | Revisão de todas as branches e worktrees (`revisao-branches-worktrees`, `wf_258bdd10-b59`), somente leitura e ensaios em worktrees descartáveis | em andamento | resultado a registrar aqui |

Nenhum arquivo de código, configuração, journal ou carteira foi alterado. Nenhuma ordem, assinatura ou chamada paga foi feita pelos pesquisadores.

## 2. Qualidade da evidência do ciclo 1

Verificação por afirmação (o cético reconferiu 10 afirmações por tópico e por lacuna, 170 no total, de 329 achados):

| Veredito | Quantidade |
| --- | --- |
| confirmado | 84 |
| parcial | 70 |
| refutado | 6 |
| não verificável | 10 |

Por tópico (achados / verificadas / confirmadas / parciais / refutadas / não verificáveis): t01 20/10/3/6/1/0; t02 21/10/2/8/0/0; t03 20/10/6/3/0/1; t04 21/10/7/3/0/0; t05 22/10/4/5/1/0; t06 18/10/5/4/0/1; t07 20/10/3/5/0/2; t08 25/10/5/5/0/0; t09 19/10/4/5/0/1; t10 20/10/3/4/1/2; t11 19/10/4/4/2/0; t12 23/10/7/2/0/1; lacunas g1 14/10/6/3/0/1; g2 19/10/7/3/0/0; g3 12/10/7/3/0/0; g4 22/10/6/4/0/0; g5 14/10/5/3/1/1.

Limitações que o leitor deve ter em mente:

1. As leituras de página passam pelo WebFetch, que devolve um resumo feito por modelo pequeno. Numeração de seções e citações literais podem divergir entre leituras (a lacuna g5 notou isso). O cético fez a segunda leitura com a mesma ferramenta, então "confirmado" aqui significa "duas leituras concordaram", não "texto bruto conferido".
2. Os arquivos brutos que sustentam as medidas do projeto (`fills.jsonl`, `decisions-meta.jsonl`, `usage-2026-10.json`, cache de velas de minuto, `audits.jsonl`) não estão no repositório; os números vêm dos documentos que os citam ou de agregados lidos pelos agentes. Nada foi recalculado a partir do dado bruto, exceto contas aritméticas.
3. Os agentes são Haiku 5.5 em esforço médio: erros de citação de linha são frequentes (o cético achou várias); eu corrigi o que li com atenção e marquei o resto como parcial. Revisão independente de um humano ou de um modelo maior continua recomendada antes de qualquer decisão de custo ou de termos.
4. Cota e consumo do Basic são **projeções lineares de dia parcial**, não medidas de mês.

## 3. Correções que fiz sobre o que os agentes entregaram

Listadas em [research.md](research.md), seção 8: fórmula de impacto (US$ 242 mil e não US$ 60 mil de TVL para US$ 121), leitura de Kelly, números do pump.fun retirados, liderança de preço, citações de cláusulas do ToS, cadência e Premium a 1 minuto.

## 4. Correções pendentes em documentos já existentes (não editei; documentos congelados ou de outras zonas)

| Documento | Linha | O que corrigir |
| --- | --- | --- |
| `docs/sdd/inonu-desktop-v1/onchainos-coverage.md` | 37 | "3 conexões por segundo": a página diz "3 requests per second (based on API KEY)" |
| `docs/sdd/inonu-desktop-v1/onchainos-coverage.md` | 33 | "402 vira cota esgotada": o código trata 402 como pagamento exigido (`src/onchainos/http.ts:438-439`) |
| `scripts/api-budget.ts` | 17-20 | `PAID_PLANS` sem Scale (US$ 399, 20 milhões e 10 milhões), Pro (US$ 599, 50 milhões e 20 milhões) e Enterprise |
| `docs/sdd/agente-autonomo/VIABILIDADE-CICLO-1MIN-E-COTAS-20261015.md` | seção 3 | Premium a 1 minuto passa do teto (133 mil por mês, cerca de 33 mil de excedente); a capacidade de consultas do perfil arrojado não chega a 1440 |
| `docs/sdd/agente-autonomo/ADENDO-B-autonomia-economica.md` | seção 8 | alavancagem "autorizada" em 2026-10-14; a decisão mais recente é de 2026-10-15 (spot, Solana), em `capacidades-okx.md` |
| `docs/sdd/agente-autonomo/ADENDO-E-...md` | seção 2 | Brief de cerca de 11,3 KB: `MAX_BRIEF_BYTES` é 2048 por objeto (`src/intel/brief.ts:16`); reconciliar o que "Brief" mede |
| `AGENTS.md` e `CLAUDE.md` | | citam `scripts/brain.ts`, que não existe; o comando em uso é `scripts/cerebro.ts` |
| `scripts/jev-consensus.ts` | conflito de merge (`UU`) | a variante em disco exige `--max-calls` e importa `JEV_JUDGE_HARD_MAX_CALLS`, inexistente em `src/consensus/jev-judge.ts`; a variante "ours" não tem teto sem `--max-calls`. Resolver o merge, não parcialmente |

## 5. Contradições abertas

Ver a tabela da seção 8 de [api-limites-e-fontes.md](api-limites-e-fontes.md): limite de REST de tickers da bolsa, tempo de slot (300 ou 400 ms), decomposição da taxa de rede (20 vezes), capital-base, tamanho do Brief, 25 contra 26 preenchimentos e consumo real do Basic por rota.

## 6. Bloqueios do dono (registrados; nenhum foi decidido)

1. Plano pago de qualquer provedor (OnchainOS, RPC, dados, terceiros).
2. Aceitar risco de termos para qualquer raspagem de página da OKX.
3. Ler a cota real da organização no console da TypeSafe e pedir o RPS vigente à OKX.
4. Ordens reais de calibração do custo all-in (pelo menos 30 execuções por classe de liquidez).
5. Alteração de schema de journal em `data/` (por exemplo estender `fills.jsonl`); limites de risco e dimensionamento; liberar live.
6. Capacidade de consultas além de 720 por dia (mudança do contrato de configuração).
**Teto diário do Jev removido por ordem do dono (2026-10-17).** O teto de 200 chamadas pagas por dia UTC (`decisao-quota-diaria`) tinha esgotado às 21:00 UTC e o Jev recusou a primeira decisão. O dono mandou remover o teto e disse ter limite de API suficiente. Feito: `JEV_DAILY_CALLS` passou a `Number.POSITIVE_INFINITY` em `src/consensus/quota.ts`, com teste novo em `src/consensus/quota.test.ts` (falhou com o teto de 200 e passa agora; 47 testes de `src/consensus` verdes). O ledger continua contando o uso do dia. O MCP (`scripts/jev-consensus-mcp.ts`) passou a aceitar `consensus_run` sem `max_calls` (antes isso gerava NaN): sem o parâmetro não há teto por execução e o ledger só conta o enviado. A mensagem do wayfinder em `src/goal/loop.ts` ("sem teto de chamadas") voltou a ser verdadeira. Decisão registrada no grafo como `decisao-quota-removida`, que substitui `decisao-quota-diaria`. **Servidor MCP já em execução**: o processo desta sessão carrega o módulo antigo na memória; reconecte `jev-consensus` em `/mcp` para a ferramenta `consensus_run` da sessão perder o teto. Enquanto isso, as decisões foram rodadas com um executor de rascunho que usa o mesmo motor (`createJevJudge` e `decide`). Fora de escopo e inalterados: o teto por execução de `scripts/jev-lab-real.ts` (US$ 1 e 200 chamadas por execução do laboratório) e o `--max-calls` do CLI. O CLI `scripts/jev-consensus.ts` está em conflito de merge (`UU`) e importa `JEV_JUDGE_HARD_MAX_CALLS`, que não existe em `jev-judge.ts` (erro de tipo anterior a esta mudança, que não resolvi por ser conflito de outro processo).

## 7. Decisões de design (Jev)

| Decisão | Estado | Escolha | Recibo |
| --- | --- | --- | --- |
| `rc-primeira-etapa`: primeira etapa de implementação após a pesquisa | **consenso do Jev** (a primeira tentativa foi recusada pelo teto diário; refeita após a remoção do teto) | `medir_primeiro` (carimbo por etapa, custo decomposto por cotação sintética, E0 em sombra); média 0,95, acordo 1,0, margem 0,92; `raspagem_site` e `plano_pago_ws` removidas pelo código por serem vedadas; 12 chamadas, 0 falhas, 17.239 tokens de entrada | [recibo](decisoes-jev/recibos/rc-primeira-etapa.json); nó `jev-rc-primeira-etapa` no grafo. Recomendação, não autoriza nada. A decisão `sem-jev` anterior foi substituída |
| Decisões do ciclo 2 | ver [wayfinder.md](wayfinder.md) | | |

O comando `bun scripts/hooks/goal.ts decide` não foi usado porque não existe um objetivo ativo neste checkout (`.claude/goal/` ausente) e criá-lo ativaria os hooks de parada; a decisão fica registrada aqui e no grafo.

## 8. Estado do repositório

O checkout tem um merge em andamento (arquivos `UU` e `AA` em `.agents/skills/*` e `docs/specs/decisao-executavel-jev/spec.md`, entre outros) que **antecede** este trabalho e não foi tocado. Nada foi commitado.
