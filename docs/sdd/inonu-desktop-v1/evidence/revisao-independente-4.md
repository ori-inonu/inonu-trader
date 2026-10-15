# Revisão independente 4 (T11.3): universo on-chain do Rastreador, escada de cotações, ticket e "Aceitar"

Data: 2026-10-13. Sessão c38db1 (implementadora). **Revisor:** um agente distinto, sem o contexto desta conversa, numa **cópia isolada** (257 MB, sem `.git`, sem credenciais, sem dados, sem executáveis), com ordem de não editar nada, de não tocar as portas 3000, 3001, 3030, 3031 e 47321 e de não chamar rede nem modelo. As reproduções dele ficaram fora do repositório.

**Resultado:** nenhum bloqueador. Nada do que foi revisado assina, envia ou prepara uma transação; o único acesso de rede novo é o `GET /onchain/quote` pelo leitor; nenhuma chamada ao modelo ao montar, por temporizador, ao escolher uma linha ou ao trocar o universo; os textos próprios são ASCII sem travessão, ponto médio nem animação. Cinco achados maiores, vários menores e uma lista de testes fracos. Cada um abaixo, com a disposição e o teste que o prende.

## Aviso do revisor, para o usuário

Ao encerrar um `python -` pendurado que era dele, o revisor rodou `taskkill /F /IM python.exe`, que **encerrou 4 processos python, dos quais só 1 era dele**. Os outros 3 podem ser seus (ou de outra sessão). Isso aconteceu fora do repositório e não pode ser desfeito daqui; se algum script ou ferramenta em Python parou sem motivo por volta das 12h, é por isso.

## Maiores

| # | Achado | Disposição | Teste |
| --- | --- | --- | --- |
| 1 | Uma escada antiga escrevia no ticket novo: o efeito de troca de rascunho abortava mas não esquecia a execução, e a guarda só comparava identidade | **Corrigido**: `createRunGuard` (`run-guard.ts`): uma execução por vez; trocar de rascunho ou sair da tela **invalida** (aborta e esquece, não escreve mais); "Cancelar" só **para** a requisição e a execução ainda escreve o estado em que terminou | `run-guard.test.ts` (5, com o caso do revisor) |
| 2 | "Aceitar" dizia "ticket preenchido" quando nada era preenchido: o efeito olhava só o prefixo `token:`, e o rascunho exigia um endereço que algumas redes (Sui, TON) não têm | **Corrigido de dois lados**: o rascunho aceita qualquer endereço simples que o gateway aceita (o ticket então diz que não cota); `acceptEffect`, `acceptNote` e o rascunho vêm de uma só função pura, `acceptOutcome`, e há uma frase própria quando o ticket não foi preenchido | `accept.test.ts` (rascunho e `acceptOutcome`), `ticket.test.ts` |
| 3 | Uma cotação velha aparecia como ao vivo: `rungText` não lia `meta`, e o gateway serve do cache com `stale: true` quando o provedor falha | **Corrigido**: "cotacao velha" com a idade ("ha 3 min"), tom de alerta, sem esconder um honeypot; coluna "Idade" na escada | `ladder.test.ts`, `ticket-render.test.tsx` |
| 4 | Smart money "0" aparecia como fato ("nenhum registro na rede"), mas é "não está entre os 100 mais recentes lidos"; a junção por endereço diferenciava a caixa | **Corrigido**: o título diz "entre os mais recentes lidos da rede (ate 100)" e a linha de status mostra a idade dos registros e se estão velhos; endereço EVM sem caixa na junção e na lista (um token em duas caixas é um só) | `onchain-model.test.ts`, `onchain-body-render.test.tsx` |
| 5 | Os filtros numéricos não aceitavam digitar `-` nem `.`: a caixa guardava o número e mostrava o número de novo | **Corrigido**: `NumberFilter` guarda o texto enquanto a pessoa digita, só muda o filtro quando é um número (`parseTyped`, estrito: sem hexadecimal nem expoente) e mostra o número ao sair da caixa; vale também para os filtros da corretora, que tinham o mesmo defeito antigo | `number-field.test.ts` |

## Menores

