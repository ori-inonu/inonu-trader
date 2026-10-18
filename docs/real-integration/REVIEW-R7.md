# Parecer independente — candidato r7

Data: 2026-10-11. Revisor: /root/candidate_review, conversa nativa 01a12c1f-4fd5-7a61-93e6-15def4a2ea29, sessão raiz 01a12b5f-ca2a-7ff1-a131-07933705d3e8.

**Decisão: r7 não aprovada no recorte local enquanto R6 permanecer aberto. R1–R5 corrigidos. G17 e a meta G01–G17 não aprovados.** Há um novo defeito material reproduzido na publicação e apresentação de dados após invalidação do relógio. Mesmo resolvendo esse defeito, as provas reais de Web3, carteira, inferência do aplicativo e proposta semântica ainda são necessárias para a aceitação integral.

## Contrato, independência e integridade

Revisão somente de leitura sobre a cópia isolada C:/Users/gabri/.codex/tmp/okx-real-review-r7-01a12b5f. O revisor não implementou o candidato e não alterou suas fontes, critérios, dependências ou a worktree de integração. A cópia isolada cumpre a separação exigida para revisão; não é evidência de sandbox somente de leitura do sistema operacional. Configuração Sol/xhigh recebida no contrato não estabelece observação independente do modelo, tier ou sandbox efetivo.

Reproduções e resultados privados estão exclusivamente em C:/Users/gabri/.codex/tmp/okx-real-review-r7-repro-01a12b5f. Nenhum estado privado de outra conversa foi importado. Nenhum segredo, arquivo de ambiente, request autenticado, consulta RPC real, carteira real, gesto de consentimento real, consumo pago, assinatura, transmissão financeira, staging, commit, push, deploy, meta nativa ou memória de projeto foi usado ou criado pelo revisor.

Foram lidos o harness codex-desktop-harness, PLAYBOOK SDD, critérios imutáveis, SPEC, matriz, guia, checkpoint, inventário de especificações, recibos de verificação, limitações de evidência visual e o primeiro parecer. Advice Jev é consultivo; abstenções e recomendações automáticas não substituem gates, fatos externos, autorização ou aprovação independente.

| Item fixo | SHA-256 / identidade | Resultado |
| --- | --- | --- |
| REVIEW-MANIFEST.json | bbd8f4f7b1f66807ddd847f7d2767d04cb103cc0c6e9be27e67b5cca35eef352 | 660 arquivos conferidos antes e depois; zero divergências |
| INSTRUCAO-DO-OBJETIVO.md | cfa90cac735e9a838a0c4bc593276c83757905e7c5fedcd2414e499b1dad9e08 | Imutável e hash confirmado |
| EXECUTION-SPEC.md | eeb6ab8d9e4adf990600a8806bceaeb7774a5eefe1ae3bbe7daba70e590290ef | Imutável e hash confirmado |
| HEAD informado no manifesto | 055a637f27f28cbf357cfb492534f7ed33d9b68f | Baseline declarado; a revisão usa a árvore de arquivos congelada |
| Primeiro parecer | C:/Users/gabri/.codex/tmp/okx-real-review-report-01a12b5f.md | Consultado para verificar R1–R5 |

O resultado da conferência posterior está em hashes-after.json no scratch privado. As junctions node_modules e web/node_modules foram provisionadas pelo integrador fora dos 660 arquivos, após a primeira tentativa de checks não resolver dependências. Foram usadas somente para leitura e execução, sem instalação ou alteração. O checkout original e as 53 mudanças preexistentes do baseline concorrente permaneceram fora da responsabilidade de escrita do revisor.

## Novo achado material

### R6 — P2 — Dados invalidados pelo relógio continuam publicados e a interface os apresenta como prontos

**Local:** src/real/runtime.ts:42. Consumidores: web/src/components/RealPipeline/RealPipelineView.tsx:28, :67, :78, :92 e :107; relógio da interface em web/src/components/RealPipeline/RealPipeline.tsx:32.

**Condição:** depois de um ciclo, o relógio local recua em relação ao tempo monotônico, ou o gate de frescor detecta outra invalidação. fresh() grava invalid=true de modo permanente para a correlação. visible() bloqueia a decisão, mas retorna o mesmo core, envelopes, dados e derivações. A interface determina prontidão apenas por status=ready e expiresAtMs maior que Date.now(), sem consumir o resultado desse gate nem manter sua própria proteção contra deriva/salto do relógio.

