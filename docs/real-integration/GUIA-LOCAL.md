# Integração local e qualificação

Esta entrega funciona em paper, com execução financeira desabilitada. A meta G01–G17 continua aberta: testes offline e mercado público OKX v5 não qualificam carteira, API Web3 v6, inferência do aplicativo ou proposta financeira real.

## Iniciar

Use esta worktree: `C:/Users/gabri/.codex/worktrees/okx-real-integration/jev-trader`. O checkout original tem trabalho concorrente preservado; nenhuma promoção, commit ou publicação foi feita.

Com Bun instalado, o procedimento de desenvolvimento é:

```powershell
bun --no-env-file run real:console
```

O comando inicia backend em `http://127.0.0.1:3000` e Next em `http://127.0.0.1:3001`. O console mostra as URLs efetivas. `REAL_PORT` e `REAL_UI_PORT` devem ser distintos. Kuru, chave privada, credenciais Exchange e carteira não são pré-requisitos de bootstrap. Ctrl+C solicita encerramento dos processos criados; um encerramento não observado gera falha e nunca é declarado limpo. O journal paper possui lock exclusivo e exige o processo anterior encerrado para retomar.

`REAL_UI_MODE=production` usa um build existente. `NEXT_PUBLIC_API_URL` é incorporado pelo Next durante o build; configure-o com a porta efetiva do backend antes de `bun --no-env-file run build`. Mudar a variável apenas no start não altera o bundle. A prova final r8 usa backend 4130 e UI 4131. Para reutilizar esse build, configure REAL_PORT=4130, REAL_UI_PORT=4131 e REAL_UI_MODE=production, após verificar portas livres. As duas execuções de qualificação foram encerradas; capturas não significam serviço continuamente ativo.

## Configurar sem expor valores

O exemplo `real.env.example` contém apenas nomes e padrões locais. Copie-o para um arquivo privado fora do versionamento, preencha exclusivamente valores próprios da aplicação e carregue explicitamente:

```powershell
bun --no-env-file --env-file=C:/caminho/privado/real.env run real:doctor
bun --no-env-file --env-file=C:/caminho/privado/real.env run real:console
```

`real:doctor` informa presença, faltas, redes, TTLs e configuração sanitizada. Presença de chave não comprova acesso. Web3 exige os três valores `OKX_WEB3_API_KEY`, `OKX_WEB3_API_SECRET`, `OKX_WEB3_API_PASSPHRASE`; não usar credenciais Exchange ou do plugin. Jev da aplicação usa `TYPESAFE_AI_API_KEY`; `REAL_JEV_CONSUMPTION_AUTHORIZED` permanece falso até autorização e orçamento aplicáveis serem estabelecidos. A quota máxima inclui reservas duráveis, inclusive chamadas que falharam; restart não zera consumo. Custo desconhecido permanece null. Um modelo configurado precisa resposta real para comprovar acesso.

O par DEX opcional exige contratos de tokens da mesma rede, decimals verificados e `REAL_AMOUNT` inteiro em unidade bruta. Não usar capital configurado como saldo. Não assumir 18 decimals, preço USD, zero de inventário ou custo de gas quando desconhecidos.

## Usar a interface

Abra a URL da UI informada pelo console. Saúde e capacidades funcionam antes da carteira. A leitura pública BTC-USDT-SWAP informa instrumento, funding e mark da API Exchange v5; é independente da carteira e da Web3 v6. Validade é conferida na coleta e no consumo. Uma referência HTTPS de `GET /api/v5/public/time` mede a diferença fonte/local e a incerteza para essas leituras públicas. O TTL continua limitado a 60 segundos; a tolerância de futuro continua em cinco segundos. Timestamps originais e recibo ficam visíveis. Divergência acima de três minutos, RTT acima de dois segundos, referência vencida ou salto do relógio invalidam a leitura. O sistema operacional e a assinatura autenticada Web3 v6 não são alterados por essa calibração.

Conectar OKX Wallet é uma ação local por gesto explícito. Depois da conexão, a autorização adicional de consulta informa que endereço e rede serão enviados ao backend local, à OKX Web3 e ao RPC público da rede: `https://rpc.xlayer.tech` ou `https://rpc.monad.xyz`. O escopo atual é `web3-rpc-read-v2`; consentimento anterior não habilita esse destinatário. Conectar não concede essa autorização. Revogar ou desconectar invalida respostas atrasadas; identidade fica em memória e exige novo consentimento após restart. Nunca transmitir endereço ao Jev, persistir conta em logs compartilháveis ou aceitar assinatura/transação para esta meta.

A consulta RPC fixa o mesmo bloco para saldo nativo, saldo ERC-20, decimals, código e allowance quando aplicável, e confere seu hash ao final. Quantidades permanecem strings exatas. A avaliação do inventário cruza esses dados com a amostra Web3 da mesma identidade, revisão e correlação. Cobertura incompleta, divergência, ausência de preço USD ou validade vencida mantêm o valor desconhecido. Esse adaptador não é rotulado como OnchainOS e não qualifica deployment, ABI, simulação ou execução.

DeFi e leaderboard têm adaptadores GET e integração opcional desligada por padrão. Um responsável por evidências deve fornecer a qualificação vigente da rede e os parâmetros explícitos; nomes em variáveis ou documentação não substituem esse contrato. Detalhes DeFi exigem investmentId e confirmação no catálogo. POST de busca DeFi e POST signal/list permanecem capacidades documentadas sem integração neste fluxo. Funding público usa aquisição adaptativa à validade da amostra e registra a cadência efetiva; não consultar repetidamente o mesmo snapshot para aparentar novos dados.

Atualizar consulta o worker e os dados; histórico permite inspecionar ciclos e hold. Sem fontes qualificadas, hold é o resultado correto e PnL realizado fica desconhecido. Dez ciclos sem acesso ao núcleo não satisfazem G10.

O journal tem limite de inspeção de 20 MB. Um append que exceda esse limite é rejeitado antes de modificar o arquivo; o worker interrompe a persistência. Não remover ou rotacionar o histórico para zerar reservas Jev. Qualquer manutenção deve preservar a contabilidade durável e ocorrer com o processo encerrado.

## Evidências e retomada

Leia `MATRIZ-G01-G17.md`, `CHECKPOINT.md`, `VERIFICACAO.json`, `AUDIT-R8.json`, `CONSOLE-LIVE-R8.json`, `BROWSER-EVIDENCE-R8.json`, o manifesto do candidato e o parecer independente da mesma versão. A instrução congelada permanece `INSTRUCAO-DO-OBJETIVO.md`; não reduzir seus critérios para encerrar a meta. `SEMANTIC-PROOF.md` descreve o contrato adicional de validação, quando presente: ports e fixtures não substituem observações reais nem adaptadores qualificados.

Fontes oficiais principais: [OKX OnchainOS](https://web3.okx.com/onchainos/dev-docs/introduction), [simulação de transação](https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-simulate-transaction), [API Exchange v5](https://www.okx.com/docs-v5/en/).
