# Unidade da cotação no SDK oficial OKX

Pesquisa factual restrita ao repositório público `okx/okx-dex-sdk`, commit `6be0a98ae467a942795b7576b373ff912f20bb82`, capturado em 10/10/2026. Nenhum SDK foi instalado ou executado. O contrato de captura foi gravado antes das requisições; dois metadados e quatro arquivos foram capturados uma vez cada, com corpo e metadados individuais persistidos antes da saída do processo.

## Resultado

**A unidade de `toTokenAmount` continua desconhecida nesta pesquisa.** A versão examinada vincula `getQuote` a `GET /api/v6/dex/aggregator/quote`, mas não declara nem converte a unidade de saída. Este resultado complementa a pesquisa anterior; não permite remover a barreira que impede encadear a segunda perna da arbitragem.

## Evidência vinculada ao endpoint

O método `getQuote`, linhas 364 a 370 de [dex.ts](https://github.com/okx/okx-dex-sdk/blob/6be0a98ae467a942795b7576b373ff912f20bb82/src/okx/api/dex.ts#L364), retorna diretamente `this.client.request`, usa `GET`, o caminho v6 e `this.toAPIParams(params)`. O conversor de parâmetros, linhas 347 a 362 do mesmo arquivo, converte valores definidos em strings; não estabelece a escala econômica de uma resposta. Não há referência a `toTokenAmount`, `fromTokenAmount`, `lamportsToSol` ou `solToLamports` no arquivo `dex.ts` examinado.

No cliente HTTP, linhas 71 a 134 de [http-client.ts](https://github.com/okx/okx-dex-sdk/blob/6be0a98ae467a942795b7576b373ff912f20bb82/src/okx/core/http-client.ts#L71), a resposta é lida com `response.json()`, o código é comparado a `"0"` e o objeto é devolvido com `return data as T`. Essa asserção de TypeScript não converte valores nem valida a escala. A URL padrão é `https://web3.okx.com`, linhas 25 a 31; ela pode ser substituída pela configuração. Esta inspeção de código não é uma resposta observada da API nem prova de acesso pessoal.

Os tipos `QuoteData`, linhas 77 a 93 de [types/index.ts](https://github.com/okx/okx-dex-sdk/blob/6be0a98ae467a942795b7576b373ff912f20bb82/src/okx/types/index.ts#L77), e `RouterResult`, linhas 34 a 48, descrevem `fromTokenAmount` e `toTokenAmount` como `string`. `TokenInfo`, linhas 4 a 12, declara `decimal: string` e `tokenContractAddress: string`. Não há comentário de unidade associado a esses montantes. A presença de casas decimais do token não determina, sozinha, se um montante retornado está em unidade mínima ou legível.

O arquivo [amount.ts](https://github.com/okx/okx-dex-sdk/blob/6be0a98ae467a942795b7576b373ff912f20bb82/src/okx/utils/amount.ts#L1), linhas 1 a 19, contém conversões genéricas entre SOL e lamports. Não referencia cotação ou `toTokenAmount`; sua existência não vincula a saída do endpoint a lamports. O contrato de pesquisa não autoriza deduzir a unidade de outros tokens a partir desses helpers.

## Integridade e limites

O arquivo `SOURCE-CHECK.json` verifica SHA-256 de seis corpos, metadados de captura individuais, a árvore não truncada e a identidade Git dos quatro blobs selecionados. `SOURCES.json` contém URLs fixas, horários locais por resposta, status, tamanhos e localizadores. O cabeçalho remoto `Date` é preservado como observado; difere do relógio local e não foi usado para inferir atualidade da cotação. O tamanho do corpo decodificado é registrado separadamente de `Content-Length` HTTP.

Foram lidos somente os quatro arquivos selecionados no plano. Não foi feita afirmação de ausência em todo o repositório, em outras versões, nos exemplos ou na documentação restante. Nenhum endpoint de cotação foi chamado, nenhuma carteira foi acessada e não foram examinadas credenciais. Não houve teste de produto, mudança de código do GEV ou cálculo de retorno.

## Consequência para o GEV

Manter `outputUnit` desconhecida e o resultado econômico não qualificado. A próxima evidência necessária é uma declaração explícita aplicável ao mesmo endpoint ou uma conversão verificável que vincule montante, token e versão. Isso ainda precisa ser acompanhado por venda executável, custos completos e reconciliação de resultado observado. A pesquisa não seleciona prioridade econômica, não substitui as três abstinências Jev e não autoriza operações financeiras. Crescimento da carteira e lucro permanecem sem demonstração.