**Comportamento observado:** uma amostra offline com 100 ms de validade foi consumida após avanço monotônico de 1.000 ms e recuo de 60.000 ms no relógio de parede. O backend acrescentou corretamente “Dados essenciais incompletos ou expirados” à decisão blocked. Contudo, preços, velas e cotação continuaram publicados com status ready. A renderização real de RealPipelineView exibiu os preços, quatro badges “Pronto” e TTL de 61 s. O TTL aparente passou de 100 ms para 60.100 ms. O mesmo predicado de parede controla inventário, avaliação derivada e fontes opcionais; a leitura RPC também permanece no core retornado.

**Impacto:** o operador e outros consumidores recebem uma observação que o próprio runtime já considera inválida, com indicação visual positiva de validade. Viola a verificação de frescor no consumo exigida por G07/G13. A decisão de inferência permaneceu bloqueada; não foi demonstrado bypass de execução, gasto ou transmissão financeira. P2 representa a incorreção operacional e de confiança da publicação, não um bypass financeiro comprovado.

**Reprodução mínima executada, sem rede:**

1. Executar Bun com --no-env-file sobre clock-publication-repro.ts no scratch privado. O testcase importa o runtime fixo r7, injeta relógios e proofFixture, abre somente um journal de scratch e não fornece função de inferência. Os valores de configuração são marcadores sintéticos explícitos, não credenciais reais.
2. Gerar um ciclo sintético, avançar o monotônico em 1 s, recuar o relógio de parede em 60 s e ler runtime.latest().
3. Executar render-repro.ts no mesmo scratch. Ele renderiza RealPipelineView da r7 usando o ciclo efetivamente retornado, sem browser effects ou requests.
4. Conferir clock-publication-evidence.json e clock-render-evidence.json: backendDetectedInvalidClock=true, pricesRendered=true, readyBadgeCount=4, remaining61seconds=true.

| Evidência privada | SHA-256 |
| --- | --- |
| clock-publication-evidence.json | 0735e0dda6534756f3076e71401f1cf594549ca10e1576458470c26c330411d5 |
| clock-render-evidence.json | f77549c2a301689a0c1586dde1409669adf46441932765ccdde492816a9fed17 |

Essas evidências são sintéticas e provam somente o defeito de controle e renderização; não certificam integração OKX, carteira ou inferência real. Os dois comandos terminaram com exit 0 e networkCalls=0.

**Correção necessária antes da aprovação local:** invalidar explicitamente a publicação e o consumo de core, envelopes e derivações quando o gate de relógio/frescor falhar; impedir que dados já invalidados recuperem status pronto somente porque o relógio de parede recuou. Cobrir o resultado entregue por latest()/histórico e o resultado efetivamente renderizado. Manter timestamps originais como proveniência e os limites congelados; não aumentar tolerância de futuro ou TTL. Atualizar a matriz G07/G13 para refletir R6 até sua correção ser revisada em uma nova árvore fixa.

O integrador confirmou R6 como correção obrigatória e informou que preparará r8 com regressões e guardas temporais. Este parecer não avalia essa implementação futura nem usa uma captura servida da r7 como prova da correção.

## Verificação dos achados anteriores

| Achado | Conclusão r7 | Evidência de correção |
| --- | --- | --- |
| R1 / P1 — avaliação USD sem unidade qualificada | Corrigido | core.ts:69–76 mantém decimals, valueUsd, subtotal e valor completo desconhecidos. valuation.ts:139–192 deriva separadamente por aritmética exata, exigindo rawBalance, decimals independentes, identidade/revisão/correlação e bloco compatíveis. Divergência, preço ausente ou observação incompleta não viram zero. Derivação unverified não é qualificação financeira. |
| R2 / P1 — patrimônio privado enviado ao Jev | Corrigido | jev.ts:8 constrói estado por allowlist: rede, instante, disponibilidade/frescor das fontes, candidatos vazios, custos desconhecidos e execução false. Não envia endereço, identidade, saldos, quantidades, coverage ou agregados de patrimônio. Regressões verificam exclusão dessas informações. |
| R3 / P2 — inferência permitida com núcleo vazio/incompleto | Corrigido | transport-proof.ts:24 verifica endpoints, métodos, unidades, recibos, correlação, timestamps e completude. Preços/velas vazios, faltantes, omitidos ou sem timestamp válido bloqueiam a inferência antes de reserva/chamada. Casos focados verificam ausência de gasto/reserva nessas condições. R6 é outro defeito: publicação posterior, não liberação da inferência. |
| R4 / P2 — append cria journal impossível de reabrir | Corrigido | journal.ts:7 e :51 usam o mesmo limite de 20.000.000 bytes na inspeção e no preflight de append. O limite é verificado antes de write/history.push. Prefixo, reservas e sequência sobrevivem a reabertura; falha de persistência é fatal para o worker. |
| R5 / P2 — UI promovia ready de fixture/unverified a resposta real | Corrigido | RealEnvelope preserva mode; RealPipelineView.tsx:68–71 exibe “Modo da fonte” e descreve somente “Resposta recebida”. Renderização independente de fixture e unverified confirmou claimsReal=false, showsMode=true e hasModeField=true. |

