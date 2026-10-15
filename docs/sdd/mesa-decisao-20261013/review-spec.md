# Revisão independente de Spec: candidato final de 37 arquivos

Resultado: **nenhum achado aberto de Spec** nos oito critérios congelados, dentro do escopo delimitado abaixo. Não constitui aprovação humana, autorização financeira, certificação de operação live ou revisão de Standards. O revisor não implementou nenhum dos arquivos candidatos.

Revisor: conversa `01a13638-0d16-7093-a1bb-99c7b07aa8a3`, agente `/root/review_spec`. Coordenador: `01a135ff-362e-7cf0-ac4f-ef678d322188`. Candidato lido: `review-candidate/`. Execução própria: `review-spec-workspace/final-candidate/`, cópia isolada com dependências existentes. Nenhum arquivo do candidato, baseline, principal ou SPEC foi editado. Não houve instalação, chamada real de provedor/modelo, autenticação, carteira real, assinatura, ordem, publicação ou restart de servidor do usuário pelo revisor.

## Achados e fechamento

Não há achados acionáveis abertos. Os três achados da primeira revisão foram resolvidos:

1. **Cancelamento próprio e precoce**: `web/src/components/Desk/Dock/PortfolioConsultation.tsx:46` cria UUID antes do POST; linhas 34 e 50 usam a mesma identidade para cancelar/enviar, sem observar status global. `src/inonu/ask.ts:551` usa identidade própria e tombstone limitado para DELETE anterior ao POST. SPEC PORT-2, linha 13: "usa o ciclo existente de single-flight, cooldown, cancelamento, teto e ledger". A reprodução independente passou, inclusive ausência de cancelamento/status global; testes do backend cobrem idempotência, posse, cancelamento antecipado e limites.
2. **Rótulos reais da carteira**: `web/src/lib/inonu/portfolio.ts:40` normaliza rótulo; linha 64 preserva contrato e saldo. SPEC PORT-1, linha 12: "consulta manual aceita composição mínima [...] saldos por identidade de ativo/rede". Os quatro casos independentes USDC.E, USDC nativo, USDC_Bridged e USDC.e passam no contrato frontend/backend sem endereço da carteira.
3. **Teste de sigilo atualizado**: `src/settings/http.test.ts:147` exige `last4: null` e origem local; linha 148 rejeita divulgação do segredo. SPEC KEY-1, linha 11: "Somente origem e presença aparecem no status". Suíte dirigida passou nessa expectativa.

A falha de pureza da integração concorrente não foi atribuída ao delta original desta entrega. A seam aditiva `src/outcomes/live-costs.ts` separa constantes de runtime do grafo do laboratório; `wire.ts:14` importa essa seam. O teste de compatibilidade preserva os valores históricos. Os oito gates existentes de pureza passaram na cópia independente. O arquivo wire não existia no baseline inicial; sua continuidade concorrente não pode ser provada por um diff completo contra HEAD, e o manifesto identifica expressamente essa propriedade.

As duas divergências inicialmente observadas entre manifesto e candidato, em wire.ts e decision-log.test.ts, foram fechadas pela sincronização de adições concorrentes e seus dois arquivos de suporte, registrada em concurrent-sync.json. O revisor conferiu hashes e repetiu os testes afetados, sem editar produção. O encaminhamento das opções e cancelRequest permanece verificado após a sincronização. A revisão anterior foi preservada em review-spec-final-v36.md.

## Cobertura da aceitação imutável

