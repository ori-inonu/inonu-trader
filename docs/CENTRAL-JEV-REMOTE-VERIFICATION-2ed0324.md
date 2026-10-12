# Verificação do candidato remoto 2ed0324

Conversa 01a12971-f91a-7b01-befa-dfa93eb04425. Baseline 96d30cc387a6520aba23199e25d0d4ec71a7ad88; candidato 2ed0324af1d539ea89e052b52309ec6365b4d2bb, pais baseline e 0620787aae1ba2ef1b0cf217cbd65670463ac48a. A árvore difere apenas pelo novo documento docs/REMOTE-BRANCH-INTEGRATION-20261011.md, 51 linhas. Todos os arquivos preexistentes, incluindo inputs de execução/teste/build, são idênticos ao baseline por git diff --exit-code com somente esse documento excluído.

Evidências anteriores do conteúdo inalterado foram conferidas por SHA256 e respectivos arquivos .exit, todos com valor 0. Nenhuma suite foi reexecutada apenas para o merge de histórico/documentação.

- Backend: 1969 pass, 2 skip, 0 fail; 1971 testes, 118 arquivos, 127.55s. operator-7bce1e8-root.log, SHA256 1b9b112387f0d6f98fd04c81df661706788f3a991bd70ac43269bade84c69904.
- Frontend: 408 pass, 0 fail; 38 arquivos, 4.19s. final-main-web.log, SHA256 44e348050f7807a9cd09b57f29be76d831717b6b3a71d9529ee53cb708e1ea73.
- Typecheck:all: exit 0. operator-7bce1e8-types.log, SHA256 99fbe0fda0c8af80b347b8d5e72a970ebf4f4f6865fda925a2a1c344ef0f75c5.
- Build Next/Turbopack nativo: exit 0. final-main-native-build.log, SHA256 00e3ecbf60dd8f06ffc6dbddd8a525833e3dc8b6e19f8225ad272a011909df02. Build ID SULwN8KB5CZQ-fT_7cdC6.

Total: 2377 pass, 2 skip, 0 fail. Os dois skips não são aprovações. Logs preservados em C:/Users/gabri/.codex/tmp/jev-central-01a12971. Relatório machine-consumed CENTRAL-JEV-REMOTE-VERIFICATION-2ed0324.json, SHA256 d3da5dfd6c8945303739afdb7baa86a410613c45876f97c63b23e2754e9f526d, contém checks de logs/exits, 19 refs locais e quatro refs remotos, todos ancestrais do candidato; inventário de worktrees sem inclusão de WIP concorrente.

RI4 permite reutilização dos resultados por identidade dos inputs. A revisão independente de cobertura dos 35 caminhos é uma evidência separada ainda pendente no momento deste registro. Main permanece no baseline; esta verificação não concede aprovação de integração.

Critérios C1–C6 congelados permanecem intactos. C3 visual e C6 interface servida continuam pendentes: abertura de navegador recusada pela revisão automática (recusa do usuário); criação da prévia local rejeitada antes do shell (blocked by policy). Sem repetição/contorno, servidor, ordem financeira, push ou deploy.