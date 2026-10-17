# Plano: evidência executável no Brief do JEV

## Abordagem

Dois cortes independentes compartilham apenas o contrato de candidato existente:

1. Sonda de entrada: `entry-cost.ts`, testes correspondentes e integrações de tipo em `cycle.ts` e adapter em `wire.ts`. Migrar os símbolos com LSP, preservando impacto, TTLs, ordenação, deadlines e quantidade de sondas. Somente a recusa explícita de gas station fecha as compras desta observação; falhas genéricas permanecem desconhecidas.
2. Brief: `model.ts` e testes correspondentes. Serializar os alertas existentes das posições de modo opcional. Preservar a legenda já adicionada por outra sessão, sem alterar o significado dos demais campos. Verificar o limite de tamanho sem truncamento ou aumento de teto.

A integração é dona dos artefatos desta pasta, da revisão e das verificações finais. Cada implementação deve reproduzir o defeito com script descartável antes da alteração; nenhum agente roda build, formatador ou suíte durante a implementação. A verificação completa será rodada uma vez após integração, salvo correção de falha real.

## Riscos e trade-offs

- Usar a validade curta de falha já existente limita o tempo de fechamento sem instituir nova política financeira.
- Uma recusa prévia não explica automaticamente falhas posteriores à execução. Relatar apenas o caminho efetivamente exercitado.
- O Brief tem pouco espaço. Manter os fatos, candidatos e teto; evitar legendas redundantes se necessário, sem criar outra convenção.
- O processo instalado não é este checkout. Validar o código não é implantar mudanças em uma carteira ativa.
- Não alterar o ritmo: o modo automático já pode chegar a um minuto em condições específicas, e 24 horas contínuas nesse ritmo exigiriam 1.440 consultas principais, antes de fechamentos ou chamadas adicionais.

## Verificação

Replay local somente leitura usando evidências disponíveis, sem modelo remoto ou CLI de execução; testes de regressão em fronteiras consumidoras; gates do AGENTS.md. A documentação final distinguirá resultados observados de limitações.
