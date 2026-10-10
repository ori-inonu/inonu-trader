# Comparar evidências OKX

O relatório reúne observações Signals e o scanner Meme Pump por rede e contrato. Cada linha mostra a origem declarada, a idade de cada coleta/evento, o estágio do scanner, a avaliação de pesquisa recalculada e as evidências que ainda faltam. Não oferece ranking de lucro ou recomendação de compra/venda.

Demo offline:

```powershell
bun --no-env-file run okx:evidence
```

A demo usa os horários originais das duas fixtures sintéticas. O scanner aparece desatualizado. Isso exercita a diferença entre um sinal recente e uma avaliação antiga, sem simular uma coleta atual. Todos os registros continuam `execution: not_qualified`.

Para comparar arquivos de relatórios já produzidos pelos comandos atuais `okx:signals` e `okx:market-scan`:

```powershell
bun --no-env-file run okx:evidence --signals .scratch/signals.json --scan .scratch/scan.json --max-age-ms 60000
```

Cada arquivo deve ser JSON UTF-8, regular e de até 1 MiB. Use `Set-Content -Encoding utf8` se salvar stdout no PowerShell. Os dois caminhos e a janela de atualidade são obrigatórios juntos; o formato legado de `scripts/okx-scan.ts` não é aceito. Não são feitas consultas, autenticação ou operações na carteira. O comando da integração usa `--no-env-file`; ele não lê o arquivo `.env` do projeto.

`sourceClaim: okx_authenticated` em um arquivo é apenas uma declaração. A origem permanece `unverified`, e fontes sintéticas/autenticadas ficam separadas por observação. O scanner é reavaliado com as regras e campos normalizados selecionados; o status importado é ignorado. Uma linha com status `research_candidate` apenas passou pelos filtros de pesquisa disponíveis.

Uma coleta recente não torna seu evento/preço antigo recente. Horários futuros e ausentes aparecem explicitamente. Signals declara o horário de conclusão; evento posterior a ele permanece futuro. O scanner declara o início, com conclusão desconhecida: preço recebido após esse início e até o momento da comparação tem cronologia desconhecida, que impede classificá-lo como candidato de pesquisa. Só preço posterior ao momento da comparação é futuro comprovado. Tokens sem uma das fontes continuam visíveis com essa ausência. Contratos de outras redes não se unem por nome ou símbolo; caixa é preservada em Solana e redes desconhecidas.

A liquidez do pool é indicativa. Ainda faltam segurança atual do contrato, possibilidade de venda, cotação executável de saída, taxas/custos reais e origem autenticada comprovada. Retorno líquido e liquidez executável continuam desconhecidos. O relato de US$68 para US$6.700 não foi verificado e não fundamenta projeções.

Veja os [limites Signals](../okx-signals-v1/GUIA.md) e a [pesquisa da unidade DEX](../okx-dex-units-v3/RESEARCH.md). A unidade de saída ainda desconhecida impede promover a arbitragem a operação qualificada. Wallet conectada no navegador, credenciais OnchainOS e acesso efetivo aos feeds são estados diferentes.
