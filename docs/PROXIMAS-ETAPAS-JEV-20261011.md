# Próximas etapas do Jev Trader

Planejamento de 2026-10-11 para a main f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c.
Meta atual: produzir este plano. As etapas abaixo são propostas para implementação posterior.
Critérios desta entrega: [SPEC PC1–PC6](PROXIMAS-ETAPAS-JEV-20261011-SPEC.md).
Fontes e hashes: [manifesto](PROXIMAS-ETAPAS-JEV-20261011-EVIDENCE.json).

## Direção

O próximo avanço é demonstrar o ciclo **dados verificáveis → candidatos elegíveis → decisão do Jev → execução em paper → reconciliação → resultado explicado na interface**. Os componentes já existem em diferentes caminhos; integrar e qualificar esses contratos tem prioridade sobre ampliar modalidades financeiras ou adicionar mais efeitos visuais.

Consulta delegada ao Jev: receipt 5e7a5f09-e833-4a43-a96e-4ba645c52037, modelo jev-1.13.0, escolha integration_first, confiança 0,94, probabilidade informada 0,95. Foram comparadas integração primeiro, recuperação sintética primeiro e interface primeiro, com abstenção. A escolha é aconselhamento de prioridade, approved_by=jev_delegated e human_response=false; não é permissão de operação. Uso informado: 876 tokens de entrada e 69 de saída; custo faturado desconhecido (null). [Recibo e entrada sanitizada](PROXIMAS-ETAPAS-JEV-20261011-JEV.json).

## O que já está disponível e o que falta qualificar

| Área | Evidência consultada | Implicação para a próxima entrega |
| --- | --- | --- |
| Main e interface | A conclusão anterior foi em 32fbaf8. A main atual tem commit f626a30 e tree 96189e3cb9dbfe178a5dfff94f722ecb3d6f77b1; a diferença toca os dois arquivos scripts/okx-operator.*. O BUILD_ID observado ainda é j1s1cW9B0aeroZ160t6vL da prévia anterior. | Revalidar o novo baseline e identificar qual build está sendo exibido. Os testes históricos não certificam a alteração posterior. |
| Leitura de mercado | src/system-one/readings.ts fornece dados públicos e configuredWallet retorna knownValueUsd=0, valueComplete=false, source=configured. | Capital configurado não prova saldo real. Integrar inventário somente com proveniência, unidades e completude verificadas. |
| Decisão do Jev | src/operator/cycle.ts já limita tempo, valida a resposta contra elegíveis e aceita inventário/modelo por dependência; src/system-one/types.ts mantém dry_run/blocked. | Reutilizar o seletor finito e os gates. Demonstrar o percurso integrado em sombra, incluindo hold, sem abrir o executor financeiro. |
| Capital e recuperação | src/paper-supervisor*.ts e src/paper-capital.ts implementam supervisor durável e fixtures sintéticas; docs/PAPER-SUPERVISOR.md distingue synthetic-paper de operação real. O operador possui ledger próprio. | Definir um contrato de adaptação; não duplicar contabilidade nem tratar dois ledgers como uma única autoridade. Qualificar reinício, pendências e reservas. |
| Receipts | src/market.receipt.test.ts e src/trader.receipt.test.ts são testes de conformidade de outra variante, pulados sem configuração isolada. A main já tem validação de receipts em src/market.ts e src/trader.ts. | Mapear semântica e cobertura antes de portar/adaptar testes. Dois skips não demonstram, por si, falta de uma proteção. |
| Laboratório | docs/JEV-LABORATORIO-DE-DECISAO.md e src/lab já descrevem decisões no ponto no tempo, custos e comparação estatística. A CLI padrão usa MockJevChooser e dados sintéticos. | Conectar capturas compatíveis e avaliação fora da amostra. Um resultado sintético ou uma probabilidade de escolha não prova vantagem de mercado. |
| Interface | A entrega anterior exercitou desktop 1280 px e mobile 390/320 px. Reduced motion foi inspecionado em código/testes; não houve emulação do sistema, auditoria completa de acessibilidade ou medição de custo da animação. | Preservar o Jev como centro visual e acrescentar evidência operacional, acessibilidade e desempenho medido. |

