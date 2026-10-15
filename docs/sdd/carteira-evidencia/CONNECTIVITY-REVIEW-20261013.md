# Revisao independente final do candidato de conectividade

Data: 2026-10-13. Revisor independente: /root/settings_review, conversa propria 01a136d9-995b-7630-8735-45866b737210. Coordenador: /root, conversa 01a136cd-3af3-7361-bd23-c23a6aeece97.

Resultado de fonte e testes: aprovado no escopo revisado, sem novos achados bloqueantes. O P1 registrado em REVIEW.md foi corrigido. Resultado da entrega inteira: PENDING_VERIFICATION, porque WAL-06 ainda requer evidencia no app atual. Esta revisao nao certifica lucro, ML treinado, trades, cobertura integral ou ativacao financeira.

## Isolamento e integridade

Revisei a copia isolada C:/Users/gabri/.codex/tmp/portfolio-connectivity-01a136cd/review-workspace e a baseline irma. Nao implementei esta entrega. Nenhum fonte, teste, criterio, projeto principal ou dependencia foi alterado por este revisor. A unica escrita desta rodada e este relatorio privado. Nao executei API externa, modelo, leitura de segredo, assinatura, ordem nem acesso a carteira real. Os providers dos testes sao sinteticos.

SPEC.md SHA256: 1fb32f0a612e25bd6df3080167718b893aaec01123f5a4bb10d9d78e31fb2913. Criterios WAL-01 a WAL-06 inalterados.

MANIFEST.json SHA256: cb048a3722a45f8d8ca8d9340e0751853407530c7f7ea02d100528f5f4b8d6e8. Os 12 arquivos conferiram no manifesto na abertura e na reconferencia final.

## Achados e encerramento do P1

Nenhum novo achado bloqueante foi identificado no delta atual.

[P1 encerrado] A publicacao reading -> connected dos saldos nativos nao cancela mais a leitura automatica EVM quando a revision permanece igual. Local atual: web/src/components/Desk/Dock/HoldingsPanel.tsx:573-583; web/src/lib/wallet/holdings-session.ts:33-44. Local da falha anterior: HoldingsPanel.tsx:575 no candidato de SHA256 08aa41c537eecee8405d1c04cc0b489d6d3b9cc824cc3aa5798f737d7234e4a0. Criterio: WAL-02.

O painel agora usa subscribeHoldingsRevision, que escuta subscribe do store e compara a revision depois de publicada. Assim, a conclusao dos saldos nativos e a publicacao asincrona de identityKey na mesma revision preservam o guard. Mudancas de conta, rede, provider e eventos repetidos que incrementam revision continuam invalidando o guard EVM. O subject inclui revision para que uma nova sessao inicie uma leitura; Solana ignora revision EVM tanto no subject quanto no callback.

Verifiquei o store real do snapshot, especialmente wallet-store.ts:62-74, :77-100 e :123-153. Os testes novos usam createWalletStore e um provider falso que segura eth_getBalance: holdings-session.test.ts:202-224 comprova leitura pendente preservada ao terminar a leitura nativa; :244-289 verifica refresh e identityKey; :317-349 verifica invalidacao sincrona apos publicacao em conta/rede, incluindo eventos repetidos; :351-377 verifica independencia Solana; :379-402 verifica unsubscribe. Todos passaram na execucao independente. O coordenador informou RED anterior e GREEN posterior; esta rodada verificou diretamente GREEN e o contrato de fonte, sem executar a implementacao antiga novamente.

## Cobertura integral dos criterios congelados