mode-render-evidence.json, SHA-256 b05a5f8638526c5ef110c0e1fb3f2a6e6329bc60f1b98934f18b4c72c08f7793, registra a reprodução de R5. Os achados anteriores estão fechados apenas para o defeito descrito, não para os critérios externos abrangidos por suas famílias.

## Comportamentos críticos examinados

- Identidade e consentimento: uma store compartilhada atende à carteira; a conexão por gesto não concede consulta. Eventos e troca de revisão invalidam resultados atrasados; grant/revoke são serializados e compensados. O escopo web3-rpc-read-v2 exige consentimento novo para os destinatários RPC, apresentados nominalmente na UI. Não foi observado caminho automático que envie endereço ao Jev. Prova de extensão/carteira real permanece ausente.
- RPC: allowlist somente de leitura, cadeia verificada, bloco fixo para saldo/decimals/código/allowance e hash reconferido ao final. Resposta divergente invalida valores. Inteiros permanecem strings/BigInt; tokens, bytes, duração e aborts são limitados, sem retry financeiro. Dados não qualificados mantêm null e modo unverified. Não ocorreu request RPC real nesta revisão.
- Avaliação: somente raw balances compatíveis com o RPC no mesmo contexto entram no cálculo. Cobertura parcial não é total da carteira; moeda/unidades/preço ausentes continuam desconhecidos. A integração conserva campos originais do provedor. A avaliação não marca execução ou qualificação financeira como verdadeiras.
- Extensões: DeFi GET e leaderboard têm qualificação própria por rede/endpoint e ficam desligados por padrão. Dados opcionais não qualificam o núcleo nem contaminam candidatos Jev. POST de sinais/busca e entitlement não são inventados. Adapters exercitados com seams continuam unverified e exercisedReal=false.
- Mercado público: time/instrument/funding/mark v5 ficam separados do núcleo autenticado v6. Referência de relógio exige HTTPS, Date coerente, RTT ≤2 s, offset limitado a 180 s, validade ≤60 s e estabilidade monotônica; conserva os timestamps originais. Worker e PublicMarket incluem invalidação por relógio no consumo, limpeza de dados em falha e abort/epoch na parada. A correção pública não altera relógio do OS nem valida assinatura v6.
- Runtime, transporte e journal: prova de transporte se vincula a recibos específicos de endpoint/rede/correlação; completude/frescor bloqueiam chamadas dependentes. Reserva durável antecede inferência e permanece consumida após interrupção. Stop/revoke descartam respostas atrasadas. Journal tem lock, checksums, fsync, recuperação de cauda preservada e novo preflight de limite. R6 impede aprovar a publicação final do núcleo.
- Proposta: execução financeira permanece OFF. O framework de semantic-proof não possui fatos reais de deployment/ABI/decoders completos nessa configuração, portanto continua blocked. Encoding/build/preflight, fixture ou simulação remota isolada não são promovidos a elegibilidade financeira.
- UI: custos, moeda, coverage, PnL, capacidades, modo e proveniência desconhecidos são apresentados como desconhecidos. Wallet mismatch é ocultado no render antes de effects. Nenhuma UI revisada concede assinatura/broadcast. O guard temporal de RealPipeline é insuficiente conforme R6; PublicMarket tem proteção própria distinta.

Não surgiram outros achados P1/P2 comprovados no escopo limitado examinado. Isso não equivale a ausência de defeitos fora desse escopo ou a prova de acesso real.

## Verificação executada e recibos conferidos

Checks independentes usaram Bun 1.3.14, --no-env-file, a cópia fixa e a integração local RTK + Headroom. Os comandos, saídas e métricas estão no scratch. A execução da suíte completa/build foi coordenada pelo integrador; o revisor conferiu recibos e hashes, sem repetir os jobs pesados em concorrência.

