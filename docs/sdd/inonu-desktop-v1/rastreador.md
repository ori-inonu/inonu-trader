# Rastreador (inspirado no Rastreador de Criptomoedas do TradingView)

Parte do [SPEC](SPEC.md): RAS-1 a RAS-6, U15. Tarefas: M8 em [TASKS.md](TASKS.md). Rota `/rastreador`, entrada na barra superior (não na tela principal). Fonte de inspiração: página ao vivo do TradingView (F15), consultada em 2026-10-12.

## 1. O que o TradingView oferece e como cada item entra aqui

| TradingView (verificado) | Aqui | Observação honesta |
| --- | --- | --- |
| Universo de cripto | spot e perpétuos da OKX (cerca de 1160 spot e 500 perpétuos, 485 deles com margem em USDT, medidos em 2026-10-12) e tokens on-chain por rede (`hot-token`) | O universo é "negociável aqui", não "todas as moedas por valor de mercado" |
| Colunas Rank, Preço, Var % 24h, Valor de mercado, Vol USD 24h, Oferta em circulação, Vol / valor de mercado | Rank (por volume USD 24h), Preço, Var 24h, Vol USD 24h, Valor de mercado e Vol / liquidez (on-chain) | OKX não publica valor de mercado nem oferta para pares da corretora: coluna `-` com motivo. On-chain traz `marketCap`, `liquidity`, `holders` |
| Domínio social % | Menções e sentimento (`social/sentiment/symbol`, até 20 símbolos por chamada) | Camada de cobrança desconhecida (medir em T3.8); só para linhas visíveis e se habilitado |
| Categoria | Tipo de mercado (Spot, Perpetuo) e, on-chain, Em alta, Mencionado no X, Memepump, RWA, Reconhecido pela comunidade | OKX não tem categorias ricas como o TradingView; não inventamos |
| Tech Rating | **Pressão de fluxo** (descritiva) | Não é recomendação: sem verbo de ordem |
| Filtros: Rank, Valor de mercado, FD, Vol / valor de mercado, Endereços com saldo, Vol USD, Var. de vol. %, Vol. de transações USD, Var %, Perf %, Categoria | Ver seção 3 | FD não existe na OKX |
| Visões: Visão geral, Desempenho | Visão geral, Desempenho, Fluxo, Smart money, Risco | Fluxo, Smart money e Risco são nossas |
| Botão "IA" (linguagem natural) | **Perguntar ao Inonu** | Sob demanda, com teto (ASK-5) |
| Lista de universos | Universos: Todos, Spot, Perpétuos, On-chain por rede, Meus fixados | Reaproveita as estrelas e `watch-pins.ts` |

## 2. Fontes de dados, custo e frescor

