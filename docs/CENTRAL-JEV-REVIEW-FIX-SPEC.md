# Correções da revisão independente da Central Jev

Baseline fixo: 872ca45a906d96b2f091b0228bc8240613607975; main observado 4a41edf11be10c2c6764271381f1910a581aaa36.
Os critérios C1–C6 e S1–S5 previamente congelados permanecem intactos. Trabalho limitado aos quatro P2 restantes de review-system-one-final.md; precisão decimal e prazo monotônico já integrados.

## Comportamento e verificação

- F1: valor financeiro obrigatório ausente, não finito ou negativo em carteira, limites ou candidato reconhecido → projeção HTTP rejeita o ciclo e parser não o publica como decisão. Capital, valor conhecido, exposição, limites de ordem/exposição e margem/notional aceitam zero legítimo; leverage e distância de liquidação são positivos. Métricas opcionais de risco desconhecidas permanecem null. Identidades de candidatos malformadas continuam descartadas. Verificar handler GET e parser públicos.
- F2: após as três leituras públicas aguardadas → relógio injetado é amostrado uma vez para freshness e candles. CLI usa relógio atual e marca carteira configurada após a leitura. Timestamps futuros reais e antigos continuam rejeitados; não fabricar observação. Verificar readPublicMarket com porta e relógio controlados.
- F3: status error/timeout/malformed/invalid-choice → apresentar decisão rejeitada, causa e manutenção por segurança; não mostrar peso do fallback como decisão aceita. Status ok com hold continua Manter com seu peso. Exibir razões de execução. Verificar HTML público renderizado, sem alegar navegação real.
- F4: cada candidato → texto Elegível/Bloqueado, detalhe nativo details/summary acessível por teclado/toque com razões ou métricas. Preservar escada 2.5D e motion reduzido. Verificar semântica HTML; revisão visual real segue sem evidência devido à recusa de navegador, sem contorno.

Executar uma fatia red→green por vez, suítes afetadas, tipos/build finais e revisão independente de commit fixo antes do merge. Somente o integrador edita estes arquivos no worktree próprio. Sem ordens, push ou deploy. Preservar worktrees sujos concorrentes.

## Decisões e evidências anteriores à implementação

Jev f73b67c8-c085-43fc-96e6-77028666d83a: reject_invalid_required recomendado (approved_by=jev_delegated); apresentação rejeitada ABSTAIN, não aprovação. F3 usa fallback reversível fundamentado no contrato existente: decide.ts normalize/validateLeverageDecision e cycle.ts catch produzem hold=1 como segurança quando status não é ok, portanto não é peso de escolha aceita.

Jev d0700aba-fa90-484f-b257-0ccb08849976, jev-1.13.0: existing_public_seams recomendado confiança 1; completion_clock recomendado confiança 0.91 (approved_by=jev_delegated técnico). Uso conhecido 643 input/106 output tokens; custo desconhecido. Recibos privados persistidos pelo plugin; nenhuma consulta fornece autorização ou prova de execução.

SHA-256 dos arquivos antes da alteração (bytes do checkout):

| Arquivo | SHA-256 |
| --- | --- |
| src/system-one/public-view.ts | 2f0797729ca47f86d015ea4ab547e4811e8c182c699b6c6c4e0b891f2835c4b2 |
| src/system-one/readings.ts | d3aaed5858967b0dec5b9930b420e0c764652fdb6b2e96a5dfc6693b0a360d75 |
| scripts/system-one.ts | a4fde0ee290ac836a38bce7640016f5b9e313a1b840188e45267b2e16633c6ab |
| web/src/lib/system-one.ts | a8a1fdf00108a0dc9ebaee88bb7f648755392e1011d0b2532424aebd4ac533bbd |
| web/src/components/SystemOne/SystemOne.tsx | e20a5874e02c22b6d1ef7f9956fa6db1c94e659026220663c4929c2c4f18e4eb |
| web/src/components/SystemOne/SystemOne.module.css | 982d2f9446558d136c282eba9f62a6bb9d4c6dd87500875a187dbaed8ba3bb1b |