| Evidência | Resultado observado | Alcance |
| --- | --- | --- |
| Primeira tentativa focada src/real, antes das junctions | 78 pass, 7 fail, 5 errors; módulos ai, ethers e react/jsx-dev-runtime não resolvidos | Falha de ambiente preservada em focused-tests.txt e test-metrics.json; não ocultada ou contada como sucesso |
| src/real após provisionamento das dependências | 162 pass, 0 fail, 1305 assertions, 19 arquivos, 4,21 s | Independente; focused-tests-fixeddeps.txt e test-metrics-fixeddeps.json |
| Web: wallet-store, real-pipeline e render | 16 pass, 0 fail, 78 assertions, 3 arquivos, 468 ms | Independente; web-focused-tests.txt e web-test-metrics.json |
| Reproduções de publicação/render R6 e modo R5 | Ambos comandos exit 0, sem rede; R6 confirmado, R5 corrigido | Independente; testcases/JSON privados citados acima |
| Backend completo | 2101 pass, 2 skip, 0 fail, 884339 assertions, 135 arquivos, 242,77 s na saída Bun | Recibo do integrador hash-conferido; duração do job 243,91 s |
| Frontend completo | 579 pass, 0 fail, 4127 assertions, 42 arquivos, 5,84 s | Recibo do integrador hash-conferido |
| Types backend/web e build produção | Exit 0 em todos | Recibos do integrador hash-conferidos |

verification-receipt-hashes.json registra receiptHashMatches, stdoutHashMatches e stderrHashMatches verdadeiros para os cinco jobs de VERIFICACAO.json. O recibo de frontend conservado usa nome integrado-r6; o integrador informou reutilização das mesmas fontes web no r7. A vinculação à árvore depende do manifesto/documentação do integrador; a conferência criptográfica dos recibos não reconstrói por si só a árvore executada. O revisor executou checks web focados sobre a r7 fixa. Dois skips receipt-safety não contam como integração real.

O wrapper shell da tentativa inicial tinha exit 0 após Tee-Object apesar da falha interna do Bun. O parecer usa a saída e a classificação command_unsuccessful do adapter, não o exit do wrapper, para registrar a falha. Nos checks seguintes, a saída Bun e métricas confirmam sucesso. Não há alegação de ganho de desempenho RTK/Headroom ou de custo zero; pass-through e métricas preservadas não são avaliação pareada de ganho.

A tentativa de nova prova servida nas portas 3010/3011 colidiu com outro chat e foi descartada pelo integrador. Esse incidente é uma limitação de ambiente e não prova sucesso da aplicação r7. O integrador comunicou repetição em 4130/4131 com saúde da própria aplicação, filho ativo e HTML do pipeline, e build das mesmas fontes com API 4130 em 19,24 s. Até o fechamento deste parecer, o resultado final dessa prova servida não foi anexado ao candidato fixo nem executado pelo revisor. Não se promove essa comunicação a prova visual final independente.

## Cobertura de aceitação G01–G17

“Aceitável localmente” abaixo significa comportamento de engenharia inspecionado ou exercitado no limite declarado; não encerra um critério que também exige prova real. A instrução e SPEC congeladas prevalecem sobre matriz, opinião consultiva, passagem de testes ou esta tabela.

