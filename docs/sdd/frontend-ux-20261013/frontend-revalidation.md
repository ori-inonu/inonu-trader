# Revalidação do frontend na cópia fixa

Captura: 2026-10-13T16:44:33.732Z, segundo source-manifest.json. Verificação de hashes encerrada em 2026-10-13T16:49:29.7488946Z. Pesquisador: /root/frontend_evidence, conversa própria 01a13605-1714-7453-bd4d-6593af0d61a2.

Escopo: delta do relatório frontend-research.md contra C:/Users/gabri/.codex/tmp/ui-audit-01a135ff/review-input/source. Somente leitura dessa cópia, do manifesto e do relatório anterior; nenhuma leitura do produto live, execução de servidor, modelo, feed, carteira, build ou testes. Este arquivo não modifica nem aprova o plano e não certifica a execução das correções.

Manifesto SHA256: 1972172b49fb5c235b74ab4fb31e24b4f8b62b4d5c0acb5d948311e3ce0c016c. Relatório anterior SHA256: ad1cf8cdcca8471aa257d48a389ff5d473040bc6673b0272a62a99a542eebd22. Os 30 arquivos específicos usados nesta revalidação coincidiram com os hashes do manifesto. O manifesto cobre uma cópia sem .env, credenciais, node_modules, runtime backend ou histórico Git; não prova identidade de deployment.

## Delta dos oito achados

| Achado | Estado na cópia fixa | Evidência atual e limite |
| --- | --- | --- |
| F01, P1, AssetPicker Enter | Permanece na fonte | AssetPicker.tsx:242-269 mantém handler no dialog, a exceção para busca onchain em248-251 e seleção de shown/ocShown[highlighted] em260-267. Arquivo byte a byte igual. Aceitação F01-A anterior continua aplicável. |
| F02, P1, onchain somente clique | Mecanismo corrigido na fonte | OnchainBody.tsx:170 adiciona tabIndex=0.175-179 trata Enter/Space, preventDefault e guard locked;174 mantém seleção/desmarcação por clique;171 expõe aria-selected. A afirmação anterior de ausência de teclado está obsoleta. Foco/AT/estado locked e ativação sem consulta ainda devem ser exercitados, não certificados por inspeção. |
| F03, P1, Enter OKX em controles internos | Permanece na fonte | RastreadorView.tsx:172-178 ainda trata teclas do ancestral sem conferir alvo;175 abre selectedId.375 liga esse handler à tabela;381 sort button;397 pin;402-410 checkbox. As mudanças reduziram os números das linhas, mas não corrigiram a propagação. F03-A mantém-se. |
| F04, P1, IDs dos docks | Permanece na fonte | MesaView.tsx:511,521,533 monta três DockPanel com tabs compartilhadas/particionadas. DockPanel.tsx:179/181/210 mantém dock-tab/tab.id e dock-body/current.id sem namespace. Mesa CSS:25 oculta cópia móvel no desktop;131-133 oculta a larga e revela o grupo no mobile. CSS não remove os nós do DOM. F04-A mantém-se; efeito AT/DOM real ainda não executado. |
| F05, P1, cancelamento onchain | Permanece na fonte, escopo preciso | useOnchainResource e useOnchainCandles byte a byte iguais. Candles:149 recebe _signal e150 não o transmite. client.ts:331 FetchLike não declara signal;336-340 passa só method/credentials/headers. AssetPicker também não mudou. Descarte de UI antiga continua diferente de aborto de transporte. Não generalizar a InonuClient: ele passa signal ao POST em181. F05-A mantém-se. |
| F06, P1, operator fora de ordem | Permanece na fonte | operator-center.ts byte a byte igual.88 fetch sem signal;93-94 publica sem generation/version;119-120 disparos periódicos;125 apenas limpa intervalos. Request velho pode terminar por último ou após mudança de origem. Não houve reprodução runtime. F06-A mantém-se. |
| F07, P2, dieta | Permanece na fonte, linhas atualizadas | info-diet.md e registry são byte a byte iguais. MesaView.tsx:458-459 mantém JevIndicators sob strip;494-503 mantém FlowGauge/DerivativesStrip na wing. CSS:55 oculta .jev no desktop, mas não .indicators;60 só oculta indicador vazio;118-125 organiza visibilidade mobile. Em layout normal desktop esses detalhes continuam fora de Radar/Fluxo definidos na matriz. Clipping, densidade percebida e dimensões não podem ser certificados sem render. F07-A mantém-se. |
| F08, P2, Settings concorrente/draft | Permanece na fonte | SettingsView.tsx:117-120 aguarda onSave e depois limpa todo draft;138/141 não usam pending;439-454 não transmite busy do hook. useSettings byte a byte igual. Origem ambiente agora é distinguida em116 e bloqueia Limpar em141, mas não resolve save concorrente nem edição B apagada após save A. F08-A mantém-se. |

