# Revisao dos arquivos auxiliares e do legado

Escopo: a proposta nao integrada de goal1 exclui 1146 caminhos de docs, sendo 611 Markdown e 535 auxiliares. Esta passagem leu metadados e calculou hashes; nao executou codigo dessa origem, extraiu arquivos, migrou dados ou publicou conteudo do legado.

## Conteudo presente na worktree proposta

A comparacao dos 535 auxiliares com 3445 arquivos atuais da origem encontrou nove equivalentes: sete logs vazios e dois arquivos example nao vazios. A comparacao admite somente bytes exatos ou a normalizacao explicita de CRLF em texto. Os demais 526 nao tiveram equivalente por hash nessa busca. Isso nao determina se um conteudo foi transformado, incorporado em outro formato ou guardado no arquivo ignorado.

Os 535 incluem 253 JSON, 131 PNG, 17 JPG, 13 TypeScript e outros 121 arquivos. Nenhum caminho foi removido do candidato de integracao por esta auditoria. O estado Git e os hashes lidos na origem ficaram intactos. Evidencia local: .scratch/document-asset-audit-20261018/result.json no checkout original.

## Conferencia do arquivo legado

O arquivo local docs-legado-20261017.tgz tem 33914208 bytes comprimidos, 55705600 bytes de tar e 1653 entradas regulares. Gzip, checksums dos headers, tamanhos, terminacao do tar e tipos de entrada foram conferidos em memoria. Nenhum arquivo foi extraido. Os 1146 caminhos excluidos estao presentes uma vez cada.

| Comparacao contra HEAD a4a9ef5 da origem | Arquivos |
| --- | --- |
| Bytes exatos | 171 |
| Diferenca somente de CRLF | 974 |
| Equivalentes no total apos essa normalizacao | 1145 |
| Conteudo divergente | 1 |
| Ausentes ou caminhos duplicados | 0 |

O divergente e docs/research/R6-onchain-os-catalogo.json. O blob de HEAD tem 480855 bytes e a entrada arquivada tem 491933. Nenhum tem BOM UTF-8. Remover CRLF ou comparar o JSON com chaves ordenadas nao os torna equivalentes. O snapshot original permanece no historico Git; a versao do catalogo a preservar e seus consumidores exigem conciliacao antes de importar sua exclusao.

O primeiro recibo comparou bytes brutos e encontrou 975 diferencas. O recibo v2 identificou que 974 eram somente CRLF; v3 conferiu separadamente BOM e equivalencia semantica do catalogo restante. Os recibos anteriores foram preservados. Resultado atual local: .scratch/legacy-document-archive-v3-20261018/result.json.

## Alcance

Equivalencia com a origem a4a9ef5 nao prova alinhamento aos contratos mais novos de main. Os anexos atuais de laboratorio ja foram tratados separadamente, e o terceiro anexo AUT-3 continua pendente na proposta de migracao. Links documentais, os 299 rotulos de fonte e o uso dos arquivos auxiliares tambem continuam em revisao.

O arquivo legado permanece local e ignorado, sem publicacao ou integracao. A existencia de uma copia local nao restaura os caminhos referidos pelo aplicativo ou pelos documentos. Nenhuma dessas comparacoes qualifica o agente operacional ou resultado financeiro.
