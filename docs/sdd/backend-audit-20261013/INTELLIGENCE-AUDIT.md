# Auditoria de inteligência e risco do backend

Data: 2026-10-13. Papel: pesquisador, sem implementação nem certificação da própria proposta. Entrada exclusiva: `C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/baseline`. Identidade desta execução: thread `01a13629-d057-7821-a554-a42994564eb9`, sessão `01a1361d-519c-7a83-a461-fff1a29f0317`. Contexto local do harness: revisão 0, fase research; não foi importado estado de outra conversa.

## Resultado e prioridade

Cinco defeitos foram reproduzidos offline. O primeiro afeta diretamente o relatório de risco; os demais comprometem dados de resultados e um futuro treinamento. A suíte existente das áreas examinadas passa, portanto esses casos são lacunas reais de cobertura.

| Prioridade | Achado | Classe e contrato | Escopo mínimo proposto |
|---|---|---|---|
| P1 | A grade da carteira mistura períodos e depende da ordem das posições; uma captura vazia elimina o risco das outras | Defeituoso: Q-06, integração/agregação e unidade temporal | Novo `src/portfolio-analytics/captured-report.ts` e ligação pequena em `scripts/quant-portfolio.ts`; preservar `src/quant/**` reservado |
| P1 | Snapshot anterior às chamadas inclui fluxo medido depois daquele instante | Defeituoso: REC-4, vazamento temporal | `src/outcomes/recorder.ts`, `src/intel/features/from-analysis.ts` e respectivos testes, após confirmar ownership vigente |
| P2 | Triple barrier ignora a invalidação da zona | Defeituoso: REC-3 e AC-INT-2, rótulo inconsistente | `src/outcomes/labeler.ts`, comentário/tipos associados e teste |
| P2 | Leitura aceita vetor v1 vazio e de outro instrumento/instante | Defeituoso: REC-1/REC-5 e contrato literal de FeatureVector v1 | `src/outcomes/store.ts` e teste de parser/leitura |
| P2 | `decisions.jsonl` ultrapassa indefinidamente o teto da pasta | Defeituoso: REC-2, retenção/armazenamento | `src/outcomes/store.ts` e testes; compatibilidade de decisões legadas |

As propostas são tarefas candidatas dentro do objetivo autorizado, sujeitas à integração e revisão independente do coordenador. Arquivos reservados continuam audit-only: Inonu ask/model/source/http, desktop handlers, settings/vault, quant/capture e web. Nenhuma proposta troca a ação do Jev por algoritmo, altera a cadência do trader ou liga inferência automática.

## 1. Grade e cobertura do relatório de carteira

**Evidência literal:** `scripts/quant-portfolio.ts:57` faz `JSON.parse(...) as CaptureFile`, sem validar a identidade, o período e o envelope. Em `:59` insere também `audit.usable=[]`; em `:63` escolhe `const barMs = [...series.values()][0]?.barMs ?? 900_000;`; `:65–69` intersecta timestamps de todas as séries. `:73` calcula retornos nessa interseção. A escala diária é `DAY_MS / barMs` em `src/quant/portfolio.ts:180` e `sigmaBar * Math.sqrt(barsPerDay)` em `:266`. A frase em `scripts/quant-portfolio.ts:62`, “contiguous because each usable series is”, só é verdadeira se todas compartilham o período.

**Contrato:** dados-quant SPEC `:31`, Q-06: cobertura de valor, risco e exclusões observáveis, “posição sem valor sai do cálculo e a cobertura cai, nunca vira zero; sem retornos suficientes o risco é `null`”. O relatório declara retornos por barra; mudar a ordem não pode mudar sua unidade física. Aqui o erro não está na fórmula de covariância, mas no adaptador de capturas.

**Entrada reproduzida:** posições BTC e ETH, USD 1000 cada. Arquivos com nomes esperados `<KEY>-USDT-SWAP-15m.json`; BTC contém 133 barras de 900000 ms e ETH 67 barras de 1800000 ms. `T=1800000000000`, `capturedAtMs=T+134*900000`; início `T+i*barMs`, preço `100*exp(0.03*sin(i*barMs/900000))`, open=close, high=close*1.001, low=close*0.999, volume=1, confirmed=true. Os 67 timestamps comuns são separados por 30 minutos. Execução real do CLI, mantendo todos os dados e invertendo apenas positions:

