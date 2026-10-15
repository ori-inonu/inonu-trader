# ADENDO A: zero configuração, sem teto de API, resultado como único critério

Estado: **requisitos novos e revisão independente; nada daqui altera arquivos do Claude Code.** Escrito em 2026-10-14 por uma segunda sessão (Devin), a pedido do dono, para o Claude Code integrar. Complementa [SPEC.md](SPEC.md) (AUT-27 a AUT-31 já estão no código e ainda não na tabela do SPEC). Nada rodou com dinheiro, com o modelo real nem com o CLI real.

## 1. Decisão do dono (2026-10-14)

- A única configuração do usuário é conectar a carteira e, ao conectar, autorizar todo o processo do agente. Nenhuma configuração manual: nem limites, nem orçamento de API, nem ritmo, nem decisão.
- Limites de API (TypeSafe e OnchainOS) são "o de menos": se o agente dá resultado, o dono paga um plano maior. O que importa é o lucro e o crescimento composto do capital, todos os dias.
- O foco é a organização e a estrutura dos dados que vão ao Jev e a rapidez da decisão. Pode refatorar tudo para isso.
- Mantido por escolha anterior do dono ("Crescer sem margem"): sem margem, dívida ou alavancagem. A palavra "alavancagem" continua sendo lida como crescimento composto.

## 2. O que os fatos dizem

| Fato | Fonte | Consequência |
| --- | --- | --- |
| Jev 1.13 custa US$ 0,042 por milhão de tokens de entrada; saída grátis; limites de 100 mil tokens/s e 80 req/s; contexto de 64 mil tokens | https://docs.typesafe.ai/models | uma decisão de cerca de 10 mil tokens (estimativa, não medida) custa cerca de US$ 0,0004; uma por minuto, US$ 0,60 por dia; US$ 5 pagam cerca de 12 mil decisões |
| O teto de 144 consultas por dia é exatamente 24 h a cada 10 min; a validação aceita no máximo 1000 por dia e ciclo mínimo de 5 min | `budget.ts:15`, `config.ts:90-91` | o teto não economiza nada material e é o que **impede** decidir mais rápido (um minuto por ciclo seriam 1440 por dia) |
| Pôr todas as perguntas numa só chamada é "12,2 vezes mais barato e 10 vezes mais rápido, sem mudar as respostas" | cookbook "Parallel questions" da TypeSafe | o desenho atual (uma avaliação por ciclo) está certo e deve ficar |
| O cliente da OnchainOS serializa todas as chamadas com piso de 1100 ms e, após um 429, pausa tudo por 30 s | `onchain-read/client.ts:53,61` | é o gargalo da velocidade de leitura: cada chamada espera pelo menos 1,1 s, então 50 chamadas levam cerca de 55 s |
| A política de limites só pode ser criada pelo dono, no portal da OKX, e `wallet status` devolve `policy: null` quando não existe | `okx-agentic-wallet/references/wallet-portal-actions.md`, `wallet-cli-reference.md` | o app não consegue criá-la por ele; é uma pergunta de risco (seção 6) |

## 3. Requisitos (EARS)

