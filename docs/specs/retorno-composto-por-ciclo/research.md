# Pesquisa: retorno composto por ciclo de 1 minuto, dados em tempo real e decisão mais rápida

Data: 2026-10-17. Fase: somente pesquisa. Nenhum código, configuração, journal ou carteira foi tocado. Nenhuma ordem, assinatura, chamada paga ou chamada ao Jev de dados foi feita pelos pesquisadores.

Método: workflow com 12 pesquisadores em paralelo (Haiku 5.5, esforço médio), um cético por tópico reconferindo 10 afirmações contra a fonte primária, um crítico de completude e 5 pesquisadores de lacunas (35 agentes, run `wf_31a20d79-702`). Eu li todas as saídas, refiz os cálculos e corrigi os erros que apareceram (seção 8). Ao final, conferi pessoalmente as duas fontes mais decisivas (cláusula 9.4 do OKX API Agreement e a tabela de planos). Saídas brutas em [evidence/](evidence/). O estado da verificação está em [status.md](status.md).

Pedido do dono: entender como fazer o Jev e o System One decidirem mais rápido e capturarem 0,5% a 1% por ciclo de 1 minuto sobre o capital inteiro, avaliar limites de API e a raspagem do ecossistema OKX Wallet e OnchainOS, e definir como tratar os dados. A meta é tratada como hipótese de trabalho a medir, sem promessa de lucro (regra do `AGENTS.md`).

## 1. Resposta curta

1. **Dá para ter dados em tempo real de todo o universo da bolsa OKX sem gastar cota OnchainOS e sem raspar nada.** Medido hoje: uma única conexão WebSocket pública, sem chave, aceitou os 1965 instrumentos vivos (1184 spot, 509 swap, 272 futuros) e entregou cerca de 3870 a 4100 mensagens por segundo no canal de tickers. Um único GET REST de tickers devolve o snapshot de todos os pares spot (1184 linhas).
2. **Esse feed cobre só a bolsa.** São 445 ativos-base distintos em spot. Os tokens Solana fora da bolsa (a carteira opera nesses) não estão nele. Para esses, as fontes são o estado dos pools lido on-chain por RPC e as APIs de agregadores, ambos com limites e custos mapeados em [api-limites-e-fontes.md](api-limites-e-fontes.md).
3. **Raspar o site da OKX é a pior opção disponível**, não a única. A cláusula 9.4 do OKX API Agreement ("Automated Scraping and Circumvention") proíbe scripts, bots e raspadores para extrair Market Data, inclusive de endpoints públicos sem autenticação, e remete acesso de alto volume a uma licença separada. A OKX também pode limitar ou encerrar o acesso a qualquer momento (cláusulas 4.4 e 14). O risco recai sobre a carteira e a conta do dono. Aceitar esse risco é decisão do dono, não minha nem do Jev. Detalhes na seção 5.
4. **A OnchainOS deve ficar com decisão e execução, como o dono propôs.** O plano Free dá 100 mil chamadas Basic e 100 mil Premium por mês (cerca de 2,24 chamadas por minuto de cada), sem WebSocket. O consumo de Basic já projeta acima do teto. Economizar a cota de dados é pré-requisito de qualquer ciclo mais curto.
5. **O gargalo de velocidade não é o modelo.** O Jev responde em 0,37 s de mediana. O que limita é o ritmo por relógio, o teto local de 720 consultas por dia, a coleta sequencial antes do modelo (pior caso de 170 s pelo código), o funil que descarta 57% dos candidatos antes do Jev e o atrito de execução.
6. **A meta, como média contínua de 0,5% líquido por minuto, não tem sustentação em nenhuma fonte encontrada**, e isso não é um trava: é o ponto de partida de uma escada de metas e de uma decomposição em janelas, ambas testáveis em sombra em horas (seção 3). O que o dado do projeto mostra hoje é o oposto da meta: 0 de 7 voltas positivas, -0,41% bruto.

## 2. O que foi medido e o que não foi

Números do projeto (fonte: documentos do repositório que citam os arquivos locais; os arquivos brutos `fills.jsonl`, `decisions-meta.jsonl` e `usage-*.json` ficam fora do versionamento e não foram reabertos):