```json
{"firstBTC":{"barMs":900000,"observations":66,"sigmaDaily":0.34862440251643656},"firstETH":{"barMs":1800000,"observations":66,"sigmaDaily":0.24651467910648078},"dailyRatio":1.414213562373095}
```

Segundo caso: BTC do mesmo fixture e SOL com `candles=[]`, ambos com valor conhecido USD1000. Resultado: concentração USD2000, mas `risk={"status":"unavailable","reason":"too_few_observations"}` para toda a carteira, sem exclusão SOL. A série BTC tinha 132 retornos suficientes. O CLI perde evidência válida ao intersectar com a série vazia.

**Correção mínima:** separar parsing/alinhamento num módulo puro novo; validar `instId`, `barMs`, `capturedAtMs`, arrays e campos antes do cast; exigir um período explícito e preservar continuidade; excluir a captura sem observações com motivo antes de construir grade. Concentração deve continuar contando valor conhecido; risco deve declarar precisamente ativos e fração de valor cobertos. Sem inferir preços nem ressamplear silenciosamente. Acrescentar motivos da camada de captura, sem alterar os enums/módulos quant reservados.

**Alternativas reais:** A) exigir 15m conforme o nome/contrato do arquivo e excluir/rejeitar os demais com motivo, menor mudança; B) aceitar períodos comuns declarados, todos iguais, exigindo horizonte explícito e reportando a unidade. Resampling explícito ampliaria requisitos e não é necessário para corrigir o defeito.

**Aceitação independente / seam:** teste puro do novo `captured-report` com os fixtures acima e execução do script como consumidor. Ordem de posições preserva métricas e exclusões; nenhuma série 30m é rotulada 15m; série vazia não apaga BTC; cobertura do risco é 0.5 com SOL excluído quando BTC fornece observações suficientes; identidade divergente e JSON estruturalmente inválido dão erro/motivo estável. Casos sem qualquer série válida retornam risco indisponível, jamais zeros inventados. Nenhum teste exige feed, carteira, assinatura ou `.env`.

## 2. Fluxo futuro é gravado como presente

**Evidência literal:** `src/outcomes/recorder.ts:113` captura `asOfMs = deps.now()` antes do quote em `:116` e de cinco leituras de barras. A análise é obtida somente em `:148`; `:149` chama `flowInputFromAnalysis(reading.analysis, asOfMs)` e ignora `FlowReading.nowMs` declarado em `:34`. `:176` também grava as zonas dessa análise posterior. Em `src/intel/features/from-analysis.ts:31`, `Math.max(0, nowMs - last)` converte uma leitura do futuro em idade zero, escondendo o erro.

**Contrato:** inteligência SPEC `:44`, REC-4: “Nenhum valor de um snapshot em t muda se as velas posteriores a t forem removidas (sem olhar o futuro)”; AC-INT-1 `:104` exige ausência de atributos futuros. O comentário de FeatureInput também exige preço no instante `asOfMs` (`src/intel/features/types.ts:47–48`). A filtragem temporal de candles em `closedBars` não protege os blocos de fluxo, zonas, quote e regime.

**Entrada reproduzida:** clock começa em 300000; quote injetado avança o clock a 305000 e retorna mid100/spread2; todas as barras vazias; leitura de fluxo tem `nowMs=305000`, `janela.ateMs=305000`, warm=true, compras90/vendas10, níveis presentes e zonas vazias. Nenhuma chamada real. Resultado:

```json
{"snapshotMs":300000,"analysisMs":305000,"expectedDelta":null,"actualDelta":0.8,"actualAgeMs":0}
```

**Impacto:** um futuro dataset pode usar informação que só existiu depois de sua entrada, aparentando qualidade indevida em validação. Esta reprodução demonstra vazamento de dados, não vantagem econômica. Atribuir t ao início de uma coleta assíncrona não estabelece que todos os componentes existiam em t.

**Correção mínima:** definir um instante comum com proveniência. Para preservar t fixo, usar apenas leitura capturada em/antes de t e ignorar com motivo estável qualquer bloco posterior; zonas obedecem o mesmo gate. Acrescentar timestamp ao contrato do quote/regime quando for necessário provar sua disponibilidade. `ageMs` não deve normalizar futuro para zero. Alternativa: definir t após a coleta, desde que todos os componentes tenham timestamp e nenhum futuro a esse t seja permitido; isso muda o instante de entrada e exige aceitação explícita da semântica, sem fingir snapshot na fronteira exata de 5m.

