# Carteira conectada ao radar

## Fonte e limite da entrega

Em 2026-10-13, nesta conversa, o usuário pediu reconhecimento automático da carteira, ativos e patrimônio visíveis, alinhamento de Solana com o seletor, decisões Jev ligadas ao radar e menos informação sem ação. Disse: "A partir do momento que eu conecto a minha carteira ali, ele já abre todos os ativos que eu tenho" e "a aba da carteira, ela deve estar conectada ao radar do mercado". Também autorizou melhorias locais e remoção de elementos redundantes, preservando foco em resultados financeiros. Essa solicitação substitui a restrição inicial de inspeção para esta entrega local delimitada.

Conexão e leitura de saldos existentes são autorizadas. Não executar nem habilitar compras, vendas, assinaturas ou movimentação de fundos. A automação desta entrega é leitura e preparação de análise; operação financeira autônoma não será ativada. Ganho financeiro, vantagem de ML e cobertura integral de todas as redes não foram demonstrados. Preservar o operador Jev/Kuru/Monad e as zonas concorrentes da SPEC canônica.

## Evidência e decisão

Há duas consultas na composição da carteira. A consulta antiga conta ativos, mas só revela linhas depois do modelo e só prepara poucas redes. HoldingsPanel já mostra saldos, preços e total da OnchainOS e HoldingsConsult já prepara qualquer rede retornada. O seletor e HoldingsPanel mantêm estados diferentes. HoldingsConsult omite o candidato do radar embora prepareConsult já aceite esse argumento.

Jev Workflows avaliou opções reais e escolheu unificar em HoldingsPanel, compartilhar o escopo com o seletor, encaminhar o candidato e ler automaticamente por sessão. Confirmou o seam público de controlador puro, views públicas e navegador. approved_by=jev_delegated; human_response=false. Recibo bbd1fb7b-9ca2-4330-ad48-7090148e2094; modelo jev-1.13.0; confiança integração 0.99, seam 0.89; input 702, output 120; custo desconhecido null. Esta decisão é técnica, não uma aprovação de operação financeira.

## Frozen acceptance

- WAL-01: uma consulta de carteira na composição; saldo e total aparecem antes de consultar o modelo. Todas as linhas retornadas são acessíveis. Ausência de preço/total permanece desconhecida, não zero inventado.
- WAL-02: ao conectar uma conta válida ou trocar o escopo, uma leitura automática de saldos e valor inicia, com cancelamento de resposta de sessão anterior. Sem polling/retry/modelo/assinatura automática. Atualizar e cancelar permanecem disponíveis.
- WAL-03: selecionar Solana atualiza imediatamente o escopo e endereço da leitura para Solana. Redes EVM usam o endereço EVM; a rede efetiva da extensão e o alvo solicitado não são confundidos. A consulta multirrede declara a cobertura suportada.
- WAL-04: o ativo do radar chega à preparação Jev na rede correspondente. Candidato de outra rede ou limite de seis ativos é explicado. Contratos, valores e consentimento existentes são preservados; respostas vencidas/canceladas não viram decisões atuais.
- WAL-05: a UI prioriza patrimônio, posições e decisão em linguagem clara. Não promete lucro, não declara ML treinado ou resultado líquido com custo desconhecido; não inclui execução financeira autônoma. Preserva ticket manual e operador existentes.
- WAL-06: testes Bun nos seams acordados, build/typecheck afetados, verificação no app local e revisão independente em cópia isolada, registrando limitações reais.

## Plano mínimo e responsabilidade

Integrador /root: DockWalletTab, HoldingsPanel, HoldingsConsult, WalletChainSwitch e testes de views/consulta. Um auxiliar isolado pode escrever apenas holdings-session.ts e holdings-session.test.ts, controlador puro para reconhecer escopo e identidade de leitura. Não editar hooks/provider de carteira nem backend reservado. Outro auxiliar investiga contratos e limites da análise, somente leitura. Revisor distinto confere baseline, critérios congelados e candidato isolado.

A prioridade é fechar o caminho conta -> leitura -> ativos/total -> radar -> consulta Jev. Automação em simulação, qualidade do feed e registro de resultado líquido dependem da auditoria dos contratos existentes e de dados suficientes; não substituir esses dados por regras de trading ou recomendações inventadas.