| Item | Valor | Estado |
| --- | --- | --- |
| Voltas completas compra/venda | 7 (STONK 6, HOTBOT 1) | medido, amostra mínima |
| Resultado das voltas | 0 de 7 positivas, -0,316 USDC sobre cerca de US$ 77 a 78 (-0,41%; cerca de -0,62% com a rede) | medido |
| Atrito de ida e volta, ativo líquido | 0,17% a 0,56%, média 0,42% (6 pares de um só ativo) | medido, n pequeno |
| Atrito, intermediário e raso | 1,82% (1 par); pelo menos 2,1% só na entrada, igual para 2, 5 e 10 USDC | medido, n=1 |
| Taxa de rede cotada vs recibo | US$ 0,0005 cotado, US$ 0,0103 no recibo (cerca de 20 vezes) | medido, ainda sem decomposição |
| Movimento absoluto mediano em 1, 5, 15, 60 min | 0,38%, 0,63%, 1,03%, 2,23% (16 tokens, amostras sobrepostas, sem direção) | medido, frágil |
| Latência do Jev | mediana 0,371 s, p90 0,406 s, p99 1,57 s, máx 8,95 s (120 consultas) | citado, arquivo bruto ausente |
| Ciclo | um ciclo de 37,5 s; mediana de 2,9 s nos 15 ciclos que consultaram (24 amostras de um dia) | amostra mínima |
| Pior caso antes do modelo | 170 s por soma dos tetos no código; com modelo e ordem, 260 s e mais | cálculo do código, não medido |
| Funil de compra | 717 candidatos, 411 (57%) fechados antes do Jev, 268 pulados pelo modelo, 38 pedidos | medido |
| Capital | aparece como US$ 100, 118, 121 e 126 em fontes diferentes; medido por último: 118,17 a 118,80 em 2026-10-15 | divergente, a conciliar |

O que **não** existe e bloqueia qualquer conclusão de retorno: série conciliada de patrimônio com todas as pernas, custo decomposto por preenchimento (pool, impacto, rede, prioridade, gorjeta), carimbo de tempo por etapa do ciclo, contador de chamadas por rota e precisão direcional do Jev contra o movimento futuro.

## 3. A meta, reformulada para poder ser testada

Detalhes e contas em [matematica-da-meta.md](matematica-da-meta.md). Em resumo:

- 0,5% por minuto composto = x1,349 por hora e x1316 por dia; 1% = x1,82 por hora e x1,67 milhão por dia. Linear, sobre US$ 121, seriam US$ 0,61 a 1,21 por minuto (US$ 871 a 1742 por dia sem compor).
- **Escada de metas** em vez de um único degrau: 0,05% líquido por ciclo dobra o capital em um dia; 0,16% é o "10x em 24 h" que o dono já usou como alvo de raciocínio em `ANALISE-10X-EM-24H-20261015.md`; 0,25% dá x36; 0,5% dá x1316. Cada degrau é um critério mensurável, e a pesquisa não impõe teto.
- **Decomposição em janelas**: retorno por minuto = frequência de janelas por minuto x retorno líquido médio por janela. Exemplo: 0,5% por minuto equivale a uma janela de 5% líquido a cada 10 minutos. Isso troca "ganhar todo minuto" por "capturar janelas de expectativa positiva", que é o que os regimes documentados (lançamentos, deslocamentos) de fato oferecem.
- **Capacidade**: a % por minuto só compõe enquanto o tamanho do trade for pequeno diante da profundidade. Em pool de produto constante, o impacto médio é de cerca de 2 x tamanho / TVL, então impacto de 0,1% pede TVL de cerca de 2000 vezes o trade (US$ 242 mil para US$ 121; US$ 2 milhões para US$ 1 mil). O crescimento é geométrico só até aí.
- **Falsificação barata**: para detectar uma média de 0,5% por ciclo com desvio de 1% por ciclo bastam cerca de 32 ciclos independentes; com desvio de 2%, cerca de 126 (menos de 3 horas de ciclos de 1 min). Detectar 0,1% por ciclo pede 784 (desvio 1%) a 3136 (desvio 2%) ciclos. Isso vale com custos reais descontados e amostras não sobrepostas.

