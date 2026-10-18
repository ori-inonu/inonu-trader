# Alpha Radar — contrato público delimitado

Pesquisa factual em 10/10/2026; coletas HTTP registradas entre 17:36:17 e 17:36:44 UTC. Duas consultas de busca, quatro páginas oficiais alvo. Nenhum endpoint de dados, login, autenticação, carteira ou operação foi exercitado.

Alpha Radar é apresentado como ferramenta para selecionar tokens e encontrar carteiras classificadas como smart money ou influentes que os detenham; o texto também associa a descoberta a grandes carteiras, contratos populares e movimentos iniciais de liquidez. Isso descreve finalidade, sem definir um algoritmo verificável ou provar retorno. [OKX Wallet, publicação 14/08/2025; atualização 21/08/2025](https://web3.okx.com/learn/onchain-weekly-22).

| Aspecto | Evidência pública | Contrato ou pendência |
|---|---|---|
| Entrada da interface | A navegação oficial liga Alpha radar a [address-radar](https://web3.okx.com/address-radar) e anuncia filtros de tokens para encontrar endereços. | URL pública explícita; parâmetros, tipos, limites, ordenação e lista dos filtros não constam no HTML coletado. |
| Tokens e carteiras | A [publicação Alpha Hunting](https://web3.okx.com/learn/onchain-weekly-22) descreve seleção de tokens e detentores influentes. | Não define chave chain/token, normalização de endereço, chain IDs, classificação smart money ou deduplicação. |
| Dados apresentados | O [artigo europeu](https://www.okx.com/learn/wallet-and-onchain-services-available-in-europe), publicado 29/08/2025 e atualizado 01/09/2025, associa conjuntamente Signal e Alpha Radar a holdings, transações recentes e padrões de endereços. | Atribuição coletiva; não identifica quais campos pertencem a cada ferramenta. A menção conjunta a 140+ redes não é matriz de suporte exclusiva do Radar. |
| Unidades e relógio | O HTML de [address-radar](https://web3.okx.com/address-radar) devolve principalmente navegação e rótulos de Tracker/Holdings/PnL. | Sem schema específico de Alpha Radar, unidade de quantidade/preço/valor/PnL, moeda, timestamp, janela, atualização, cobertura ou paginação demonstrados. |
| API, CLI e acesso | A [introdução Onchain OS](https://web3.okx.com/onchainos/dev-docs/home/what-is-onchainos) documenta genericamente Skills e Open API. | Não estabelece ligação explícita ao Alpha Radar, método/path, envelope, auth, quota, preço, CLI ou exportação. Não foi encontrada API específica na superfície consultada; isso não demonstra inexistência universal. |

O artigo Alpha Hunting descreve alertas por preço/volume/listagens sob Signal e posições/PnL/mudanças de ativos em tempo real sob Tracker. Esses contratos não foram transferidos ao Alpha Radar. Tampouco há equivalência demonstrada com Meme Pump. [Fonte oficial](https://web3.okx.com/learn/onchain-weekly-22).

A publicação europeia trata disponibilidade de um conjunto de serviços e ressalva restrições regionais. Não comprova acesso desta conta, elegibilidade pessoal, custos ou necessidade específica de conectar carteira ao Radar. Sua extração web foi lida, mas o GET direto redirecionou para pt-br e retornou 404: o hash registrado é do erro, não do artigo. [Fonte e ressalvas](https://www.okx.com/learn/wallet-and-onchain-services-available-in-europe).

**Inferência para uma futura SPEC, sem implementação:** manter uma referência local à interface com proveniência e estado de integração desconhecido; exigir fonte explícita antes de associar qualquer campo/API ao Radar. Aceitação independente: vínculo verificável à URL oficial; unidades/identidade/frescor desconhecidos preservados; nenhum resultado tratado como feed observado ou ganho; testes futuros de identidade/unidades não podem preencher lacunas com fixtures sintéticas.

Alternativas reais: referência documental/manual com campos desconhecidos; ou adaptador automatizado dependente de contrato oficial adicional e validação autorizada. A pesquisa não escolhe prioridade entre elas. Exclui scraping de endpoints internos, autenticação, trades e certificação financeira.

[SOURCES.json](SOURCES.json) conserva URLs, datas, trechos literais e hashes dos corpos HTTP. Três HTML válidos foram fixados; publicação/atualização desconhecidas nas páginas de produto e introdução. Houve repetição dos mesmos alvos após falha local de codificação; nenhum quinto documento canônico foi pesquisado. Configuração exigida Sol6.1/xhigh; modelo, tier e sandbox efetivos desconhecidos.

