# Alinhamento entre carteira e agente

Registro de coordenação da conversa Codex `01a136cd-3af3-7361-bd23-c23a6aeece97`, em 2026-10-14. Este registro não habilita execução financeira nem substitui critérios congelados.

## Direção observada

O pedido humano atual é Edge First e centrado no agente: conectar a carteira, reconhecer seus ativos, acompanhar o mercado OKX/OnchainOS e usar o System One do Jev para decidir manter, comprar, vender ou trocar. A interface deve mostrar decisões e resultados com pouco texto. Configurações financeiras e seleção de ativos deixam de ser tarefas manuais do usuário. O pedido atual substitui a direção de gestão manual do plano histórico `tasks.md`, sem declarar suas tarefas executadas.

O crescimento de US$68 para US$6.700 em um dia é uma aspiração citada pelo usuário. Não é um retorno verificado deste projeto, uma garantia ou um critério que autorize inventar resultados. Arbitragem exige preços simultâneos, tamanho executável, liquidez, custos de cada perna e conclusão das transações; diferenças de preço isoladas não comprovam lucro realizável.

O teste de carteira autorizado nesta conversa continua em sombra, sem ordens. Conectar a extensão, autenticar a Agentic Wallet, conceder autoridade de assinatura e verificar liquidação são estados diferentes. A refatoração não pode tratar a conexão da extensão como prova de execução autônoma.

## Contratos mínimos para a integração

- Jev escolhe as ações financeiras. Código valida identidade, dados, frescor, execução, idempotência e interrupção. Se uma regra técnica propõe uma venda antes de consultar Jev, a exceção precisa ser resolvida contra o pedido atual e a norma de propriedade da decisão.
- Carteira e radar usam identidade de ativo por rede e contrato. Cobertura parcial, ativos sem preço, risco desconhecido e ausência de liquidez são estados explícitos; não viram zero ou cobertura completa.
- Risco, liquidez e concentração entram como evidências datadas e com fonte. Preço desconhecido não pode ser interpretado como sinal de saída.
- Toda ação e abstenção relevante precisa de acompanhamento comparável com manter a carteira, inclusive decisões de manter e ignorar. Resultado bruto não pode sustentar uma alegação de vantagem líquida com custo desconhecido.
- O termo Edge First foi registrado como pedido humano, sem inferir uma migração de hospedagem. Vantagem financeira precisa de medição após custos; se houver proposta de processamento em edge, ela precisa de fronteira e execução verificadas próprias.
- Remover uma cota arbitrária não remove limites reais do provedor, custos, dados vencidos, respostas inválidas, duplicidade de ordens ou STOP.

## Coordenação e responsabilidade

| Superfície | Evidência e limite |
| --- | --- |
| Codex `Implementar autonomia no Inonu`, `01a13a27-cea7-73d1-a5bc-3c6014d1ef44` | Mensagens de coordenação enviadas com autorização humana. Dona da refatoração `src/agent/**`, wire e nova interface Agent. Deve revalidar achados contra seu candidato atual antes de integrar. |
| Claude Code `Inonu Trader`, sessão `a645aa24-a0d6-487a-bc12-0ed706e0c859` | Leitura local delimitada do registro em `C:/Users/gabri/.claude/projects/C--Users-gabri-jev-trader/`. Pedido humano de 13:07:13.691Z, UUID `34d0d59c-3e04-42fc-ad93-31681b48aeac`, confirma configuração autônoma e decisões Jev. Leitura do registro não comprova canal live de mensagens com Claude Desktop. |
| Esta conversa | Integração e correções de Holdings/consulta/sombra e evidência de carteira. Não sobrescrever arquivos da refatoração concorrente. |

## Revisão e página atual

Os revisores independentes usam a captura fixa `C:/Users/gabri/.codex/tmp/wallet-shadow-01a136cd/autonomy-review-1330`, com manifesto SHA-256 `1ef9e32b8d1f9b11a188a1829b70d33c828693bdd95a25f240572cf78d6ce843`, e comparam Spec e Standards sem alterar critérios. Essa captura não certifica o candidato posterior em reconciliação pela sessão dona.

Às 13:57 UTC, a mesma aba `http://localhost:3001/` voltou a renderizar a nova tela do agente e mostrou `App local conectado`, com carteira desconectada. O erro anterior `Can't resolve '@/lib/agent/draft'` desapareceu sem reload desta conversa. Conexão do app não comprova leitura dos ativos ou decisão Jev. Não houve clique de autorização financeira.

Às 14:05 UTC, a página mudou para `ANALISANDO` e declarou que ainda não move dinheiro. A etapa de login na Agentic Wallet OKX continuava pendente, com zero posições, zero consultas ao modelo e falha ao ler a carteira. Esta conversa não clicou em conectar, aceitar ou entrar. O rótulo de sombra não demonstra autenticação, dados da carteira ou política do executor; a mudança foi comunicada à sessão dona da refatoração.

Às 14:19 UTC, sem interação desta conversa, a mesma página apresentou patrimônio informado de US$109,75, 13 posições, uma consulta declarada ao `jev-latest`, quatro posições avaliadas e cinco alternativas de compra. A venda de PINCHA de cerca de US$18 apareceu preparada, com zero ordens executadas. O título `OPERANDO` contradizia a mensagem de falta de política/autorização de execução. Valores e a declaração de consulta no painel não certificam o payload enviado ao modelo, capital realizável ou retorno líquido.

Uma leitura passiva de `/agent/ledger?n=200` às 14:20:11 UTC confirmou o último ciclo registrado como `sombra`, `decidido`, com uma ordem preparada e nenhuma executada. Não foi chamado `/agent/status`: na fonte atual sua leitura pode iniciar `refreshAccount` via CLI. A fonte atual também compõe executor CLI, diferente da captura antiga com executor null; capacidade efetiva não pode ser inferida daquela captura. A divergência do título e a deriva do wire foram enviadas ao dono, que confirmou estar ajustando a manchete na cópia isolada. Não houve ativação financeira nesta conversa.

Próximas verificações: revisar as correções no candidato consolidado do dono; confirmar sombra no caminho real; comprovar quais dados chegaram ao Jev e comparar decisões com manter, usando medições posteriores e custos conhecidos. Os ajustes de carteira passaram nos testes afetados, typecheck, build isolado e revisão independente delimitada; a composição no AgentScreen continua pendente. Não declarar autonomia financeira, retorno ou conclusão dessa prova antes de observá-los.
