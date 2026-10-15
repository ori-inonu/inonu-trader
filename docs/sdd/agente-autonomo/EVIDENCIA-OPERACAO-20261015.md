# Evidência de operação e achados de comportamento (2026-10-15)

Escopo: medir a observação de 24 h do artefato qualificado e registrar o que o histórico real mostra sobre o comportamento do agente. Nada aqui altera o agente vivo. Qualquer mudança de decisão exige novo build e qualificação da Codex (decisão do dono: aguardar qualificação).

## 1. O medidor

`scripts/observe-24h.ts` (55 testes em `scripts/observe-24h.test.ts`). Somente leitura: não escreve no home do agente, não chama rota POST, não toca processo. Escreve só em `--save`, fora do home.

```
bun --no-env-file run scripts/observe-24h.ts --home <home do agente, caminho físico> [--since <ms ou ISO>] [--gap-min 15] [--forgotten-min 10] [--save <arquivo fora do home>]
```

Padrão de janela: o início da observação, 2026-10-15 11:27:53 local (primeiro `/health` do núcleo hospedado pelo Agendador). Sai com 0 quando não há achado e com 1 quando há. Um relatório limpo não é notícia; um achado é.

| Item da seção 6 do runbook | Como é medido | Limite honesto |
| --- | --- | --- |
| Disponibilidade | silêncios entre ciclos do ledger e entre escritas de `equity.jsonl`; reinícios do log do núcleo; `/health` só como amostra | um `local_core_started` sem `stopped` antes é reinício não limpo, tempo parado desconhecido; um silêncio só é "explicado" quando um intervalo conhecido de desconectado ou pausado o cobre |
| Recuperação e recibos | estágio final por `orderKey`; `incerta` que virou `executada` ou `falhou`; `incerta` esquecida acima do limite | queda de energia e reinício do Windows só são provados por um reinício real |
| Ordem duplicada | duas verificações separadas: a mesma chave enviada duas vezes, e um novo `enviando` no mesmo ativo e lado enquanto a anterior não foi resolvida | não verifica a posição on-chain, só o ledger |
| Qualidade das decisões | ciclos por resultado e motivo, ciclos com candidatos descartados, validade do brief, latência da resposta | não mede se a decisão foi boa |
| Comportamento | compras logo após venda do mesmo ativo (`churn`), recusas repetidas do mesmo candidato (`repeated_refusal`) | limiares de 3 |
| Qualidade de dados | **não medido**: o brief não grava idade por fonte nem deriva de relógio; falhas de provedor só aparecem como motivo de ciclo não decidido | listado em `notMeasured`, nunca omitido |
| Ganho | **não medido**; a ferramenta mede operação | |

### 1.1 Correções depois da revisão de leitura da Codex (nota 181)

Cada uma entrou com teste que falhava antes; cinco mutações deliberadas do código foram todas pegas pelos testes.

- **Ordem pendente sem linha de envio reconhecida** não some mais: uma última linha `incerta` ou `enviando` sem `enviando` anterior aparece em `unsettled` com `sendRecorded: false` (origem desconhecida) e, se velha, em `forgotten`.
- **Dois envios no mesmo milissegundo** são ordenados pela posição de gravação no ledger (append-only). Recibo gravado antes do segundo envio desfaz a sobreposição; gravado depois, não.
- **Cobertura por arquivo** (`coverage` no relatório): ledger, equity, briefs, decisions-meta, state e log do núcleo são obrigatórios; um arquivo ausente ou vazio vira `file_missing` (janela desconhecida, nunca limpa) e linha malformada em QUALQUER arquivo vira `malformed_lines` com o nome do arquivo. `fills.jsonl` ausente não é achado (nunca houve preenchimento).
- **`netUsd` virou `cashFlowUsd`**, com o aviso no código: é fluxo de caixa dos preenchimentos da janela, sem taxa nem custo-base, pode incluir perna anterior à janela, e **não é resultado nem PnL realizado**. Não deve entrar no Brief nem na memória como tal.
- **Janela fechada:** linhas com horário depois de agora (tolerância de 5 s, o `agora` é lido depois dos arquivos) ficam fora de todas as contagens e somam em `temporalConflicts`; uma resposta anterior à pergunta é conflito, não latência. Qualquer conflito vira o achado `temporal_conflict`.
- `maxBytes` virou `maxLength` (caracteres), pelo motivo da nota acima.

### 1.2 Alocação e velocidade (pedido do dono, ADENDO-H)

O dono quer crescer o patrimônio agregado por diversificação e gestão ativa, com reação mais rápida que 2 min, e que se meça patrimônio, concentração, cobertura e latência, não só caixa ocupado ou número de ordens. O medidor passou a trazer a seção `allocation`, antes de qualquer mudança de critério, para haver linha de base:

- **Carteira** (`allocation.portfolio`, de `equity.jsonl`): participação do caixa em stablecoin, número de posições reais (não stablecoin, de pelo menos US$ 1; gás e poeira não contam), maior posição, concentração (`hhi`, soma dos quadrados dos pesos, 1 = tudo em um ativo), minutos da janela com 80% ou mais em caixa (uma pausa maior que 15 min entre duas amostras conta só 15) e ativos com unidades e sem preço, que ficam à parte e nunca viram "valor zero".
- **Cadência** (`allocation.cadence`): mediana, p90 e pior intervalo, em segundos, entre ciclos consecutivos. É o piso da velocidade de reação; um trecho desconectado ou uma queda de energia só infla o pior intervalo.
- **Cobertura** (`allocation.coverage`): quantos candidatos de compra e quantas posições o modelo vê por ciclo. Não diz nada sobre o tamanho do mercado por trás.
- **Taxa de rede** (`allocation.networkFees`): soma, em SOL, das taxas dos preenchimentos reais da janela. É custo, não resultado.

Linha de base lida em 15/10, janela de 0,61 h desde o início da observação: caixa em stablecoin entre 90% e 91% do patrimônio de US$ 118,17 a US$ 118,80, **uma** posição real (EMBER, 10% do total), `hhi` 0,82, quatro ativos sem preço (poeira); cadência mediana de **136 s** (p90 152 s, pior 167 s); o modelo vê **7** candidatos de compra e 2 posições por ciclo. Nas 18 h anteriores (desde 14/10 21:00 UTC): caixa entre 70% e 92% (média 87%), cerca de 11 h com 80% ou mais em caixa, 17 preenchimentos com 0,0029 SOL de taxa, cadência mediana de 129 s.

Limites, sem atribuir causa: o arquivo não registra depósitos e saques, então a variação de patrimônio da janela (`markToMarketChangeUsd`: +US$ 0,62 na janela atual, −US$ 2,26 nas 18 h) mistura marcação, operação e fluxo externo e **não é resultado**; não se registra o tamanho do universo atrás dos 7 candidatos nem o horário do evento de mercado que motivou cada decisão, só a cadência e o tempo de resposta do modelo. O caixa alto é um fato medido, não uma conclusão sobre por quê: nenhuma decisão aqui é atribuída a uma regra.

## 2. Linha de base (início da observação)

Primeira execução, 0,13 h de janela: núcleo reiniciado limpo uma vez (a segunda troca, 30,3 s), 3 ciclos `decidido`, nenhuma ordem enviada, 3 briefs válidos (o maior com 12.594 caracteres: o campo `briefBytes` é `JSON.stringify(brief).length`, não bytes UTF-8), latência mediana de resposta 441 ms, sem achados. Esses números são da versão do medidor anterior às correções da seção 1.1. O que isso prova é só que o medidor roda contra os arquivos reais e que a janela começou limpa.

## 3. O que o histórico real mostra (rodando o mesmo medidor desde 2026-10-14 21:00Z)

Prova de que o medidor não é vazio: sobre as 17,6 h anteriores ele devolve achados reais.

1. **Silêncio de 371 min sem explicação** no ledger e de 373 min no equity, de 14/10 22:59 a 15/10 05:10 (hora local), antes de o executor atual existir. Nenhum intervalo de desconectado ou pausado o cobre; os arquivos do agente não dizem a causa, mas o log de eventos do Windows diz (o medidor passou a lê-lo, somente leitura, e a nomear a causa como `host_power_loss`): desligamento inesperado às 22:59:53 (Kernel-Power 41), nova partida às 23:05:30, suspensão da máquina de 23:49:26 a 04:04:24 (Power-Troubleshooter), e o agente só voltou por volta de 05:10. **Correção do que eu tinha escrito antes:** a sessão do usuário foi aberta às 23:06, um minuto depois da religação (`query user`), e mesmo assim o agente não voltou, porque naquela noite não existia nenhum início automático: a tarefa de logon antiga foi registrada em 15/10 (a descrição diz "autorizado pelo dono em 2026-10-15"; `LastRunTime` 05:51 e o `autostart.log` só começa às 05:16). A falha de ontem foi falta de início automático, não falta de login. Hoje o início automático existe, e o que ele ainda não cobre é uma queda de energia com ninguém para entrar na conta. O `autostart.log` do watchdog antigo mostra ainda cinco saídas do núcleo com código −1, a cada cerca de 8 min, entre 05:43 e 06:26 locais de 15/10; o medidor atual não lê esse log. Dois reinícios não limpos no log do núcleo: 14/10 19:44 e 15/10 11:20 (este é o corte do PID 25532 que eu fiz na primeira troca: parada forçada, sem linha `stopped`).
2. **Vai e volta no mesmo ativo (`churn`).** Em 14/10, 21:18 a 21:47, o Jev comprou STONK com `buy_full` (alvo 5%) e vendeu com `exit_all` dois minutos depois, cinco vezes seguidas (`source: modelo` nas duas pontas). Comprado US$ 67,00, vendido US$ 66,84: líquido −US$ 0,16 mais taxa de rede de cerca de 0,0003 SOL por troca, 12 trocas. A janela da execução acima mistura uma perna anterior e por isso mostra `netUsd` positivo para STONK; o número que vale é o do laço completo acima.
3. **Recusa repetida (`repeated_refusal`).** MANIFEST recusado 5 vezes por `impacto_alto` entre 11:08 e 11:17 de hoje, BOTTLE 3 vezes entre 10:12 e 10:17, CARDBACK 4. A recusa é do guarda de código antes de qualquer envio (sem custo on-chain), mas cada tentativa consumiu um ciclo e uma consulta ao modelo; o Jev não recebe a informação de que o candidato foi recusado nos ciclos anteriores.
4. **Compras e o preço depois (amostra pequena, não conclusiva).** Há 8 compras reais; 7 têm preço de liquidação em 4 h (a de EMBER, de hoje, ainda não). A primeira de STONK subiu 1,9% em 4 h e as outras seis ficaram entre −5,8% e −9,7% (HOTBOT −9,7%, as cinco de STONK perto de −6%). São 2 ativos nas sete; isso é uma observação, não uma estimativa de que o agente compre em topo.