A documentação antiga de readiness é um mapa de contratos e hipóteses. Checklists e contagens antigos não foram promovidos a status atual. A matriz acima resume o que foi inspecionado nesta pesquisa, sem declarar um teste end-to-end que não foi executado.

## Entregas e dependências

O integrador é o único responsável por arquivos compartilhados e integração final. Escritores auxiliares, quando autorizados, recebem cópias isoladas e arquivos exclusivos; a revisão é independente. Os responsáveis abaixo são papéis de trabalho, não agentes já iniciados.

| Etapa | Prioridade | Depende de | Responsável | Resultado |
| --- | --- | --- | --- | --- |
| E0 — baseline e cobertura | P0, primeira fatia | Nenhuma | Integrador + revisor | Baseline testado, proveniência da prévia e mapa dos receipts. |
| E1 — dados e inventário | P1 | E0 | Backend de leitura | Um snapshot verificável em modo somente leitura. |
| E2 — decisão em sombra | P1 | E1 | Integração de decisões | Uma decisão finita auditável, sem execução financeira. |
| E3 — paper reconciliado | P1 | E2 | Adaptador e capital | Ciclo completo, persistido e recuperável em simulação. |
| E4 — avaliação e continuidade | P2 | E3 | Dados + verificação | Relatório fora da amostra e operação paper observada. |
| E5 — central visual qualificada | P1 em paralelo | E0; estado integrado final depende de E2/E3 | Frontend | Explicação visual do ciclo, acessível e com motion medido. |
| E6 — revisão de prontidão futura | Após E4 e E5 | E4, E5 | Revisor + dono | Dossiê de prontidão; qualquer operação real exige autorização própria. |

### E0 — validar a main atual e fechar o mapa de cobertura

Escopo inicial: f626a30; scripts/okx-operator.ts e scripts/okx-operator.test.ts; testes de receipts e suas implementações; package.json, web/package.json e a identificação do build. Se a main avançar, registrar o novo hash e reavaliar a diferença antes de certificar o alvo.

Verificação proposta, usando o runtime já instalado: na raiz, bun --no-env-file run test e bun --no-env-file run typecheck; em web, bun --no-env-file run test, bun --no-env-file run typecheck e o build de produção do projeto. Não iniciar src/index.ts ou a CLI do operador para obter um baseline. Os comandos devem ser executados em checkout limpo ou cópia isolada e ter saída exata recuperável pela integração RTK/Headroom.

Criar uma matriz de contratos para hash esperado, estado pendente, custo desconhecido, duplicação e bloqueio de execução. Executar a conformidade externa somente em processo isolado com a fonte correta, ou adaptar a cobertura para a implementação atual mediante regressão observável; não remover skips ou enfraquecer assertivas apenas para produzir verde.

Concluído quando: todas as suites pertinentes, análise de tipos e build têm resultado no mesmo commit; cada skip tem motivo e destino explícito; a proteção nova de lock tem cobertura exercitada; a revisão independente cobre o candidato. Se atualizar a prévia, registrar PID/porta/BUILD_ID/commit e conferir o alvo exato. A prévia antiga continua evidência histórica até essa conferência.

### E1 — qualificar um snapshot de leitura antes de decidir

Arquivos/módulos: src/okx-wallet, src/onchainos, src/system-one/readings.ts e types.ts, fontes de src/operator/cycle.ts, capturadores existentes em scripts. Escolher um único percurso inicial, com unidades, chain/instrumento, timestamp da fonte, observedAt, idade máxima e flags de completude. Valor desconhecido permanece null/incompleto; um orçamento configurado não vira saldo.

A primeira implementação deve funcionar offline com fixtures gravadas. Leitura externa depende de acesso verificável, limites do provedor e consentimento para os dados envolvidos. Conexão de carteira no navegador não autoriza transmitir seu inventário ao backend ou ao modelo. Credenciais e preços não confirmados são dependências, sem valores presumidos.

