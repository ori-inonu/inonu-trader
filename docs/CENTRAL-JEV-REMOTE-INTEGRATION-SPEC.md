# Integração dos remotos: Central Jev

Objetivo autorizado: consolidar as atualizações elegíveis das branches e worktrees em main, preservar a central visual Jev e suas proteções, verificar e revisar independentemente. Esta SPEC complementa, sem modificar, CENTRAL-JEV-ACCEPTANCE.md, SHA-256 20e1558da58ceae78332020f1e4f84277eacdb694748d28b9ea599dc30808054.

Fontes fixas observadas em 2026-10-11: main 96d30cc387a6520aba23199e25d0d4ec71a7ad88; origin/codex/okx-readonly ed005440ff09b46fc5b10ae1d4ed74e94f70b494; origin/codex/inonu-trader-ui 0620787aae1ba2ef1b0cf217cbd65670463ac48a, filho de ed005440. Base comum b587759e459ea049590102e54a0b07800864cdc3. Integração anterior das mesmas capacidades: c352f82755862f4a4619d5e0d4411e2194f8d6a8, com melhorias posteriores de wallet, contabilidade e central.

- RI1: inventariar os 35 caminhos alterados pelo remoto desde a base e comparar blobs com a integração anterior e main atual. Para cada diferença, identificar capacidade preservada, substituição explícita ou alteração elegível faltante, com evidência de código.
- RI2: a integração não remove proteções de custos desconhecidos, validação de decisões, recibos, modo paper, carteira somente leitura, freshness, limites nem suporte a X Layer. A interface Jev permanece o centro de decisões, com os painéis atuais e controles já revisados.
- RI3: trabalhar apenas no worktree exclusivo codex/jev-panel-integration, inicialmente limpo; registrar ambos os commits remotos como ancestrais. Nenhuma mudança concorrente não commitada entra na integração.
- RI4: revisar o candidato independentemente contra RI1–RI3 e C1–C6. Se inputs de execução forem idênticos aos inputs verificados de 96d30cc, reutilizar evidência exata de testes/tipos/build com hashes; qualquer alteração de comportamento exige verificação pertinente nova. Identidade de árvore não prova funcionamento visual.
- RI5: atualizar main somente quando limpo, ainda no baseline fixo e com candidato revisado sem impedimentos. Verificar ancestry, diff final, árvore e preservação das branches locais e remotas.

A consulta read-only aos dois remotos teve sucesso, exit 0; recibo Jev 77adcb3b-85c6-444d-b044-246b909349c5 recomendou fetch. A estratégia reconcile foi recomendada pelo Jev: recibo d1cb3f79-6f5a-47f3-acd7-fb0d8cf63df8, modelo jev-1.13.0, confiança 0.84, uso 613 tokens de entrada/65 de saída; custo desconhecido (null), approved_by=jev_delegated, human_response=false. Recibos são aconselhamento, não autorização.

Não há autorização para push, deploy, ordens financeiras ou mudanças de credenciais. A inicialização da prévia e abertura do navegador continuam bloqueadas; não repetir nem contornar. C3 e C6 permanecem pendentes, sem alegação de aceitação visual ou interface servida.