| ID | Requisito |
| --- | --- |
| ZC-1 | Enquanto a carteira estiver conectada, o sistema não deve expor campo, botão nem rota de configuração (tetos, orçamento, ritmo, redes, risco, política). Os valores vêm do autopilot, do mandato do Jev e de constantes internas. As únicas ações do usuário são conectar e desconectar. |
| ZC-2 | O sistema não deve deixar de consultar o modelo por ter atingido uma contagem. Deve contar consultas, tokens e custo em dólares (`consultCostUsd`, null quando desconhecido) e mostrar o resultado **depois** desse custo. A única parada por custo é a do provedor (crédito esgotado, 402, 429): o ciclo decide "manter" e as saídas do plano continuam por código. Substitui AUT-3 e AC-AUT-3. |
| ZC-3 | O ritmo de leitura da OnchainOS deve ser aprendido, sem campo manual: parte de 1100 ms por chamada, acelera enquanto não houver 429 ou 50011, recua ao primeiro e respeita `Retry-After`. |
| ZC-4 | O ritmo de decisão deve ser dirigido por evento: nova consulta quando o Brief muda de forma material ou um gatilho do plano dispara, com piso de segundos e não de 5 minutos. Decidir mais rápido não é decidir mais vezes: cada troca tem custo, e o Brief inalterado não gera consulta. |
| ZC-5 | O Brief deve incluir o desempenho do próprio agente, neutro a depósitos e retiradas (dia, 7 dias, queda desde o pico, dias positivos), e o custo estimado de ida e volta de cada compra. Chaves descritivas em inglês e rótulos semânticos ao lado dos números (seção 5). |
| ZC-6 | O resultado do agente é o da carteira: índice neutro a fluxos, por dia do usuário, líquido dos custos conhecidos de execução e de modelo. "Lucro" só é afirmado com janela fechada e amostra (AUT-11 permanece). Nenhuma promessa de retorno diário: o sistema mede e mostra cada dia, inclusive os negativos. |
| ZC-7 | A exposição deve seguir a evidência medida, sem botão: sem evidência líquida de custos, exposição reduzida; com evidência, a do autopilot; perda da carteira reduz sozinha. |
| ZC-8 | O aviso da conexão (`DISCLOSURE`) deve dizer, em linguagem direta: o agente decide e executa sozinho compras e vendas na subcarteira; o dinheiro pode ser perdido; não há garantia de retorno; só se deposita o que se aceita arriscar; como desconectar; custos de execução e de modelo reduzem o resultado; o que é enviado ao modelo (percentuais e códigos, nunca endereço nem saldo em dólares). O texto e a versão mudam juntos (teste de deriva por hash). |
| ZC-9 | Sem margem, dívida nem alavancagem (AUT-15) enquanto o dono não escolher o contrário com medição que a sustente. O crescimento composto vem de reinvestir o resultado realizado. |
| ZC-10 | O agente só deve comprar na medida da convicção do modelo: o limiar sobe com o tamanho, uma resposta moderada compra menos, uma fraca não compra, e confiança desconhecida nunca compra. A resposta completa (probabilidades e confiança) vai ao registro junto com o Brief. |

Aceitação, cada uma por teste: AC-ZC-1 (nenhuma rota `/agent/config`, nenhum texto "Configuração" na tela); AC-ZC-2 (10 mil consultas simuladas, nenhuma recusada por contagem; crédito esgotado simulado vira "manter" e a saída do plano ainda sai); AC-ZC-3 (servidor falso que devolve 429 acima de N req/s: o ritmo converge abaixo de N); AC-ZC-4 (Brief igual, zero consultas; mudança material, consulta em menos de 10 s com relógio falso); AC-ZC-5 (forma do Brief: desempenho presente, tamanho limitado); AC-ZC-6 (`equity.test.ts`: depósito e retirada não movem o índice, perda não é escondida por depósito); AC-ZC-8 (hash do texto casa com a versão); AC-ZC-10 (`conviction.test.ts`: limiar crescente, nunca compra mais que o pedido, só tamanhos oferecidos, confiança desconhecida não compra).

## 4. Achados da revisão independente (feita na árvore viva, somente leitura)

| Sev. | Achado | Evidência | O que fazer |
| --- | --- | --- | --- |
| Verificado | O rebaixamento para sombra por política ausente, binário divergente etc. nunca chega ao executor | `cycle.ts:483` e `cycle.ts:574` só executam com `runMode === "limitado"`; suíte do agente: 562 passam, 0 falham (`.scratch/agent-suite-after-equity.log`) | manter; os 4 testes que falharam às 10:40 eram antigos e foram atualizados |
| Alta | Uma ordem em voo suspende também a **saída protetora do mesmo token**: sem humano, o stop de uma compra "incerta" fica parado | `cycle.ts:472` | reconciliar sozinho por `wallet history --chain --tx-hash` ou `--order-id` (`txStatus`: PENDING, ERROR, SUCCESS, CANCELLED) e permitir a saída protetora calculada do saldo fresco |
| Alta | `executada` significa transmitida, não pousada: "broadcast ≠ landed" | skill `swap.md`, passo 6 | confirmar por `wallet history` antes de contar no Placar e de abrir o plano como posição real |
| Média | O disjuntor atual lê o efeito hipotético a 4 h do Placar e exige 3 decisões liquidadas: não vê o que a carteira perdeu (custos, derrapagem, saída que falhou) | `autonomy.ts` | acrescentar `judgeEquity` (`equity.ts`), a partir de leituras da carteira |
| Média | O adaptador lê só `.choice`; a API devolve `probabilities` e `confidence`, e o padrão documentado é decidir por confiança | `model.ts:307-309`; docs.typesafe.ai/patterns/confidence-routing | aplicar `gateBuy` (`conviction.ts`) antes de `planOrders` e **gravar a resposta completa** no registro: é o conjunto de dados que um dia permite aprender com os resultados |
| Média | O SPEC diz que a OKX não documenta operação sem confirmação; o skill oficial documenta "Silent / Automated Mode" com opt-in explícito, parada em risco `block` e registro de cada transação | skill `swap.md`, seção "Silent / Automated Mode" | corrigir a linha do SPEC; a conexão com aviso é esse opt-in |
| Info | Argumentos do `security token-scan` (A1.4): `--tokens "<chainId>:<endereço>" --trade-direction buy`, resposta com `combinedAction` (block, pause, warn, safe) | `security-cli-reference.md` | exigir `safe` antes de comprar; a OKX pede para não recomputar o veredito |
| Info | Proteção no servidor (A1.8): "ordens ficam no TEE e executam sozinhas quando o gatilho dispara"; validade fixa de 7 dias; 6 redes; mínimo US$ 1; derrapagem padrão 15% | `strategy.md`, `strategy-cli-reference.md` | desenhar com renovação antes dos 7 dias e cancelamento da ordem irmã quando uma executar; medir antes de confiar |
| Info | Existe login por chave de API (`loginType: ak`), com a política no dev-portal | `wallet-portal-actions.md` | medir se evita o login por e-mail repetido |

