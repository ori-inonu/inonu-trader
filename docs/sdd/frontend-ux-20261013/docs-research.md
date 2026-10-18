# Auditoria documental do front-end: contratos e lacunas

Data: 2026-10-13. Pesquisador: `/root/docs_contracts`. Conversa própria: `01a13604-bdee-7d61-b679-34420cc4244f`; sessão: `01a135ff-9686-7e92-b4cb-b23db7525fac`. Workspace: `C:/Users/gabri/jev-trader`. Baseline observado: HEAD `00a593bcabe25dbb6d83795268533551098f645b`, com alterações preexistentes em produto e docs. Contexto próprio do harness retornou revisão 0, pesquisa/idle. Este relatório é somente leitura do produto e não certifica a especificação que o integrador produzirá.

## Cobertura e limites

- Inventário completo de filesystem recebido do integrador: 1091 arquivos não ocultos em `docs`, incluindo 477 Markdown, registrado em `C:/Users/gabri/.codex/tmp/ui-audit-01a135ff/plan/inventory.json`. Esse inventário prova existência e metadados, não leitura semântica integral.
- `catalog.json`, `document-status.json`, `currentness.md`, `topic-map.md` e os conceitos serviram como navegação e classificação de tópicos/estado. Seus totais são snapshots mais antigos e não substituem o inventário atual. O catálogo inclui artefatos de evidência históricos, imagens, JSON e logs, cuja existência não certifica o candidato atual.
- Leitura semântica integral dos contratos: `AGENTS.md`; `inonu-desktop-v1/{SPEC,TASKS,info-diet,OWNERSHIP,rastreador,wallet}.md`; `grafico-jev/SPEC.md`; `config-onchain-smartmoney/SPEC.md`; `carteira-evidencia/{tasks,requirements}.md`; `MESA-DE-OPERACOES.md`; `MESA-TOPBAR-SPEC.md`; `UI-EXECUTION-TRUTH-SPEC.md`; `INONU-DESIGN-SPEC.md`; `CENTRAL-JEV-{ACCEPTANCE,CONCURRENT-UI-SPEC,EXECUTION-COPY-SPEC,MOBILE-FIX-SPEC,LEDGER-INTEGRATION-SPEC}.md`; `REPORTS-SERVER.md`; `mobile-decision-report/SPEC.md`; `currentness.md`; `topic-map.md`; conceitos `interface-e-central.md` e `relatorios-e-evidencias.md`.
- `carteira-evidencia/design.md` foi lido seletivamente: inventário e colisão (1-180, com truncamento em trecho intermediário), contrato e estados (210-390, com truncamento em tipos ilustrativos), alternativas/bloqueios/verificação (390-410). Não alego leitura integral desse arquivo. Os demais conceitos foram consultados por tópicos/estado, não lidos semanticamente por inteiro.
- Não houve testes, build, inspeção visual própria, provedor/modelo/wallet/rede de mercado, ordens, assinatura, edição de configuração ou produto. Fontes de testes/capturas antigas só sustentam o baseline que declaram. A inspeção pública e a de código atual são responsabilidades independentes do integrador/outros pesquisadores.
- Não houve envio de código, docs privados ou estado de carteira ao Jev. Este recorte determinístico não exigiu escolha técnica nova. Conflitos são entregues como conflitos, sem inferir uma autorização de mudar critérios.

## Contratos imutáveis para a próxima especificação

