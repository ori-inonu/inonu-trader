# Revisao dos contratos documentais pendentes

Origem examinada: jev-trader-goal1, HEAD a4a9ef5, sem modifica-la. A verificacao desta passagem leu os dois anexos do laboratorio e avaliou somente a expressao de recorte sobre o texto real em variantes LF e CRLF. Nenhum codigo da origem ou modelo foi executado.

## Recorte apos normalizacao

src/lab/purity.test.ts:38 e src/lab-jev/purity.test.ts:19 normalizam CRLF para LF, mas calculam o indice do anexo numa segunda leitura ainda crua. Nos documentos atuais, o primeiro indice fica 546 caracteres alem do indice normalizado; o segundo, 237. O inicio do contrato e removido ao aplicar o indice bruto ao texto normalizado.

Prova observada: com LF, o recorte comeca no titulo esperado. Com CRLF, a mesma expressao perde o titulo nos dois arquivos. Normalizar uma vez e calcular indexOf sobre essa mesma string preserva o titulo. Atributos da origem definem somente docs/_meta/cerebro/** como -text; nao fixam LF para esses anexos. A suite completa da origem nao foi executada em CRLF e nao se afirma um numero de falhas dela.

Correcao necessaria antes da integracao: ler uma vez, normalizar, exigir a presenca do marcador e recortar pelo indice calculado no texto normalizado. Validar com as duas terminacoes de linha. Evidencia: .scratch/document-migration-contract-review-20261018/result.json, com hashes dos arquivos examinados.

## Anexos desatualizados frente a main

Os dois anexos preservam integralmente os contratos de a4a9ef5 apos a normalizacao tipografica declarada. Isso nao prova equivalencia com os contratos atuais de main.

O diff a4a9ef5..main nos documentos antigos tem nove insercoes e oito remocoes. Entre as atualizacoes obrigatorias estao:

- JEV-LAB-JEV-REAL: origem do texto fixo em p-lab-chooser e mapa de modulo com JEV_LAB_QUESTION_ID, em vez do antigo JEV_LAB_SHADOW_NOTICE.
- JEV-LABORATORIO-DE-DECISAO: resultados incompletos permanecem em suas posicoes temporais no HAC; gamma_j considera pares separados por j epochs originais e nao comprime lacunas. A ressalva sobre ausencia informativa permanece relevante.

Acao para a migracao: conciliar os anexos com main atual antes de redirecionar os testes ou remover as fontes antigas. Rodar as suites contra o contrato conciliado. Esta revisao cobre dois contratos, nao as 1146 exclusoes propostas.
