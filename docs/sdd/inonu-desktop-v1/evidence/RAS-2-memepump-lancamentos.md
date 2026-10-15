# RAS-2: lançamentos (Memepump) no gateway e no Radar (2026-10-13)

Pedido do usuário em 2026-10-13: "no Memepump, dá para rastrear várias oportunidades de pump para tomar decisão". A família Memepump estava classificada como "sob demanda" na matriz de cobertura (mkt-meme, T8.2) e nenhuma rota existia. Esta entrega é a primeira: a lista de lançamentos de uma rede por etapa da vida do token.

## A rota do gateway

`GET /onchain/memepump-list?chainIndex&stage[&protocolIdList&filtros]` (`src/onchain-read/routes/memepump.ts`, registrada em `routes/index.ts`; a lista fixa de rotas de `catalog.test.ts` ganhou a linha). Camada contada Premium até T3.8 medir; validade de 30 s.

- **Validação antes de qualquer chamada:** rede só dígitos; etapa `NEW`, `MIGRATING` ou `MIGRATED`; até 10 protocolos; os filtros que o provedor aceita (porcentagens de 0 a 100, valores em dólar, contagens), cada um no seu formato. **`walletAddress` não é parâmetro**: com ele o provedor acrescentaria a posição do próprio usuário à resposta.
- **Saída:** até 30 lançamentos, cada um com mercado da última hora, curva, quem segura (10 maiores, dev, insiders, bundlers, snipers, carteiras novas, phishing, detentores) e **se** há rede social, site ou X (nunca o endereço do link, nunca o logotipo, nunca a carteira do criador). Número ilegível é `null`, nunca zero.
- **Leituras reais na Solana, etapa `NEW`:** três pelo gateway (a primeira voltou erro de formato, a segunda mostrou o formato real, a terceira confirmou: HTTP 200 com 30 lançamentos, 15.682 bytes) e uma do painel. Elas mostraram três coisas que a documentação não diz, e o código lê as duas grafias: a resposta **é a própria lista** (a página a embrulha em `{cursor, items}`), o endereço do token vem em **`tokenAddress`** (a página diz `tokenContractAddress`), e todas as porcentagens são **de 0 a 100** (`top10HoldingsPercent` vinha como `50.1642`). Um lançamento recém-criado pode não ter mercado ainda (5 de 30 vieram sem valor de mercado: ficam `null`). Contador local de Premium: 57 a 60 de 50.000.
- **Testes:** `memepump.test.ts` (13): validação, as três formas da resposta, links nunca repassados, nulos, teto de 30, texto limpo de caracteres de controle e de pontuação proibida.

## A vista "Lançamentos" do Radar

Quinta vista do Radar, depois de Onde comprar, Zonas, Traders e Holders (**desvio D4-31**: DOC-4 lista quatro). `MemepumpTab.tsx`, `lib/onchain/memepump.ts` e `client.memepump`. Uma leitura por escolha, sem polling.

- A pessoa escolhe a **etapa** (Novos, Quase migrando, Já migrados) e a **ordem** (mais volume, mais compras, mais novos); o código **não ranqueia o "melhor"**. A tabela mostra 12 linhas no máximo (INF-1) e diz quantas leu.
- Cada linha: token, idade, valor de mercado, volume de 1 hora, compras e vendas da hora, curva, detentores e **marcas de cuidado**. Uma marca é uma medida em palavras ("o dev tem 30% da oferta; snipers com 53,2%; só 9 detentores") com o limite que a faz marca escrito em `CARE_LIMITS`: dev 10%, 10 maiores 50%, insiders 20%, bundlers 20%, snipers 30%, carteiras novas 30%, qualquer phishing, menos de 30 detentores, nenhuma rede social nem site. **Esses limites são minha escolha, não calibrada por medição**, e a linha diz "marcas", não "risco".
- Clicar no token o abre (gráfico e Holders), de onde se pede ao Inonu. O código não diz o que fazer; a palavra de ordem só existe na resposta do Inonu.
- 12 testes do modelo (`memepump.test.ts` da web) e 6 da tela (`memepump-render.test.tsx`); varredura de animação e de tipografia cobrem os arquivos novos. Visto ao vivo no painel do navegador com 12 lançamentos reais da Solana.

## O que não está feito

- **Pedir ao Inonu sobre os lançamentos** (um candidato por lançamento, o modelo escolhe entre ids) ainda não existe: o modo `descoberta` usa `hot-token` e `signal/list`, não esta lista. É o passo que transforma a tabela em decisão.
- **Redes que o Memepump não suporta** (a página lista as suas): a leitura volta com o erro do provedor e o texto da aba; a lista de redes suportadas (`memepump/supported/chainsProtocol`) não foi lida nem usada para desabilitar as pastilhas.
- **Nomes de tokens são texto de terceiros** e podem ser ofensivos ou enganosos (a leitura real trouxe um com palavra ofensiva): só caracteres de controle e pontuação proibida são limpos; não há filtro de linguagem.