| ID de auditoria | Requisito observável preservado | Fonte exata |
| --- | --- | --- |
| C-CORE | A mensagem central do demo continua sendo Jev decidindo buy/sell a partir do feed, trades reais de carteira real, ordens Kuru/Monad em cada bloco de 300 ms e dashboard live. Nunca decidir a cada N blocos. Não confundir esse objetivo com prova já obtida. | `AGENTS.md:113`, `AGENTS.md:119`, `AGENTS.md:121`, `AGENTS.md:125` |
| C-TRUTH | Feed live, modo declarado e execução comprovada são estados distintos. Cadência de 300 ms depende de medição real, nunca valor inventado. Distinguir simulated, pending, placed, reverted, lost; sem promessas incondicionais de execução no estado desconhecido. | `UI-EXECUTION-TRUTH-SPEC.md:5`, `:9`, `:11`, `:15`; `INONU-DESIGN-SPEC.md:66`, `:74`, `:83`; `CENTRAL-JEV-EXECUTION-COPY-SPEC.md:7` |
| C-SCOPE | Desktop Inonu/OKX é consultivo e sob demanda; não altera escopo do executor Kuru. Carteira prepara leitura/ticket, envio desligado. `advisoryOnly=true`, `executionEnabled=false`. | `inonu-desktop-v1/SPEC.md:66`, `:67`, `:266`, `:291`, `:293`, `:294` |
| C-MODEL | Zero modelo em background; clique explícito gera no máximo uma chamada, single-flight/cooldown/budget. Brief até 2 KB, hash, null com motivo. Buy/sell/hold fechado pertence ao modelo. Accept só preenche token/carteira ou journal, nunca ordem. Uso/custo desconhecido fica null. | `inonu-desktop-v1/SPEC.md:256`, `:258`, `:259`, `:260`, `:261`, `:269`; `:382`, `:388` |
| C-UI | Sem middle dots, em/en dashes, blinking/pulsing. Conteúdo humano curto, detalhe em gaveta, identidade de requisito em painel. Cinco abas e foco/resize responsivos permanecem critérios, com conflitos pontuais preservados abaixo. | `AGENTS.md:125`; `inonu-desktop-v1/info-diet.md:7`, `:16`, `:50`; `SPEC.md:187`, `:300`, `:302` |
| C-SOURCE | Mostrar fonte, idade, orçamento e por que indisponível. Null/sentimento ausente não é erro. Envelope inválido/403/origem errada gera estado local acionável de backend indisponível. Nenhum dado fixture/synthetic/stale/unavailable vira live. | `inonu-desktop-v1/SPEC.md:174`, `:175`, `:184`, `:210`, `:211`; `config-onchain-smartmoney/SPEC.md:46`, `:91` |
| C-CHART | Gráfico é hero; seis modos e prefs pós-hidratação; marcador acessível por teclado, com tempo/preço/proveniência. Bps e horizonte são limitados a barras fechadas apropriadas; N menor que 10 não recebe percentual. G1 estabelece área mínima real, sujeita à reconciliação de layout descrita abaixo. | `grafico-jev/SPEC.md:49`, `:51`, `:53`, `:54`; `inonu-desktop-v1/info-diet.md:14` |
| C-ONCHAIN | Redes/capacidades dinâmicas. Unsupported fica desabilitado com motivo. Sinais smart money/zonas são descritivos e neutros, não ordem/adjetivos de compra. Sem ranking ou unidade monetária inventados. | `inonu-desktop-v1/SPEC.md:193`, `:227`, `:239`; `config-onchain-smartmoney/SPEC.md:74`, `:78` |
| C-WALLET | Chave canônica chain+contrato, átomos/decimais exatos, zero preço não substitui unknown. Separar fonte/captura e saldo/histórico/PnL/custo. Filtro/omissão/cobertura parcial não implica zero ou total reconciliado. Net desconhecido se custo desconhecido. | `carteira-evidencia/requirements.md:25`, `:26`, `:28`, `:40`, `:41`, `:42`, `:43`, `:45`, `:55`, `:56`, `:71` |
| C-WALLET-SAFETY | Leitura browser por padrão; sem endereço completo em prompt/relatório/log, sem credenciais, assinatura, envio ou transação no novo módulo. Consentimento de egress e chamadas pagas são dependências próprias, não resolvidas por conselho. | `carteira-evidencia/requirements.md:24`, `:29`, `:30`, `:70`, `:92`; `design.md:350` |
| C-A11Y | Teclado, Esc/outside-click/retorno de foco; atalhos ignoram text input/modifiers. 320/390 px sem overflow, zoom 200% acessível, foco visível e alvo adequado. Não anunciar cada bloco via aria-live. Movimento contínuo decorativo não é requisito. | `MESA-TOPBAR-SPEC.md:20`, `:22`, `:30`; `INONU-DESIGN-SPEC.md:39`, `:62`, `:93`; `CENTRAL-JEV-MOBILE-FIX-SPEC.md:5` |
| C-PERF | Coalescer ticks 1 s/5 s/1 min sem modelo; recalcular materialmente em barras fechadas; filas limitadas e drops medidos. Polling só visível, abort ao mudar ativo, rejeitar retorno stale, TTL/cache/budget por fonte. Não inventar ganho, FPS, latência, custo ou uso. | `inonu-desktop-v1/SPEC.md:247`, `:248`, `:249`, `:250`; `config-onchain-smartmoney/SPEC.md:90`; `grafico-jev/SPEC.md:70`; `SPEC.md:240` |
| C-REPORT | Relatório móvel é HTML offline finito, escapado/allowlist, sem recursos/scripts/forms remotos, sem inferir autoria do hash. Preservar estados pendentes/custo desconhecido/synthetic. Reports-server loopback somente leitura e sem provar feed/trade/lucro. | `mobile-decision-report/SPEC.md:18`, `:19`, `:20`, `:21`, `:22`; `REPORTS-SERVER.md:3`, `:19`, `:42`, `:46` |