## 4. Dados, limites e o que mover para fora da cota

Resumo da cota (detalhe e fontes em [api-limites-e-fontes.md](api-limites-e-fontes.md)):

- **OnchainOS Market** (dados): Free 100 mil Basic e 100 mil Premium por mês; Starter US$ 99 (2 milhões e 600 mil, com WebSocket); Growth US$ 199 (5 milhões e 2 milhões); Scale US$ 399 (20 milhões e 10 milhões); Pro US$ 599 (50 milhões e 20 milhões); Enterprise sob consulta. Excedente por chamada (x402): US$ 0,0001 Basic e US$ 0,0002 Premium, exige assinatura de pagamento por requisição (o projeto não faz). Limite por segundo ou minuto do Market **não é publicado**; a página manda falar com o suporte. Estouro devolve código 50011 com HTTP 429.
- **OnchainOS Trade** (cotação e execução): Trial de 60 dias com 1 RPS (até 5 sob aprovação); Start-up de 2 a 50 RPS; Enterprise customizado. "O ajuste de RPS é correlacionado ao volume de negociação". Isso concilia a contradição entre tópicos: o Market não publica RPS, o Trade publica.
- **WebSocket da OnchainOS** (só pago): 3 requisições por segundo por API key e 480 inscrições por conexão por hora. O registro local diz "conexões por segundo"; a página diz requisições.
- **Bolsa OKX (pública, sem chave)**: WebSocket com 3 requisições de conexão por segundo por IP, 480 subscribe/unsubscribe/login por hora por conexão, 64 KB por requisição e queda após 30 s de silêncio. Limites de REST por endpoint ficaram **não verificados** (a página oficial tem 406 mil caracteres e a seção de Market Data não foi alcançada).
- **Jev (TypeSafe)**: US$ 0,042 por milhão de tokens de entrada, saída gratuita; contexto de 64 mil por requisição; limites por segundo definidos por organização no console, com 429 acima. Não há cota diária ou mensal publicada. Os 144, 288, 720 e 1440 por dia são **teto local de configuração**, não contrato.
- **Consumo de Basic**: projeção linear de 109,5 mil no mês em 2026-10-15 e de cerca de 158 mil em 2026-10-17 (nova leitura de `scripts/api-budget.ts`), acima do teto. Projeção linear de dia parcial: tratar como alerta, não como medida.

O que pode sair da OnchainOS sem custo: preços, volume, fluxo e books dos instrumentos da bolsa (feed público). O que **não** pode, hoje, sem contratar algo: preço contínuo dos tokens Solana fora da bolsa.

## 5. Raspagem do ecossistema OKX Wallet e OnchainOS

Matriz completa em [api-limites-e-fontes.md](api-limites-e-fontes.md). Pontos centrais:

- **Termos**: OKX API Agreement 9.4 (verificado por mim em 2026-10-17, leitura via resumo de modelo, não texto bruto): "You must not use automated scripts, bots, web scrapers, or any other automated means to extract Market Data". A página resume o alcance como o razoável para uso pessoal, com licença separada para alto volume, e diz que a restrição vale também para endpoints públicos sem autenticação. Outros termos: Build API Terms 5.3 (sem acesso não autorizado, sem interferir, sem engenharia reversa) e 1.1/3.3 (sem redistribuição); Ecosystem ToS 8.1 (serviço pode ser interrompido a qualquer momento). Não há cláusula de scraping no Build API Terms. Ausência de cláusula não é permissão. Isto não é parecer jurídico.
- **robots.txt** do web3.okx.com: grupo genérico com muitos `Disallow` para padrões com query string, `Allow` para `/api/*` e `/v5/*`, sem `Crawl-delay` (lido por resumo; não é autorização).
- **Técnica**: não se sabe se o site usa JSON interno ou HTML renderizado. De propósito ninguém inspecionou a rede do navegador para não sondar anti-bot. A raspagem tende a ser mais frágil (DOM, endpoint, anti-bot) e não há evidência de que seja mais rápida que o WebSocket oficial. O repositório já exclui raspagem de endpoints internos (`docs/okx-alpha-radar-v1/RESEARCH.md`).
- **Alternativas que dão o mesmo efeito** sem esse risco: (a) WebSocket público da bolsa para o universo listado; (b) estado de pools Solana lido on-chain por RPC; (c) APIs de agregadores dentro dos limites; (d) planos oficiais da OnchainOS (custo, decisão do dono).
- **Recomendação**: não raspar. Registrar como bloqueio do dono: aceitar risco de termos para raspagem de qualquer parte do site.