| ID | Avaliação independente do comportamento local | Aprovação integral / pendência |
| --- | --- | --- |
| G01 | Manifesto, critérios, inventário e baseline explícitos; 660 hashes antes/depois sem alteração. Original e concorrência fora da escrita do revisor. | Baseline local verificável. Auditoria da promoção/árvore final ainda necessária; nenhuma promoção autorizada inferida. |
| G02 | Supervisor/worker/journal/shutdown inspecionados. CONSOLE-LIVE.json documenta duas inicializações, IPC, restart e fechamento de porta/lock. | Prova atual servida final e encerramento após build atual ainda devem ser vinculados. Prova anterior não certifica uptime 24/7. |
| G03 | Doctor/health e capabilities distinguem presença, configuração, acesso e execução; v5 e RPC não substituem v6. | Parcial: credenciais Web3 e entitlement reais não demonstrados. |
| G04 | Races, revisão, cleanup e consentimento específico cobertos localmente, inclusive destinatários RPC. | Pendente gesto/conexão/consentimento/eventos com wallet real. Fixtures não atendem o critério. |
| G05 | Núcleo v6, recibos e integração com observation/RPC/extensões inspecionados; aquisição pública v5 separada. | Pendente Market/Balance/DEX autenticados e correlacionados até a UI, por família/rede. HTTP v5 não os certifica. |
| G06 | R1 corrigido; quantidades e avaliação exatas, cobertura e unidades desconhecidas conservadas, divergência rejeitada. | Pendente inventário real conferido para carteira/rede/bloco compatíveis. R6 afeta publicação de derivações inválidas. |
| G07 | Frescor/completude bloqueiam inferência; calibração pública tem limites conservadores. | R6 aberto: gate invalida decisão, mas publicação/consumo visual do núcleo permanece pronta. Núcleo real também depende de G05/G06/G08. |
| G08 | Quote/build conservam quantidades, rotas, custos e validade; custo desconhecido não vira zero. | Pendente cotação autenticada real com unidades, preço, custos e fatos de contrato qualificados. |
| G09 | R2/R3 corrigidos; allowlist de privacidade, validação de resposta, quotas e reserva durável inspecionadas/testadas. | Pendente credencial/acesso e consumo autorizado do Jev do aplicativo, resposta real correlacionada. Consultas do plugin não satisfazem G09. |
| G10 | Loop serial, journal, restart, quota, outage e expiração cobertos localmente. | Pendente ≥10 ciclos completos novos do núcleo real, por ≥2 TTLs, com prova de duração/frescor e inferência G09. Hold sem núcleo não conta. |
| G11 | Barreiras de proposta e semantic-proof são conservadoras; framework permanece blocked sem os fatos necessários. | Pendente build real, deployment/proxy/bytecode/ABI, decodificação completa, fees/reserva e simulação qualificada. Não há aprovação financeira. |
| G12 | Capabilities são específicas; extensões GET ficam OFF por padrão; sinais/busca não implementados não são anunciados como disponíveis. | Acesso/entitlement e observações reais condicionais ainda não demonstrados. Sem transformar documentação em direito de acesso. |
| G13 | UI exibe configuração, fontes/modo, custos/coverage, hold, histórico e próximo passo; R5 corrigido. | R6 aberto e nova prova servida pendente; fluxos reais de carteira e núcleo continuam dependentes de acesso/consentimento. |
| G14 | Evidência visual anterior informa 1440×900, 390×844, 360×800, teclado, alvos 44 px e contraste amostral; CSS inspecionado. | Repetição servida na árvore final pendente. Preferência reduced-motion alterada e toque físico não foram exercitados; emulação não os comprova. |
| G15 | Gates herdados de permissão/limites/ledger/kill-switch e recuperação constam de regressões; journal/hold examinados; execução OFF. | Aceitável no limite local observado; auditoria final necessária. Nenhuma transmissão financeira ocorreu nesta revisão. |
| G16 | Checks focados passaram após correção do ambiente; recibos de suites/types/build conferidos; falhas anteriores preservadas. | Prova servida final da versão atual ainda pendente. Tests/seams não certificam integração externa; skips explícitos. |
| G17 | Revisão independente fixa com achado, repro, hashes e limites concluída para r7. | Não aprovado: R6, provas servidas finais e dependências reais essenciais abertas. Critérios não foram enfraquecidos. |

## Limitações e encaminhamento

A revisão é limitada aos módulos novos e seams solicitados, critérios congelados, checks focados e recibos apresentados. Não realizou auditoria de toda a plataforma histórica nem execução autenticada ou financeira. As proteções foram exercitadas principalmente em seams sintéticos; isso estabelece comportamento local, não instalação/ativação Desktop, acesso externo, qualidade de inferência real, desempenho de produção ou operação contínua.

O próximo passo obrigatório de engenharia é corrigir R6 e fornecer r8 imutável com manifesto, regressões de publicação/render e prova servida vinculada à mesma árvore. A revisão da nova versão deve confirmar que a invalidação não revive ao restaurar/recuar o relógio e que RPC/avaliação/mercado/cotação deixam de ser consumidos como válidos. A cópia r7 deve permanecer preservada para a reprodução.

Após aprovação local, a meta continua dependente de credenciais e direito de acesso Web3, conexão/consentimento real da wallet, autorização de consumo Jev do aplicativo e fatos/adaptadores semânticos reais. Resolver essas dependências dentro da autorização existente e produzir os ciclos correlacionados é necessário antes de qualquer conclusão G01–G17. Não pedir que Jev invente credenciais, permissões, disponibilidade ou prova externa.

**Resultado final desta revisão: R1–R5 fechados; R6/P2 aberto e confirmado pelo integrador; 660 hashes preservados; r7 local não aprovada; G17/meta integral não aprovados.**
