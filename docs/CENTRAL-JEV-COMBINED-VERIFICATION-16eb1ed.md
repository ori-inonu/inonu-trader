# Verificação conjunta da central e ledger — 2026-10-11

Conversa 01a12971-f91a-7b01-befa-dfa93eb04425. Candidato fixo 16eb1edee343bb16039e53e83bd43d7e3b27f365; parents 714e2762ba3c1704cb00b5d8051bd0460c84ec66 e ff37327264d904242c57c21c8acb548a05651e82. Main ainda ff37327 no início deste registro, limpa; merge final pendente de gates e revisão independente. Nenhum push, deploy ou ordem financeira.

## Gates já observados

Frontend completo em 714e276: 416 pass/0 fail, 39 arquivos, exit 0. copy-web.log SHA256 b5da972c4e2b181c130b36f800ed5a364af586f96e5d5390680a8aa6b0827f89. Regressões de descrição: oito falhas antes da correção; suite focal 21 pass/0 fail após correção. Revisor independente confirmou fechamento do P2 e 21 pass/70 asserções no export, sem novo impedimento no delta; parecer docs/CENTRAL-JEV-COPY-REVIEW-714e276.md SHA256 40bb8fc9ef61b1dd0c95199fc33a64d46564dcf06c0813c1fe29561749111b6e. Limitação histórica do parecer: ainda não dispunha do sucesso posterior do build.

Build nativo padrão Next16.3.4/Turbopack em 714e276: exit 0, Build ID fEQXi7zmqvsXIt51IEknU. copy-native-physical.log SHA256 44e584cdec2a191476462a46c60aaa27174d49be3c573bc276a91367bc9f4d9e. O runner de resumo teve UnicodeEncodeError após salvar stdout/stderr e resultado do build; seu exit 1 não foi atribuído ao Next. Não houve troca de bundler/configuração. Cópia física das dependências conferida em 10.463 arquivos de cada lado, nenhuma diferença, SHA256 dos dois manifests bb8434bd3285e8ea0b61d195974120db63ce143affda0f81f09454fc524ced23; physical-dependencies-verification.json SHA256 77c027f1b1d1d06f5af1ce69639abe50f097d09292e8a141d8a31fa6fb398fd0.

git diff --quiet 714e276 16eb1ed -- web package.json bun.lock tsconfig.verification.json retornou 0. Frontend/build acima são reaproveitados somente para esses inputs iguais. Typecheck:all conjunto em 16eb1ed exit 0; combined-types.log SHA256 f830dee8279913b62956a5c27a3f52f0fccc8cec9f052fd4cdc8dee6f25b9de2.

Inventário anterior ao avanço final: 19 branches locais, quatro refs remotos não simbólicos e dois HEADs simbólicos; todos os 25 tips observados contidos no candidato. Oito worktrees: integrador e main limpos, principal 42 entradas pendentes, System One31, R8 16, demais limpos. Mudanças não commitadas permanecem fora da integração. combined-inventory-before-main.json SHA256 043633e159871805e3793b699835edb287aca26226460fae9dfbdd8a3c2f56de. Inventário é instantâneo e deve ser reconferido antes do avanço de main.

## Falha preservada e diagnóstico

Primeira suite backend conjunta: 1985 pass, 2 skip, 1 fail; 1988 testes/119 arquivos, 150.92s, exit 1. combined-root.log SHA256 1ad9093b08dd8528829f7784f3f94260da290ccb3632a405d9ec724d6df9bcba. Falhou src/paper-supervisor-runner.test.ts:476, caso offline de recovery C1–C5: child_handshake_timeout;child_pid=26640;exit=running;stdout=;stderr=. A espera de resultado do subprocesso de recovery tem limite de 3000ms após confirmação da saída do primeiro filho. Teste e runner não mudaram no delta; demais casos de subprocessos passaram. Não atribuir causa à nova persistência sem evidência.

Jev classify_failure receipt 5b9352f4-f633-4657-b030-3c2149774f27: abstained/low_confidence .44, workflow gather_evidence, modelo jev-1.13.0, uso 972/116, custo desconhecido. Hipóteses ainda não estabelecidas: atraso de inicialização/escalonamento sob validações concorrentes, bloqueio transitório em fixture/importação ou defeito intermitente preexistente no recovery. Nenhum critério/timeout/código alterado para obter sucesso.

Probe isolado do caso real, com mesmos limites e sem código alterado: 1 pass, 0 fail, 3.49s, exit 0. paper-isolated.log SHA256 af1132e1cb2ca5b51efc6f9392c2608c8fbd2328827dab694fb181152d65f5fd. A falha não foi reproduzida nesse probe; causa permanece desconhecida. Suite completa foi iniciada novamente sem checagem de tipos/cópia/hash/archive pesados em paralelo; resultado será registrado abaixo, sem apagar a primeira falha.

## Critérios globais preservados

Aceite C1–C6, RI1–RI5, EC1–EC4 e LI1–LI5 permanecem congelados. C3 visual e C6 servido não certificados: revisão automática recusou navegador informando recusa do usuário; criação da prévia foi bloqueada por política antes do shell. Sem novas tentativas ou contorno. Build/SSR não demonstram uma prévia acessível nem desempenho visual.
