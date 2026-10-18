# Wallet API e decisões em sombra

Conversa `01a136cd-3af3-7361-bd23-c23a6aeece97`. Critérios imutáveis: [WALLET-SHADOW-SPEC-20261014.md](WALLET-SHADOW-SPEC-20261014.md), SHA-256 `e4403df64749c57418d25e4b787ae494dd46abe9ef9d41a4987bf2e9228b35fa`. Entrega completa **PENDING**: testes e revisão de fonte não substituem o exercício da carteira real no AgentScreen atual.

## Comportamento implementado

Total e saldos usam o mesmo escopo de tokens e filtro de risco. A interface distingue total informado, soma de valores conhecidos, cobertura parcial e ativos sem preço. Risco zero ou ausente continua desconhecido. A consulta de carteira incorpora risco observado, concentração qualificada de holders e liquidez parcial dos pools com identidade, origem, idade e lacunas. O contexto de seis ativos continua limitado a 15 leituras e 2048 bytes; Jev escolhe as ações.

O painel anterior preserva o resultado da mesma leitura após expiração e sinaliza que precisa atualizar. A passagem do relógio não cancela o pedido da mesma leitura nem apaga seu resultado; uma resposta dessa leitura é apresentada como histórica quando ela já venceu. Troca de carteira, rede ou leitura invalida o contexto anterior e cancela a consulta em andamento. A idade que muda com o relógio não é tratada como mudança de identidade.

A marca local de sombra exige preço posterior e fresco do mesmo ativo. A correção usa o mínimo entre o instante de criação do cache e o instante reconstruído pela idade, rejeitando dados anteriores à decisão, inválidos ou vencidos. Chegada tardia da resposta não cria retorno. Esse contrato pressupõe relógios comparáveis e não certifica o instante de amostragem do provedor.

Cotações são leituras explícitas, até seis ativos, sem assinatura ou ordens. Custos e unidades não qualificados mantêm resultado líquido desconhecido; taxa de rede, gas e impacto não são descontados duas vezes. Patrimônio informado não comprova capital realizável.

## Verificação delimitada

Workspace isolado: `C:/Users/gabri/.codex/tmp/wallet-shadow-01a136cd/wallet-final-review-1355/workspace`. Dependências instaladas foram reutilizadas somente para leitura, sem arquivos de ambiente ou credenciais dos provedores. O build escreve apenas nessa cópia. Não houve reinício do app compartilhado.

| Verificação | Resultado observado |
| --- | --- |
| Readers Wallet API e catálogo | 131 testes passaram, zero falhas. |
| Biblioteca de carteira e contratos web de portfólio | 595 testes passaram, zero falhas. |
| Rechecagem final de sombra após ajuste de tipagem | 13 testes passaram, zero falhas; sobrepõe a suíte web acima. |
| Typecheck web final | Exit 0. O teste anterior preservado tinha quatro TS7031 no callback de um fixture; corrigido sem mudar tipos de produção. |
| Build web com webpack | Exit 0, 38,26 segundos. O helper Python falhou depois de salvar os resultados ao imprimir um caractere Unicode em cp1252; esse exit 1 de apresentação é separado do exit 0 do comando de build. |

RED/GREEN anteriores estão preservados em `SH02-RED.log`, `SH02-CANCEL-RED.log`, `SH02-FINAL-GREEN.log`, `SH04-RED.log` e `SH04-FINAL-GREEN.log` no diretório privado da conversa. SH-02 teve 51 testes e 249 asserts verdes, mais 156 testes relacionados; os totais não são somados à cobertura atual como testes distintos. A regressão de cache reproduziu retorno bruto fictício de 0,5 e líquido de 0,39 antes da correção; o resultado correto é desconhecido/null.

A revisão final dos ajustes do integrador não encontrou defeito confirmado aberto nesse escopo. Parecer privado: `C:/Users/gabri/.codex/tmp/wallet-shadow-01a136cd/wallet-final-review-1355/REVIEW.md`, SHA-256 `4bdc7d10cbe6932362f5f96b41129c6e89f226948b6608d466618425429f7cb5`; manifesto `MANIFEST.json`, SHA-256 `c97799370cd56a8a89e74cfc271213150f5f7db00c2f1c20d21682aeb1d86368`. Os 11 paths revisados continuaram iguais ao compartilhado na conferência de 14:15:59 UTC. A revisão não incluiu React montado cruzando TTL, navegador ou a nova composição Agent.

