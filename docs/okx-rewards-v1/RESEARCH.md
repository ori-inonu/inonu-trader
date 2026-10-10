# Rewards OKX Wallet: superfície documentada — 10/10/2026

Pesquisa documental limitada a três buscas e três páginas oficiais. **API/CLI de descoberta, listagem ou estimativa de benefícios de Cryptopedia, campanhas Wallet e bônus por swap não encontrada na superfície consultada.** Isso não demonstra inexistência. Não houve consulta de conta/carteira nem comportamento live observado.

| Recurso | Interface | Integração elegível | Evidência | Pendências |
|---|---|---|---|---|
| Wallet Rewards | Entrada tentada não validada | Registrar URL/estado; benefício desconhecido | [S1](https://web3.okx.com/rewards): HTTP 404 | Catálogo atual, região, regras, conta, API e direitos de uso |
| Cryptopedia | App Wallet → Discover → Cryptopedia → Verify | Catálogo local manual de documentos | [S2](https://www.okx.com/en-us/help/okx-wallet-to-launch-cryptopedia-season-36): fluxo com carteira | Campanhas atuais e elegibilidade individual |
| Campanhas/recompensas por swap | Tarefa histórica em DApp específico | Registrar condições publicadas; não estimar pagamento | [S2](https://www.okx.com/en-us/help/okx-wallet-to-launch-cryptopedia-season-36): tarefa Momentum por sorteio | Bônus ativo, seleção, montante pessoal e custos totais |
| Rewards DeFi adjacentes | Skill oficial `okx-defi` | Pesquisa futura do contrato de descoberta | [S3](https://github.com/okx/onchainos-skills/blob/cfbb0bafa71898e50762cd9fa77f026b4a8caa1b/README.md): discovery e claim rewards | Não equivale a catálogo Wallet; endpoints/argumentos/acesso não revisados |

O exemplo S2 foi publicado em 25/06/2025 e terminou em 24/08/2025. Exige completar **e verificar** tarefas; algumas requerem liquidez, duração ou rota OKX DeFi específicas. Recompensas não são garantidas. Os organizadores podem excluir participantes, reter recompensas por abuso e alterar/cancelar a campanha. Participantes assumem impostos, taxas, gás e despesas; tokens podem desvalorizar ou ficar ilíquidos. O documento diverge nos totais anunciados (1.015.000 versus 935.000 USDT) e nos atrasos de verificação; não usar esses números como benefício atual nem regra universal. [S2](https://www.okx.com/en-us/help/okx-wallet-to-launch-cryptopedia-season-36)

O README oficial, fixado no commit `cfbb0bafa71898e50762cd9fa77f026b4a8caa1b`, descreve descoberta de produtos e rewards de protocolos DeFi. Não publica ali um esquema de listagem/estimativa de campanhas Wallet. A busca restrita a docs OnchainOS não forneceu esse contrato. Descoberta de produtos DeFi, saldo/posição pessoal e claim são etapas diferentes; este relatório não autoriza as duas últimas. [S3](https://github.com/okx/onchainos-skills/blob/cfbb0bafa71898e50762cd9fa77f026b4a8caa1b/README.md)

**Proposta local elegível, por inferência:** um registro manual somente leitura com URL oficial, publicação, período, cadeia, tarefa, condições, necessidade de carteira, custo declarado, benefício condicional, data da revisão e hash. Não automatizar endpoints internos da UI. Publicar campos ausentes como `unknown`; marcar campanhas encerradas; não converter pool total em retorno individual. Acesso público ao documento não comprova licença de feed, direito de redistribuição ou aprovação para extração automatizada; estes continuam pendências.

**Barreiras verificáveis:** nenhum endereço/conta, assinatura, claim, trade ou chamada autenticada; cada campanha precisa de regras vigentes próprias; benefício, probabilidade, acesso e custos pessoais permanecem desconhecidos. Um futuro adapter exige método/path/schema oficial inequívoco e revisão independente. Nenhuma instalação, recomendação de ganho ou taxa atual foi produzida.

Hashes e operações efetivamente consultadas estão em `SOURCES.json`. Configuração requerida Sol 6.1/xhigh; modelo, tier e sandbox efetivos desconhecidos. A confiança da consulta Jev é conselho registrado, não evidência factual.