| Critério | Resultado e evidência | Limite de qualificação |
| --- | --- | --- |
| UI-1, SPEC:9 | Atendido. MesaView/CSS remove perspectiva e mantém PriceChart montado. O controle nomeado de ampliar/restaurar também está em MesaView.tsx:477 no mobile. PriceChart.module.css:421 acrescenta somente o popover móvel limitado. Browser compilado em 1440x900 e 390x844 exercita ativo, 5m, Linha, primeira e última camada MACD, ampliar/restaurar e os 16 estados preservados. Painel desktop 1122x488 para 1408x688; mobile 366x568 para 366x618 e restaura. MACD móvel clicado sem force, centro alcançável por elementFromPoint; checkbox x45/y741, 13x13, painel x12/y208, 366x568. Foco sólido 2px, sem overflow horizontal, texto proibido, blink/pulse ou erros JS. | Browser pelo coordenador no servidor próprio 3017; fontes, script, JSON e capturas inspecionados independentemente. Medida mobile antiga 366x716 era a seção completa com ações, não o painel. Não é evidência financeira. |
| UI-2, SPEC:10 | Atendido. UI diferencia leitura parcial/rede/idade/validade, cotação e execução; nenhum consentimento concede autorização de ordem. O fixture de browser registra zero POST em conexão/refresh e botão desabilitado antes de consentir. As suítes de preparação/freshness passam. | Carteira sintética EIP-1193 e HTTP interceptado. Operação real e autenticação não exercitadas. |
| KEY-1, SPEC:11 | Atendido. Resolver fixo cobre TYPESAFE_AI_API_KEY e TYPESAFE_API_KEY, processo e Windows User/Machine; configuração local/cofre prevalece. Testes injetados verificam cache, ausência/erro, precedência e fallback após limpeza local. Status Jev expõe presença/origem com sufixo null; UI separa detecção de autenticação e informa cache Windows de até 60s. | Testes de descoberta usam leitores injetados; esta revisão não validou uma credencial real nem carregamento em sessões já abertas. |
| PORT-1, SPEC:12 | Atendido. Esquema fechado, 2 a 6 ativos, rede/contrato como identidade, saldo textual até 40 caracteres, observação de até 60s, cobertura parcial e perfil conservador sem alavancagem. Patrimônio/PnL e valores desconhecidos permanecem null. Carteira vazia descreve somente o conjunto observado e candidato em foco limitado. Normalização real frontend/backend verificada independentemente. | Monad/X Layer e lista configurada parcial, sem patrimônio integral, custo de aquisição ou reconciliação DeFi. |
| PORT-2, SPEC:13 | Atendido. Modo carteira usa asker existente, single-flight/cooldown/caps/ledger e cancelamento próprio. `jev-model.ts:104` faz uma avaliação única com perguntas por ativo; valida identidade/ação, recusa venda sem posição, nunca decide direção por score ou presume compra/venda. Fonte informa origem/idade/lacunas e preserva campos não medidos como desconhecidos. Wrapper concorrente encaminha opções e cancelRequest, testado. | Todas as escolhas/modelo desta revisão são doubles. Não há avaliação de retorno, confiança, tamanho ou alavancagem. |
| PORT-3, SPEC:14 | Atendido. Plano por ativo apresenta ação, origem, idade, risco/lacunas, cobertura, perfil, modelo e custo conhecido/desconhecido. Consentimento informa redes/contratos/saldos e possível custo. Fixture prova payload sem endereço, POST manual, DELETE com UUID próprio, expiração removendo plano/consentimento e troca de conta invalidando sessão. Fonte usa token de sessão para conta/rede e geração/freshness para descartar resultados. | Troca de conta e vencimento exercitados no browser; rede coberta pela mesma invalidação de sessão e testes de freshness, sem troca real de rede. |
| SYS-1, SPEC:15 | Atendido no escopo revisado. Comparação limitada aos 37 caminhos do manifesto contra baseline sujo exato. Contrato trader/Kuru/Monad a cada 300ms não alterado pelo delta. Collector não ganha envio automático da carteira. Integrações concorrentes não foram removidas; compatibilidade da tabela de custos e pureza são verificadas. | Sem medição live de cadência, transações ou sessões em execução. Continuidade de trabalho concorrente fora do baseline inicial depende da proveniência explicitada no manifesto/coordenador. |
| EVID-1, SPEC:16 | Atendido. REPORT.md:9 a 24 compara TradingView, Nansen, Token Metrics e OKX por fontes primárias e código local; separa adaptadores de condições live. Oxa Visuality permanece não identificado; cobertura OnchainOS/OKX Wallet e execução não qualificada são explícitas. REPORT.md:38 a 40 nega inferência de lucro/ML e registra avaliação posterior necessária. REPORT e verification finais coincidem entre principal, candidato e snapshots inspecionados. | Relatório, links e proveniência inspecionados, sem reexecutar pesquisa externa ou certificar concorrentes. Descrições comerciais não demonstram retorno. |

## Execuções próprias e evidência do coordenador

Todas as execuções próprias usam Bun 1.3.14 `--no-env-file`, dependências existentes e RTK/Headroom com métricas próprias. Saídas de Bun permanecem integrais; não foram transformadas em certificação por resumos.