## Divergências e limites confirmados documentalmente

1. **Ecossistema: conflito congelado aberto.** SPEC desktop DOC3 diz “Ecossistema” (`SPEC.md:186`) e AC-DOC2 o repete (`:367`). DOC4 pede cinco abas (`:187`), enquanto `info-diet.md:38` manda remover Ecossistema e `:50` enumera Inonu, Radar, Fluxo, Carteira e Mercado bruto. `concepts/interface-e-central.md:63` registra que código segue info-diet sem autorizar reescrever o congelado. É necessário um adendo explícito, mantendo o texto anterior e a razão da substituição. A implementação não deve apagar DOC3 por inferência.
2. **Densidade: intenção e teste não coincidem.** `info-diet.md:16` exige no máximo 12 linhas visíveis por aba; `:70` exige registry test. `concepts/interface-e-central.md:40` registra intenção do teste atual que admite tabelas raw/onchain por altura; `TASKS.md:164` declara cobertura apenas em Fluxo=12/Zonas=6. Não fechar INF-1 com o teste parcial. O plano precisa definir o que conta como linha e se há uma exceção formal ou defeito a corrigir.
3. **Área do gráfico: capturas antigas não fecham G1.** `grafico-jev/SPEC.md:49` exige pelo menos 900x420 a 1600 e 680x320 a 1280. `config-onchain-smartmoney/SPEC.md:112` registra 1270x383 e 1007x233; `:116` registra 1270x404 após mudança. Isso demonstra conflito de aceitação no baseline histórico, não tamanho do render atual. G9 dock <=120 (`grafico:57`) também precisa ser lido com dock 26%/min190/max55% (`config:54`) e desktop/info-diet posteriores.
4. **Execução contínua antiga foi substituída no desktop.** `MESA-DE-OPERACOES.md:50`, gráfico D2/D3 e config incluem produção contínua; desktop `SPEC.md:75` declara a substituição por demanda. Preservar o executor Kuru separado e evitar reintroduzir polling de modelo via uma refatoração visual.
5. **Marca e superfícies são distintas.** Desktop requer “Inonu” nas superfícies principais com proveniência Jev (`SPEC.md:65`, `:265`); `/console` continua legacy no repo e excluído do instalável (`:135`; `info-diet:41`). Não remover automaticamente a mensagem Jev/Kuru do demo público nem aplicar nomes/proibições de um escopo ao outro. Documento Mesa foi classificado needs_review em `currentness.md:37`.
6. **Estado documental envelhecido.** Wallet tasks registram “não iniciadas” em baseline histórico, mesmo com módulos posteriores; `currentness.md:56`, `:63` marca isso obsoleto. Desktop `TASKS.md:177` declara ausência de execução de código contradizendo sua própria lista de execuções; `currentness.md:64` preserva o conflito. Alterações recentes de TASKS e CHECKPOINT não estavam no hash antigo do catálogo. Não tratar checkboxes e totais de teste como estado atual certificado.
7. **Servidor de relatórios vs exportação.** `REPORTS-SERVER.md` documenta um servidor local existente. Mobile SPEC/README antigos descrevem sua ausência; `currentness.md:68` e `concepts/relatorios-e-evidencias.md:46` distinguem obsolescência dessa afirmação da ausência de wiring do exportador. A proposta de integração permanece separada de corrigir a documentação.
8. **Wallet/tracker parcialmente qualificados.** TASKS registra conexão real pendente (`:148`), switch com providers fake (`:149`), QR não implementado/limitação de dependência (`:150`), ticket parcial (`:153`), tracker onchain sem campos em algumas redes (`:141`) e ranking ainda escolher1/hold (`:142`). São limites declarados nessa fonte, a confirmar contra render/código atuais, não permissão para inventar dados ou executar uma carteira.
9. **Testes/capturas de ciclos diferentes.** Desktop `TASKS.md:173` aponta novas mudanças posteriores à revisão, e `:175` distingue capturas mobile de DOM desktop em viewport reduzido. Central `CONCURRENT-UI-SPEC.md:9` e `LEDGER-INTEGRATION-SPEC.md:25` têm limites específicos de baseline/inspeção. Nada disso certifica build, visual, performance ou execução do HEAD dirty atual.
10. **Diferentes “cinco” controles.** `concepts/interface-e-central.md:26` distingue as cinco seções da Mesa (Inonu/Gráfico/Livro/Fluxo/Fontes) das cinco abas do dock. O plano deve evitar fundi-las num único critério ou duplicar informação sob nomes diferentes.

