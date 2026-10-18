# Revisão independente 2 (T11.3): painel de 5 abas, descoberta, alertas, Aceitar, fonte do motor

Data: 2026-10-13. Sessão c38db1 (implementador). **Revisor:** um agente distinto, sem o contexto desta conversa, trabalhando numa **cópia isolada** do repositório (476 MB, sem `.git`, sem credenciais, sem dados, sem executável), com ordem de não editar nada e de não tocar as portas 3000, 3001, 3030, 3031 e 47321. Reproduções dele ficaram na pasta de trabalho da sessão, fora do repositório.

**Resultado:** nenhum bloqueador. Nenhum caminho que assine ou envie, nenhum segredo numa resposta, log, ledger ou Brief, nenhuma chamada ao modelo em segundo plano. Oito achados maiores (defeitos de correção ou de contagem) e uma lista de menores. Cada um abaixo, com a disposição e o teste que o prende.

## Maiores

| # | Achado | Disposição | Teste |
| --- | --- | --- | --- |
| 1 | O hash do Brief inclui `asOfMs` e as idades, então a reutilização da resposta (ASK-2) nunca disparava com uma fonte real | **Corrigido**: a resposta é reaproveitada quando nada material mudou (`materialChange`: mesmas candidatas e estados, nota a menos de 10 pontos, mesmas corridas), não por hash igual | `ask.test.ts`: "the clock alone is not a change" e "less than ten points reuses" |
| 2 | O pedido que o botão de um alerta deixa para o painel do Inonu nunca expirava: minutos depois, outro painel com a mesma chave montava e consultava o modelo sem clique | **Corrigido**: o pedido vale 15 s e depois é esquecido | `ask-trigger.test.ts`: "forgotten inside its window", janela entre 5 e 30 s |
| 3 | Uma resposta podia pousar no assunto errado (trocar o ativo ou a rede durante o pedido); "Aceitar" gravaria a decisão antiga com o nome do assunto novo | **Corrigido**: o painel do Inonu e o do "Descobrir" têm `key` por assunto, então trocar de assunto troca o painel. Resta: o pedido já em voo continua no núcleo até terminar (o núcleo é de voo único), só deixa de aparecer | `ask-keyed.test.tsx` |
| 4 | Instrumento de preço minúsculo (tick de 1e-9) perdia a leitura inteira: o arredondamento a 8 casas zerava o passo e colapsava os níveis, e o navegador recusava tudo | **Corrigido**: arredondamento a 12 dígitos significativos, em qualquer grandeza | `overlay.test.ts`: "an instrument that costs a fraction of a cent" (3 testes) |
| 5 | A idade das vistas do motor era contada com o relógio do navegador contra o da corretora: com o Windows 90 s adiantado, leitura nova aparecia como "dado velho" | **Corrigido**: as vistas usam `exchangeNowMs` (navegador mais a diferença medida); o descarte de leitura antiga no leitor conta a idade desde a chegada, não pelo carimbo | `clock.test.ts` (4), `overlay-feed.test.ts` |
| 6 | Chamadas ao provedor que saíram não eram contadas quando a fonte recusava depois de ler (sem sinais, sem dado, só honeypots) | **Corrigido**: `SourceError.onchainosCalls`, `countSentCalls` e `withSentCount` no núcleo; o pedido e o ledger passam a dizer quantas saíram. A contagem do cabo do gateway já estava certa; isto era o relato | `source-count.test.ts` (5), `ask.test.ts`, `handlers.test.ts` (2 leituras, 2 no ledger) |
| 7 | Uma chamada ao modelo de custo desconhecido (timeout, cancelamento) desligava o teto diário em dólar | **Corrigido**: o ledger guarda `usdEstimado` (a estimativa feita antes da chamada); o teto diário conta o custo medido ou, na falta, a estimativa. O custo medido do painel de uso continua `null` quando algo não foi medido | `ledger.test.ts` (4), `ask.test.ts` (2) |
| 8 | Limiares por minuto aplicados a uma janela de 500 negociações, que em par pouco negociado cobre horas | **Mitigado**: o footprint cobre só o último minuto (`FLOW_WINDOW_MS`), como os limiares. Em par muito parado a leitura fica vazia e diz isso. **Desvio D4-06**: "janela" deixou de ser "as 500 últimas negociações" | `source.test.ts` (2) |

## Menores

