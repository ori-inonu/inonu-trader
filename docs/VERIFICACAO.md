# Verificação local

Baseline fixo: b587759e459ea049590102e54a0b07800864cdc3. Alterações locais sem commit, push ou deploy. R1-R8 permanecem congelados em READINESS-SPEC.md; P1-P3 em PROFIT-SPEC.md. Critérios não foram enfraquecidos para aceitar resultados.

## Comportamento exercitado

Bun 1.3.14: 23 testes, 79 assertivas, zero falhas. TypeScript: `bun run typecheck` passou e inclui os três CLIs novos. Testes verificam configuração fechada, inventário/caixa financiados, custos e drawdown, decisões inválidas/hold, filtro econômico, atraso e concorrência, remoção de ordens e parada por gasto. Replay usa fixtures calculadas e três diários reais em paper, rejeitando duplicidade, proveniência incoerente e fills sem financiamento.

As primeiras revisões independentes rejeitaram dois caminhos R3: intervalo mantinha ordem simulada aberta e gas cruzava o teto sem parada imediata. Assertivas acrescentadas falharam antes da correção (3 passaram/2 falharam); passaram após a correção. Outro teste reproduziu ordem mantida durante bloco concorrente (5 passaram/1 falhou); a correção também passou.

O teste do doctor usa RPC local e credencial sintética. Reproduziu exposição da credencial com o CLI anterior (0 passaram/1 falhou) e passou com mensagem genérica; não utilizou segredo real. O diagnóstico nunca constrói carteira nem envia transação. A execução real de capture com `--seconds 45` verificou o formato publicado do comando e a versão corrigida sobre o mercado público.

A revisão de padrões também apontou a preferência por APIs Bun na gravação de arquivos. O resumo de capture agora usa `await Bun.write`; typecheck passou novamente e uma captura mock de cinco segundos gravou JSON válido com a duração, modelo e fonte esperados. Essa execução verifica a gravação do CLI e não integra as três amostras de rentabilidade.

Os testes provam esses comportamentos delimitados, não rentabilidade. Resultados e limites estão em [RISCO-E-BACKTEST.md](RISCO-E-BACKTEST.md). A terceira amostra foi positiva apenas por marcação de inventário, com zero trades. Custos e probabilidades permanecem estimativas não calibradas.

## Revisão e limites

Revisão de critérios e revisão de padrões são eixos separados, em cópia isolada sem .env ou credenciais. Cada relatório identifica manifest, hashes, verificações e limitações. Os relatórios finais são anexados em evidence após a revisão; a própria execução do teste não substitui seu parecer independente. Modelo/tier efetivos dos revisores não foram expostos, embora os papéis estejam configurados.

Live permanece bloqueado antes de depósito/ordem. Falta chave Jev própria, signatário/capital qualificado, conciliação completa após restart e evidência de estratégia. A OKX/Pix depende de conta autenticada, KYC, rede e tarifas; não foi verificada pessoalmente. Railway foi apenas consultado em leitura: mudanças locais não foram publicadas. Nenhum executor após encerramento ou promessa de ganho constante foi criado.

## Próximo ciclo elegível

Congelar prompt/modelo/parâmetros do Jev, quando houver chave própria disponível localmente, e comparar paper novo com caixa, inventário mantido e maker simples em períodos reservados. Medir custos, exposição, fills, atraso, retorno e drawdown. Conciliação de execução real é uma entrega separada; disponibilidade de credenciais não dispensa essa etapa. Não aumentar alavancagem ou lote para perseguir R$4000.