## 6. Arquitetura recomendada (resumo)

Detalhe em [arquitetura-e-decisao.md](arquitetura-e-decisao.md). Camadas: ingestão (WebSocket da bolsa; RPC de pools para o conjunto negociado; OnchainOS só para decisão e execução), normalização com identidade e relógio de evento (já existe em `src/pulse/facts.ts`), estado em memória com anéis de barras, motor de materialidade (movimento de K vezes a volatilidade, com cooldown), montagem do Brief por delta e por top N, consulta ao Jev por evento com prova de consumo, e executor único existente.

Quatro candidatos: A hub único em memória (recomendado como primeiro), B workers por conexão com escritor SQLite separado, C híbrido com OnchainOS seletiva, D estado de pools Solana por RPC. A e C reaproveitam o que o repositório já tem. D é o único que cobre tokens Solana sem cota e é o de maior esforço.

## 7. Ranking de oportunidades (crítico, ajustado por mim)

Ganho e esforço qualitativos: nenhum tópico mediu retorno líquido por ciclo.

| # | Oportunidade | Esforço | Risco | Depende do dono |
| --- | --- | --- | --- | --- |
| 1 | Medir em sombra: carimbo por etapa, custo decomposto, cotação sintética de ida e volta em lote, E0 das três classes de distorção | baixo a médio | baixo | decomposição que mude schema de journal é bloqueio |
| 2 | Portão de custo de ida e volta antes do Jev e taxa de rede medida no Brief | baixo a médio | baixo | passa pelo Jev (decisão de design) |
| 3 | Funil: medir o markout dos 57% de candidatos fechados antes do Jev contra os escolhidos | baixo | baixo | não |
| 4 | Feed público da bolsa como estado local em sombra (1965 instrumentos) e conjunto interseção bolsa x Solana | médio | baixo | não |
| 5 | Governador de cota por rota e cache por idade | baixo | baixo | não |
| 6 | Ciclo por evento com prova de consumo (E3) e pré-modelo em paralelo | médio | médio | zona do Codex em `src/decision-review/**` |
| 7 | Estado de pools Solana por RPC para o conjunto negociado (teste em plano gratuito) | alto | médio | provedor pago é bloqueio |
| 8 | Cotação de Jupiter como segunda opinião antes da execução | médio | médio | nova dependência é bloqueio |
| 9 | Bundles Jito e proteção contra sanduíche em tokens rasos | médio | médio | custo de execução, dono |
| 10 | Enriquecimento Premium direcionado a poucos candidatos | médio | baixo | não |
| 11 | WebSocket pago da OnchainOS (US$ 99 por mês é cerca de 82% do capital) | baixo | alto | **bloqueado, cobrança** |
| 12 | Terceiros licenciados de dados | médio | médio | **bloqueado, cobrança** |
| 13 | Raspagem do site | alto | muito alto | **bloqueado, termos** |

## 8. Correções que fiz sobre o que os agentes entregaram