| Achado | Disposição |
| --- | --- |
| Sem checagem de aborto depois de `source.build`: um cancelamento ou tempo esgotado durante a leitura ainda chamava o modelo | **Corrigido** (`ask.ts`), teste "cancelled while the data was being read" |
| Cada instrumento consultado era seguido para sempre (assinatura, janela, arquivo por minuto) | **Corrigido**: o coletor segura no máximo 24 instrumentos; além disso o instrumento vem da corretora a cada clique | `collector.test.ts` (3) |
| `okx-public.instrument` ignorava `ctType`: contrato inverso (`BTC-USD-SWAP`) tratava o valor em dólar como moeda | **Corrigido**: contrato inverso é "instrumento nao suportado" | `okx-public.test.ts`, `source.test.ts` |
| A migração das vistas do painel não era gravada: depois de clicar noutra aba, o recarregamento perdia a vista antiga | **Corrigido** (`migrateSubs`) | `dock-subviews.test.ts` (2) |
| O `useMemo` dos corpos do painel não dependia do relógio: idades da fita e da liquidez on-chain congelavam | **Corrigido**: reconstrói a cada 5 s |
| A memória do fluxo checava o prazo de 6 h pelo carimbo do arquivo, que cada minuto fechado renova; volumes fracionários derrubavam a análise | **Corrigido**: cada minuto carrega o próprio `closedAtMs` e envelhece sozinho; volumes são inteiros | `flow-memory.test.ts` (4), `collector.test.ts` |
| Cofre inacessível aparecia como chave "ausente" (CFG-1 pede estado de falha explícito) | **Corrigido**: `vault: "indisponivel"` no estado, no Doctor (falha com ação) e na tela de Configurações ("nao foram apagadas") | `vault.test.ts` (4), `doctor.test.ts`, `client.test.ts`, `settings-view-render.test.tsx` |
| `cleanup.ts` normalizava terminações de linha mistas, apesar de prometer "byte a byte" | **Corrigido** na remoção (cada linha mantida guarda a sua terminação); a **restauração** escreve com a primeira terminação do arquivo, dito no cabeçalho | `cleanup.test.ts` (2) |
| Cancelar pelo painel usa o `running.id` global, então o cancelar de um painel pode derrubar o pedido de outro | **Não corrigido**: o núcleo é de voo único e o botão só aparece no painel que está pedindo; risco baixo, registrado |
| `onchain-read/client.ts`: a nova tentativa após 50102 envia duas requisições e relata uma | **Não é desta sessão** (arquivo da Fase 2); relatado ao usuário |
| `main.ts` aceita `INONU_VAULT_SERVICE` também no executável compilado | **Mantido**: o teste de fumaça usa um serviço descartável por essa variável; risco aceito (quem controla o ambiente do processo já controla o app) |
| `Origin` e `Sec-Fetch-Site` são forjáveis por qualquer processo local: "só com clique" vale contra páginas web, não contra processos locais | **Limite declarado**, inerente à porta local |
| Acentos nos textos do Fontes (clientes antigos `okx-ws.ts`, `okx-rest.ts`) | **Mantido** (**D4-07**): são textos de código anterior a esta entrega com testes próprios; a regra "sem acentos" vale para os textos desta entrega e nenhuma varredura cobre os antigos |

## Qualidade dos testes

- **Varreduras alargadas**: `no-send-scan.test.ts` passou de 36 para os módulos do painel, da barra e da mesa (e passou limpa); `animation-scan.test.ts` idem, estilos incluídos. Os módulos da carteira antiga (`lib/okx-wallet.ts`, `wallet-transaction-preflight.ts`) seguem fora da varredura de envio por serem anteriores a esta entrega; o revisor os leu à mão e estão limpos.
- **"Nunca mais de 15"** no teste da descoberta: o plano só tem 11 itens, então o teste não exercita o limite; foi renomeado para dizer só o que mostra.
- **Varredura do cliente do modelo** agora inclui `MesaView`, `DeskRail` e `TopbarAlerts`.
- **Reconhecidos como fracos, mantidos como documentação de contadores**: "without any click nothing calls the model", "holds nothing but subject keys", "same input same plan", "no order sent" (literal `false`). A garantia forte está nas varreduras e no tipo `enviaOrdem: false`.
- **Lacunas ainda abertas**: nenhum teste monta os ganchos (`useEngineAlerts`, troca de instrumento) num DOM real, porque o projeto não tem DOM de teste; a ordem dos efeitos do React fica coberta só por leitura e pelas peças puras.

## Documentos conferidos pelo revisor

Confirmados: `freeze --check` (r3, 13 arquivos), `verify-citations`, `okx-coverage --check`, as contagens de testes citadas, `systemOneLine={null}`, Fluxo com 12 linhas e Zonas com 6, "Central" escondido no instalável. **Estavam errados ou velhos e foram corrigidos**: as contagens por pasta do CHECKPOINT, a fonte do preço no T7.3 (`JEV_USD_PER_MTOK` vs `prices.json`), o caminho do T2.4 (`src/desktop/cleanup.ts`), o alcance das varreduras em T9.8 e T10.5, e o "contadas pelas que saíram" do T7.10, que só valia no caminho de sucesso (agora vale também na recusa).

## O que o revisor não pôde conferir (continua sem evidência)

O executável compilado, o cofre do Windows, o instalador, as leituras ao vivo, o modelo real, as capturas, a suíte completa da raiz (rodei-a eu: 4420 passam, 2 ignoradas, 0 falham), a ordem real dos efeitos do React, o desenho do canvas e o `next build`.
