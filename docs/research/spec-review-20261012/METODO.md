# Revisão de especificações por cluster (somente leitura)

## Objetivo do usuário (palavras dele, resumidas)
Revisar as especificações de cada branch e worktree em que o trabalho foi começado, entender o que ainda precisa ser feito e concluído, para atualizar a branch main com tudo, deixar todo o trabalho concluído e então finalizar worktrees e branches. Esta revisão alimenta a decisão do que implementar agora, do que é decisão do dono e do que está bloqueado.

## Alvo e fontes
- Árvore alvo: branch `integ/consolidation` em 8d0611a, worktree `C:\Users\gabri\jev-trader-integ`. Ela já reúne o conteúdo de todas as branches e worktrees (inclusive o que estava só em arquivos não commitados). A branch `main` está em f7be047 (`C:\Users\gabri\jev-trader-main`). O registro de como a integração foi feita está em `docs/CONSOLIDACAO-MAIN-20261011.md` (na árvore alvo).
- Worktrees originais, para comparar o que estava lá com o que entrou na árvore alvo (somente leitura; sessões e agentes Codex podem estar escrevendo neles agora): `C:\Users\gabri\.codex\worktrees\<nome>\jev-trader` para gev-wallet-pilot, gev-wallet-pilot-ui, inonu-jev-read-safety-f5-f6, inonu-jev-tape-data-f1-f4, inonu-system-one-safety, jev-panel-integration, okx-real-integration; `C:\Users\gabri\jev-trader` (checkout primário, branch feature/jev-command-center, com muitas edições não commitadas); `C:\Users\gabri\jev-trader-desk` (docs/sdd-carteira-evidencia); `C:\Users\gabri\jev-trader-vf` (docs/r10-operator-rereview). Patches completos do que estava não commitado: `C:\Users\gabri\jev-trader-archive-20261010\patches\`.
- Contratos congelados do projeto (não os reabra): CLAUDE.md do projeto (mensagem central: o Jev decide buy ou sell a partir do feed, trades reais de carteira real, ordem na book on-chain da Kuru a cada bloco de 300 ms, nunca decidir a cada N blocos; sem ponto médio, travessão ou meia-risca em texto renderizado; sem indicador piscando ou pulsando) e a execução ao vivo continua bloqueada (decisão D11 de `docs/ARQUITETURA-CENTRAL-DE-OPERACOES.md`): não proponha ligá-la.

## Regras (imutáveis)
- Somente leitura. Nunca edite, commite, mescle, mova, remova nem rode git que escreva em nenhum worktree ou branch. Leituras com `git show`, `git ls-files`, `git diff` (com `--no-optional-locks`) são permitidas. O único lugar onde você escreve é o seu diretório de trabalho: `C:\Users\gabri\AppData\Local\Temp\claude\C--Users-gabri-jev-trader\1819da3d-333a-4b69-8349-924e68a9ef45\scratchpad\spec-review\<seu cluster>\`.
- Sem rede, sem credenciais, sem `.env`, nunca `--live`, nunca assine ou envie nada. Não rode suítes completas nem build (o coordenador está rodando a verificação e a máquina está carregada). Se rodar um teste pontual, use `bun --no-env-file test <arquivo>` com cwd temporário, depois de conferir por grep que o arquivo não grava dentro do repositório.
- Checkpoints e relatórios anteriores são fontes, não prova: confirme cada status por código e por teste (arquivo:linha, nome do teste). Diga "verificado por leitura" quando não executou.
- Texto em português, sem ponto médio, travessão ou meia-risca.

## O que produzir, para cada especificação do seu cluster
1. Requisitos e critérios de aceitação com IDs (use os da própria spec; se não houver, crie IDs sequenciais curtos).
2. Para cada um: status DONE, PARTIAL, MISSING, SUPERSEDED ou N-A; evidência (arquivo:linha, nome do teste, checkpoint); o que falta.
3. Cada pendência recebe uma classe:
   - A: implementável agora, sem decisão do dono, sem chave, sem serviço externo e sem dinheiro real. Descreva o menor passo, os arquivos e o teste de aceitação.
   - B: precisa de decisão do dono. Diga qual decisão, as alternativas reais e a sua recomendação.
   - C: bloqueada por chave, serviço externo, dinheiro real ou execução ao vivo.
   - D: obsoleta ou já superada (diga por quê e por qual commit ou arquivo).
4. Trabalho não commitado ou não rastreado nos worktrees originais que NÃO está na árvore alvo (compare por caminho e sha256 curto): liste, diga se deve entrar, ser arquivado ou descartado, e por quê.
5. Contradições entre spec, docs e código (documentos que afirmam o que o código não faz, ou o contrário).

## Entrega
- Relatório completo em `<seu diretório de trabalho>\<cluster>.md` (máximo 250 linhas): uma tabela por especificação, depois as listas de pendências por classe.
- Resposta final (máximo 25 linhas): contagem DONE/PARTIAL/MISSING por especificação, pendências classe A em ordem de valor (com o menor passo), decisões B, bloqueios C, itens D, trabalho solto que ainda não está na árvore alvo, e qualquer risco de segurança ou de gate.
