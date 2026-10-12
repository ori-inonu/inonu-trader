# Consulta unificada de pesquisa OKX

**Status: proposta especificada e revisada, ainda não implementada. `okx:ecosystem` não está disponível.** O harness rejeitou o início do ciclo com `stale_evidence`; a revisão independente não encontrou uma operação suportada para renovar a cobertura da auditoria anterior. Os exemplos abaixo descrevem o comportamento aprovado para implementação futura.

O comando proposto reunirá as análises locais existentes de Signals/Meme Pump e DeFi em um único JSON. Ele mostrará a origem alegada, a atualidade, os riscos e as evidências que faltam. Os tokens e os produtos DeFi continuarão em seções independentes.

Na raiz do projeto:

```powershell
bun run okx:ecosystem
bun run okx:ecosystem --help
```

Sem argumentos, a demonstração prevista usará apenas fixtures sintéticas e um relógio fixo. A evidência de tokens estará antiga nesse relógio; o horário do detalhe DeFi será desconhecido. Esses casos deverão demonstrar por que um sinal ou rendimento anunciado não qualifica uma operação.

Para analisar capturas locais:

```powershell
bun run okx:ecosystem --signals signals.json --scan scan.json --defi-search search.json --defi-detail detail.json --max-age-ms 60000
```

Será possível fornecer somente o par Signals/scanner ou somente o par search/detail. O prazo será obrigatório na importação, entre 1 e 3.600.000 milissegundos. A ordem dos argumentos será livre. Cada arquivo deverá ser JSON em UTF-8 estrito, regular e local, com no máximo 1 MiB. Os contratos de entrada serão os de [evidências de tokens](../okx-evidence-v1/GUIA.md) e [DeFi](../okx-defi-v1/GUIA.md); respostas soltas da API ou relatórios já compostos não substituirão essas entradas.

O JSON previsto usará `schema: "okx_ecosystem_research_v1"` e conterá:

- `coverage`: informa se cada par foi fornecido; uma seção ausente fica `null`.
- `tokenEvidence`: conserva as observações de compra, avaliação do scanner, atualidade e pendências de venda e segurança.
- `defi`: conserva rendimento anunciado e sua unidade, TVL, taxas incompletas, elegibilidade desconhecida e associação não verificada.
- `missingEvidence`: exige origem verificada, segurança atual, venda executável e custos reais antes de avaliar retorno líquido.

`netReturnUsd`, `executableExitLiquidityUsd` e `totalCostsUsd` deverão ficar `null`. TVL de um produto e liquidez indicativa de um pool não demonstram quanto pode ser vendido pelo preço observado. Taxa anunciada zero não cobre todos os custos. APY anunciado não é lucro realizado nem projeção de crescimento da carteira.

O comando deverá escrever o relatório em stdout. Uma falha deverá retornar exit 1, stdout vazio e um código finito em stderr (`invalid_arguments`, `invalid_file`, `invalid_utf8`, `invalid_json`, `invalid_capture` ou `invalid_clock`). O desenho aprovado exclui carregamento de `.env`, solicitações a APIs ou modelos e acionamento de carteira ou executor.

Rewards, Alpha Radar e portfólio continuam descritos no [mapa do ecossistema](../okx-ecosystem/GUIA.md), com qualificação própria pendente. A consulta proposta integrará as evidências já disponíveis para orientar a próxima pesquisa; funcionamento deste novo comando, conexão live e retorno financeiro não foram demonstrados.