| Criterio | Resultado | Evidencia e limite |
| --- | --- | --- |
| WAL-01 | Conforme no fonte e fixtures | DockWalletTab.tsx:28-32 mantem uma composicao de consulta com HoldingsPanel e TicketPanel, removendo PortfolioConsultation duplicada. HoldingsPanel mostra valor/saldos antes do modelo, percorre todas as linhas retornadas e oferece rolagem/foco na tabela. Os testes de render verificam linhas apos a decima, null desconhecido e preco positivo pequeno sem arredondamento a zero. Nenhuma completude real de portfolio foi inferida dos fixtures. |
| WAL-02 | Conforme no fonte e testes de store/controlador | subject serializado em HoldingsPanel.tsx:560, efeito automatico :626-638, scheduleAutoRead e guards iniciam uma leitura por sessao, cancelam sessao anterior e impedem aplicacao de resposta antiga. Atualizar e Cancelar permanecem em :640-654. subscribeHoldingsRevision resolve o P1 acima. Nenhum polling de saldo, retry, modelo ou assinatura automatico foi introduzido; o timer :545-550 atualiza somente a idade. Os testes reais do store com provider sintetico cobrem reading -> connected e account/chain/repeated events. Nao certifiquei popup ou conexao EVM real. |
| WAL-03 | Conforme no fonte e fixtures | WalletChainSwitch encaminha a selecao Solana para o scope compartilhado. readTarget escolhe endereco Solana para 501 e endereco EVM para EVM; rede efetiva da extensao e alvo solicitado sao separados no texto. Cobertura multirrede declarada, sem alegar todas as redes. A prova live deste candidato esta pendente; observacoes antigas em 47321 nao sao prova do servidor atual 47322. |
| WAL-04 | Conforme no escopo verificavel | Candidato segue DockWalletTab -> HoldingsPanel -> HoldingsConsult -> prepareConsult. A rede do candidato e preferida quando consta na leitura. Outra rede, limite de seis e contratos verificaveis sao explicados. Quantidade de ativos inelegiveis agora aparece explicitamente em HoldingsConsult.tsx:99. Consentimento permanece em :83-87 e ask exige prepared.ok, consent e !busy. answerKey, portfolioMatches, generation e abort preservam contrato e descartam resposta antiga/cancelada; preparacao expirada oculta plano e oferece atualizar. Nenhuma consulta real ao modelo foi feita pelo revisor. |
| WAL-05 | Conforme no fonte | Patrimonio e posicoes precedem decisao, com consulta unica e linguagem clara. Dados usados substitui Por que em HoldingsConsult.tsx:111; a mensagem conhecida de credenciais foi traduzida, sem expor codigo bruto. Custo desconhecido continua nao informado em :135, e nenhuma ordem e enviada. Ticket manual, operador e backend ficam fora do delta. Nao ha promessa de lucro, afirmacao de ML treinado ou resultado liquido inventado. |
| WAL-06 | Parcial, leitura/consulta live atuais pendentes | Bun independente passou: 365 testes, 0 falhas, 2094 assertions, 24 arquivos, exit 0. Build desktop final fornecido pelo coordenador mostra compilacao, TypeScript e export de 8/8 paginas bem-sucedidos. Typecheck exit 0 e build exit 0 foram informados pelo coordenador. Revisao independente em copia isolada realizada. Captura atual vista pelo revisor mostra Minha carteira, Solana, Nao conectada e timeout; nao prova saldos/refresh/consulta. A conexao aguarda confirmacao humana na extensao, cujo protocolo chrome-extension a ferramenta nao acessou. |

## Verificacoes executadas e evidencias do coordenador

Comando executado por este revisor, no diretorio review-workspace/web:

```powershell
& 'C:/Users/gabri/.bun/bin/bun.exe' --no-env-file test ./src/lib/wallet ./src/lib/inonu/portfolio-solana.test.ts
```

Resultado observado: Bun 1.3.14, exit 0, 365 pass, 0 fail, 2094 expect() calls, 24 arquivos, tempo Bun 1127.00ms. A saida completa foi capturada pela ferramenta; apenas a exibicao foi limitada. O aviso React de className no fixture de endereco acompanhado persiste, sem falha de teste; nao foi atribuido a uma regressao de producao.

Leitura/diff/hash: Get-Content, rg, Get-FileHash e git diff --no-index. Exit 1 do diff significa diferencas. Um comando de hash inicial teve ParserError por pipeline de foreach em PowerShell e foi corrigido antes de usar os resultados. Uma busca em src do snapshot revelou path inexistente; nao usei ausencia de resultado como prova de backend.

Evidencias fornecidas pelo coordenador, lidas e hash conferido pelo revisor:

- BUILD-DESKTOP3.log SHA256 fd75ebd762cd5ee5a468491ceddd4bcfb5e4afd19c3e8c8d017f6f4b5f7d9554. Mostra Compiled successfully, Finished TypeScript in 6.4s e Generating static pages 8/8. Ha aviso experimental de localStorage do runtime. Coordenador informou exit 0.
- BUILD-DESKTOP3.json SHA256 fd1f97ae622443f9a44e517e75ed850940015f5f629e6469c3c8647be9464e2d. Metadados RTK/Headroom pass-through, sem campo de exit code; nao e por si so prova de exit 0.
- TYPECHECK3.json SHA256 9d8263e59e7b6cacdb1a08575380e11d12223a3d48c7dcbdbbaf71314d9997ce. Metadados pass-through, stdout vazio, sem campo de exit code. Exit 0 atribuido ao relato do coordenador, nao a uma execucao propria do revisor.

O coordenador identificou o servidor 47321 como desatualizado e iniciou a alternativa atual em 47322. Relatou Conectar Solana -> popup da extensao, mas chrome-extension foi bloqueado pela ferramenta, sem contorno. A conexao expirou sem confirmacao humana; a dependencia dessa confirmacao permanece. A autorizacao separada de consulta manual ao Jev foi relatada; nenhuma consulta ou ativacao financeira e certificada aqui. Os relatos antigos de 5/5 ativos, total e consentimento em 47321 permanecem contexto historico, nao evidencia conclusiva do candidato atual.

