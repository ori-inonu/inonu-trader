# Verificação da evidência para a consulta de carteira

Conversa `01a136cd-3af3-7361-bd23-c23a6aeece97`. Critérios: [ABSTENTION-SPEC-20261013.md](ABSTENTION-SPEC-20261013.md), SHA256 `ddc85fe01dd55d0c087d34a842fe717e60366806ce3be65e4b07d5c3d6e384f5`. O núcleo e o parser estão reservados ao Claude; o Codex integra a UI e entrega o candidato privado para integração pelo dono. Este registro não concede autorização nem certifica lucro.

## Resultado atual

A conexão local e a leitura da carteira foram exercitadas no navegador atual. A UI revisada está no export servido em `http://127.0.0.1:47322/`. O candidato de coleta e contexto do modelo ainda não foi integrado ao núcleo compartilhado. Logo, o novo contexto de mercado ainda não pode ser declarado ativo na consulta real.

O caminho antigo de seis ativos usa parte do teto de 15 leituras com velas que o resumo da carteira não consome. Além disso, dados já normalizados de preço, liquidez, volume e variação são descartados ao preparar o resumo. A regressão composta reproduz essas perdas offline. Isso não prova que sejam a causa exclusiva das seis abstenções mostradas pelo usuário.

## UI integrada e verificada

| Arquivo | SHA256 |
| --- | --- |
| `web/src/components/Desk/Dock/HoldingsConsult.tsx` | `a083ba3c37290d80f051b8996545ea6625192c8c22b04f63a4fc644701c74fdb` |
| `web/src/components/Desk/Dock/HoldingsPanel.module.css` | `646412c5db7fb25ed089b7b559c203faeed573150fe4757865e9050af5384ac2` |
| `web/src/lib/wallet/holdings-consult-render.test.tsx` | `4a41f0e2db9ae47cfd9c2667dea89b993a24ca2ba5893daa0cad9e44ceaf8cb0` |

- Abstenção aparece como `Nenhuma acao indicada`, sem atribuir ao Jev uma justificativa que ele não retornou.
- A coleta distingue fontes essenciais, opcionais e não aplicáveis. Códigos internos recebem textos legíveis; lacunas não são uma recomendação de compra ou venda.
- Respostas com a extensão de mercado mostram preço, liquidez, variações e volumes de 5 min, 1 h, 4 h e 24 h, além de idade, origem e leitura antiga. Ausente permanece desconhecido; zero real e percentuais negativos são preservados. Respostas antigas continuam aceitas.
- O texto de consentimento declara contexto público de mercado da OKX. Endereço, preços da leitura da carteira e valores das posições continuam excluídos. O checkbox inicia desmarcado; validade, identidade e cancelamento permanecem vinculados à leitura atual.

Evidência privada em `C:/Users/gabri/.codex/tmp/portfolio-abstention-01a136cd/`:

| Verificação efetivamente executada | Resultado |
| --- | --- |
| Regressões de rótulo, lacunas e mercado antes das correções | RED preservado nos logs `UI-label-red`, `UI-gaps-red` e `UI-market-red` |
| Bun `--no-env-file test` nos módulos web wallet/inonu | 658 pass, 0 fail, 3284 asserts, 51 arquivos, exit 0 |
| TypeScript web | exit 0 |
| Export desktop usando `WEB_EXPORT_ENV` canônico de `scripts/build-desktop.ts` | exit 0, 8 páginas |
| Revisão independente em `review/workspace-ui3` | 25 pass, 0 fail, 169 asserts; sem achados concretos Spec/Standards na UI |

Parecer independente `review/REVIEW-ui3.md`, SHA256 `35f11ff4f1847328b0d8a0dee3b7f03fa2f4e8648ca1e4c2abeac29bb26d1626`. A revisão da UI não certifica a integração do parser/núcleo nem a disposição das colunas de um resultado real com mercado.

## Candidato privado do núcleo e parser

Freeze final do implementador, posterior à correção independente da janela de 4 h:

| Artefato privado no diretório acima | SHA256 |
| --- | --- |
| `ABS-BACKEND.patch` | `6ea5b157966a824fa2d93c6d4f1f7f21c009b1255b3728ea48a1af27e174f0e4` |
| `MANIFEST.json` | `4d4808c87a36bfb61109eb6e4a7a71843ff098126be7fdf7298351f61a0d311a` |
| `HANDOFF.md` | `138eba4d96b30074434cb69eb16de9ab641e1bfd20e2c43351f37d18668c6fbe` |
| `H4-VERIFICATION.json` | `9fca7a4122e5473f7995dc1593ce2ea18f0b53f078da393805a498162159d513` |
| `ROOT-BASELINE-CHECK.json` | `28be33e8dac5bb2e4219913389f2dd5120ea221c05cfc6cea2a71f1c0aed25c8` |

O candidato preserva mercado público nas quatro janelas, alinhado a identidade e ordem dos candidatos. O plano carteira usa price-info e token-risk primeiro, com trades quando o teto permite: seis tokens usam 12 leituras; cinco tokens mais nativo usam 15. O modo token permanece igual. A presença dessas fontes não prova suficiência financeira nem garante que o modelo deixe de se abster.