| # | Achado | Disposição |
| --- | --- | --- |
| 6 | `taxRate` desconhecido contava como zero; "honeypot nao informado" escondia "impacto fora do limite" | **Corrigido**: todos os problemas aparecem, em ordem de peso ("honeypot nao informado; impacto fora do limite"), e uma taxa que o provedor não deu é "taxa do token nao informada" |
| 7 | Com erro e sem linhas aparecia também "A OKX nao devolveu tokens"; o estado vinha da chave anterior | **Corrigido**: a frase só aparece quando algo foi lido e nada falhou, e enquanto a chave mudou e a resposta nova não chegou a tela diz que está lendo |
| 8 | Com o universo on-chain salvo, a página lia a lista (e, com a visão Smart money salva, o Premium `signals`) ao abrir, sem clique | **Corrigido**: a página **sempre abre na corretora**; entrar no on-chain é um clique e nunca abre a visão Smart money sozinho (`enterUniverse`) | 
| 9 | "Ler de novo" não era travado por um pedido em andamento: a nova lista podia tirar o token e desmontar o painel | **Corrigido**: desabilitado enquanto há pedido |
| 10 | Cancelar aparecia como falha de rede; um leitor que lança deixava a escada presa em "lendo" e a rejeição sem tratar | **Corrigido**: cancelado no ar é "nao pedida"; um leitor que lança vira falha daquele degrau (constante, nada do que ele lançou) e `TicketPanel` trata a rejeição | `ladder.test.ts` (+3) |
| 11 | A cotação não era ligada ao pedido (rede, valor e tokens não eram conferidos) | **Corrigido**: rede, valor (diferença relativa) e os dois tokens (EVM sem caixa) são conferidos; senão é erro de esquema | `quote.test.ts` |
| 12 | `ok:true` com status de erro HTTP passava | **Corrigido** | `quote.test.ts` |
| 13 | Um payload vazio do gateway (`data: null`) virava "fora do contrato" e parava a escada | **Corrigido**: `sem_cotacao`, "A Trade API nao tem cotacao para este tamanho", e a escada continua no próximo tamanho | `quote.test.ts`, `ladder.test.ts` |
| 14 | Os registros de carteiras não tinham idade nem marca de velhos | **Corrigido** (ver 4) |
| 15 | `coinText` inventava dígitos acima de 2^53 quando os decimais são desconhecidos | **Corrigido**: "aprox." com seis algarismos | `ladder.test.ts` |
| 16 | `rungText` dava "NaN%" a quem o chamasse direto e um limite NaN passava como "dentro" | **Corrigido** |
| 17 | As linhas on-chain só se escolhiam com o mouse | **Corrigido**: `tabindex` e Enter ou espaço |
| 18 | `buildOnchainRows` supõe uma rede só | **Mantido**, documentado: o painel lê uma rede por vez; a duplicata por caixa foi tratada em 4 |
| 19 | Nível de risco fora de 0 a 5 aparecia ("Nivel 9 de 5"); zero compras e zero vendas diziam "nao informou" | **Corrigido**: nível inválido é traço com o motivo; "Sem transacoes na janela da OKX" | 
| 20 | Documentos: T9.7 dizia "verificado em teste de fluxo" sem teste que rodasse `InonuAsk.record`; `wallet.md` promete varredura de `broadcast-transaction`, que não existia; a varredura não olhava o gateway | **Corrigido**: `acceptOutcome` é a função pura que `record` aplica e é testada (a parte React segue sem DOM de teste); a varredura ganhou `broadcast-transaction` e `broadcastTransaction` e passou a ler também `src/onchain-read` | `no-send-scan.test.ts` |

Nits tratados: cota "1,1 s" com vírgula, unidade do gás no cabeçalho, frase do que falta para Cotar, "+0,00" sem sinal, `parseNumberField` aceitava "0x10", o intervalo mínimo entre uma escada cancelada e a seguinte (`initialDelayMs`). Não tratados: um duplo clique em "Cotar" vira "Cancelar" e cancela; o "0,5x" de uma escada de 5 arredonda para baixo (um tamanho de 3 unidades vira 1 como "0,5x"); `record` sem trava de reentrada (a tela esconde os botões depois do clique).

## Testes fracos apontados

| Apontamento | Disposição |
| --- | --- |
| Sem teste do container do `TicketPanel` e do `RastreadorView` (efeitos, contagem de leituras, `askBusy`) | **Lacuna conhecida**: o projeto não tem DOM de teste; o que dava para tirar de dentro do container virou função pura testada (`createRunGuard`, `enterUniverse`, `acceptOutcome`, `parseTyped`) |
| "as linhas nao mudam" só conferia a mensagem e o select | O clique e a tecla já respeitam `locked` no código; sem DOM não há teste de clique |
| `ticketPlan` "todas as redes do registro cotam" espelha a implementação | Mantido como documentação do registro |
| "sem caminho de envio" é um bloqueio de texto | A garantia forte é o `no-send-scan` (agora com `broadcast-transaction`, `wallet_sendCalls` e o gateway) e a leitura do revisor |
| Faltavam: `taxRate` desconhecido, cotação velha, leitor que lança, ids Sui e TON no Aceitar, caixa da junção, `-` digitado, erro sem linhas | Todos têm teste agora |

## O que o revisor não pôde conferir

Renderização em DOM (efeitos, cliques, digitação, duplo clique, contraste das linhas em alerta, que só diferem pelo tom de fundo), as afirmações ao vivo (97 e 100 tokens, a cotação em Base, o smoke 24 de 24, o contador do modelo), o `tsc` nativo, o formato real que o provedor dá para `taxRate` e `isHoneyPot` por rede, e o aviso de `className` do `ask-render.test.tsx` (anterior a esta entrega).
