# Pesquisa independente: prévia localhost do main

## Resultado e limites

Há um seam HTTP/SSE reutilizável, mas não há comando pronto no main que ofereça a prévia inteira com inicialização de modelo/feed desativada e bind somente em loopback. A alternativa mínima fundamentada é uma entrada explicitamente HTTP-only que reutilize startServer, com bind 127.0.0.1, ambiente allowlisted e caminhos de estado isolados. Isso oferece transporte e monitoramento; não produz decisões, cotações, fills ou dados financeiros reais. Painéis sem artefatos públicos devem permanecer indisponíveis. Esta é uma proposta de pesquisa, não implementação, autorização para iniciar processos ou certificação de execução.

Baseline: f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c, confirmado por git rev-parse na origem. Identidade observada: CODEX_THREAD_ID=01a12ada-91d7-7ce0-b6ea-e1556d234224, distinta do implementador principal 01a12971-f941-7e42-8a42-fab6d44d4eb5. Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos. Cópia exclusiva ordinária, sem sandbox OS read-only ou garantia OS de bloqueio de rede.

Escopo executado: leituras locais de fontes públicas, Git, hashes, instruções e contexto da própria conversa. Nenhum servidor, aplicativo, teste ou serviço foi iniciado/encerrado; nenhuma chamada HTTP/API/Jev, carteira, assinatura, ordem, inferência ou leitura de .env/segredos foi realizada. Sem auxiliares. Única escrita desta entrega: este relatório. Não revisei implementação própria nem alterei gates/SPEC/candidato.

## Proveniência

Raiz exclusiva R: C:/Users/gabri/.codex/worktrees/inonu-system-one-review-standards-20261011.
Backend B: R/operator-cli-lock-implementation-fixture-20261011/candidate.
Frontend W: R/ui-truth-fixture-20261011/candidate/web.
Origem O, apenas leitura: C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader.

As fontes B/W indicadas na tabela coincidem byte a byte com O; diff dos caminhos examinados contra o baseline ficou vazio. A cópia W não é um checkout completo atualizado de main: layout.tsx nela tem hash c24657fff755eb25d1cbc209d9800e2baccc5ff9a6e3a64c2d320b25e8158233. Para esse arquivo usei a versão exata de main, lida por git show e comparada ao hash de O, sem sobrescrever W. Não tratar essa cópia como artefato executável pronto do baseline. As duas cópias não têm node_modules provisionado; li documentação/código público de dependências instaladas em O, sem executá-los ou copiá-los.

Skills aplicadas: codex-desktop-harness e research, com pesquisa primária local e sem subagentes, conforme restrição explícita. Contexto recuperado somente para a identidade própria; metadados não são autorização. CONTRIBUTING foi aplicado quanto a credenciais, evidência e identificação de simulação.

## Fatos sobre inicialização

1. package.json:21-22 aponta start/dev para src/index.ts. Em B/src/index.ts:12-16, Market.init é aguardado antes de createModel; o HTTP só abre em 18-21. Trader é criado depois, trade feed é anexado em 43 e block feed inicia em 46. Não existe HTTP_ONLY/NO_FEED/NO_MODEL nas fontes de inicialização examinadas.
2. MODEL=mock evita selecionar JevModel, mas ainda cria MockModel; não desativa Market/feed. JevModel cria o avaliador em B/src/model.ts:72 e chama experimental_evaluate em 76. DRY_RUN=true deixa wallet=null (market.ts:84-86), porém init ainda consulta chain ID, parâmetros Kuru, gas/vault (103-108,116-126). O gate live de market.ts:104 continua exigindo qualificação e não deve ser contornado.
3. Remover WS_URL não elimina o feed: chain.ts:31-37 inicia polling HTTP imediato e recorrente antes da condição de WebSocket. RPC_URL/READ_RPC_URL defaults são públicos externos (config.ts:27-29). Apontar RPC para endereço indisponível causa falha/espera; não fornece um backend funcional seguro.
4. Trader cria diretórios e usa journal local (trader.ts:109-118). Portanto root start/dev também não é um servidor puramente leitor.
5. config.ts:71 carrega ambiente no import. MODEL, DRY_RUN e guards são independentes: DRY_RUN não desliga inferência; MODEL=mock não desliga RPC; AUTO_DEPOSIT=false não desliga feeds. Nenhum desses valores, sozinho ou combinado, transforma index.ts em HTTP-only.

## Seam HTTP e CORS para 3002