## Melhorias já exigidas, não propostas novas

- Estados acionáveis de backend/origem/credencial/feed; fonte/idade/budget em linguagem humana, com detalhes no Doctor e drawer (`SPEC:174-184`, `Doctor:130`).
- Transferir `FlowGauge`, `DerivativesStrip` e `JevIndicators` para as abas previstas; remover request row redundante; aplicar limites de linhas e zonas (`info-diet:24-35`, `TASKS:89`, `:164`).
- Exibir uso/custo real ou desconhecido, single-flight/budget/cooldown e zero chamadas sem gesto (`SPEC:256-268`, `TASKS:125`).
- Densidade e gráfico hero, teclado/foco, resize/collapse persistido, 320/390 px e zoom200, sem motion contínuo ou animação informacional (`config:54-57`, Topbar, InonuDesign).
- Corrigir totais/cobertura/patrimônio/PnL/custo de carteira só com evidência canônica, mantendo unknown e motivo (`wallet requirements:40-46`, `:55-60`, `:71-74`).
- Coalescing, filas/drop counters, chamadas somente visíveis, cancelamento e resultado stale descartado (`SPEC:247-250`, `config:90`), além de logos/fallback/proxy local (`SPEC:201-203`).
- Capturas reais das quatro dimensões e revisão independente do candidato atual (`SPEC:311-315`, `:398`), sem reutilizar baseline antigo como conclusão atual.

## Propostas novas que podem entrar na avaliação do integrador

Estas propostas são hipóteses, não critérios já aprovados nem conclusão de implementação.

1. **Resumo único de impedimentos no contexto de trabalho.** Reutilizar o source pill/Doctor para apresentar um impedimento prioritário com causa e ação, em vez de múltiplos banners concorrentes. Alternativas reais: manter badges em cada painel; resumo global com drill-down por fonte; resumo por aba. Aceitação futura: usuário encontra a causa sem perder origem/idade e navega por teclado. Nunca transformar unknown em “saudável”.
2. **Vocabulário único para seções e subviews.** Preservar as cinco abas congeladas reconciliadas, explicando contexto e subviews sem duplicar Livro/Fluxo/Fontes entre controles. Alternativas: manter duas navegações com hierarquia explícita; reduzir uma navegação em favor de âncoras; tornar a segunda contextual. Depende do adendo de Ecossistema e evidência visual atual.
3. **Protocolo real de performance e qualidade.** Registrar baseline repetível com cenários quiescente, feed burst, mudança de token, tab background e reconexão; comparar p95 interação, long tasks, memória, fila/drop e chamadas por fonte em pares no mesmo ambiente. Aceitação independente precisa preservar dados, gráfico, foco e comportamento de modelo; números atuais são desconhecidos. Medição e relatório local são o primeiro passo, otimizações só depois de causa demonstrada.