| Execução independente | Resultado | Saída em `review-spec-workspace/final-candidate/` |
| --- | --- | --- |
| Backend, 10 suítes afetadas | 249 pass, 1 fail, 1643 asserts. Um teste de integração handlers atingiu o timeout padrão de 5s. | `evidence/backend.log` |
| Reexecução completa de handlers, timeout 30s | 30 pass, 0 fail, 169 asserts. Fecha o timeout sem alterar produção ou expectativa. | `evidence/handlers-rerun.log` |
| Web, 5 suítes de settings/client/preparação/freshness | 51 pass, 0 fail, 233 asserts. | `evidence/web.log` |
| Contrato real de rótulos, reprodução adicional | 4 pass, 0 fail, 20 asserts. | `review-contract.test.ts`, `evidence/review-contract.log` |
| Callback real do componente, UUID antes do POST | 1 pass, 0 fail, 6 asserts. Hooks/client simulados, não lifecycle/browser completo. | `web/review-cancel.test.tsx`, `evidence/review-cancel.log` |
| Seam live-costs, wire e oito gates de pureza, candidato de 36 arquivos | 20 pass, 0 fail, 62 asserts; exit 0 preservado. | evidence/purity-final.log |
| Regressão móvel: layout, mesa e painéis | 89 pass, 0 fail, 636 asserts, três arquivos, exit 0. | evidence/mobile-regression.log |
| Após sincronização concorrente: wire, decision-log, live-costs e pureza | 41 pass, 0 fail, 131 asserts, quatro arquivos, exit 0. Oito gates verdes. | evidence/concurrent-sync-qualified.log |

Evidência fornecida e lida do coordenador: final-backend-tests.log 490/0, 2493 asserts, 27 arquivos; final-web-mobile.log 2589/0, 47231 asserts, 177 arquivos; final-concurrent-tests.log 41/0; final-build-mobile.log build Next/TypeScript e oito páginas estáticas concluídos. verification.md informa exit 0 para typecheck backend, novamente após sincronização concorrente, e web. Logs vazios não são, isoladamente, prova independente. Nenhum desses comandos é apresentado como executado por este revisor. Totais se sobrepõem e não são somados como testes únicos.

verify-chart-ui.mjs:30 a 40 modifica MACD sem force e verifica geometria/elementFromPoint; linhas 46 a 60 comprovam ampliação/restauração e seleção/intervalo/estilo/16 estados preservados. Script verifica foco, texto, motion, overflow e erros. Browser do coordenador usa frontend compilado em servidor próprio e feed público de preços; carteira/modelo usam doubles. Node foi usado somente para Playwright após falha de inicialização do Chrome com Bun, sem alterar comandos Bun da aplicação.

A primeira execução concorrente passou 33 testes, mas apontou erroneamente src/purity-bundle.test.ts, inexistente e ignorado pelo runner. Não certifica pureza. A execução qualificada acima usou web/src/lib/purity-bundle.test.ts; ambos os logs foram preservados. Uma tentativa de copiar documentos para um diretório inexistente na cópia não foi usada como prova; snapshots exclusivos em evidence e hashes qualificados conferem com o candidato final.

Histórico preservado: primeiro build da cópia falhou por isolamento incompleto de src/dependências; execução qualificada corrigiu a cópia. `final-web-tests.log` anterior teve 2578/1 pela pureza concorrente, resolvida pela reexecução integral final e confirmação própria. O typecheck independente antigo expirou sem diagnóstico após 120s; não reivindico sucesso próprio de typecheck. Achados antigos e reproduções vermelhas ficam em `review-spec.md` e na cópia anterior, não são sobrescritos.

## Integridade e proveniência

37/37 hashes do candidato e da cópia coincidem com o manifesto; baseline declarado, inclusive ausência, confere. Sete arquivos auxiliares coincidem entre candidato e cópia. Snapshot do CSS anterior confere: 916670a862909d12061b0199eb3b57807fda821a04d95ff15b01d8ba9b07976b. O delta acrescenta apenas o popover móvel. A sincronização concorrente copiou wire, teste decision-log e dependências decision-log/judge para o candidato e a cópia sem editar MAIN. A lógica concorrente InsightBox/judge tem proveniência de suporte, sem nova alegação de ML avaliado.

