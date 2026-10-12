# INONU TRADER: qualificação dos históricos L2 da OKX

Fontes públicas consultadas em 2026-10-11. Este documento distingue o contrato publicado, a resposta de metadados observada e as dependências para usar dados históricos em backtests. Os arquivos históricos ainda não foram obtidos ou qualificados.

## Metadados publicados e observados

A API associa os módulos `4/5/6` a livros de `400/5000/50` níveis. O módulo de 5000 níveis começa em 2025-11-01; a documentação anuncia a descontinuação de 50 níveis. Livros usam buckets UTC0, backfill variável e publicação típica T+3. São declarados nome, URL, tamanho MB e data. A seção não define o schema interno, a compressão ou um checksum do arquivo. Seu exemplo ZIP corresponde a trades. [API de históricos](https://www.okx.com/docs-v5/en/#public-data-rest-api-get-historical-market-data).

A página de produto anuncia dados L2 desde março de 2023. Essa declaração não demonstra cobertura efetiva por instrumento, dia ou resolução. [Produto histórico](https://www.okx.com/historical-data).

A resposta pública retida para BTC-USDT, módulo 4, SPOT, diário, 2026-10-01, contém 511 bytes e SHA256 `a24a9109e655754aebd047d42f403ce4de8afaa34adbdf9423c69d8627c4f85a`. Ela lista:

```text
BTC-USDT-L2orderbook-400lv-2026-10-01.tar.gz
https://static.okx.com/cdn/okx/match/orderbook/pro/L2/400lv/daily/20261001/BTC-USDT-L2orderbook-400lv-2026-10-01.tar.gz
```

O tamanho declarado é `109.26` MB e o timestamp do provedor é `1791748303027`. Isso comprova a listagem nessa resposta, sem comprovar acesso ou bytes do arquivo. O sufixo sugere tar comprimido com gzip; assinatura, membros, conteúdo e limites de expansão permanecem desconhecidos.

As fontes oficiais consultadas não forneceram um schema ou amostra específica desse arquivo L2. A lacuna delimitada não prova ausência global de documentação. A política local de URLs está descrita em [descoberta de históricos](./OKX-HISTORICAL-ARCHIVES.md).

## Contrato separado do WebSocket

O contrato JSON de `books` mostra `arg.channel/instId`, `action=snapshot/update`, `data.asks/bids`, `ts`, `checksum`, `prevSeqId/seqId`. Tuplas `[preço,quantidade,0,contagem]` têm membros string. Quantidade representa moeda base em SPOT/MARGIN e contratos em derivativos. `ts` representa geração do livro em Unix ms. Continuidade usa igualdade com a sequência anterior, sem exigir incremento unitário. Snapshot tem `prevSeqId=-1`; heartbeat repete a sequência e manutenção pode diminuir `seqId`. `books` começa com 400 níveis e deltas de 100 ms; `books-l2-tbt` usa 10 ms. [Contrato WS](https://www.okx.com/docs-v5/en/#order-book-trading-market-data-ws-order-book-channel).

Esses fatos pertencem ao WS documentado. A equivalência com o histórico listado não foi demonstrada. Parser, unidades, frequência, snapshots, deltas e sequência do WS precisam de evidência própria antes de serem aplicados ao arquivo.

O anúncio de 2026-05-21 deprecia o checksum em demo em 2026-06-02 e produção em 2026-06-23 para `books`, `books-l2-tbt` e `books50-l2-tbt`. O campo permanece em zero sem validar integridade; a orientação usa `seqId/prevSeqId`. O anúncio abrange canais JSON WebSocket e preserva SBE. Não define versão ou reprocessamento de arquivos históricos. [Anúncio oficial](https://www.okx.com/help/okx-order-book-channels-checksum-field-deprecation).

## Uso permitido ainda precisa de qualificação

Os termos de históricos de 2023-10-26 descrevem licença limitada, revogável, não exclusiva e royalty-free para uso pessoal, incluindo desenvolvimento da própria estratégia. Excluem outros usos, incluindo comercial e monetização por redistribuição; também tratam redistribuição/sublicença a usuários finais ou parceiros. Exigem excluir cópias quando a licença é revogada ou expira. Não garantem exatidão, completude ou ausência de restrições de terceiros. [Termos de históricos](https://www.okx.com/help/historicaldata-terms-and-conditions).

Os TOS consultados indicam atualização em 2026-09-17, prestador conforme residência/data de cadastro e precedência de termos locais quando aplicáveis. Seus §§8 e 9.4 tratam licença limitada e autorização para uso comercial. [TOS](https://www.okx.com/help/terms-of-service).

Contratante, termos locais, finalidade, destinatários e implantação do projeto não foram qualificados. O uso pretendido permanece desconhecido. Essas páginas e a listagem não demonstram licença aplicável ao INONU TRADER, permissão de redistribuição, acesso a feeds ou autorização financeira.

## Critérios para futura ingestão e replay

Cada item abaixo exige evidência própria. São requisitos propostos para a próxima qualificação.

| Critério | Evidência necessária |
| --- | --- |
| Q1: uso | Identificar contratante, termos/versionamento aplicáveis, finalidade e destinatários; mapear os direitos efetivos ao uso pretendido. |
| Q2: artefato | Em aquisição separadamente autorizada e limitada, registrar URL, pedido/recepção, status, cabeçalhos, bytes e hash. Verificar assinatura, membros e limites de expansão; impedir caminhos fora da raiz, links e execução de membros. |
| Q3: schema e unidades | Obter contrato específico ou descrição de amostra real com proveniência. Fixar formato, encoding, tipos, escala decimal, unidades por instrumento, timestamps/fusos, snapshots/deltas e versão. |
| Q4: continuidade | Com semântica comprovada, reconstruir desde snapshot válido e verificar cadeia, duplicatas, lacunas, heartbeat/reset, remoções e atualizações. Invalidar o trecho com lacuna até recuperação demonstrada. Checksum exige algoritmo e versão realmente presentes. |
| Q5: cobertura | Inventariar registros por instrumento/dia, primeiro/último evento, intervalos sem dados, profundidade, mudanças de schema e ausências conhecidas. Validar janelas adjacentes e uma janela reservada. Um arquivo não demonstra cobertura geral. |
| Q6: tempo de informação | Separar evento, disponibilidade comprovada para o consumidor e recepção local. Data do arquivo, timestamp da resposta, T+3 típico ou download atual não provam disponibilidade histórica por evento. Sem essa evidência, limitar conclusões ao replay e bloquear alegações sem lookahead. |

As dependências atuais são schema, unidades, continuidade/checksum, cobertura, tempo de informação, direitos de uso e conteúdo/acesso reais. Fills, taxas, slippage, latência, custos, margem, liquidação, lucro e reinvestimento exigem contratos e validações adicionais. Esta qualificação não demonstra saldo real, rentabilidade ou operação por 24 horas.
