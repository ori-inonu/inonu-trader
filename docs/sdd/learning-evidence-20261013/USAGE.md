# Exportação local para avaliação

Execute a partir do checkout que contém o recorder e estas fontes, usando Bun sem carregar arquivos de ambiente:

```powershell
bun --no-env-file scripts/learning-dataset.ts --dir <diretorio-do-recorder> --horizon 15m --as-of-ms <instante-em-ms>
```

O instante é explícito e deve permanecer fixo para reproduzir a avaliação. O comando somente lê arquivos regulares snapshots-YYYY-MM-DD.jsonl e labels-YYYY-MM-DD.jsonl. Não lê decisions.jsonl. Não faz chamadas de rede ou operações de carteira. Em falha, stdout permanece vazio; stderr contém o código e, quando disponível, arquivo e linha, sem conteúdo bruto. Use uma cópia estável do recorder se houver escrita concorrente. Um arquivo alterado durante a leitura é recusado.

O JSON inclui o SHA-256 dos bytes lidos de cada arquivo, opções, linhas elegíveis, motivos de exclusão e índices dos folds. O manifesto representa esses arquivos, não certifica a origem ou fidelidade histórica dos dados. Para a API em memória, a proveniência dos objetos é responsabilidade do chamador.

O alvo é retorno long spot hipotético líquido do custo round trip registrado. Não é PnL realizado, probabilidade de lucro ou recomendação de negociação. Campos desconhecidos permanecem null. Perp, cliques manuais, custos ausentes, observações com features futuras e labels inconsistentes não entram na avaliação. Os campos do alvo permanecem separados das features.

Cada fold usa timestamps inteiros, agrupando ativos simultâneos. Uma observação de treino só entra quando seu horizonte termina estritamente antes do começo do teste menos embargoMs. Blocos sem treino suficiente são omitidos, e uma cauda incompleta não vira teste. Os testes podem ter durações diferentes e alvos sobrepostos dentro do bloco. Não presumir independência estatística ou comparar durações sem considerar os intervalos.

Os padrões são minTrainGroups=30, testGroups=12 e embargoMs=0. São parâmetros operacionais, não critérios de suficiência estatística. Zero folds produz insufficient_data; ready_for_evaluation indica apenas que existem folds. Qualquer normalização, imputação, seleção, ajuste ou calibração posterior deve ser aprendida exclusivamente no treino de cada fold. A promoção ao uso real exige avaliação independente de custos, risco e baselines.

Os limites são 64 MiB totais de entrada, 100000 registros e 2000000 índices de folds. Se os folds ultrapassarem o limite, reduza a janela de entrada ou aumente testGroups mantendo os critérios de avaliação. Não aumente exposição a partir deste exportador.

Opções omitidas ou undefined na API recebem os padrões documentados. null explícito, frações, negativos e valores fora dos limites inteiros seguros são recusados.