Suíte do implementador: 281 pass, 0 fail, 1704 asserts em 13 arquivos, incluindo probe independente imutável de 4 h. Esse probe passou com variação 12 e volume 1200, além de ordem, identidade, dicionário de lacunas e limite de 2048 bytes UTF-8. Typechecks delimitados de backend e parser: exit 0. O contexto foi compactado removendo somente timestamp e legenda de origem redundantes; valores desconhecidos continuam nulos. Comandos e saídas reais constam de `HANDOFF.md`, `H4-VERIFICATION.json` e logs hashados pelo manifesto. Nenhuma API nesse ensaio offline.

O integrador conferiu novamente os sete hashes do candidato e os baselines compartilhados: zero divergências. `git apply --check --whitespace=nowarn` contra a árvore compartilhada: exit 0. Essa operação não aplica o patch. Pedido de integração registrado em [COORDENACAO-CLAUDE-20261013.md seção 7](COORDENACAO-CLAUDE-20261013.md#7-pedido-ao-dono-do-núcleo-e-parser-codex-ciclo-abstention). Nenhum arquivo do núcleo/parser foi aplicado pelo Codex.

A revisão independente final aprovou o candidato somente em fonte e verificação offline, com zero achados concretos abertos nos eixos Spec e Standards. Parecer: `review/REVIEW-final.md`, SHA256 `30b4f095e7333902718824e294e9c64d12489fb2cd13679d7a5064d5d7dd1548`. O revisor executou, em cópia isolada composta com a UI3, 361 testes verdes, 2125 asserts e 20 arquivos; três typechecks terminaram com exit 0. Os probes independentes de 4 h e ordem passaram sem enfraquecer a SPEC. Os sete hashes foram reconferidos depois da execução.

O pacote final está pronto para integração pelo dono. O parecer da entrega completa permanece `PENDING`: falta integrar, gerar o build da composição e comprovar o novo contexto no runtime. O screenshot da UI atual não mostra dados de mercado da resposta nem detalhes expandidos e não prova esse caminho. A revisão não executou consulta ao Jev, API externa ou ordem; não certifica acesso a recursos OKX nem melhora financeira.

## Conexão local e prova no navegador

Uma exportação intermediária sem `NEXT_PUBLIC_API_URL` vazio embutiu a origem de fallback `127.0.0.1:3000`. O servidor em 47322 permaneceu disponível. O export foi refeito com o ambiente canônico, que usa a origem local atual. Nenhum processo antigo foi parado.

Depois de recarregar a UI, conectar Solana e observar a leitura automática, cliquei em `Atualizar carteira`. Em `2026-10-14T00:26Z`, o botão saiu de `Cancelar` para `Atualizar carteira`; foram exibidos 14 de 14 ativos, rede Solana, total informado pelo provedor e origem `OKX OnchainOS pelo servidor local`. O erro de servidor não apareceu nessa operação. Após 60 s, a consulta passou corretamente a `Atualizar para analisar` e o checkbox ficou desabilitado até uma nova leitura.

Captura `wallet-final-ui.png`, SHA256 `14d484ceead19d4074c4f3db8ec6abc52db17afdd8ef68c4a664a97f4a8b5f7d`. Mostra o texto de consentimento atualizado, checkbox desmarcado e contagem 14/14. Não mostra decisão nova do modelo. Nenhuma nova consulta privada paga, assinatura ou ordem foi executada neste ciclo.

O total variou entre leituras. A [auditoria de procedência](VALUATION-PROVENANCE-20261013.md) não encontrou preços simulados no caminho observado, mas confirmou que total e saldos usam endpoints/caches independentes e ainda não são conciliados. O valor de uma linha é calculado como saldo vezes preço do provedor. Sem respostas pareadas, a causa da variação e as unidades reais permanecem indeterminadas. Esses números não demonstram capital realizável, ganho ou perda; liquidez e capacidade de saída precisam de evidência própria.

## Oportunidades de mercado e limites

A pesquisa primária está em `okx-market-opportunities-20261013.md`, no diretório privado acima, SHA256 `2f34a48068d02ca3a0368bdeb5e819cc060f8c005814ebffed155db7b47bd869`.

[Signals](https://web3.okx.com/onchainos/dev-docs/market/market-signal-list) oferece eventos de compra de grupos e campos de holders/concentração. Ausência de evento não é sinal de venda. [Meme Pump](https://web3.okx.com/onchainos/dev-docs/market/market-memepump-get-token-list) oferece descoberta por estágio, com lista limitada; lista de tokens não prova retorno ou acesso efetivo da chave. Conexão da extensão não comprova cobertura das APIs.

A comparação entre carteira e essas oportunidades não está implementada neste patch. O próximo mecanismo precisa preservar timestamp e cobertura por fonte, validar candidatos por rede e contrato, comparar risco/liquidez/fluxo e custos de troca quando disponíveis e registrar dados desconhecidos. A escolha permanece do Jev; ausência de dado ou catálogo não vira recomendação codificada. Dados privados adicionais ou nova consulta paga continuam dependentes da autorização correspondente.

## Dependências de integração

1. O patch, manifesto e parecer finais estão registrados para o dono dos arquivos reservados. Antes de integrar, ele precisa conferir os hashes atuais e preservar trabalho concorrente.
2. Verificar e gerar o build do conjunto fonte/parser/UI integrado; carregar explicitamente o novo núcleo no runtime. O processo atual não recarrega módulos automaticamente.
3. Exercitar uma resposta real somente quando houver consentimento para o payload atualizado. Não repetir automaticamente a consulta privada anterior.

O ciclo completo permanece pendente dessas dependências. Não há ML treinado, troca automática, cobertura integral dos 14 ativos ou resultado financeiro certificado por esta verificação.