B/src/server.ts:29 exporta startServer(meta, history). Seus imports de Market/Trader são import type (5-6); imports de runtime passam por config, node:path, operator/http e system-one/http. Os auxiliares examinados são leitores/projeções/cálculos locais, sem instanciar modelo, mercado, executor ou feed. Isso fundamenta separação estática, ainda sem teste runtime de inicialização nesta pesquisa.

A função serve /, /history e /events; SSE envia snapshot imediatamente e ping a cada 15s (35,45-52). /operator, /operator/history, /operator/insights e /system-one reutilizam handlers leitores. Importar ou executar apenas src/server.ts não chama startServer: não há entrada top-level para abrir listener.

Problemas que a futura entrada precisa resolver:

- Bun.serve recebe port, sem hostname (server.ts:38-40). A declaração instalada do Bun documenta default 0.0.0.0 e 127.0.0.1 como bind local (node_modules/bun-types/serve.d.ts:804-823). PORT altera porta, não interface. Não encontrei opção de hostname configurada pelo projeto. Um eval chamando startServer, embora evite index.ts, não garante isolamento em loopback.
- Rotas genéricas usam CORS '*', mas operador/System One são despachados antes do OPTIONS genérico (server.ts:42-44). Ambos usam OPERATOR_DASHBOARD_ORIGINS, default apenas localhost/127.0.0.1:3001 (16,24). Para frontend 3002, definir antes do import: OPERATOR_DASHBOARD_ORIGINS=http://localhost:3002,http://127.0.0.1:3002. Isso não reconfigura um processo já iniciado.
- System One exige Origin exato inclusive em GET; sem Origin retorna 403 (system-one/http.ts:19-27). Operador aceita ausência de Origin, mas rejeita origem informada fora da allowlist (operator/http.ts:40-43). O OPTIONS de operador retorna 204; o de System One retorna 200. Não confundir essa diferença com falha.
- CORS não autentica a rede. OPERATOR_READ_TOKEN é opcional; os hooks web atuais não enviam Authorization. Não colocar token em NEXT_PUBLIC_* nem remover proteção de um backend privado existente para fazer a prévia funcionar.
- Caminhos defaults são ancorados na pasta do módulo, não no cwd (server.ts:14,18-23). Alterar somente cwd não evita leitura de dados antigos. /operator devolve o JSON configurado inteiro (operator/http.ts:69), sem projeção automática. Usar caminhos absolutos novos, sob diretório exclusivo sem estado privado; ausentes devem retornar 404. /system-one aplica projeção pública, mas isso não autoriza ler snapshots privados.
- A função retorna broadcasters, sem handle de fechamento do listener/timer (server.ts:65-72). Um handle explícito de encerramento é uma pequena melhoria justificável para testes futuros; nenhum processo será encerrado nesta pesquisa.

## Frontend e dependências reais

W/src/app/page.tsx:29 usa NEXT_PUBLIC_API_URL ou http://127.0.0.1:3000. useFeed.ts:259 abre EventSource; operator-center.ts:82-125 e system-one.ts:188-239 fazem fetch direto. Inventário Git completo de web/src/app e next.config.ts não revelou API routes/proxy/rewrites: subir Next não cria o backend. Scripts web dev/start fixam 3001; CLI Next instalado aceita --port e --hostname, cujo default também é 0.0.0.0 (O/web/node_modules/next/dist/bin/next:155,181).

Next carrega .env* por conta própria; --no-env-file do Bun não substitui uma cópia física sem esses arquivos. A documentação instalada confirma carregamento (docs/01-app/02-guides/environment-variables.md:18,85,266-274) e inclusão de NEXT_PUBLIC_* no bundle durante build (154-166). Trocar NEXT_PUBLIC_API_URL somente no start não corrige bundle já compilado. Nunca herdar o ambiente completo, NODE_OPTIONS, chaves, tokens ou configurações RPC com credenciais.

Layout exato de main usa next/font/google (layout.tsx:2,5-17). Loader instalado baixa CSS e fontes se não há cache (compiled/@next/font/dist/google/loader.js:82-109), depois serve arquivos próprios (123-141). Novo dev/build pode gerar saída de rede; não é certificado offline. Preferir artefato previamente compilado e comprovadamente associado ao baseline/API URL, ou planejar fontes locais e novo build isolado se ausência total de rede for requisito da próxima execução. Não verifiquei existência/proveniência de .next nem li bundles possivelmente contaminados por ambiente.