| Dado | Fonte | Custo | Atualização |
| --- | --- | --- | --- |
| Preço, Var 24h, Vol USD 24h (spot e perpétuos) | OKX público `market/tickers` (`instType` SPOT e SWAP) e `public/instruments?instType=SWAP` | 3 chamadas, sem custo, sem credencial; os tickers a cada 60 s com a página visível e a lista de contratos **uma vez por sessão**. O volume de um perpétuo vem em **contratos**: Vol USD = contratos × `ctVal` × `ctMult` × último preço (aproximado, marcado `~`); sem o tamanho do contrato o volume é `-` (FLX-11) | a cada 60 s com a página visível |
| Open interest dos perpétuos | OKX público `public/open-interest` (`instType=SWAP`) | 1 chamada, grátis | a cada 5 min |
| Var 1 h e 4 h e sparkline (só linhas da janela visível, no máximo 30) | OKX público `market/candles` 1 m (até 240) | até 30 chamadas por atualização, respeitando 20 por 2 s | a cada 5 min |
| Tokens on-chain da rede escolhida | OnchainOS `token/hot-token` (Basic, até 100 por chamada; ranking por entrada líquida, volume ou tendência) | 1 Basic por página | TTL de 5 min |
| Janelas 5 m, 1 h, 4 h, 24 h, liquidez, holders, txs | `price-info` em lote de até 100 tokens (Premium) | 1 Premium por lote (a medir se conta 1 ou N, API-8) | TTL de 5 min |
| Carteiras inteligentes por token (nº, USD, fração vendida) | `signal/list` (Premium), cache | 1 Premium por consulta | TTL de 5 min |
| Risco (nível, % de topo, dev, bundlers, snipers, LP queimado, honeypot) | `hot-token` (campos inline) e `advanced-info` (Premium) só sob pedido | 0 a 1 por linha | sob pedido |
| Pressão de fluxo | `market/trades` público da OKX (até 500 negócios por leitura, só os do último minuto contam) **só para linhas da janela visível (até 30)**; on-chain, `txsBuy` e `txsSell` | 1 leitura REST gratuita por linha, espaçada de 150 ms (limite público de 20 por 2 s), lida em blocos de 5 para as células irem aparecendo | a cada 60 s enquanto visível; fora da janela mostra `-` com o motivo "fora da janela de calculo"; a janela que a amostra cobre de fato aparece na célula (um par muito negociado enche os 500 em poucos segundos) |
| Menções e sentimento | `social/sentiment/symbol` | camada desconhecida | só visível e habilitado |

Cada coluna exibe a idade do dado no cabeçalho ou no tooltip; dado vencido fica marcado e nunca como ao vivo (DAT-2). Sem credencial ou sem orçamento, as colunas on-chain mostram "Indisponivel" com o motivo e o atalho para Configurações.

## 3. Colunas, visões e filtros (RAS-3, RAS-4)

**Visões** (a seleção persiste localmente):

| Visão | Colunas |
| --- | --- |
| Visão geral | Rank, Ativo (ícone, símbolo, nome), Preço, Var 24h, Vol USD 24h, Valor de mercado (on-chain), Pressão de fluxo, Categoria |
| Desempenho | Ativo, Var 5 m (on-chain), Var 1 h, Var 4 h, Var 24h, sparkline 1 H (janela visível) |
| Fluxo | Ativo, Pressão de fluxo, Delta 60 s, CVD da sessão, desequilíbrios da última vela fechada, Fator Volume, idade |
| Smart money | Ativo, carteiras rastreadas (nº), USD, fração vendida, tipo (SM, KOL, Baleia), nota da trilha |
| Risco | Ativo, nível de risco, % topo 10, % dev, % bundlers, % snipers, LP queimado, honeypot, concentração de clusters |

**Filtros** (equivalentes aos do TradingView quando há dado): rede; mercado (spot, perpétuo, on-chain); Rank; valor de mercado; liquidez; endereços com saldo (holders); Vol USD 24h; variação de volume; transações; Var % por janela; categoria; tipo de carteira; nº mínimo de carteiras; risco máximo. Filtros sem coluna disponível ficam desabilitados com o motivo.

**Pressão de fluxo.** `pressao = (compraAgressiva - vendaAgressiva) / (compraAgressiva + vendaAgressiva)` na janela de 60 s (CEX) ou `(txsBuy - txsSell) / (txsBuy + txsSell)` na janela escolhida (on-chain), em `[-1, 1]`. A célula mostra o **valor medido com sinal** (por exemplo `+0,42`) e, ao lado, um rótulo descritivo do lado agressor. Faixas iniciais, configuráveis: `> 0,35` "Pressao compradora forte"; `0,10 a 0,35` "Pressao compradora"; `-0,10 a 0,10` "Equilibrada"; `-0,35 a -0,10` "Pressao vendedora"; `< -0,35` "Pressao vendedora forte". Volume total abaixo do piso adaptativo (`minVol` do [motor](flow-engine.md)) ou aquecimento incompleto mostra "Sem volume suficiente" ou "Aquecimento". É descritivo, nunca instrução (FLX-10).

## 4. Telas salvas, ordenação, teclado