**Aceitação independente / seam:** ampliar `recorder.test.ts` com clock que avança durante I/O e análise posterior; inserir/remover fluxo e zonas após t não muda o snapshot de t; valor posterior fica null com motivo, nunca idade0. Teste complementar em `from-analysis` rejeita last>asOfMs. A suíte atual só protege candles futuros. Ao implementar, manter off=zero writes, falha parcial contabilizada, dependências injetadas e nenhuma chamada ao modelo. Ligações em handlers/Inonu aguardam ownership vigente.

## 3. Rótulo de parada usa somente ATR

**Evidência literal:** `src/outcomes/labeler.ts:28–30` recebe apenas side, entry, atr e window; stop=entry±ATR, target=entry±1.5ATR. Chamadas em `:88–89` não passam `Snapshot.zones`. A invalidação só entra na reação da zona em `:44`, não na triple barrier. `src/outcomes/types.ts:58` descreve a implementação restrita a ATR, divergindo da SPEC.

**Contrato:** REC-3 em inteligência SPEC `:43`: “parada = invalidação da zona ou 1 ATR de 15 min, alvo = 1,5 vezes a parada”; AC-INT-2 `:105`: rótulos devem bater com vetores à mão. Portanto é defeito de código/comentário frente ao contrato congelado, não falta de parâmetros de modelo.

**Entrada reproduzida:** entry100, ATR10, custo20bps, demanda[98,100], invalidação99, asOf0; três barras confirmadas 5m com open100/high101/low98.5/close98.75, timestamps0/300000/600000; now900000. O fechamento já está além da invalidação, evitando depender de interpretação de wick. Resultado literal:

```json
{"completo":true,"brutoLongBps":-125,"liquidoLongBps":-145,"barreiraLong":"tempo","barreiraShort":"tempo","zonaDemanda":{"tocou":true,"reagiu":false}}
```

Esperado: `barreiraLong="parada"`; o stop ATR90 nunca é alcançado. A reação já reconhece que a ideia de demanda falhou, mas o rótulo de barreira a trata como timeout.

**Correção mínima:** construir a distância de stop por lado a partir da invalidação válida da zona, com fallback ATR quando não houver; target=1.5 dessa distância. Manter desempate conservador stop antes de alvo na mesma barra. Zone invalidation precisa estar no lado válido de entry; input inválido dá fallback/null com motivo conforme o contrato, sem distância negativa. Alternativa mais ampla de registrar duas políticas distintas (zona e ATR) é possível, mas exige versão/contrato novo e não substitui REC-3.

**Aceitação independente / seam:** teste do fixture e espelho short; fallback sem zona mantém os vetores ATR atuais; distâncias válidas de zona produzem alvo correto; inválida/ausente não cria sinal; append de candles além do horizonte mantém o label; o teste conservador existente continua passando. O coordenador/revisor deve congelar a interpretação de prioridade zona/fallback e condição de invalidação antes da implementação.

## 4. Parser não valida FeatureVector v1

**Evidência literal:** `src/outcomes/store.ts:43` exige apenas objetos, versão1, uma string instId e número asOfMs; `:44–46` percorre valores existentes. Objetos vazios passam. Em `:56` preserva identidade/instante do vetor sem reconciliar com o snapshot. Contrato literal em `src/intel/features/types.ts:65`: “Every name of FEATURE_NAMES, in that order”; `:76–77`: lista fixa, alterar nomes exige nova versão. O produtor em `compute.ts:55` e `:235` sempre materializa todos os atributos; o leitor não impõe esse contrato.

**Contrato:** REC-1 vetor v1 e REC-5 null com motivo; REC-2 linha corrompida contada/pulada. `store.ts:5` promete que linha diferente da forma documentada é danificada.

**Entrada reproduzida:** snapshot id=s, ETH-USDT, asOf0, price100, cost20, ATR10, origem=relogio; `features={v:1,instId:"BTC-USDT",asOfMs:999999,values:{},nulos:{},idades:{}}`. `parseSnapshot(...)` devolveu esse snapshot integralmente, em vez de null. Valores ausentes não recebem motivo e a identidade temporal/instrumental diverge silenciosamente.