A revisora desses ajustes não certifica os readers/catalog/quote que ela própria escreveu anteriormente. A revisão complementar independente terminou com **APPROVE delimitado a SH-01/SH-02/SH-05**, sem achados acionáveis e com 26 hashes conferidos. Parecer `wallet-final-review-1355/reader-review/REVIEW.md`, SHA-256 `e249b070a0d5005354a4268a1e4957a26ce41f0a0003cefd4f48acd9790434c2`; manifesto `reader-review/MANIFEST.json`, SHA-256 `96a7451698799b8a2fd8395526f10b685b789c4911a3344d163ea19f67281698`. A revisão reutilizou os testes registrados acima e SH-02, sem somar suas contagens sobrepostas. O complemento SH-02 usa os seis arquivos de `portfolio-worker`, com hashes idênticos ao compartilhado às 14:16:15 UTC registrados em `wallet-final-review-1355/SH02-COMPLEMENT-MANIFEST.json`. Alterações concorrentes de Agent/Settings, SH-06, runtime integrado e ganho financeiro ficam fora dessa aprovação.

## Página atual e dependência real

A mesma aba `http://localhost:3001/` permaneceu aberta. Às 14:05 UTC, mostrou servidor conectado e `ANALISANDO`, declarou somente análise sem movimentar dinheiro, mas continuou pedindo login na Agentic Wallet OKX. Exibiu zero posições, zero consultas Jev e falha ao ler a carteira. Esta conversa não clicou em conectar, aceitar ou login; a mudança observada foi enviada à sessão dona da refatoração.

Os componentes Holdings revisados não demonstram sua composição na nova interface Agent. Conexão da extensão e autenticação da Agentic Wallet são identidades distintas. Para concluir SH-06, o candidato consolidado precisa apresentar um fluxo de leitura em sombra, comprovar quais ativos e dados chegaram ao Jev e comparar decisões com manter usando observações posteriores e custos qualificados. A sessão responsável já está trabalhando nessa integração; não houve ACK confirmado do Claude.

Às 14:19 UTC, a mesma aba mudou sem interação desta conversa: mostrou patrimônio informado de US$109,75, 13 posições, uma consulta declarada ao `jev-latest`, quatro posições e cinco alternativas de compra avaliadas. PINCHA apareceu como venda preparada de cerca de US$18, sem ordens executadas. A página ainda não mostrou medições posteriores em 15 minutos, uma hora, quatro horas ou 24 horas. Esses valores de UI não comprovam payload, completude da carteira, custos ou vantagem sobre manter os mesmos ativos.

O título `OPERANDO` contradizia a mensagem de falta de política de execução. GET passivo `/agent/ledger?n=200`, às 14:20:11 UTC, confirmou último ciclo `sombra`, `decidido`, uma ordem preparada e nenhuma executada. `/agent/status` não foi chamado porque pode disparar atualização de conta via CLI. A fonte atual compõe executor CLI, diferente da captura antiga com executor null; fonte, runtime e recibos históricos são evidências distintas. A divergência foi comunicada à sessão dona, que prepara a correção em cópia isolada. SH-06 continua pendente.

Relatório factual privado: `C:/Users/gabri/.codex/tmp/wallet-shadow-01a136cd/runtime-agent-check-1419/REVIEW.md`, SHA-256 `d5f0793ea6caccc8b7b3145d212f0641b4a46be861a7cec1ce187c8715f73ea0`. O GET retornou três registros, dois de ciclo; não há ordem executada nesses registros, sem certificação de histórico completo. Oito de dez arquivos da fonte diferem da captura anterior e o hash carregado pelo processo não foi verificado. O ledger contém o campo de modelo, mas isso não comprova transporte live, uso, custo ou payload.

Nenhum teste aqui comprova autonomia financeira, liquidação, lucro ou crescimento de capital. Não houve ordens, assinaturas, transferências, broadcast ou ativação financeira nesta conversa.