Carteiras começam desconectadas; connect/readMultichain estão em callbacks. Porém providers injetados podem emitir accountsChanged/accountChanged e provocar refresh/leitura automaticamente (W/src/lib/okx-wallet.ts:296-334; okx-solana.ts:175-191). Só evitar clicar não constitui garantia. Para a prévia, browser limpo sem extensões/providers; caso isso não seja demonstrável, futura opção explícita de desativar discovery/sessões de carteira com teste. Sem conectar, assinar ou buscar saldos para preencher UI.

## Caminho mínimo proposto, não executado

1. Preparar cópia pública exata e completa do baseline por allowlist de fontes/config/dependências públicas, excluindo .env*, data, private state e artefatos sem proveniência. Corrigir a lacuna de versão do layout apenas em futuro snapshot autorizado.
2. Adicionar entrada HTTP-only pequena, sem import de index/Market/Trader/model/chain/operator CLI; chamar o seam existente. Acrescentar opção explícita de bind local ao servidor, preservando comportamento/gates de execução existentes. Não implementar fake RPC, nem capturar falhas de init para fingir backend pronto.
3. Meta honesta: model="none", wallet=null, history=[], latest=null; mode="read_only" e dataSource="indisponível — prévia HTTP sem produtor". Server Meta hoje não declara esses dois campos; formalizá-los no contrato para a nova entrada. O frontend já lê strings opcionais e trata modo desconhecido como "Execução não verificada" (useFeed.ts:178-189; presentation.ts:37-58). Sem mode, dryRun=true seria rotulado "Simulação"; não apresentar uma prévia sem produtor como simulação financeira realizada.
4. Ambiente criado por allowlist, sem carregar perfil/home/segredos: MODEL=mock, DRY_RUN=true, AUTO_DEPOSIT=false, OPERATOR_EXECUTE=false; nenhum PRIVATE_KEY, TYPESAFE_AI_API_KEY, LIVE_ACK, token ou credencial OKX. Essas variáveis são defesa adicional; a ausência de produtores depende da entrada separada. Não alterar ECONOMIC_GATE nem qualquer critério econômico, assinatura, aprovação, expiry, kill switch ou lock.
5. Definir PORT livre, allowlist de origens exatas e OPERATOR_STATE_PATH/OPERATOR_JOURNAL_PATH/SYSTEM_ONE_STATE_PATH absolutos e novos. Estado ausente é válido para prévia vazia. Para painéis preenchidos, exigir artefatos públicos explicitamente revisados; fixtures devem declarar synthetic/simulation em fonte e UI, nunca mascarar dados reais ausentes.
6. Frontend em loopback; API URL deve ser fixada no dev/build isolado. Dependências: Bun, Next 16.3.4/React 19.2.8, pacotes públicos locais, disponibilidade das portas e browser sem provider. Não instalar automaticamente para iniciar.

Formas de comando para uma execução FUTURA autorizada, não comandos disponíveis hoje. O arquivo http-preview.ts e preview-bunfig.toml abaixo ainda NÃO existem; os placeholders exigem paths provisionados e verificados. Executar com ambiente allowlisted criado pelo launcher, não herdado pelo shell:

    bun --no-env-file --no-addons --no-install --config=<config-isolada> <copia-main>/scripts/http-preview.ts

A partir do web isolado, somente se já houver build exato com API URL correta:

    bun --no-env-file --no-addons --no-install --config=<config-isolada> ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3002

Alternativa sem build prévio, sujeita à verificação de fontes/egress e compatibilidade runtime:

    bun --no-env-file --no-addons --no-install --config=<config-isolada> ./node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3002

Config isolada deve impedir instalação automática, conforme precedente de scripts/okx-operator.test.ts:15-33. NEXT_TELEMETRY_DISABLED=1 é defesa possível da futura execução Next, não substitui controle de egress. Não iniciar comandos de operator/system-one como provisão de dados; o hint de 404 não é autorização.

## Alternativas e verificação mínima futura

| Alternativa | Evidência/risco | Resultado limitado |
| --- | --- | --- |
| Root start com mock/dry-run | Inicializa RPC/Kuru/feed/modelo e journal | Inadequado para inicialização sem produtores |
| Chamar startServer via eval | Seam separado, mas bind default em todas interfaces e defaults de estado perigosos | Incompleto para a prévia segura |
| Entrada HTTP-only + loopback + ambiente/estado isolados | Reutiliza endpoints, sem produtor novo | Menor implementação proposta; ainda não testada |
| Painéis preenchidos por snapshot público/fixture | Exige revisão de conteúdo, schema e rótulos | Complemento opcional; não live qualification |