## 4. O que já está no build vivo e o que falta (corrigido depois de conferir o código)

A primeira versão deste documento propunha dar ao Jev os fatos que lhe faltavam. Conferi antes de a Codex enfileirar e **a metade do vai e volta já existe**:

- **Vai e volta (`churn`): já tem os fatos no build vivo.** O laço do STONK foi em 14/10, 21:18 a 21:47. Os commits `37973e6` (histórico fechado por ativo, `ult`, nos candidatos de compra) e `fe9558c` (critérios que respeitam saídas recentes) são de 15/10, 05:14 e 05:17, depois do laço. O bloco `execucoes` do brief já mostra ao Jev as últimas voltas reais com minutos segurados e resultado: hoje `STONK 2 min −0,08%`, `STONK 2 min −0,21%`, `STONK 3 min −0,29%`, com a legenda "Fees and short trades cost real money". A leitura de bytes do `InonuTrader.exe` do release24 confirma que `tokenTrips` e `EXEC_LEGEND` estão compilados nele. Desde o fim do laço, cerca de 14 h, não houve nova recompra logo após venda. **Não afirmo causa**: é uma observação, o campo `ult` ainda não apareceu em nenhum brief real (nenhum candidato com volta anterior voltou à lista nos 120 briefs lidos) e o medidor segue contando `churn` para flagrar se voltar.
- **Recusa repetida (`repeated_refusal`): a correção existe só na árvore de trabalho.** `src/agent/entry-cost.ts` (outra sessão) cota a compra antes de oferecê-la ao Jev. O release24 **não** a contém (nenhuma ocorrência de `entryCost` no executável; `buyCostCapPct`, que é a regra do executor, sim). Entra no vivo só com build novo e qualificação da Codex.

Princípio mantido: o código descreve, o Jev decide; nenhuma regra dura que vete o modelo. Como medir: as mesmas duas métricas do medidor (`churn` e `repeated_refusal`) em janelas comparáveis. Sem medição, o documento não afirma ganho.

## 5. Reprodução

Os números das seções 2 e 3 saem de `observe-24h.ts` sobre `ledger.jsonl`, `fills.jsonl`, `equity.jsonl`, `briefs.jsonl`, `decisions-meta.jsonl`, `state.json`, `budget.json` e os logs `local-core.log` e `local-supervisor.log` do home do Claude (caminho físico do pacote). A parte 4 da seção 3 vem de cruzar `fills.jsonl` com as liquidações de `scoreboard.jsonl`.

## 6. Reinício real de 15/10 (12:14), lido pelo medidor

O dono pediu um reinício do Windows com ele no PC. O medidor leu `recovery.logonProven: true` (início de núcleo sem `stopped`, watchdog novo 14 s antes, ciclo `decidido` 22 s depois do núcleo) e a conferência por fora confirmou núcleo único no caminho durável com o mesmo SHA256, estado conectado sem `connect`, `plans.json` e `config.json` idênticos e ledger só acrescentado. Linha do tempo e limites (login manual, reinício e não corte de energia, nenhuma ordem em voo, entrada automática ainda desligada) em `PASSAGEM-ARTEFATO-QUALIFICADO-20261015.md`, seção 9.4. O arquivo `evidence-reboot/precheck-before-reboot-20261015.json` guarda o instantâneo anterior.
