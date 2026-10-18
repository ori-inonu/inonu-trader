# Estado do alinhamento

Fase: limpeza e C2a publicadas no PR 5 em rascunho, com commit de codigo aeba0f8 confirmado. Auditoria documental complementar registrada. Checkout original recuperado para compilar e passar nas suites. Objetivo integral aberto. Main local/remota observadas em 2327a2885e9d513833a91e820b17d568be2c0303.

A continuacao aplicou, verificou e revisou mais 133 remocoes literais de export em 68 arquivos, publicadas no PR 5 no commit de codigo 7dc4574, confirmado no remoto. O corpo e os valores permaneceram intactos; nenhum modulo antigo foi copiado. A auditoria de 1798 fontes deixou 88 simbolos preservados com motivo. Tipos core/web, core e lab abaixo, mais 3821 testes web sem falhas, passaram. Ver ../export-surface-alignment/.

A inversao das substituicoes reproduziu os hashes originais de todos os arquivos, byte a byte. Diff check e cerebro verify passaram em seq 1090, com dois eventos novos e historico anterior intacto. Nenhum achado bloqueante no diff desta coorte; a migracao documental integral, autenticacao e a observacao operacional do agente continuam separadas e abertas.

## Saida dos checks

```
bun --no-env-file run typecheck
$ tsc --noEmit -p tsconfig.verification.json
exit 0

bun --no-env-file run test
8544 pass
2 skip
0 fail
1165518 expect() calls
Ran 8546 tests across 542 files. [398.75s]

bun --no-env-file run test:lab
650 pass
0 fail
838161 expect() calls
Ran 650 tests across 16 files. [34.25s]
```

Os dois skips sao os testes condicionais de receipt-safety Market/Trader, que exigem RECEIPT_SAFETY_SOURCE. Saidas integrais da verificacao atual: .scratch/export-surface-closure-20261018/. A primeira fatia retirou exatamente dez exports em nove arquivos, preservando corpos, valores e imports. C2a muda dois leitores de teste e acrescenta um extrator puro, sua regressao e dois anexos documentais atuais. A nova coorte acrescenta 133 declaracoes privadas em 68 arquivos. Nenhuma fonte web mudou, mas sua superficie compartilhada foi conferida: tipos exit 0 e 3821 pass, 0 fail, 59679 expect() calls, 252 arquivos, 26.36s.

## Contratos documentais C2a

Os dois leitores agora calculam o indice no mesmo texto normalizado e recusam marcador ausente. Os anexos novos preservam os contratos de main 2327a28, incluindo HAC com lacunas e o mapa atual de prompts. Links relativos foram conciliados. Os dois documentos antigos permaneceram byte-identicos; os prefixos extensos e demais destinos de goal1 continuam aguardando revisao. Especificacao, tarefas e saida: ../lab-annex-alignment/.

O teste do extrator defeituoso produziu 1 pass e 4 fail. A correcao passou em 43 testes focados, com equivalencia integral e links para LF e CRLF, alem das suites acima. Esse resultado corrige um problema real da proposta de migracao, sem executar o agente.

Revisao de escopo e diff check passaram. Cerebro verify confirmou seq 1086, dois novos eventos append-only e artefatos congelados intactos. Nenhum achado bloqueante na fatia C2a. PR 5 atualizado e commit de codigo aeba0f8 confirmado no remoto; promocao de main continua pendente.

## Observacao real

- Antes da limpeza, 193 testes de src/real passaram, com 2771 verificacoes e zero falhas.
- A coleta anterior 29/30 permanece preservada. A nova rodada concluiu 30/30 snapshots reais ready com timestamps e prova do relogio. A causa exata da amostra bloqueada anterior continua indeterminada. Artefato: .scratch/public-freshness-diagnosis-20261018/result.json.
- Chrome, http://127.0.0.1:3001: painel atual renderizado, status e analise indisponiveis. O proxy consulta o core de carteira em localhost:3000, que nao foi iniciado. Captura: .scratch/observe-main-browser-20261018/panel-core-unavailable.png.
- O runtime paper independente em 3020 completou 25 ciclos hold, called=false e executionEnabled=false. Sua coleta publica funciona; suas rotas /api/real nao atendem as rotas /agent do painel. Isso nao mede inferencia do agente de carteira.
- Os dois filhos e o observador foram encerrados; a ausencia dos tres PIDs foi conferida. Nenhum processo de producao foi iniciado.

Cinco consultas novas do adaptador createJevAgentModel usaram leituras publicas reais e o provedor real, com as variaveis ja disponiveis no processo. Todas tiveram HTTP 200 e resposta validada; postura neutra em cinco, p50 301,436 ms e p95/max 373,992 ms. Sem fallback, 4311 tokens de entrada e 216 de saida reportados por consulta. O alias solicitado foi jev-latest; versao efetiva e custo faturado permanecem desconhecidos. Nenhuma carteira, inventario, candidato operacional ou executor participou, e nenhum mandato retornado foi aplicado. Fonte inalterada. Ver model-public-observation.md.