- **Telas salvas** locais (`localStorage`, chave `inonu.screens.v1`, até 20): `{ nome, universo, filtros, visao, ordenacao, colunas }`; validadas por esquema ao carregar (entrada corrompida é descartada).
- **Ordenação** por qualquer coluna numérica, estável, ascendente ou descendente; padrão Vol USD 24h descendente.
- **Tabela** virtualizada (mais de 1500 linhas), cabeçalho fixo, rolagem dentro da tabela, navegação por teclado (setas, Enter abre o ativo na Mesa, `/` foca a busca, `P` fixa).
- Sem animação piscante ou pulsante; células atualizadas mudam de cor por transição única e discreta (variação positiva ou negativa), com contraste conforme o tema.

## 5. Perguntar ao Inonu e Pedir ao Inonu (RAS-5, RAS-6)

**Perguntar ao Inonu** (o "IA" do TradingView): campo de texto livre de até 300 caracteres. O modelo recebe **só a frase** (nenhum dado de mercado, nenhum instrumento) e responde **uma opção por pergunta fechada**, cada opção com seu significado:

| Pergunta | Opções |
| --- | --- |
| mercado | todos, spot, perpétuos |
| volume mínimo em 24 h | qualquer, 1 mi, 10 mi, 100 mi, 1 bi |
| variação de 24 h | qualquer, alta forte (> +10%), alta (> +3%), queda (< -3%), queda forte (< -10%), calmo (entre -1% e +1%) |
| posição por volume | qualquer, top 20, 50, 100, 200 |
| ordem | maior volume, maior alta, maior queda, maior preço |
| fixados | não, sim |

O código monta o filtro a partir das opções (`src/inonu/screener.ts`); nada que o modelo escreva vira campo, número ou texto na tela. Uma resposta que não seja exatamente uma das opções (opção desconhecida, pergunta faltando, chave a mais, palavra do próprio modelo) é descartada e vira `erro` com o motivo. A interface mostra o filtro como **chips que a pessoa pode tirar** e **só aplica quando ela clica em "Aplicar filtro"**; a proveniência "modelo: Jev (id)" e o custo medido aparecem junto. Os filtros de liquidez, holders, carteiras e risco entram quando o universo on-chain entrar. Custo: 1 chamada do modelo por pergunta, sujeita ao teto e ao cooldown de ASK-5, com a mesma frase reaproveitada por até 5 minutos sem nova chamada; o ledger registra (`modo: filtro`, sem o texto da frase).

**Pedir ao Inonu** (linhas selecionadas, **até 5 por pedido**: 10 linhas custariam cerca de 20 chamadas, acima do teto de 15 de [ADR-6](adr/ADR-6-custo-e-formas-de-uso.md)): monta um Brief por linha reutilizando lotes (`price-info` em lote, `hot-token` já em cache); só as 3 primeiras pela nota local da trilha recebem chamadas profundas (`advanced-info`, `trades` por carteira inteligente, `top-liquidity`); orçamento total do pedido, no máximo 15 chamadas OnchainOS ([ADR-6](adr/ADR-6-custo-e-formas-de-uso.md)). O resultado é um ranking de ids com razão curta e candidatos descartados, exibido no topo da tabela com proveniência "modelo: Jev".

## 6. Aceitação

AC-RAS-1 e AC-RAS-2 do [SPEC](SPEC.md): `/rastreador` abre pela barra; universo OKX e on-chain; colunas conforme este documento; filtros, ordenação e telas salvas funcionam **sem modelo**; "Perguntar ao Inonu" produz filtro validado; seleção gera pedido dentro do teto. O teste da barra (`web/src/lib/mesa/topbar-render.test.tsx:30-34`) e a especificação `docs/MESA-TOPBAR-SPEC.md` (T2, "duas seções") são atualizados na mesma tarefa (T8.1), e a regra de larguras de `DeskRail` acomoda a entrada nova sem cortar texto em 1100 px.