Captura atual fornecida pelo coordenador e vista independentemente com view_image: C:/Users/gabri/.codex/visualizations/2026/10/13/01a136cd-3af3-7361-bd23-c23a6aeece97/wallet-decisions-pending.png, SHA256 12608d14d39c32a68ef13f371391212ca636cdef3d56075d4ac55250f7dd2ab4. Exibe Minha carteira, rede Solana, Nao conectada, seletor Solana, Conectar Solana, explicacao de confirmacao/carregamento automatico e A carteira nao respondeu a tempo. A URL http://127.0.0.1:47322/ e atribuida ao relato do coordenador, pois a imagem nao mostra barra de endereco. A imagem comprova estado de timeout/ausencia de conexao; nao comprova leitura dos cinco ativos ou consulta real no runtime atual.

## Limites reais

- Endereco Solana acompanhado sem conta conectada continua uma condicao preexistente: HoldingsPanel.tsx:530 incorpora watched.address no alvo, enquanto :661 passa side original para a view, que pode tratar account null como ausente. Baseline tinha o mesmo contrato. Nao certifiquei esse caminho nem o converti em regressao deste delta.
- Rede de candidato sem posicoes retornadas nao recebe opcao adicional na consulta; o contrato existente exige dois a seis ativos verificaveis. Nao afirmo cobertura completa do radar ou de todas as redes.
- Testes SSR e do store/controlador nao demonstram intercalacao completa de hooks React no navegador, popup da extensao ou modelo real. A captura atual mostra apenas o estado sem conexao apos timeout. Nenhuma prova atual de leitura dos cinco ativos, expiracao/refresh ou consulta real foi disponibilizada ao revisor.
- O backend reservado por outra sessao, as dependencias e o operador nao foram alterados ou certificados por esta revisao. Nenhuma aprovacao de resultado financeiro, qualidade do feed, custo real ou autonomia financeira decorre deste relatorio.

## Hashes finais do candidato

Relativos a review-workspace/web/src; SHA256:

| Arquivo | Hash |
| --- | --- |
| components/Desk/Dock/DockWalletTab.tsx | 4c82fd8776e8bbf6a0ed7cf340cca6fe0e792642032e2e5e5f92df1dd67b6c85 |
| components/Desk/Dock/HoldingsPanel.tsx | c561340a89833668a1459b49b95ee8669856392a180309716e2a3878ea5e60e9 |
| components/Desk/Dock/HoldingsConsult.tsx | 99a21db7c6dfb6f3b8b6e0ab842d72ea8dec350e1f1ad8786faa2a9e5352ed2a |
| components/Desk/Dock/WalletChainSwitch.tsx | 44095ca7404cf1c47959146de9b60ce2b9c2221d1cdd565a5cd11af306806691 |
| components/Desk/Dock/HoldingsPanel.module.css | c9302cdb85d005edede03bc68d258224a80bdd41c4889e3be00efe130593c70c |
| lib/wallet/holdings-session.ts | ad246615de8bd4ec04ad35f656d4199354dbb5a535cbd1c6a5bf1aa84ff75880 |
| lib/wallet/holdings-session.test.ts | b7bf044e657c68fe2fb30a7b63f6f1d15301a9bf49fc9e0bee12db2dab21a7bb |
| lib/wallet/holdings-render.test.tsx | c0c0052e5bcceabe1f9982afb532321854c234d65d73c320ae4ecd722f403ff5 |
| lib/wallet/holdings-consult-render.test.tsx | 7a402c8ac31b749567f9815a3eae7a4d6813c6b8c7a33a33ef6d35ce1561e973 |
| lib/wallet/chain-switch-solana-render.test.tsx | ed6edce0463bbcad46bd608ce616d707e890de1019a306b63fd2dde73d9546fc |
| lib/wallet/chain-switch-render.test.tsx | a6a033114eb4e87e74a91fbeb4dea0aaac742317355bdee4c5331a2a2b14bddc |
| lib/wallet/holdings-solana-render.test.tsx | 03caff7e5d0dbc4658bd74c82d48f17f6246cb6cba76dc0045e5d268f075802d |

Baseline HoldingsPanel.tsx: 038d1cd45dec61dca19c61014ae1043e40fb99ce23aabb2a0805ba6f29837359.

Dependencias do snapshot novamente conferidas, inalteradas nesta rodada:
wallet-store.ts fd678575d803fb60bc85700b417ae0fed1f545bde63bfa323d169b5b87972a39;
okx-wallet.ts 59f10dc59a58235c1abb2351a5c6bd699803a25a78257abdd5af6252d856490e;
wallet/run-guard.ts a552afec8ec3e980908bb0f3e0b0647f590b78dfe528b699ce5ce445b37b3232;
wallet/holdings-consult.ts 769cdf5ac38a4f33567292b08a3a1bef41198ea307d1da8fcf0f7d1fb38ef947;
inonu/portfolio.ts e0da0400643d1e5b0e48ab8734e4ee352e02b1e64fc760fbd5031671f9bf9cdf.

Proximo passo exigido para concluir WAL-06: confirmar a conexao pelo fluxo humano da extensao e registrar no app 47322, com fonte/export atual verificavel, a leitura automatica, saldos/total/rede, expiracao/refresh e a consulta manual autorizada. Entao fornecer artefato com caminho/hash para a revisao independente complementar. Nao substituir essa prova por observacoes do servidor antigo.