Não chamar F02 de bug ainda aberto no plano. O próximo trabalho dessa fatia deve ser a verificação independente da correção já presente, mantendo o critério original. Os sete achados restantes são mecanismos de fonte, sem alegação de reprodução ao vivo. Prioridades e testes do relatório anterior não foram enfraquecidos.

## InonuAsk, no-send e transporte

Não houve baseline SHA256 anterior de InonuAsk/no-send/accept/ticket no relatório frontend-research.md. Portanto, a inspeção atual desses arquivos não permite afirmar quais alterações ocorreram desde aquela captura ou que corrigiram defeitos. Permite somente limitar a descrição do plano à fonte fixa atual.

- InonuAsk.tsx:67 liga Pedir ao onAsk e desabilita enquanto asking;177-182 tem guard state.phase e POST explícito.143-146 informa busy à tela;161-164 lê status a cada30s, não é por si uma chamada de inferência.210-214 consome sharedAskTrigger, cujo histórico de gesto precisa ser preservado. Não certificar prevenção de double click, mount ou ciclo de vida somente pelo disabled/estado React.
- InonuAsk.tsx:224-233 limita Aceitar/Ignorar a acceptOutcome, journal.add, ticket.fill, note e resolve do store. accept.ts:22 e32-38 define enviaOrdem=false para cada família;75-77 só deriva draft aceito;ticket.ts:79-81 guarda draft e notifica listeners localmente. A proposta UI pode preservar essa semântica, sem adicionar assinatura, envio, broadcast ou quantidade automática.
- InonuClient.ts:171 inclui signal em FetchLike e181 passa-o ao fetchImpl do POST. F05 corresponde ao cliente onchain, não a todo transporte da aplicação. Abortar a chamada não prova cancelamento de trabalho do provedor nem custo evitado.
- no-send-scan.test.ts:56-63 delimita roots de entrega Inonu/desktop, wallet local e alguns shells. Linhas1-4 excluem a integração wallet/real mais antiga. O scanner é baseado em nomes/patterns em13-18, filtra comentários em20-26 e exclui tests/fixtures em33. Os asserts de contagem em74/87 não ampliam sua cobertura. Não inclui todo web/src, SettingsView ou client onchain por transitividade de imports.
- O teste no-send não foi executado nesta revalidação. Mesmo um pass futuro seria evidência desses roots/patterns; não certifica ausência global de execução, nem prova os claims públicos Jev/Kuru de wallet/trades reais. Restringir gate no-send ao escopo desktop/consultivo documentado e preservar separadamente a execução real autorizada do trader. Esta revalidação não inspecionou o executor.

Verificação independente ainda necessária: F02 selecionar/desmarcar com Enter/Space, locked, foco visível/AT e zero pedido só pela seleção; F01/F03 ativação dos controles focados; F04 IDs/relacionamentos no DOM real nas quatro larguras; F05/F06 requests retardados e fora de ordem com transporte local controlado; F08 cliente falso controlado com edição B durante save A. Não usar credenciais, mercado financeiro, modelo ou wallet para reproduzir esses eventos. Os cenários/criteria completos continuam no relatório anterior.

## Hipóteses e evidência positiva

H01 e H02 continuam hipóteses sem profiling e sem ganho medido. useDesk, store, controller, PriceChart, draw-chart, useInonuLayer e jev-read são byte a byte iguais. MesaView:123 conserva clock1s e482-488 conserva objeto jev recriado. RastreadorView:484-495 conserva refresh somente visível e cleanup;561 conserva clock5s. Nenhum novo dado nesta revalidação demonstra CPU/frame-time/requisições economizadas. Permanecem os pares reais, gates de qualidade e proibição de reduzir Jev/Kuru a cada N blocos.