Próximo teste proporcional: subprocesso real da nova entrada, cwd temporário, ambiente allowlisted, --no-env-file/--no-install/--no-addons/config explícita, sem herdar paths privados. Reaproveitar o padrão público de scripts/okx-operator.test.ts, porém seu fetch guard não é sandbox de rede OS nem cobre todos sockets. Instrumentar imports/constructors/calls relevantes e saída de rede para provar ausência de Market/createModel/feeds/executor/signing, sem bloquear o próprio cliente HTTP loopback.

Verificar /, /history e snapshot/ping SSE com dados vazios e meta honesta; 404 dos quatro endpoints de estado ausente; GET/OPTIONS de operador e System One com Origin 3002 permitido, origem externa negada e métodos de mutação rejeitados. Não exigir 204 onde o handler existente usa 200. Asserir ausência de escrita em ledger/journal/state e ausência de credenciais na resposta. No browser limpo, verificar a origem HTTP real, indisponibilidade explícita de dados e "Execução não verificada"; preencher fixtures somente com rótulo synthetic e sem confundir conexão SSE com execução financeira. Testes unitários/sintéticos não substituem essa observação nem certificam live.

## Evidência runtime e pendências

Checkpoint anterior O/docs/OPERATOR-CLI-LOCK-INTEGRATION-CHECKPOINT-20261011.md:19 registra frontend 3002 visível, feed/backend com Failed to fetch e carteira desconectada. É registro do coordenador, não observação atual minha.

Complemento factual fornecido pelo usuário nesta pesquisa: main f626 limpo; CUA tab1 em 3002 mostra feed desconectado, System One/backend sem resposta e operator Failed to fetch. Listeners reportados: 3000/PID25128, 3001/PID33732, 3002/PID36504. HTTP inicial via HttpClient default apresentou timeout/403 sem allow-origin; o usuário apontou possibilidade de proxy e seis GETs com UseProxy=false ainda em verificação. Não recebi resultados terminais dessa recuperação. Não atribuo os erros ao CORS nem considero o processo atual associado ao baseline/config esperados. Fonte default 3001 não prova origem allowlisted no runtime.

Esses processos foram preservados. Porta 3002 ocupada impede lançar outro frontend nela; a proposta exige disponibilidade/ownership verificada em execução posterior, ou outra porta livre com a mesma correção explícita de origem. Mudar PORT/API URL requer compatibilidade com o bundle do frontend; não encerra nem reconfigura listeners existentes.

Conclusão limitada: separação HTTP viável por fonte, sem inicialização financeira quando usada pela entrada proposta; falta implementar/verificar entrada segura, snapshot completo/dependências, origem runtime, build/API URL e disponibilidade das portas. Nenhuma prévia funcional foi iniciada ou certificada aqui. Objetivo JEV/OKX amplo continua aberto; sem aprovação de main, merge, deploy, fundos, inferência ou execução live.

## SHA-256 das fontes e registros

Paths B/W conforme proveniência; layout, bunfig e checkpoint lidos em O. Valores completos medidos; hashes iguais entre origem/cópia salvo a exceção layout explicitada.

