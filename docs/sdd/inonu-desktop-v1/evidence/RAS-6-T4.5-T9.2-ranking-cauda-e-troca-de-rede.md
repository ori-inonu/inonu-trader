# RAS-6, T4.5, T9.1 e T9.2: ranking das linhas escolhidas, cauda do ledger e troca de rede

Data: 2026-10-13. Sessão c38db1. Tudo não commitado. Estados de evidência separados no fim.

## O que foi feito

| Tarefa | Entrega | Onde |
| --- | --- | --- |
| RAS-6 (T8.5) | Modo `ranking` do "Pedir ao Inonu": de 2 a 5 linhas escolhidas no Rastreador, **um** Brief para todas, o modelo escolhe entre os ids (`spot:` ou `perp:` de cada linha, ou `manter`) | `src/inonu/ask.ts` (`alvos`, chave do pedido por conjunto), `src/inonu/source-ranking.ts`, `src/intel/brief.ts` (alvo `{escopo:"ranking", instIds}`), `src/desktop/handlers.ts`; web: `lib/rastreador/choose.ts`, coluna "Escolher" e seção "Ranking pelo Inonu" em `RastreadorView.tsx`, `lib/inonu/ask-target.ts` |
| T4.5 | Aba Inonu mostra, sob o botão, os totais do dia e os 5 últimos pedidos do ledger; atualiza ao fim de cada pedido | `components/Desk/Dock/InonuLedgerTail.tsx`, `lib/inonu/{ledger-signal,usage}.ts` |
| T9.1 (parcial) | Classificação dos códigos 4001, 4100, 4200, 4900, 4901, 4902, -32002, -32602, -32603, -32601 e do tempo esgotado, com texto próprio e sem a mensagem da carteira; um pedido por vez por carteira | `web/src/lib/wallet/errors.ts`, `chains.ts` |
| T9.2 | "Trocar rede" na aba Carteira: 8 redes da lista do app, `wallet_switchEthereumChain` e, em 4902, `wallet_addEthereumChain` com a confirmação da pessoa; só por clique; só 3 métodos (troca, adição, leitura de `eth_chainId`) | `web/src/lib/wallet/chains.ts`, `components/Desk/Dock/{WalletChainSwitch,DockWalletTab}.tsx` |
| Correção achada ao vivo | `fluxo.razao` no Brief do instrumento: delta sobre o volume da janela, comparável entre ativos (o delta puro vem em lotes: BTC-USDT mostrou `-140432000` ao lado de `77219` do ETH perpétuo) | `src/inonu/source.ts` |
| Lacuna achada | Recusas `sem_candidatos`, `sem_sinais`, `sem_dados_onchain`, `sem_credencial_onchainos` caíam no texto genérico; agora têm frase própria ("Nada foi enviado ao modelo") | `web/src/lib/inonu/view.ts` |

## Desenho do ranking e o que ele NÃO é

