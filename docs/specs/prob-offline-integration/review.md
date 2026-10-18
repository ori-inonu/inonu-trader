# Revisao da integracao offline

Escopo: biblioteca probabilistica pendente da goal1, consumidor CLI e testes sinteticos. A origem foi preservada. Apenas estes caminhos e os documentos desta entrega entram; a reorganizacao documental ampla, autenticacao, dependencias e conflitos das demais arvores permanecem fora da integracao.

## Resultado

Sem achados bloqueantes para o uso exploratorio offline descrito na spec. Os problemas reproduzidos por regressao foram corrigidos: nome de destino com dois pontos, junctions, sobrescrita por arquivo/hardlink, pasta de entrada implicita, idade desconhecida convertida em zero e projecao de texto livre. Valores livres desconhecidos de motivo, postura, janela e nome de entrada nao sao reproduzidos no relatorio.

Biblioteca pura, imports internos e testes de fronteira aprovados. Nenhum caminho de producao importa a biblioteca nesta entrega. Market.init, produtor dos journals, agente, cadencia, limites, dependencias, lockfiles e autenticacao nao foram alterados.

Facetas conferidas com o produtor: brief e placar usam probabilidades; o fechamento multiplica por 100 ao montar sua.f. As fixtures do leitor preservam 0.2/0.6 no brief e convertem fading 40 do fechamento para 0.4. O teste positivo de brief posterior agora declara explicitamente idade conhecida, e as regressoes negativas verificam as duas pontas.

A varredura de padroes de chave privada PEM, tokens GitHub e formato sk nao encontrou caminhos sinalizados nesta entrega. Isso e uma verificacao de padroes, nao uma prova universal de ausencia de segredos.

## Limites que acompanham a entrega

- Leitor limitado aos cinco arquivos ativos declarados em leitura. answers, prices e fills tem apenas presenca verificada; segmentos rotacionados nao entram. Presenca nao prova cobertura.
- A purga usa o horizonte nominal. A tolerancia do caminho de preco, a disponibilidade tardia de liquidacoes e a idade real desconhecida da fonte nao sao modeladas como disponibilidade individual de cada rotulo. O split temporal e uma avaliacao exploratoria sob esse contrato; nao certifica ausencia de vazamento em journals reais. Um leitor com proveniencia e disponibilidade de rotulos e backlog futuro.
- O alvo e movimento bruto historico. Nao ha custo liquido, execucao, qualificacao live, politica de reinvestimento ou demonstracao de lucro composto.
- Comparacoes de saida antecipada escolhem politicas na propria amostra. Nao ha validacao posterior nem efeito no agente.
- A protecao de escrita exige diretorios estaveis durante o comando. Caminhos canonicos e criacao exclusiva cobrem os casos sinteticos de links e sobrescrita; nao se afirma resistencia a troca hostil de diretorios durante a execucao.
- O detector de identificadores cobre valores conhecidos nos journals e nao substitui uma auditoria de dados sensiveis. A projecao limita as chaves textuais de entrada.

Tipos, core, laboratorio, suites focadas e diff check aprovados conforme status.md. Nao foi necessario repetir as suites depois de remover quatro linhas vazias no EOF e atualizar somente documentacao.
## Revisao adicional da finalizacao

A recomendacao consultiva Jev ec27d52d-d044-4ecc-b1cd-322be31bc369 escolheu finalize_reviewed_pr, confianca 0.54. Por essa confianca foi feito novo passe local de escopo e guardas: origem exata do fork, main e HEAD esperados, manifesto de arquivos, nenhum hook Git ativo (somente exemplos .sample), nenhuma mudanca em caminhos operacionais, diff check e suites comprovadas. A rotina final precisa validar novamente esses fatos antes de qualquer publicacao; nao usa a recomendacao como autoridade.
