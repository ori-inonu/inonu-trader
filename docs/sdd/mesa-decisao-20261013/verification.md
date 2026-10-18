# Verificação da mesa de decisão

Conversa: 01a135ff-362e-7cf0-ac4f-ef678d322188. Execuções locais em 2026-10-13. Aceitação imutável: SPEC.md, SHA256 d7ee2282f6178cee183dea745698f3fa86ff27e49b55f24fcd115fd6088f8298. Manifesto de 37 arquivos: change-manifest.json, SHA256 e95cf6f907d9fad9184de72f396e5f605f9a7d2c0d1de8ec477a5ea76e300ecb.

## Execução e alcance

| Verificação | Resultado observado | Evidência |
| --- | --- | --- |
| Backend: asker, HTTP, modelo, carteira, fontes, ledger, configurações, handlers, cofre e wrapper | 490 testes passaram, 0 falharam, 2493 assertions, 27 arquivos, 33,99 s | evidence/final-backend-tests.log |
| Bibliotecas web, `bun --no-env-file test src/lib` na pasta web | 2589 testes passaram, 0 falharam, 47231 assertions, 177 arquivos, 49,49 s | evidence/final-web-mobile.log |
| `bun --no-env-file test src/outcomes/live-costs.test.ts src/outcomes/wire.test.ts web/src/lib/purity-bundle.test.ts` | 20 testes passaram, 0 falharam, 62 assertions, 3 arquivos, 8,38 s | evidence/final-purity-tests.log |
| Regressão após sincronizar adições concorrentes: `bun --no-env-file test src/outcomes/wire.test.ts src/outcomes/decision-log.test.ts src/outcomes/live-costs.test.ts web/src/lib/purity-bundle.test.ts` | 41 testes passaram, 0 falharam, 131 assertions, 4 arquivos, 1,116 s | evidence/final-concurrent-tests.log |
| TypeScript backend, `bun --no-env-file x tsc --project tsconfig.verification.json --noEmit` | Saída vazia e exit 0 na execução do coordenador | evidence/final-typecheck-root-qualified.log |
| TypeScript backend após sincronização concorrente, mesmo comando | Saída vazia e exit 0, confirmação posterior aos novos arquivos concorrentes | evidence/final-typecheck-concurrent.log |
| TypeScript web, `bun --no-env-file run node_modules/typescript/bin/tsc --noEmit` | Saída vazia e exit 0 na execução do coordenador | evidence/final-typecheck-mobile.log |
| Next 16.3.4: `bun --no-env-file node_modules/next/dist/bin/next build --webpack`, INONU_EXPORT=1 e diretório verified-export | Build, TypeScript e geração estática passaram, exit 0; 8 páginas geradas | evidence/final-build-mobile.log |
| Navegação no frontend compilado, Chrome headless, 1440x900 e 390x844 | Ampliação/restauração, ativo, 5m, Linha e 16 estados de camadas preservados; foco visível; sem overflow horizontal, erros JS, pulso ou caracteres proibidos | evidence/chart-ui-results.json, evidence/verify-chart-ui.mjs |
| Carteira no frontend compilado, provedor EIP-1193 simulado e HTTP interceptado | Conectar/atualizar não chama modelo; consentimento exigido; composição sem endereço; cancelamento do UUID próprio; expiração e troca de conta invalidam | evidence/wallet-ui-results.json, evidence/verify-wallet-ui.mjs |

O build ocorreu numa cópia isolada com dependências existentes e sem arquivo .env. O servidor estático próprio em 127.0.0.1:3017 apresenta esse build; não oferece API de produto. Apenas o feed público de preços foi acessado no teste visual. Node foi usado somente para Playwright, pois Bun e o pipe do Chrome no Windows falharam na inicialização; comandos da aplicação usam Bun.

Os testes de carteira/modelo usam doubles. Não certificam autenticação Jev, saldo de uma carteira real, cobertura de todo o mercado, retorno financeiro, execução de ordens ou ativação em servidores já abertos. Os totais são execuções separadas, com testes sobrepostos, e não devem ser somados como testes únicos.

O adaptador RTK/Headroom encaminhou Bun sem compressão por `command_not_allowlisted`; não houve alegação de economia. A métrica de backend permanece em final-backend-metrics.json. Falhas anteriores de build isolado incompleto, teste de pureza e menu móvel foram preservadas nas evidências originais da conversa e resolvidas por verificações posteriores.

## Cobertura da aceitação

| Critério | Evidência verificável |
| --- | --- |
| UI-1 | Capturas desktop/mobile; chart-ui-results.json; menu móvel testa primeira e última camada; ampliação mantém seleção, intervalo, estilo e todas as camadas. O painel passa de 1122x488 para 1408x688 no desktop e de 366x568 para 366x618 no celular. |
| UI-2 | wallet-ui-results.json e testes do cliente/carteira: leitura parcial, rede, validade e capacidades distintas; nenhum POST ao conectar ou atualizar. |
| KEY-1 | Testes runtime-key/store/vault/handlers/client: precedência local e Windows, presença/origem sem segredo. A presença real no Windows foi observada sem autenticação no provedor. |
| PORT-1 | Testes portfolio/ask e teste de carteira: identidade por rede/contrato, saldo desconhecido null, universo limitado, sem endereço e sem alavancagem. |
| PORT-2 | Testes asker/modelo/HTTP: decisão por ativo do Jev, validação, single-flight, cooldown, ledger, caps e cancelamento do proprietário, incluindo DELETE antes do POST. |
| PORT-3 | Consentimento, evidência e custos; invalidação por leitura, conta, rede e idade; UUID do cliente; testes HTTP/componentes e wallet-ui-results.json. |
| SYS-1 | Manifesto limitado, diff e preservação de adições concorrentes; bot Kuru/Monad não alterado. Sem ordem, assinatura, publicação, instalação ou reinício dos servidores do usuário. |
| EVID-1 | REPORT.md e fontes primárias: produto documentado, implementação local e operação live são estados distintos; lacunas de OnchainOS, nome Visuality e ML explícitas. |

## Preservação e revisão

A auditoria de integridade conferiu os 37 arquivos tanto no projeto quanto no candidato isolado, sem divergências. Durante a revisão, o candidato ainda continha duas versões antigas enquanto o manifesto já refletia adições concorrentes no projeto. A sincronização copiou essas adições e suas dependências para o candidato, sem editar ou desfazer o projeto. evidence/concurrent-sync.json registra os hashes anteriores e preservados.

O CSS anterior do gráfico, inclusive a barra móvel adicionada em paralelo, foi preservado integralmente. O delta desta tarefa acrescenta somente o popover móvel limitado; o snapshot anterior tem SHA256 916670a862909d12061b0199eb3b57807fda821a04d95ff15b01d8ba9b07976b.

As revisões independentes foram concluídas em cópias isoladas: [SPEC e auditoria de direção](review-spec.md) e [normas e correção](review-standards.md), sem achados acionáveis abertos nos oito critérios congelados. O revisor de SPEC executou 89 testes móveis e 41 testes de integração/pureza sem falhas; o revisor de normas executou 26 testes de layout/pureza e 44 testes de integração/cancelamento sem falhas, além de TypeScript. As execuções se sobrepõem. Pareceres distinguem evidência própria, browser do coordenador e limites de qualificação live. O coordenador não aprovou seu próprio trabalho.