- Cada linha é lida pela **mesma fonte** do clique em um instrumento (`ativo`), uma depois da outra; o candidato da linha leva a nota da melhor zona, as famílias que a formaram e a contagem de zonas; o fluxo vai como `{ negocios, deltaRazao, imb }` (negócios do último minuto, razão do delta, contagem de imbalances; o texto do modelo no modo ranking explica cada chave); cada medida `null` leva o motivo por linha. Linha ilegível sai do Brief com o código constante da recusa; com menos de 2 linhas legíveis o clique é recusado **antes** do modelo (`sem_candidatos`, 0 chamadas).
- Nenhuma chamada OnchainOS (`onchainosCalls: 0`); só leituras públicas gratuitas da OKX. Teto, cooldown, voo único, razão, ledger e cancelamento são os de ASK-5, os mesmos dos outros modos (a chave do pedido é o **conjunto** de linhas: as mesmas linhas em outra ordem são o mesmo pedido).
- **Desvio D4-08:** [rastreador.md](../rastreador.md) seção 5 descreve "um ranking de ids com razão curta e candidatos descartados". O contrato de resposta do modelo é **uma escolha fechada** (comprar ou vender um id, ou manter), então o resultado é **a escolha do Inonu entre as N linhas** (ou "manter"), não uma ordenação completa; uma ordenação exigiria um segundo formato de resposta validado. O texto congelado não foi editado.
- **Desvio D4-09:** o universo do Rastreador hoje é só OKX (spot e perpétuos). As "3 primeiras pela nota local recebem chamadas profundas" só têm sentido com linhas on-chain, que ainda não existem na tabela; entram junto com o universo on-chain.
- **Desvio D4-10:** T9.2 usa os RPCs públicos do registro `EVM_CHAINS` (`web/src/lib/evm-multichain.ts`, 8 redes) e não `providers.json`, que só tem o RPC da rede 196.
- **Desvio D4-14:** [rastreador.md](../rastreador.md) fala em "um Brief por linha"; o código faz **um Brief para todas as linhas**, porque o modelo escolhe entre elas e precisa vê-las juntas. Apontado pela [revisão 3](revisao-independente-3.md).
- **Desvio D4-11:** `deltaRazao` entrou em `fluxo` do Brief de **todo** pedido de instrumento; o hash desses Briefs mudou (sem efeito sobre a reutilização, que compara conteúdo e não hash).
- O ranking **não** publica marcador no gráfico (fala de vários ativos); o diário local recebe a linha com o nome do ativo escolhido, ou o conjunto quando a escolha foi manter.

## Testes (escritos antes)

| Alvo | Testes | Observação |
| --- | --- | --- |
| `ask.test.ts` (+2) | forma do pedido `ranking`, 14 formas recusadas, chave por conjunto | falharam antes, passam |
| `source-ranking.test.ts` (12, novo) | leitura por linha, ids, nota/fatores/estado, fluxo `{n,r,imb}`, idade e origem por linha, ordem irrelevante (mesmo hash), 5 linhas cabem em 2 KB sem palavra de ordem, linha ilegível, falha sem vazamento (`SENTINEL`), menos de 2 linhas, modo errado, cancelamento antes e durante | **mutações**: sem `.sort()` do alvo e mensagem vazando foram pegas |
| `handlers.test.ts` (+2, 1 reescrito) | clique de ranking de ponta a ponta pelo núcleo real (exchange e modelo falsos): 1 Brief, 0 chamadas OnchainOS, ledger `modo: ranking`; 1 linha recusada; um alvo único no formato antigo vira `pedido_invalido` | o teste "modo que ninguém serve" usava `ranking` e foi reescrito |
| `source.test.ts` (+1) | `deltaRazao` = (205 - 33) / 238 = 0,723; janela vazia = `null` | |
| web `choose`, `ask-target`, `screen-render`, `view` | escolha 2 a 5, limite, conjunto no universo inteiro, seção do ranking (1 linha, 2 a 5, 5 com caixas desativadas, linha escondida por filtro), rótulos, ASCII, sem palavra de ordem | |
| web `usage`, `ledger-signal`, `tail-render` (T4.5) | cauda: lendo, indisponível, vazio, 5 linhas, recusa sem modelo | |
| web `wallet/errors`, `wallet/chains`, `chain-switch-render` (21 + 7) | tabela de códigos, nada da mensagem da carteira, troca, 4902 com adição, segunda troca uma vez só, recusa encerra, rede não confirmada, um pedido por vez, tempo esgotado libera, só 3 métodos | **mutações**: sem a guarda de pedido pendente e sem a confirmação de `eth_chainId` foram pegas |
| varreduras | `no-send-scan` e `animation-scan` incluem os arquivos novos | limpas |

Suítes antes da revisão 3: raiz 4437 passam, 2 ignoradas, 0 falham (197 s); web 2317 passam; `desktop:smoke` 24 de 24. **Depois da revisão 3** (achados integrados, ver [revisao-independente-3.md](revisao-independente-3.md)) os números finais estão no [CHECKPOINT.md](../CHECKPOINT.md).

## Ao vivo (exe compilado, núcleo local, OKX real)