Aceite: fixtures válidas passam; fixtures obsoletas, de rede/conta incompatível, parciais, malformadas ou sem custo necessário bloqueiam elegibilidade. Mudança de conta/rede invalida o estado anterior. Saídas separam origem sintética, configurada e observada. Um ensaio real somente leitura pode qualificar o adaptador quando os acessos estiverem disponíveis; na ausência deles, o relatório mantém “qualificação externa pendente”.

### E2 — ligar o Jev ao estado elegível em sombra

Arquivos/módulos: src/operator/cycle.ts, jev-selector, risk-gate, plan e src/system-one; contratos de web/src/lib/operator-feed.ts e system-one.ts. Determinar um ID de ciclo estável e o vínculo snapshot → candidatos → decisão → motivos → plano de simulação. Nunca chamar o modelo para um conjunto sem elegíveis; hold continua resultado válido.

Primeiro usar um seletor determinístico injetado. Uma sessão do modelo real do produto depende de acesso e orçamento próprios conhecidos; a autorização de consultas técnicas ao plugin não substitui esses requisitos. Payloads enviados são mínimos, sanitizados e sem chaves ou inventário identificável desnecessário.

Aceite: IDs inválidos, resposta malformada, timeout, falha e estado vencido resultam em hold/blocked e não invocam executor. Um teste integrado mostra decisão válida e hold, com origem e latência auditáveis. Probabilidade da escolha não é exibida como probabilidade de lucro. A evidência distingue seletor simulado de sessão real; usar mock não encerra a qualificação do modelo real.

### E3 — adaptar o ciclo ao paper durável

Arquivos/módulos: src/paper-supervisor.ts, paper-supervisor-store.ts, paper-capital.ts, src/operator/ledger.ts e o novo seam mínimo de adaptação. Reutilizar reserva, reconciliação, ownership e persistência; documentar qual ledger é autoridade e como o outro vira projeção. Bloquear qualquer dependência de signer ou envio real nesse percurso.

Aceite: fixtures de ganho, perda, pendência, resultado desconhecido e custo incompleto passam pelo ciclo E1/E2 com identidades estáveis. Reinício antes/depois de intenção, receipt e liquidação não duplica comprometimento nem ganho. Pendência conserva reserva e impede gasto novamente; recibo incompatível e custo desconhecido mantêm bloqueio. Quantidades inteiras por ativo são preservadas; conversões para USD explicitam fonte e arredondamento. Reinvestimento considera somente ganho realizado e reconciliado.

Verificação: regressões unitárias, testes de adaptação e testes de falha/reinício/concor­rência em diretório temporário isolado. Concluído com replay do mesmo journal produzindo a mesma posição/capital, encerramento observado e revisão independente dos limites. Isso qualifica paper, sem certificar fills ou liquidez reais.

### E4 — medir qualidade das decisões e continuidade

Arquivos/módulos: scripts/onchainos-capture.ts, scripts/public-market-capture.ts, scripts/jev-lab.ts, src/lab, src/backtest.ts e contratos de captura existentes. Definir antes do ensaio a janela temporal, split treino/validação/teste, custos, regras de preenchimento/latência, comparadores, hipóteses e critérios estatísticos já disponíveis no laboratório. Reutilizar o pipeline e registrar versão/hash do dataset; não escolher janelas retrospectivas para alcançar um resultado desejado.

Aceite de avaliação: execução reproduzível fora da amostra, sem features futuras; custos e limitações de proxies visíveis; comparação com hold e políticas simples; correção de múltiplas hipóteses e incerteza conforme os contratos do lab. Resultado inconclusivo ou negativo é um resultado válido e mantém a fase de observação. Nenhuma promessa de retorno ou promoção automática de alavancagem.

Aceite de continuidade: ensaio paper com duração e limites definidos na SPEC da etapa, tempo efetivamente observado, reconexão, fontes stale, kill switch, reinício e drenagem registrados. Medir p50/p95 de ciclo/decisão, erros, retenção e crescimento de arquivos. Validar coerência entre latest e journal, que são escritas distintas, sem pressupor transação atômica. Não declarar 24 horas ou cadência por bloco com base em simulação acelerada.

### E5 — fazer a interface contar a decisão do Jev