A revalidacao inicial das portas encontrou apenas o gateway global em 18471, sem o backend de carteira em 3000/3020 e sem frontend em 3001. Depois, a fatia ../core-browser-validation/ construiu o export atual e observou o core desktop real em 47321 com perfil novo e vazio. Inicio e configuracoes renderizaram; health, status e analise responderam, guardas recusaram origens indevidas. Agendador desligado e zero consultas antes/depois. Filho encerrado e 2536 arquivos preservados. Essa observacao e a sonda separada de modelo nao demonstram ciclos completos ou retorno financeiro.

## Trabalho restante

Goal1: 59 arquivos de comentarios/tipos, 113 de superficie de export, 53 de runtime/import, seis remocoes TypeScript e seis itens nao TypeScript no escopo auditado. Categorias sao triagem, nao aprovacao automatica. Origem e checkout original preservados. Artefato: .scratch/remaining-system-audit-20261018/result.json.

O inventario anterior do checkout original encontrou 25 de 37 deltas com o mesmo texto de main apos normalizar CRLF/LF. O comparador corrigido esta em .scratch/remaining-doc-root-audit-20261018-v2/result.json; o primeiro resultado misturava blobs Git com conversao de fim de linha e tem erratum explicito. Depois desse inventario, o ultimo conflito de scripts/jev-consensus.ts foi resolvido e as dependencias de main ausentes foram repostas. Tipos, core (8160 pass, 2 skip, 0 fail), lab (650 pass, 0 fail), tipos web e testes web (3821 pass, 0 fail) passaram na raiz. O merge local permanece aberto, sem commit ou alteracao de main. Ver bootstrap-root.md.

Os oito artefatos v1 congelados permanecem byte-identicos na origem e sem exclusao rastreada. As 1146 exclusoes documentais exigem revisao dos destinos por pasta e anexos. document-contract-review.md registra os defeitos da proposta original; C2a corrige os dois leitores no candidato e preserva os contratos atuais. Ausencia de blob identico entre arquivos novos de ate 1 MiB nao demonstra perda de conteudo transformado.

A auditoria complementar leu 694 Markdown novos/alterados e o grafo de 4,38 MB. Dos 611 Markdown excluidos, 15 corpos integrais foram encontrados apos normalizacao; tres sao anteriores a atualizacoes de main. Dois ja foram corrigidos no candidato C2a; o terceiro e o contrato AUT-3 do agente, que deve preservar a admissao previa de fallback. Os 596 nao encontrados integralmente exigem revisao semantica, sem inferir perda automatica.

Foram encontrados 299 de 314 rotulos de fonte apontando ao proprio documento de tarefas e 98 ocorrencias de links locais sem destino em 7739 examinadas. A varredura lexical pode incluir exemplos; os casos foram registrados para revisao. O grafo foi lido como dado e sua contagem nao foi tratada como prova de arquivo integral das fontes. Origem preservada. Ver folder-document-provenance-review.md e .scratch/folder-document-provenance-20261018/result.json.

O registro desta auditoria acrescentou dois eventos a cadeia anterior: cerebro verify passou em seq 1088, hash 5e4e5f15acf819bda42ac4d7af871df55be272ae027cabfcf494125ed612485d. O diff posterior ao commit de codigo afeta apenas documentacao e seu grafo; src, scripts, web, dependencias e configuracao de verificacao permanecem iguais ao candidato testado.

Consolidacao API: contratos e consumidores nomeados foram revisados e 89 testes offline passaram na origem, com fetch global bloqueado e dados simulados. Os nove arquivos conferidos permaneceram intactos. O conjunto tambem muda validacao/copia de credenciais, caminho/corpo assinados e injecao do relogio; sua integracao fica bloqueada para decisao automatica. Ver api-consolidation-review.md. Os 89 testes nao representam o definition of done de goal1 nem uma consulta autenticada real.

Migracao documental integral, demais exports e divergencias exclusivas seguem pendentes. Autenticacao, segredos, risco, migracoes de dados e operacoes financeiras permanecem bloqueados para decisao automatica.

## Jev e continuidade

O consenso do projeto ja oferece chamadas sem teto por padrao e mantem o ledger. O conector global Jev Engineering ficou indisponivel durante o ajuste do teto separado de 20 tentativas. A consulta anterior recebeu erro de limite; o instalador preparado parou por fonte ausente antes de escrever. Nao se afirma ajuste global aplicado.

Nova revalidacao de origin/main confirmou o consenso sem teto. A regressao focada passou em 3 testes, com 10 expect() calls e reserva contada de 1200 consultas sem provedor. Ainda existem tetos distintos no Pedir ao Inonu e no agente de carteira, preservados nesta verificacao. Ver decision-limit-status.md.

As cinco chamadas do adaptador do projeto sao inferencias reais distintas do conector de engenharia. Nenhuma chamada Jev Engineering foi inventada; a decisao da coorte usa o fallback local sem-jev. A existencia do ambiente do provedor foi comprovada e permitiu a sonda sem restaurar a instalacao global, ler arquivos de credenciais ou modificar autenticacao.

Decisao local sem-jev no escopo autorizado: preservar as fontes, validar a limpeza literal e manter main/producao retidas enquanto a evidencia do agente completo estiver ausente. scripts/goal.ts nao existe neste checkout; o fallback e os bloqueios estao registrados aqui.

O objetivo permanece ativo. Proximo trabalho: revisar C1/C2 e os destinos documentais, resolver divergencias comprovadas e medir o agente completo em contexto autorizado antes da promocao. Esta primeira fatia nao conclui o objetivo.