## Dependências e caminhos reservados

- Carteira canônica permanece somente em `docs/sdd/carteira-evidencia/`; citar sem duplicar seus requisitos/tasks como uma segunda fonte canônica (`AGENTS:129`, requirements P8 `:31`).
- `OWNERSHIP.md:25-32`/wallet `design.md:67-75`: Z1 `src/jev-read/**` e reports server; Z2 mobile report; Z3 `src/okx-wallet/real/**`/web wallet; Z4 valuation; Z5 onchain research; Z6 legacy Rail/Decision/Command/evidence; Z7 operator; Z8 Desk/mesa/shared integrations. Donos são históricos/inferidos, não autorização atual. Z8 e alterações compartilhadas pertencem ao integrador.
- Fase2 conserva `src/onchain-read/**` e intel onchain (`desktop OWNERSHIP:35`, `TASKS:28`). Rechecar status do workspace e da cópia `C:/Users/gabri/jev-trader-main` antes de qualquer futura edição. Não assumir que copy/worktree limpa ou dono antigo continua ativo (`OWNERSHIP:61-64`).
- Ports 3000/3001/3030/3031 e processos preexistentes não devem ser reiniciados/encerrados por esta auditoria (`OWNERSHIP:64`).
- Credencial/modelo/região/assinatura/licença/fonte, carteira real desbloqueada, consentimento de egress e USD/tolerância quando não demonstrados são fatos externos desconhecidos/dependências próprias. Jev não inventa nem concede esses fatos (`wallet requirements:92-95`, `desktop TASKS:30`).
- Conexão real e QR têm pendências próprias; ganho financeiro/backtest permanece não medido (`TASKS:116`, `:148-150`). Não instalar dependência ou exercitar carteira para fechar este relatório.

## Aceitação independente sugerida para o candidato documental

1. AUDIT separa inventário, leitura semântica, código, render, histórico e desconhecido, com hashes e baseline explícitos.
2. Requirements mantém cada contrato acima e identifica substituições formais, sem apagar DOC3/AC-DOC2 ou enfraquecer INF-1/G1 por testes atuais.
3. Design distingue demo Kuru, desktop Inonu, console legacy e relatório offline; suas fontes/capacidades/provas nunca se confundem.
4. Tasks inclui um requisito e verificação observável por slice, caminhos exclusivos, dependências reais, cenário/viewport e revisão independente. Medição de performance antecede promessa de ganho.
5. O candidato somente documental não afirma build/pass, live/execution, wallet real, ganho ou WCAG conformidade atuais; ações externas e implementação permanecem fora desta fase.

## Hashes SHA-256 observados ao encerrar a pesquisa

Os arquivos foram rehashados durante esta entrega, não copiados cegamente do catálogo. Estes hashes são do filesystem dirty, não de um commit limpo.