Arquivos/módulos: web/src/components/CommandCenter, GrowthDeck, DecisionDial, DecisionCenter e Rail; web/src/lib/useFeed.ts, feed-frame.ts, operator-feed.ts e system-one.ts. Pode começar em paralelo após E0 com estados gravados; o aceite integrado depende dos contratos E2/E3. Ler web/AGENTS.md e a documentação local da versão do Next antes de alterar o frontend.

Mostrar de forma navegável: origem e idade do dado, candidato escolhido, motivo de hold/bloqueio, limites, reservas, ganho realizado, estado paper e último ciclo reconciliado. Conservar a hierarquia visual que coloca o Jev no centro; motion acompanha mudanças de estado e ajuda a compreensão. Detalhes 2.5D/3D adicionais dependem de orçamento de renderização medido e fallback acessível; não são requisito para encerrar a entrega.

Aceite: desktop e mobile em 1280/390/320 px sem overflow, teclado e foco visível, informação equivalente sem cor/movimento, leitor de tela e contraste nos controles críticos. Emular prefers-reduced-motion e verificar o resultado real; não certificar só por CSS. Exercitar desconexão/reconexão, eventos duplicados/fora de ordem e histórico limitado. Medir quadros perdidos, trabalho de CPU e layout na mesma máquina, viewport e cenário antes/depois; definir o teto na SPEC com esse baseline, sem afirmar ganho por impressão visual.

Concluído com screenshots, resultados de interação, testes pertinentes, medição registrada e revisão visual/acessível independente. Animação não pode ocultar stale/blocked nem parecer uma operação executada.

### E6 — preparar a decisão futura sobre prontidão

Atualizar docs/LIVE-QUALIFICATION.md, READINESS-SPEC.md e a matriz de capacidades com evidências exatas. Analisar correspondência wallet/inventário, custos, margem, ordens pendentes, receipts, restart, kill switch, acesso e limites. Registrar pendências reais e distinguir “pronto para revisão do dono” de permissão para operar.

Esta etapa entrega um dossiê. Uso de capital real, ordem, assinatura, approval, empréstimo/alavancagem, publicação ou deploy não é autorizado pelo presente plano nem pelo Jev. Depende de autorização específica do dono e dos gates existentes; não é condição de conclusão desta meta de planejamento.

## Primeira tarefa pronta para execução posterior

E0, em uma fatia exclusiva: revalidar a main atual, executar a cobertura do novo lock, mapear os dois skips de receipts, conferir a proveniência da prévia e registrar revisão independente. Somente correções demonstradas por regressão entram nessa fatia; E1–E6 aguardam entregas próprias. O plano não agenda nem inicia essas etapas.

## Contrato da meta atual

Planejar as próximas etapas do Jev Trader a partir da main integrada, identificando pendências reais e uma sequência executável. Usar a main f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c como baseline de pesquisa e preservar o trabalho preexistente. O destino é um plano local com etapas, dependências, responsáveis por módulo, critérios observáveis e verificações correspondentes. Separar o resultado histórico da interface das alterações posteriores ainda não revalidadas.

Done significa: SPEC PC1–PC6 preservada; fontes existentes com hashes; prioridade técnica consultada ao Jev com recibo real; plano e evidências salvos; consistência mecânica verificada; revisão independente com baseline fixo; checkpoint da própria conversa registrado. As três passagens são inventário, priorização e verificação/revisão.

Usar como recursos a conclusão anterior, os contratos READINESS-SPEC/WEB3-INTEGRATION-DELIVERY-SPEC, SYSTEM-ONE e PAPER-SUPERVISOR/JEV-LABORATORIO-DE-DECISAO, confirmando suas afirmações relevantes no código atual. Decisões técnicas abertas seguem a delegação ao Jev, sem inventar respostas humanas, fatos externos ou autorização. Esta meta permite pesquisa e escrita de artefatos locais; não implementação de funcionalidades, execução financeira, sessões pagas do produto, publicação ou deploy. Se uma fonte mudar, reavaliar somente a evidência afetada.

Não iniciar tarefas seguintes automaticamente. Encerrar esta meta quando o planejamento estiver verificado e revisado; persistir o progresso até atender esse critério dentro do escopo autorizado.