**Correção mínima:** validar a lista fixa FEATURE_NAMES, identidade e instante iguais ao snapshot e motivo para cada valor null; rejeitar valores/versão incompatíveis. Não completar campo ausente com zero ou construir atributos retrospectivamente. Alternativa: migrar legado para uma versão distinta, com origem e hash próprios, mantendo v1 estrito; não aceitar legado defeituoso como v1.

**Aceitação independente / seam:** testes `parseSnapshot` e leitura JSONL rejeitam vetor vazio, atributo omitido, instId/asOf divergentes e null sem motivo; cada linha rejeitada incrementa corruptLines; round-trip de `computeFeatures` válido continua funcionando. Defaults e permissões continuam locais; não se altera comportamento do modelo.

## 5. Decisões escapam do teto de armazenamento

**Evidência literal:** `src/outcomes/store.ts:149` inclui `decisions.jsonl` em ownFiles e nos bytes. `:147–148` inclui somente snapshots/labels em dayFiles. `enforceCap` em `:162` só remove dayFiles; `:219` sempre appenda à mesma `decisions.jsonl`. O comentário `:4` chama o arquivo de “small”, mas não há limite que o torne pequeno. O teste atual confirma “the decisions stay”, sem testar decisões sozinhas acima do teto.

**Contrato:** REC-2 em inteligência SPEC `:42`: pasta outcomes com teto200MB, append-only diário e rotação atômica. Manter decisões para sempre é uma opção de produto diferente, não uma exceção documentada ao teto. Default é 200*1024*1024 bytes (`store.ts:17`).

**Entrada reproduzida:** diretório temporário vazio, maxBytes1024, clock1800000000000; 100 `DecisionRecord` válidos, ids0..99, ETH-USDT, modo=spot, action=hold, candidateId/briefHash/snapshotId/probabilidades/veredito=null, reutilizado=false. Duas verificações de cap ocorreram, pois CHECK_EVERY=50. Resultado:

```json
{"snapshots":0,"labels":0,"decisions":100,"corruptLines":0,"writeErrors":0,"bytes":19490,"lastAppendMs":1800000000000}
```

**Correção mínima:** decisões diárias dentro da mesma política de retenção; leitura compatível do arquivo legado e tratamento explícito dele na quota. Alternativa: arquivo próprio segmentado com quota e rotação limitada. Recusar novas decisões com erro observável é fallback de armazenamento, não fingir sucesso acima da quota. Não apagar arquivos alheios nem permitir apagar snapshots e ainda permanecer acima do cap por causa do arquivo de decisões.

**Aceitação independente / seam:** `store.test.ts` com apenas decisões, mistura dos três tipos, legado e arquivo estranho; ao ponto de verificação acordado todos os arquivos próprios respeitam a quota; escrita/rotação malsucedida retorna false e conta writeErrors sem quebrar clique. Definir precisamente tolerância entre as verificações periódicas, ou reservar espaço antes do append, sem reduzir o teto da SPEC. Nenhum ensaio sobre arquivos reais do usuário.

## Estado atual: código, documentação e prova ausente