| Fonte | SHA-256 |
| --- | --- |
| `AGENTS.md` | `17c63ea3c3328fbbd5cf0cf3934af0dd6ee142b9e4bf6e3b5b58724277dfdc34` |
| `docs/sdd/inonu-desktop-v1/SPEC.md` | `4bb65a88c573dae423dd165a30500c671216d0e0415e0d8dd1ca940f84604a75` |
| `docs/sdd/inonu-desktop-v1/TASKS.md` | `b870402acdb6841b95f173e0f96d5af250b3ccf71a105d31bbdad854be12f9d6` |
| `docs/sdd/inonu-desktop-v1/info-diet.md` | `698cc07d663c593eb5b161f85b0e62b3166a5282bf2cd99d10e4748c4d2dcb91` |
| `docs/sdd/inonu-desktop-v1/OWNERSHIP.md` | `5c34646e0f7c5812582b5d3483c8dbfa539b1935537d609d49ee63c4e9a81e6b` |
| `docs/sdd/inonu-desktop-v1/rastreador.md` | `22aff83b9975ea5fbae73a75be2b2f90480c651990f387cb6ed496cce9ddf0ec` |
| `docs/sdd/inonu-desktop-v1/wallet.md` | `a22dcdfbbcd247ff9a4c5faf0b022862b1ff3cc7ba604af44742bf4a71910ca8` |
| `docs/sdd/grafico-jev/SPEC.md` | `a222c2d468573a2b8cf236afc7d3bdb096339bb0fc396288ba81a0ae5198b94a` |
| `docs/sdd/config-onchain-smartmoney/SPEC.md` | `b4660c1d16ee297ac4c4d964b5336fd52a0d8606ac71411bd81e7d6ca4890b2b` |
| `docs/sdd/carteira-evidencia/tasks.md` | `3da5a970b7c85549c02ea33e2787bac978afa72732a55cdc0aa4c6d9e6bef0c6` |
| `docs/sdd/carteira-evidencia/requirements.md` | `2274abdb91408fd24715780dde2d20b97997cee913d2168793d274d71314908c` |
| `docs/sdd/carteira-evidencia/design.md` | `bebd9c954d0c3b260655c919125ee12c1034bda6b48ebcfeed5715806d5aa8dc` |
| `docs/MESA-DE-OPERACOES.md` | `a44f3416b2964c6eac422465e5761d89865b8c41d70b9527edfea049169e97e1` |
| `docs/MESA-TOPBAR-SPEC.md` | `8deacbea18bd3deb6568181d85bc54a3a7c58bf80b8c3beee5962c689064e4ab` |
| `docs/UI-EXECUTION-TRUTH-SPEC.md` | `ee461b36576c6c4647fe19c5ce69bba1c20c6e06a3996b7aa55110a7f1fc75e8` |
| `docs/INONU-DESIGN-SPEC.md` | `184d31ac33e0b83734047d9d73f8cf2b7b4c46dafc9cabf9379ba8b8af6016a7` |
| `docs/CENTRAL-JEV-ACCEPTANCE.md` | `20e1558da58ceae78332020f1e4f84277eacdb694748d28b9ea599dc30808054` |
| `docs/CENTRAL-JEV-CONCURRENT-UI-SPEC.md` | `7e2a1e8e8908851364c685c9c934c6b0c910b7b7607c7dfda39cc53790ccb2fb` |
| `docs/CENTRAL-JEV-EXECUTION-COPY-SPEC.md` | `46d65b711a79b89403d6b8267f28a001906b9b0b147ce719c210db936e80e246` |
| `docs/CENTRAL-JEV-MOBILE-FIX-SPEC.md` | `ff6db590c4f6c73fd7b4309014014424e1c1a1ac6eb9a4a1863110c5ce6120fe` |
| `docs/CENTRAL-JEV-LEDGER-INTEGRATION-SPEC.md` | `1f3cacc81e808dba148baf50eae418ee49de7b954efb54b8f254dc31d493664e` |
| `docs/REPORTS-SERVER.md` | `b987c10859b8fa102980abb75102cef5fd33c09c659b7a516126f8d4e3f48760` |
| `docs/mobile-decision-report/SPEC.md` | `385adc07bf8fcd66f5ded0e66826a5ae260a7cf7ae9ee79d650c45729d0557a3` |
| `docs/_meta/currentness.md` | `65ddebba876ece217de7810ccd9ff66a35e4fdb1a2e182717571ab88936b25a4` |
| `docs/_meta/topic-map.md` | `a90f29ed88dbfcc9a0fcdb5de1e12b633829543141764bc28abea710feb3ad6d` |
| `docs/_meta/catalog.json` | `ac72bfa23413505b415d5c34530e3a2f772c2b09e5c96782b24f6358c839ba80` |
| `docs/_meta/document-status.json` | `e446c47f57df4f5ef5c1eeacefddfc0f20b22d3199f3324bf7bcb08e0c7c3205` |
| `docs/concepts/interface-e-central.md` | `4522241cbb13cce544d4f2d4d21128b510b658ffe5367b2c67ba40a1cc5a80bb` |
| `docs/concepts/relatorios-e-evidencias.md` | `b927c809b3b09943cf6462048c2f1704d36f064710d846485ba9641cf9074ac0` |

Próximo passo elegível do integrador: consolidar o candidato documental, explicitar os conflitos de Ecossistema/densidade/geometria e enviar esse candidato e hashes para revisão independente. Este pesquisador não aprova sua própria contribuição como especificação final.
