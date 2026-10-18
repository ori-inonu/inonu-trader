# Proveniencia e referencias da migracao por pasta

Auditoria somente leitura de jev-trader-goal1, HEAD a4a9ef5 com deltas locais, contra main 2327a28. Nenhum gerador ou codigo da origem foi executado. O auditor leu dados e blobs Git; nao mudou a origem, seus ramos, journals ou configuracao.

## Cobertura deterministica

Foram conferidas as 1146 exclusoes propostas sob docs. Sao 611 arquivos Markdown e 535 de outros formatos, incluindo 253 JSON, 148 imagens PNG/JPG e 59 logs. A leitura dos destinos abrangeu 694 Markdown novos ou alterados em toda a origem e o grafo documental de 4,38 MB, que ficara fora do limite de 1 MiB do primeiro comparador de blobs.

O corpo completo de 15 dos 611 Markdown foi encontrado literalmente nos novos documentos apos normalizar LF/CRLF e a tipografia declarada. Isso comprova somente essa preservacao textual. Os outros 596 nao foram encontrados por contencao integral; podem ter sido resumidos ou reorganizados, portanto este resultado nao prova perda nem aprova sua exclusao.

Tres dos 15 corpos preservam uma versao que mudou em main:

| Fonte antiga | Destino na origem | Situacao |
| --- | --- | --- |
| docs/JEV-LABORATORIO-DE-DECISAO.md | src/lab/docs/spec.md | origem preserva contrato antigo; C2a ja corrigiu o candidato com HAC atual |
| docs/JEV-LAB-JEV-REAL.md | src/lab-jev/docs/spec.md | origem preserva mapa antigo; C2a ja corrigiu o candidato |
| docs/sdd/agente-autonomo/SPEC.md | web/src/lib/mesa/docs/spec.md | ainda pendente: AUT-3 em main exige admitir/contar cada avaliacao fisica antes da chamada, inclusive fallback, e aponta para T17 |

Os demais 12 corpos encontrados tem o mesmo blob de origem e main. Isso nao qualifica seus links ou prefixos, nem os demais artefatos binarios e estruturados. Nenhuma dessas exclusoes foi importada por esta auditoria.

## Registro de fontes colapsado

A varredura encontrou 314 linhas de registro no formato fonte/aproveitado em 22 documentos. Destas, 299 usam o proprio caminho do documento de tarefas como rotulo de fonte. Exemplos conferidos:

- scripts/docs/tasks.md:136 anuncia uma linha por caminho original; a partir da linha 140, 26 das 27 entradas usam scripts/docs/tasks.md como fonte. Restam somente dois rotulos distintos para as 27 entradas.
- src/docs/tasks.md:107 registra fontes migradas; 23 das 24 entradas usam src/docs/tasks.md como fonte, tambem com somente dois rotulos distintos.

Essas linhas descrevem aproveitamentos diferentes, mas nao permitem reconstruir uma correspondencia individual com os caminhos originais. Antes da integracao integral, restaurar uma identificacao verificavel de cada origem a partir dos blobs Git ou de outro manifesto comprovado. Nao inventar esse mapeamento a partir do resumo.

## Links locais

Em 7739 ocorrencias de links locais examinadas, 98 apontam para destinos ausentes na origem. A varredura e lexical: pode incluir exemplos de codigo, nao valida fragmentos nem links por referencia e nao consulta URLs externas. Portanto os 98 casos sao uma fila de revisao, e nao 98 documentos comprovadamente quebrados.

Casos conferidos incluem os links antigos dos dois anexos de laboratorio, ja corrigidos no candidato C2a; os links a selftest.ts removido em src/desktop/spike/docs/plan.md:7 e map.md:9; e os destinos evidence/revisao-independente-1.md, FREEZE.json e CHECKPOINT.md em web/src/lib/mesa/docs/spec.md:326. Este ultimo arquivo concentra 44 ocorrencias. Os caminhos e linhas completos estao no artefato local.

## Grafo e limites

grafo/graph.json tem 7860 nos e 13996 arestas. Nenhum campo source textual normalizado coincidiu exatamente com os 1146 caminhos excluidos. Isso nao demonstra ausencia do conteudo em outros campos ou resumos, mas tambem nao fornece um arquivo integral comprovado dessas fontes. A contagem do grafo nao substitui o mapeamento de proveniencia ou a preservacao dos arquivos de evidencia.

Status Git da origem e SHA-256 de todos os destinos lidos permaneceram iguais antes e depois. Evidencia: .scratch/folder-document-provenance-20261018/result.json. Os resultados anteriores do comparador de blobs continuam limitados como descrito no erratum; este auditor complementa aquela triagem, sem declarar migracao semantica concluida.

C2 segue aberto para os prefixos, as fontes resumidas, os links, o terceiro contrato desatualizado e os artefatos nao Markdown. Decisao local sem-jev no escopo de revisao autorizado: registrar os achados, preservar a origem e manter as exclusoes fora do candidato enquanto a correspondencia nao estiver demonstrada. O conector Jev Engineering segue indisponivel.