- Fórmula de impacto (tópico 1): o agente escreveu impacto de cerca de tamanho / (2 x profundidade) e US$ 60 mil de profundidade para US$ 121. Em produto constante o impacto médio é de cerca de 2 x tamanho / TVL, o que dá US$ 242 mil. Corrigi.
- Kelly (tópico 11): o cético corrigiu f* para sigma de 0,5% (200, e não 2). A leitura "incompatível com risco de ruína" também estava frouxa: f* = mu / sigma^2 maior que 1 só diz que, se o edge fosse real e conhecido, o ótimo seria alavancado. O risco real é o erro de estimação de mu. Ver [validacao-e-baseline.md](validacao-e-baseline.md).
- Números do pump.fun (tópico 9): a mediana de 4,9 min, os 83% em 1 hora e os 43,8% e 19,7% de sobrevivência de liquidez não têm fonte que os sustente e foram **removidos**. Fica a taxa de graduação de 1,4% a 6,7% conforme o período (mecanismo BOOST em julho de 2026), de fonte secundária.
- Liderança de preço (tópico 10): o working paper não revisado mostra liderança da DEX em ETH e SOL e da bolsa só em BTC; a afirmação de liderança da bolsa em Ethereum foi refutada.
- Citações de cláusulas (tópico 5): as seções 2.2, 2.7, 5.7 e 9.1 do ToS não dizem o que o agente atribuiu. Só 8.1 confere. Removidas.
- Cadência (tópicos 1 e 11): o literal `120_000` em `scheduler.ts:112` é timeout da etapa `after`, não cadência. A cadência é `intervalMin x 60_000`. A capacidade de consultas do perfil arrojado fica dimensionada para 2 minutos (720), então o orçamento recusa a consulta 721 mesmo com intervalo quente de 1 minuto.
- Premium a 1 minuto (tópico 2): 133,2 mil por mês passa do teto de 100 mil; excedente de cerca de 33 mil chamadas.

## 9. O que depende do dono (bloqueios registrados, nada decidido)

1. Plano pago de qualquer provedor (OnchainOS, RPC, dados). Starter custa US$ 99 por mês, cerca de 82% do capital.
2. Aceitar o risco de termos para raspar qualquer página da OKX.
3. Ler no console da TypeSafe a cota real da organização (requisições e tokens), e pedir à OKX o RPS vigente da conta.
4. Ordens reais de calibração (custo all-in por classe de liquidez com pelo menos 30 execuções).
5. Qualquer alteração de schema dos journals em `data/` (por exemplo estender `fills.jsonl`), limites de risco e dimensionamento.
6. Mudar a capacidade de consultas além de 720 por dia.

## 10. Decisão de design levada ao Jev

Pergunta: qual deve ser a primeira etapa de implementação. A primeira tentativa foi recusada ("teto diário de 200 chamadas ao Jev esgotado"; outras sessões tinham consumido o teto), e por regra do projeto registrei provisoriamente a opção mais reversível, **medir primeiro em sombra** (carimbo por etapa, custo decomposto por cotação sintética, E0), sem mudar decisão nem executor. Depois o dono mandou remover o teto diário e a decisão foi refeita: **o Jev chegou a consenso em `medir_primeiro`** (média 0,95, acordo 1,0, margem 0,92; 12 chamadas, 0 falhas; as opções vedadas `raspagem_site` e `plano_pago_ws` foram removidas pelo código). Recibo em [decisoes-jev/recibos/rc-primeira-etapa.json](decisoes-jev/recibos/rc-primeira-etapa.json) e nó `jev-rc-primeira-etapa` no grafo. É recomendação, não autoriza nada.

## 11. Índice desta pasta

- [matematica-da-meta.md](matematica-da-meta.md): escada de metas, requisitos, capacidade, amostra.
- [api-limites-e-fontes.md](api-limites-e-fontes.md): limites verificados, conflitos resolvidos, fontes de dados, matriz de raspagem.
- [arquitetura-e-decisao.md](arquitetura-e-decisao.md): camadas, candidatos, orçamento de tempo, velocidade de decisão, execução e custos.
- [fontes-de-edge.md](fontes-de-edge.md): catálogo de fontes de vantagem com nível de evidência.
- [validacao-e-baseline.md](validacao-e-baseline.md): linha de base, gargalos G1 a G10, protocolo e métricas.
- [spec.md](spec.md), [plan.md](plan.md), [tasks.md](tasks.md), [status.md](status.md).
- [evidence/](evidence/): saídas brutas dos agentes com veredito do cético.