| Arquivo relativo a main | SHA-256 |
| --- | --- |
| src/index.ts | 7275a80b361e5d9a9700a4196518cc3d64d2244bfa7e23b25052a3e73336ecfa |
| src/server.ts | 0fb67e5b65f58ad6ebcad5157d1b8daa75df59a794dfa458f77ae2d375f0678d |
| src/config.ts | 8383abb4a2e6a3bf913dcd12b809c1ad5ad2e5e765b97de78f2aba09242154d5 |
| src/market.ts | 0635221348c1acda1ed277c0f5ef69eb37c0d74063e5c34a8fa1dd4161ebffe7 |
| src/chain.ts | b94a062562b5b6b018fb58c8f9987681e2bbaf8437b7abae0e514b175da22cb5 |
| src/model.ts | 2c076f42e33261619a7e791479fe9200ed6865213406314344ea0772a657185d |
| src/trader.ts | a2ec56b8be8ff1046222248e098da495885cea903e49e34665b0137a9bd751be |
| src/trades.ts | 1ff0dfd30c7f7bdaaa59569957eec6870c5aa2aaf37c824c24101d5f657cc962 |
| src/operator/http.ts | d392a77915fc48448d76ccc608ba4f57d7069fc0ba67c0820feaba3ed55d6cd1 |
| src/operator/insights.ts | 3249facee93fd7b212029eb984b53929f3f6fd9f7db26b9dc5a85b8fc5042153 |
| src/system-one/http.ts | 2dd44642babda63e0a41d935d329afdb07ed5d1578a0f68688291ef150cc5e85 |
| src/system-one/public-view.ts | 62b3682bef7325798f3dcb40bab00609026cb07f4dd57b87485daf90b88f312c |
| src/system-one/types.ts | 5642a3471bbe389d339047bfaa00122677ad83f596fde325f18c5c8c1861c03c |
| package.json | f20dcbb49539fc32e0de83bb0ad9abd5b10c3425519e3ab5241b15a84ec634c6 |
| tsconfig.json | c9becbd07c14df96ae30dadf2cffeb07580cdbc01e7629a9cc1ad3344b7df1c8 |
| bunfig.toml | 7a207b924222010bf45ff7cdc097443437d4d3fea6509e26c20c54fdbae31b29 |
| CONTRIBUTING.md | 77e3d24d12c441f531b8c0311a2299edb1ff42a31460fe390153578586e6c7a1 |
| scripts/okx-operator.test.ts | aae504a1b3219b0e8fe1a61cdf80990d9dadb3ad28c374a29e7692eef8590a2d |
| web/package.json | 947d9a16e9b95b9f094bf97d09c834e68e988011bad0bdbf9e76c3e1bb7cec40 |
| web/next.config.ts | 32593a30fead04d7bfb42a6aab567c70e691985b83a72859a596e326e09d04b4 |
| web/src/app/layout.tsx (main) | 73b4108a76e807d24f864fd3423bb46962d15604ceb50cbf59748170516702f6 |
| web/src/app/page.tsx | d60c2ca7f4e3fb4a483478ee3b69fd4c33aa59ef456af6324022726f531ac12d |
| web/src/lib/useFeed.ts | 7a71639374b68f4192a9b31bb58e3164bbe12f051299bd00695bdd779d465328 |
| web/src/lib/operator-center.ts | 1b446f8f865586e245af59b3ad859b2d43f0bcda0b524ace30ba3f3f874e1336 |
| web/src/lib/system-one.ts | 0d351804f7bef1f607d1c546d189e0f642d8dd0a2b99b9793f40062f3aaa5a96 |
| web/src/lib/presentation.ts | 1560d361d0af3b3e092a33cf1d238adc07b5ad91d288a6d9df760ed7a926b339 |
| web/src/lib/useOkxWallet.ts | 65d589b2f624ff4f04b651ce516f2f4f1bb306e4f9aa9d34ebc292b7383c7f7d |
| web/src/lib/useOkxSolana.ts | bad3d8533bce348b91052f193ff5c6bd2c74c04453fb05fbe7ee8dcb1ddb50ec |
| web/src/lib/okx-wallet.ts | 5f37cd832c52b3f4eab6f813acaeddee3dc4f823b4bfefbdab3d31f2a1f20e2f |
| web/src/lib/okx-solana.ts | 5c619f73bb678c78888ece05f3147e6d260d122be6ecdff1d6faa5cccd87513b |
| docs/OPERATOR-CLI-LOCK-INTEGRATION-CHECKPOINT-20261011.md | c06848893f3362418febb1394144911fcbc2a9c47a74ecdb643aeb0a2f8fd7a3 |

Dependências públicas instaladas lidas como documentação/source, não como prova do runtime ativo:

| Arquivo em O | SHA-256 |
| --- | --- |
| node_modules/bun-types/serve.d.ts | 902c11d8c36e16a0e7db09db0c2112731055595800977c9370042cdf646a0e7b |
| web/node_modules/next/dist/bin/next | 794b7e825ae1cc1a7e532a380d619e9f27841c3866700d60ec008e50a0e0c152 |
| web/node_modules/next/dist/docs/01-app/02-guides/environment-variables.md | 089542c335bc9da8799e86a1696a3941a3b46d0cbedc01ebd234c3a1a2c587c2 |
| web/node_modules/next/dist/compiled/@next/font/dist/google/loader.js | 45e38a6da7efde1a8f53c29619af2eb8f202d352119dbc91c7714db07db385f4 |