1. **Leitura do ranking sem modelo** (script fora do repositório, só leituras públicas; antes da revisão 3, que passou a recusar ids fora do formato e a tirar a linha ilegível do alvo): `BTC-USDT`, `ETH-USDT-SWAP`, `SOL-USDT` e um par inexistente `NOPE-USDT`: **1463 ms, 985 bytes**, 3 candidatos mais `manter`, `NOPE-USDT` fora com `nulos["NOPE-USDT"] = "leitura_falhou"`, 0 chamadas OnchainOS, razões `0,845`, `-0,838`, `-0,275`. Foi esta leitura que mostrou o delta em lotes e levou à `razao`. `imb: null` com o motivo `aquecimento` por linha.
2. **Rastreador** (`/rastreador` no navegador embutido): 36 linhas com caixa "Escolher X para o ranking", cabeçalho "Escolher para o ranking"; com 1 linha: "1 de 5 linhas escolhidas. Falta pelo menos uma para ranquear"; com 3: chips removíveis, "Limpar escolha" e o botão "Pedir ao Inonu: ranquear as 3 escolhidas". Celular 375 px, sem rolagem horizontal: [capturas/ras6-ranking-375.jpg](capturas/ras6-ranking-375.jpg).
3. **Aba Inonu**: "Hoje: 5 pedidos, 8.072 tokens, custo em dolar nao medido" e as 5 linhas do ledger real.
4. **Aba Carteira**: a seção "Trocar rede" aparece, desconectada: "Conecte a carteira para trocar de rede" e a nota de que nenhuma transação é enviada. O estado conectado (seletor e botão) **não foi visto ao vivo**: depende de T1.1 e da extensão real; está coberto pelos testes de tela e do provider falso.

## Declaração: uma chamada real ao modelo que eu não deveria ter feito

Ao clicar em "Pedir ao Inonu: ranquear as 3 escolhidas" para ver a recusa por falta de chave, assumi `sem_chave` sem ler o estado antes: o script lia `modelConfigured` **no mesmo passo** do clique, sem condicionar. O estado era `modelConfigured: true` e **a chamada ao modelo aconteceu de verdade**: modo `ranking`, modelo `jev-latest`, **1550 tokens**, 2,2 s, 0 chamadas OnchainOS, custo em dólar não medido (sem preço por token informado). Resposta: "Inonu decidiu manter" entre 4 candidatos; **não cliquei em Aceitar nem em Ignorar** e nenhuma ordem existe no app. A autorização de T7.8 (e a de gastar com o modelo neste trabalho) era do usuário, e eu não a tinha para esse clique; o recibo está no ledger. Isso é a primeira resposta real do modelo vista por esta sessão e **não** deve ser contada como a consulta autorizada de T7.8.

O ledger mostra ainda 4 chamadas reais anteriores no mesmo dia (2 `ativo` e 2 `token`, 57 a 72 minutos antes do meu clique, 1480 a 1782 tokens cada, 18 chamadas OnchainOS nos dois pedidos `token`). **Não** são de verificações registradas por esta sessão; o ledger não diz quem clicou. Isso também corrige este CHECKPOINT: a chave do modelo **está** no cofre (`modelConfigured: true`), ao contrário do que a pendência 1 dizia.

Regra adotada daqui em diante: antes de qualquer clique que possa chamar o modelo, ler `/inonu/status` e parar se `modelConfigured` for `true`.

## Estados de evidência

| Item | Configuração válida | Sessão nova | Ao vivo | Ganho medido |
| --- | --- | --- | --- | --- |
| RAS-6 ranking | sim (testes, tipos) | sim (exe reconstruído, smoke 24/24) | sim: leitura real da OKX, tela real, **uma** resposta real do modelo (acidental) | não: nenhum ganho afirmado |
| T4.5 cauda do ledger | sim | sim | sim (linhas reais) | n/a |
| T9.1 classificação | sim | sim | **não** (sem extensão) | n/a |
| T9.2 troca de rede | sim (provider falso) | sim | **só o estado desconectado**; conferência manual com a extensão fica com T1.1 | n/a |