SHA256 principais:

- SPEC: d7ee2282f6178cee183dea745698f3fa86ff27e49b55f24fcd115fd6088f8298.
- Manifesto final, 37 caminhos: e95cf6f907d9fad9184de72f396e5f605f9a7d2c0d1de8ec477a5ea76e300ecb.
- MesaView.tsx: 526b69a8bf88e6329189a3eba396f3ebaab0cf2d71cf3e289e58d87008a53748.
- MesaView.module.css: 5e735abb8fbdab8e936ccb5350df01ec5a5e434adf68d554b09854128b056098.
- PriceChart.module.css: 725b33a9db9f18cbd561f348dbb85372c29c72e3736efde919f85d2171f41035.
- Wire final: 0bb481ad06a93d60486bb6d2d5321413fb08442649b87b36fa56f1b71a866459.
- Wrapper concorrente: 316f923a065db751660d225d824e485c7b8e5a48b7063d11941b49dd501411b0.
- Judge concorrente de suporte: 5d5a9fb8e5b85143e463eac9d7998cbcecaeab28c59d84927d542f69770987c4.
- Live-costs: fe1af000bde21925168fa01e19a2231bbcaaa3f69ae471b81fa7f0645d68f36b.
- REPORT final: defd40a15577f67e853654dec1c660f5f481bb7ca71c0128ce7528a46c540779.
- verification final, antes de acrescentar links deste parecer: 77ed3bb1bd2e11b97001362d07a5e3851d8c8d31af217b8713a07c0935791b02.
- Ledger concurrent-sync: 5c05a0fcb48eeee935ddf034a6643458996eeefb551eb6b2d6d71319b5611349.
- Prova própria completa: evidence/hash-verification-mobile-release-qualified.json, 5e7b24c033deced9106a6da3c9a5d6d1cac00ac22d147e63ed793d2e84b3733b.
- Log móvel próprio: dba486f8c66283a4b54664d5cdb2ba823a51c06acd784655a1ae2fc4ad2b381f.
- Log concorrente/pureza próprio: 2a45ed4f17ddb71be0c2e8ac778ffef89562385115fdc2846645ac59021a9dc5.
- JSON chart-ui final: 34dfacc7cb59063288afc757f7ec6a935d4e7159879fc19794c23820667b33c9.
- JSON visual: b00414004fe3a0595cf2fbcb0cfafc8b297cbfd1e54428220b8e3b98eb9b6f12.
- JSON carteira: 3e861a262c9f34e7313f34afd6de81a5dcdd8841e3557ee61c0ce98ed4732e57.
- Web integral móvel do coordenador: ef9251fbf47dacde56a9d99b3d0ecb7657b9e91b4d477f58b4873a5cfeb5f990.
- Build móvel: c883d2a6995b0668499238535752df0120fb8a960a654a802a2c537178551c39.

## Auditoria independente da direção autorizada

A direção observada permanece compatível com o pedido: melhorar hierarquia visual e usabilidade, analisar fronteiras reais de integrações/carteira, descobrir presença da chave Windows e preparar decisões consultivas por ativo. A entrega local reduz dispersão, amplia o gráfico e permite consulta mínima manual com lacunas visíveis. O relatório distingue presença de código, teste com doubles e integração live qualificada.

Os oito critérios congelados não mudaram; gates determinísticos e hooks permanecem locais. Jev é consultivo/delegado e não fornece aprovação humana, autorização financeira ou evidência live. O revisor não consultou modelo, copiou estado privado para repositório, alterou objetivos, fez commit/staging/push, publicou, pagou, assinou, ordenou ou reiniciou aplicativos. Fontes e artefatos observados não introduzem esses efeitos no fluxo novo; isto não é auditoria global de todos os processos do computador.

O aceite é dos oito critérios desta etapa. Não certifica maximização de lucro, melhores ativos de todo mercado, crescimento de capital, patrimônio completo, autenticação Jev real, execução/rebalanceamento, alavancagem ou modelo de ML treinado com ganho fora da amostra. Não comprova ativação em sessões já abertas nem cadência live de 300ms. A dependência prioritária registrada é qualificar leitura real e acessos OnchainOS pelo contrato canônico de carteira, sem ordens nem envio automático ao modelo; avaliação financeira/ML exige evidência temporal e custos reais separada.