| Área | Estado observado na cópia isolada | Limite da conclusão |
|---|---|---|
| TA, SMC, atributos | `src/intel/ta` e `src/intel/features` existem, com testes; lista v1 fixa e nulls com motivos no produtor | TASKS inteligência `:11–12` diz “não iniciado”: estado documental defasado; existência não autoriza marcar “feito” sem os critérios restantes |
| Gravador, rótulos, armazenamento | Módulos e testes existem; os cinco defeitos acima incluem componentes dessa base | TASKS `:13–16` também defasado para existência de código. Busca sem arquivos de teste por `createRecorder`, `createOutcomeStore`, `appendDecision` encontrou apenas definições internas, nenhum consumidor da aplicação; integração runtime ainda ausente nesta cópia |
| Placar e Veredito | Ausentes `src/outcomes/scoreboard.ts` e `src/verdict/**`; tarefas INT-0.10/INT-1.x abertas | Falta de funcionalidade planejada, não bug de módulo existente. Não há prova de risco por perfil ou placar automático completos |
| Aprendiz local | Ausentes `src/intel/ml/**`, cartão versionado, logística/árvores/isotônica e monitor de deriva planejados | ML-1–5 e AC-INT-5 não implementados aqui. Não há learner promovido nem vantagem de aprendizado demonstrada |
| Quant/lab | `src/quant/calibration.ts` contém walk-forward; `src/lab/stats.ts` contém Holm, comparação pareada e gate; `src/lab/outcomes.ts` contém COST_TABLE | Essas bases de avaliação não comprovam que REC/ML estejam integrados ou que haja treinamento/promoção do Aprendiz. Custos injetados no recorder ainda não têm ligação comprovada à COST_TABLE |
| Carteira/evidência | `balances.ts` trabalha com atoms/decimais e estados ausentes/divergentes; preço zero de quantidade positiva não vira patrimônio consistente; custos e reconciliação possuem testes | Evidência de patrimônio é distinta de prescrever tamanho de ordem/risco. Não inspecionei carteiras reais. Q-06 CLI utiliza posições fornecidas, não lê carteira |
| System One | `cycle.ts:39` quant é anexo; `:40` filtro de elegibilidade local; `:61–65` pergunta ao modelo e valida; `:76` inclui `system_one_never_executes`; `:90` dry_run/blocked | Advisory, não executor. Quant não pode mudar elegibilidade em uma correção de Q-06 |
| Trader | `trader.ts:160/238` recebe decisão de model; `:163` faz gates de prazo/risco/confiança/saldo, `:196` pode hold; `:570` estado blockMs300; `risk.ts:12–33` valida fundos/despesas/marcação | Não foi iniciado nem alterado. Wallet real, ordens Kuru e execução por bloco de 300ms não foram exercitados nesta auditoria. Não inferir lucro, ativação Desktop ou cobertura live de testes sintéticos |

Há portanto infraestrutura determinística útil para o Jev e avaliação offline, mas não um circuito completo observado de snapshot→decisão registrada→placar→treino versionado→walk-forward/purga→promoção→monitor. Corrigir qualidade da captura e das etiquetas antes de integrar/aprender evita tornar métricas ruins mais convincentes.

## Verificação executada e limites

Comando efetivamente executado, Bun v1.3.14 (`0d9b296a`), env-file desabilitado:

```text
bun --no-env-file test ./src/outcomes/store.test.ts ./src/outcomes/labeler.test.ts ./src/outcomes/recorder.test.ts ./src/intel/features/compute.test.ts
57 pass, 0 fail, 279 expect() calls, 4 files, exit 0
```

As reproduções adicionais foram programas TS inline pela entrada padrão de `bun --no-env-file -`, com os imports públicos dos módulos citados e fixtures descritos acima. Outcomes usou quote/bars/analysis/store injetados; fetch global foi substituído por erro “audit forbids network”. A prova CLI Q-06 usou somente JSON de captura/posições artificial e `bun --no-env-file run scripts/quant-portfolio.ts --positions <temp>/positions.json --dir <temp> --json`. Diretórios temporários exclusivos `jev-intel-audit-*` e `jev-portfolio-audit-*` foram removidos após verificar o caminho absoluto dentro de tmpdir. Nenhum fixture foi usado como evidência de retorno real.

Não executei modelos, APIs privadas, ordens, assinaturas, servidores ou `.env`; não alterei fonte, git, memória/harness ou reservas. Nenhum código/dado/transcrição privado foi enviado a serviço consultivo. Não há incerteza de API externa necessária para esses cinco defeitos: fonte e contratos locais bastam.

O coordenador informou falha de typecheck em `scripts/quant-portfolio.ts:67` (TS2769) e `src/outcomes/okx-bars.test.ts:10` (TS2552/RequestInfo). Não tratei a segunda como defeito atual, pois o arquivo mudou durante o snapshot. Não repeti typecheck global, nem declarei green global. Os achados acima se referem exclusivamente aos hashes imutáveis abaixo; antes de tocar a árvore ativa, confirmar diff/hash e ownership do arquivo.

Critérios que continuam independentes e não foram certificados: AC-INT-1 integração 4 instrumentos/1h, REC-6 n/Wilson/Newey-West/Brier; AC-INT-5 purga/embargo, controle200 random walks/poder2000; ML-3 promoção Holm e BrierSkill; ML-5 deriva; AC-INT-9 contador idle; AC-INT-10 suítes/build/smoke/citações/freeze/coverage. A recomendação é a fatia de grade/cobertura Q-06, seguida da higiene temporal/labels/parser antes de ativar o recorder ou construir ML.

