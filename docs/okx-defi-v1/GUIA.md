# Produtos DeFi da OKX no GEV

Esta análise offline organiza uma página de busca e um detalhe de produto em observações separadas. Ajuda a identificar rendimento anunciado, rede, protocolo e dados faltantes. Não calcula lucro líquido, liquidez pessoal de saída ou patrimônio, nem recomenda investimento.

## Demonstração

```powershell
bun --no-env-file run okx:defi
```

Sem flags, todos os dados são sintéticos e o relógio é fixo. A demonstração não consulta sua carteira, ambiente ou OKX. O relatório JSON contém `mode: "synthetic"` e `execution: "not_qualified"`.

## Capturas locais

Cada arquivo contém metadados explícitos e o envelope original, dentro de `response`. Exemplo inteiramente sintético de busca:

```json
{
  "schema": "okx_defi_capture_v1",
  "endpoint": "search",
  "sourceClaim": "synthetic",
  "capturedAtMs": null,
  "response": {
    "code": 0,
    "data": {
      "total": 1,
      "list": [{
        "investmentId": "example-product",
        "chainIndex": "1",
        "name": "Produto sintético",
        "platformName": "Protocolo sintético",
        "rate": "0.02140",
        "tvl": "100000",
        "feeRate": null
      }]
    }
  }
}
```

O segundo arquivo usa `endpoint: "detail"` e `response.data` como objeto de um produto:

```json
{
  "schema": "okx_defi_capture_v1",
  "endpoint": "detail",
  "sourceClaim": "synthetic",
  "capturedAtMs": null,
  "response": {
    "code": 0,
    "data": {
      "investmentId": "example-product",
      "chainIndex": "1",
      "investmentName": "Produto sintético",
      "platformName": "Protocolo sintético",
      "rate": "0.02140",
      "rateTypeDesc": "APY",
      "tvl": "100000",
      "isSupportRedeem": true
    }
  }
}
```

```powershell
bun --no-env-file run okx:defi --search ./search.json --detail ./detail.json --max-age-ms 300000
bun --no-env-file run okx:defi --help
```

As três flags são obrigatórias no modo importado. `max-age-ms` aceita inteiro entre 1 e 3600000. Capturas requerem `capturedAtMs` inteiro válido ou null; null significa tempo desconhecido. Cada arquivo regular local pode ter até 1 MiB, em UTF-8 estrito. O comando não busca produtos, cria arquivos ou aceita modo live. Erros exibem somente um código finito, sem conteúdo/path bruto.

`sourceClaim: "okx_api_claimed"` permite organizar uma captura cuja origem foi alegada por quem a forneceu; não autentica a fonte. Uma carteira conectada no navegador não demonstra permissão de API. Esta entrega não possui coletor autenticado nem comprova acesso pessoal. Os exemplos acima devem continuar marcados como synthetic.

## Como interpretar

- A [busca oficial](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-search) descreve `rate` como fração decimal de APY: `0.02140` representa 2,14% anual anunciado. Isso não é lucro recebido nem taxa fixa garantida.
- O [detalhe oficial](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-detail) tem rendimento genérico e um exemplo com label APY. A unidade numérica não está demonstrada: o relatório preserva texto e label, mas mantém `unit: "unknown"`, sem herdar a fração da busca.
- TVL da busca é USD; unidade do TVL do detalhe permanece desconhecida. TVL não mede quanto você consegue resgatar ou vender no momento.
- Uma fee observada, inclusive zero, tem base desconhecida e não substitui custos de rede, swap, entrada, saída ou execução. `totalCosts` e `netReturn` permanecem null.
- Indicadores de investimento/resgate/claim pertencem ao produto. Não comprovam sua elegibilidade, prazo, capacidade ou valor líquido de saída.
- Correspondência exata de produto e rede gera `identity_match_unverified` para navegação. As duas observações permanecem separadas, sem média, seleção do maior rendimento ou união de campos financeiros.
- Relógio recente significa somente captura declarada recente. Timestamp/TTL do provedor permanecem null; origem continua unverified. Captura velha, futura ou sem horário é explícita.

A busca tem até 20 linhas; `claimedTotal` pode ser maior. `partial_unverified` nunca representa descoberta completa. IDs textuais são preservados, inclusive zeros iniciais; número inteiro positivo seguro recebe representação explícita. Campos opcionais ausentes ou inválidos viram desconhecidos com issue finita. Não há enriquecimento por nomes, símbolos ou tokens.

## Evidências e próximos limites

[SPEC](SPEC.md), [pesquisa](RESEARCH.md), [fontes](SOURCES.json), [decisões técnicas](DECISAO-V2.json) e [baseline](BASELINE.json) documentam o contrato. As verificações/revisões da entrega devem ser consultadas quando registradas; exemplos sintéticos não certificam feed live ou ganho financeiro.

Esta etapa não qualifica investimento, resgate ou reinvestimento. Para avançar até retorno observado seriam necessárias evidências próprias de origem e acesso, unidade e horizonte do rendimento, custos totais, segurança do protocolo, saída executável e conciliação de patrimônio. Crescimento composto só poderá ser avaliado a partir de resultados líquidos observados; não há projeção de retorno exponencial nesta entrega.
