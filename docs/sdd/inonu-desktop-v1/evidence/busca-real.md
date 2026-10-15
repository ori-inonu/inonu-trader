# T4.7: busca real de token por símbolo e por endereço em 3 redes

Data: 2026-10-13. Sessão c38db1. Requisitos SRC-5 e critério AC-SRC-3. Leituras reais da OKX OnchainOS pelo gateway local do app compilado, com a credencial do cofre; nenhuma chamada ao modelo.

## A sonda

Rota `GET /onchain/search?chainIndex=<rede>&q=<texto>` (Basic), 6 chamadas, todas respondidas, contadas no orçamento do mês (de 12 a 17 de 50.000):

| Rede | Busca | Resultado |
| --- | --- | --- |
| Ethereum (1) | símbolo `USDC` | 1 resultado: USDC, USD Coin, `0xa0b86991...`, reconhecido pela comunidade |
| Solana (501) | símbolo `USDC` | 2 resultados: USDC, USD Coin, `EPjFWdd5Au...`, reconhecido pela comunidade (mais um token derivado) |
| Base (8453) | símbolo `USDC` | 1 resultado: USDC, USD Coin, `0x833589fc...`, reconhecido pela comunidade |
| Ethereum (1) | endereço `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | o mesmo USDC |
| Solana (501) | endereço `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | o mesmo USDC |
| Base (8453) | endereço `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | o mesmo USDC |

Os três endereços de USDC são os publicados de cada rede; o app não os tinha em lugar nenhum, a busca os encontrou.

## A captura

[capturas/T4.7-busca-usdc-solana-390x844.jpg](capturas/T4.7-busca-usdc-solana-390x844.jpg): o seletor de ativos do gráfico, em janela de celular, com a rede Solana escolhida e a busca `USDC` enviada (Enter): "USDC, USD Coin, US$ 0,999, liq US$ 2,4 bi, 9,1 mi holders" e "syrupUSDC". Antes do Enter a lista mostra o "Trending" da rede, que é o comportamento da busca (mínimo de 2 caracteres e envio explícito), não uma falha.

## O que não foi feito

- Busca por **nome** com mais de um resultado ambíguo (símbolo repetido em redes diferentes) e a mensagem "mesmo simbolo, outro contrato" não foram exercitadas ao vivo nesta rodada.
- A captura foi tirada em 390x844; a busca em 1600x900 não foi capturada (a janela do painel de imagem do navegador embutido não reproduz esse tamanho de forma confiável nesta máquina).
- A sonda lê a rota local do gateway; o erro "Resposta fora do contrato" da queixa original ficou coberto por T4.1 (erros distintos e autoteste de boot), não por esta tarefa.
