# Jev configurado no Windows

Verificado em 9 de outubro de 2026. A chave do usuário estava disponível no ambiente do Windows como `TYPESAFE_API_KEY`. O provedor instalado no projeto espera `TYPESAFE_AI_API_KEY`.

O `.env` local, ignorado pelo Git, agora contém uma referência ao ambiente. O valor da chave não foi gravado nesse arquivo nem nas evidências:

```dotenv
TYPESAFE_AI_API_KEY=${TYPESAFE_API_KEY}
MODEL=jev
JEV_MODEL_ID=jev-1.13.0
DRY_RUN=true
AUTO_DEPOSIT=false
```

A expansão foi exercitada primeiro com uma variável sintética e depois conferida por igualdade interna, sem exibir a credencial. O modelo foi fixado para tornar os próximos resultados reproduzíveis. Fontes: [expansão de variáveis no Bun](https://bun.sh/docs/runtime/environment-variables#expansion) e [modelos oficiais TypeSafe](https://docs.typesafe.ai/models). A decisão delegada ao Jev está em [windows-key-decision-20261009.json](evidence/windows-key-decision-20261009.json); ela não concede permissão para movimentar dinheiro.

## Verificação proporcional

Critérios W1 a W3, fixados para esta configuração:

- W1: o projeto reconhece a chave por referência; `.env` permanece ignorado e nenhum valor secreto é publicado.
- W2: `DRY_RUN=true`, `AUTO_DEPOSIT=false`, carteira de assinatura ausente e operação real bloqueada.
- W3: comprovar resposta real do Jev, distinguir presença da chave de autenticação exercitada, reproduzir o journal e informar os limites da amostra.

O [diagnóstico](evidence/doctor-jev-windows-20261009.json) passou para o mercado público e identificou a credencial. A [checagem local](evidence/windows-key-config-20261009.json) confirmou a referência, ausência de cópia do segredo e `walletConstructed=false`.

A captura solicitou 90 segundos e observou 92 blocos com o modelo `jev-1.13.0`. Houve três respostas válidas da API, em 338, 299 e 280 ms: todas escolheram `hold`. O processo terminou sem erros ou timeout. Nenhuma ordem, execução, assinatura, depósito ou transferência ocorreu.

O [replay reproduzível](evidence/jev-windows-key-20261009.backtest.json) cobre 89,231 segundos de eventos. A banca simulada de US$100 terminou em US$100,00265766: variação líquida de +US$0,00265766 (+0,00265766%). Como não houve fills, essa variação veio exclusivamente da marcação dos 200 MON iniciais, descontado o custo estimado da API de US$0,00014234. Gás, taxas maker, giro e lucro realizado foram zero. O drawdown máximo foi US$0,01019198.

O custo de API usa os tokens retornados pelo SDK e a tarifa configurada de US$0,042 por milhão de tokens de entrada; o faturamento da conta não foi reconciliado. Três respostas e uma janela curta confirmam integração, não vantagem estatística, lucro contínuo ou capacidade de multiplicar a banca.

Journal imutável: [jev-windows-key-20261009.jsonl](evidence/jev-windows-key-20261009.jsonl), SHA-256 `ff5e7576274dd4e9e767ad0278b6b6e62594aa7a26ff89f2801fe2b0344b766a`. [Resumo da captura](evidence/jev-windows-key-20261009.jsonl.summary.json) e [resultado do processo](evidence/jev-windows-key-20261009.run.json).

## Uso local

Abra o terminal na pasta do projeto. A variável `TYPESAFE_API_KEY` precisa estar disponível nesse terminal; não cole a chave em comandos ou conversas.

```powershell
& C:/Users/gabri/.bun/bin/bun.exe run doctor
$env:JOURNAL_PATH = 'data/jev-paper-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.jsonl'
& C:/Users/gabri/.bun/bin/bun.exe run capture --seconds 120
& C:/Users/gabri/.bun/bin/bun.exe run backtest --journal $env:JOURNAL_PATH
```

Cada captura usa um journal novo. Os limites anteriores de risco, intervalo e custos continuam aplicados; o filtro econômico pode evitar chamadas de API ou ordens em certos momentos.

A chave Jev está conectada e foi exercitada. O projeto permanece em paper. Operação financeira real depende de carteira e reconciliação de saldos, ordens, fills, gás e reinícios, além de qualificação prospectiva da estratégia. Adicionar uma chave de carteira ou alterar `DRY_RUN` não supera o bloqueio de prontidão no código. Consulte também [operação no Brasil](OPERACAO-BRASIL.md) e [risco e backtests anteriores](RISCO-E-BACKTEST.md).