## Proveniência SHA-256

Hashes dos bytes da cópia auditada, não da árvore ativa. As linhas citadas são dessa mesma cópia.

| Fonte | SHA-256 |
|---|---|
| docs/sdd/inteligencia-decisao/SPEC.md | 23ec48e6c4a858f6844263e8995124823c2f817fb8ac020a184dbfb81c04c961 |
| docs/sdd/inteligencia-decisao/TASKS.md | 60af7e9acb41e46f8a78503e79e319449950a565cbf966f71be2fb0aec276a08 |
| docs/sdd/inteligencia-decisao/README.md | 4bef1531b0469c2039c1ec8cec6e4fa27b634e91ffd484b386c513785d6e3e7e |
| docs/sdd/dados-quant/SPEC.md | a67537d8c59bb107eca20b607d65ad31a2cbc35320195d0e2b688cdde9b4978f |
| docs/sdd/carteira-evidencia/tasks.md | 3da5a970b7c85549c02ea33e2787bac978afa72732a55cdc0aa4c6d9e6bef0c6 |
| scripts/quant-portfolio.ts | d608fc5a00bf561eb62ee8e75a2e55536f7995f8228864f03940031a25f682a7 |
| src/quant/portfolio.ts | 9396760fbaf780537ecc6c405f40f2475891e7dc634d3f9bccddaf0b91988ce2 |
| src/outcomes/recorder.ts | 02dc1eecd890014f3fb741bd104a235019ca842693d138d36077c1363a5d65ba |
| src/intel/features/from-analysis.ts | 6523381895f0b7e4aaede79f11a108a131fd98c8550b9f7895eacb0aae64a8f7 |
| src/intel/features/compute.ts | 52821c40b745c3c15839124c5c27914447144edfc6c69f074e17da8e7c707945 |
| src/intel/features/types.ts | 583208c64c99f60aa761e5742bf7a5139d885e6963859006196e892669101bb6 |
| src/outcomes/labeler.ts | 70b1633d40ad160b08d995b2ca532275222c22068cb53db2d44ea068ee3ac6b4 |
| src/outcomes/types.ts | eefae092662c85d985d582d83b8c9049d6939ff068a36fae05558f76d071a9c4 |
| src/outcomes/store.ts | 5fc44abf546fe854c13254b7082060562494ae8f90edfcc217c8535c3f892aba |
| src/outcomes/recorder.test.ts | 92fc875f1fbfde1494674aec88f12f802833527ea5da68a5fa706bae56eeac1f |
| src/outcomes/labeler.test.ts | ec810998e9316242b9e37a2b2efaaf9a31081e075b61796adcee929d8eb7d6b8 |
| src/outcomes/store.test.ts | 4129ab50778edf1399e7dac8bb0f75d22b34749f167e8888570b41bd06d9f54f |
| src/intel/features/compute.test.ts | a3ed3d669d07cc333ad4e122ce8bcfbb944126ebd5cc7d8a115bedd802331fad |
| src/lab/outcomes.ts | db845a899566ea98947972339f4f9268569d56e123093576cac03228145a46b6 |
| src/lab/stats.ts | d52f0a2838a33e3a6d11dad38aecda2c02b12734a588a44b9fbcc7cb4a09c61b |
| src/quant/calibration.ts | d981bef3da5746d4e0a432bd8d7baf6ad105b4582f202267e12333c487ee1865 |
| src/system-one/cycle.ts | e964ff5a44472d99a0abf2162e737fcaf51444e8617bcedc89d579b85e4564df |
| src/system-one/decide.ts | 3929e0060218c9b7935a6d246424d47c03b5b32294fb98c9547dac56839df365 |
| src/trader.ts | a2ec56b8be8ff1046222248e098da495885cea903e49e34665b0137a9bd751be |
| src/risk.ts | 57bfbb0a2a4180efd682e6226c70eb200b32f3a446ea67b489abc3239ca80008 |
| src/portfolio-evidence/balances.ts | d2818a17defc23c62e0cd9445831dd59e77a6e41aac8d0f56b2cf3b4cc6ed113 |
| src/desktop/handlers.ts | b1141640a7e30035d721390d0584252294b73cb5d5972cf4e0722697e703a593 |