## 5. Estrutura dos dados do Jev (fonte: documentação da TypeSafe)

- A página de falhas conhecidas do Jev 1.13 diz que ele erra com precisão numérica e rende mais com representações semânticas do que numéricas: o Brief atual é quase todo número com chaves de uma letra e uma legenda (`p`, `l`, `i`, `v`, `r`, `m`...). Isso é a **indireção** que a lista de falhas desaconselha, e o inglês é o idioma de melhor acurácia (o Brief mistura chaves em português com perguntas em inglês). Trocar por nomes descritivos em inglês e acrescentar baldes ("liquidez: funda, ok, rasa"; "momento: esticado, neutro, em queda") é barato: o limite de 7600 bytes foi pensado para economizar um custo que, no preço publicado, é desprezível.
- A acurácia cai quando o estado traz detalhe sem relação com a pergunta: cada pergunta de candidato enxerga todos os outros candidatos. Medir a alternativa de uma avaliação por candidato (estado pequeno, em paralelo, limite de 80 req/s) contra a atual antes de trocar.
- Esconder vários julgamentos numa só pergunta está na lista do que evitar: a escolha de 4 posturas por candidato mistura direção e tamanho. O padrão recomendado é perguntas atômicas (Noul/Score) combinadas em código com pesos que o código controla (Composite scoring) e leitura da confiança antes de agir.
- A ordem das opções influencia (o modelo tende à primeira): conferir a consistência reordenando.
- Fixar o modelo (`jev-1.13.0`) quando os limiares forem calibrados; `jev-latest` é um alias que muda.
- Tudo isso é testável por **consistência e confiança** com chamadas de uns US$ 0,0004 cada; a qualidade financeira só o Placar mede.

## 6. Decisões do dono ainda abertas (risco real)

1. Começar com dinheiro real na exposição cheia, ou com **exposição pequena que cresce sozinha** conforme a evidência líquida de custos aparece (recomendado: a sombra não mede derrapagem nem taxas, a exposição pequena mede).
2. A política do portal (feita por ele, fora do app) continua **obrigatória** para operar, ou passa a **opcional com exposição reduzida** sem ela. Hoje é obrigatória (`gate.ts`, `politica_ausente`), e é o único passo manual que sobra além de entrar na conta OKX e depositar.

## 7. Entregue por esta sessão e mapa de integração

Entregue (novos, puros, sem importar nada além de tipos; 47 testes escritos antes do código; `equity.ts` também conferido por duas mutações que os testes pegam): `equity.ts` (índice neutro a fluxos, retorno por dia, queda desde o pico, `judgeEquity`), `conviction.ts` (`gateBuy`: o limiar sobe com o risco; confiança desconhecida nunca compra), `api-cost.ts` (custo por consulta pelo preço publicado, com fonte e data).

Integração, nos arquivos do Claude Code (esta sessão não os tocou): `wire.ts` grava uma leitura da carteira por ciclo (unidades decimais a partir de `balanceMinor` e `decimals`, só os ativos que entraram em `agentUsd`; `usd: null` se a leitura foi parcial) e as ordens enviadas, e chama `judgeEquity` ao lado de `judge`, com os motivos `queda_do_dia` e `queda_do_pico` (cabem em `CODE` de `state.ts`); `model.ts` devolve `probabilities` e `confidence`; `cycle.ts` aplica `gateBuy`; `budget.ts` passa a contar custo e deixa de recusar; `http.ts`, `service.ts`, `config.ts` e a tela perdem a configuração; `onchain-read/client.ts` ganha o limitador adaptativo.

O que continua humano por natureza: entrar na conta OKX na página da OKX, depositar na subcarteira e, se mantida, a política do portal.