PriceChart conserva o hash anterior, incluindo a alternativa HTML, suporte a teclado e cancelamento do RAF já descritos. ResizeObserver não foi revalidado neste delta. Não certificar AT, mobile, ausência global de pontuação/pulse, layout/ganho ou ambiente ativo somente por hash. A camada bodyPlan atual em MesaView:279-294 mantém guard de montagem da cópia visível e deve ser preservada na correção dos IDs.

## Hashes atuais

Entre os arquivos com baseline no relatório anterior, estes cinco mudaram:

- web/src/components/Desk/MesaView.tsx: a2c3e787d1df0ea3f15528d95fe67c004847c974091e7c8c3a89cfa19f7de599 -> 4c3a867546df4897c4fdb3120e578abee98e1cbf85caeeb922a51813758d9972
- web/src/components/Desk/MesaView.module.css: d96183534961a5e6cfdf879e6c9d3425f36a7fef689b15a46bdd31a1783ceb7a -> 55412fc9c7fd6bc555564fb24e51ff717b37f7028142f693ac59d00546ee27ef
- web/src/components/Rastreador/RastreadorView.tsx: 41319d6cb5ebc2c18be1b7e2d1dcd5e7d8f4adae07cf6f6830a2d145b7168a87 -> 71dde57bff4081ad67f594507be83bc6a171ea7a6b9452823d9ffff2a52d80bf
- web/src/components/Rastreador/OnchainBody.tsx: d793533bf8976e39d66ee1ffaac48d3d12cb7d157571c95c063c9dd2cceb9758 -> 486142e2501f5922cfd20c01c52837036ebf1ef63feda72a07d4887051f3f0ee
- web/src/components/Settings/SettingsView.tsx: a33445995716fa5d8fb8c6a5ab7136ef6713cefd018bf90ba656cf4147725276 -> d5135a8fe5074022456ad9c59cf9c6537b2bd1a7ad8f68e47c600b1b76d1b2b5

SHA256 dos arquivos efetivamente comparados ou lidos na cópia fixa:

~~~json
[
  {
    "path": "web/src/components/Desk/MesaView.tsx",
    "sha256": "4c3a867546df4897c4fdb3120e578abee98e1cbf85caeeb922a51813758d9972"
  },
  {
    "path": "web/src/components/Desk/MesaView.module.css",
    "sha256": "55412fc9c7fd6bc555564fb24e51ff717b37f7028142f693ac59d00546ee27ef"
  },
  {
    "path": "web/src/components/Desk/panels/AssetPicker.tsx",
    "sha256": "ac5cb46c44944ead041a26c579c626e13b6201d23e93eab70dccb105237cbe2d"
  },
  {
    "path": "web/src/components/Desk/Dock/DockPanel.tsx",
    "sha256": "e5623744b90d0390185703ffe571a941b43b1652ad518eef180692909b5ae4c5"
  },
  {
    "path": "web/src/components/Rastreador/RastreadorView.tsx",
    "sha256": "71dde57bff4081ad67f594507be83bc6a171ea7a6b9452823d9ffff2a52d80bf"
  },
  {
    "path": "web/src/components/Rastreador/OnchainBody.tsx",
    "sha256": "486142e2501f5922cfd20c01c52837036ebf1ef63feda72a07d4887051f3f0ee"
  },
  {
    "path": "web/src/components/Settings/SettingsView.tsx",
    "sha256": "d5135a8fe5074022456ad9c59cf9c6537b2bd1a7ad8f68e47c600b1b76d1b2b5"
  },
  {
    "path": "web/src/lib/settings/useSettings.ts",
    "sha256": "79532d5816f3b60446a75400268aff7d5dc786e583ccb7bd6550967dce5a218e"
  },
  {
    "path": "web/src/lib/onchain/useOnchainResource.ts",
    "sha256": "2b2ad6ec6b2981000cb0bee964757da99c378c783580f600f40f1ec0fb2a6a15"
  },
  {
    "path": "web/src/lib/onchain/useOnchainCandles.ts",
    "sha256": "69b5a229c2ac26d9d125ef19de4f6b60af2e6772f3678f220419ae1f03f42fba"
  },
  {
    "path": "web/src/lib/onchain/client.ts",
    "sha256": "9d6afb3ef17eb5eba76b11965540b059d62c8543162b84138b457e8a19992846"
  },
  {
    "path": "web/src/lib/operator-center.ts",
    "sha256": "e84b1d476dc526ea2007e4864b5b43517ddb05d03cb0cbfab27fe94d30b5048c"
  },
  {
    "path": "web/src/components/Desk/panels/PriceChart.tsx",
    "sha256": "6711c5ccc816d70d7a024ce03a70f39c6091dca58f0e5ce6ca74283b72fd06b8"
  },
  {
    "path": "web/src/lib/desk/useDesk.ts",
    "sha256": "f46d4c33f96b92241af084b8fa3322b67b2d1f7d8874cada110eebfaa844ec32"
  },
  {
    "path": "web/src/lib/desk/desk-store.ts",
    "sha256": "2d7d5662025588246eeed4dffc2b27f40155126bd2daf9f31e2561e0e80668dc"
  },
  {
    "path": "web/src/lib/desk/desk-controller.ts",
    "sha256": "65fb5eb96ab4e397da5453df9bf27ca04d90d25924dc2c223ddcc0b478accb97"
  },
  {
    "path": "web/src/lib/desk/ui/draw-chart.ts",
    "sha256": "f2f940c9cf629a0091541db2770ad4928dca0683bfe847e548cd744176c09f31"
  },
  {
    "path": "web/src/lib/inonu/useInonuLayer.ts",
    "sha256": "16cbe4ace451032075b36933b3b16600c9fed3141a603215ed26c6b0f8ccc7f1"
  },
  {
    "path": "web/src/lib/jev-read.ts",
    "sha256": "9b13e02181ad4ae17a6c2d3b707950df1f8943732732c65988a9e600274a1d98"
  },
  {
    "path": "web/src/lib/mesa/panels-registry.ts",
    "sha256": "387c01ba447457853d7d2d68e99412abc698f4d393332a9e352a57e05bc078bc"
  },
  {
    "path": "docs/sdd/inonu-desktop-v1/info-diet.md",
    "sha256": "698cc07d663c593eb5b161f85b0e62b3166a5282bf2cd99d10e4748c4d2dcb91"
  },
  {
    "path": "web/src/app/page.tsx",
    "sha256": "cf37e8f808f725293998991e352becdae9253daf176c0e0f580ac99fd96d5a48"
  },
  {
    "path": "web/src/app/console/page.tsx",
    "sha256": "a6405bf91a9d9313a4c2e7565ae198fb8f0db9ba3d08f60b3a261ce2396815b4"
  },
  {
    "path": "web/src/components/Desk/InonuAsk.tsx",
    "sha256": "9eafb1ffd6abd2dec002a1af8b59f96f5d301fee06801d087a3a32a041f65bae"
  },
  {
    "path": "web/src/components/Desk/InonuAsk.module.css",
    "sha256": "a0f742dd3c71e0e16c0d29522aad753e297f156c63a14ec53fd5aa287720d18e"
  },
  {
    "path": "web/src/lib/no-send-scan.test.ts",
    "sha256": "d50caa0b3cf983550f261efcb96705f00bcb32ed6d5dc0259d5134423ff0b8c6"
  },
  {
    "path": "web/src/lib/inonu/accept.ts",
    "sha256": "b334dcb1a00b467c108b396d8dbf7fca8631b488a3f7da7c0e878e69615503ae"
  },
  {
    "path": "web/src/lib/wallet/ticket.ts",
    "sha256": "1f613266ba478e4d076dde7620f9b0a1c87226964d6633862feadd3ad7e6944e"
  },
  {
    "path": "web/src/lib/inonu/client.ts",
    "sha256": "0a6ac0798eb84cf5f06854c608e54165e721ca6cb20bf0ca7d431f4fa50ad90b"
  },
  {
    "path": "docs/sdd/inonu-desktop-v1/SPEC.md",
    "sha256": "4bb65a88c573dae423dd165a30500c671216d0e0415e0d8dd1ca940f84604a75"
  }
]
~~~

A captura é fixa para esta auditoria. Antes de implementar no worktree, o integrador deve conferir hashes/ownership novamente; este delta não concede autorização nem justifica sobrescrever alterações concorrentes.

