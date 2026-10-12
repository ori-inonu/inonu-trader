# Execução da integração real OKX

Autorização observada: Gabriel pediu nesta conversa a criação e execução do objetivo até G01–G17, sem confirmações de continuidade. Conversa nativa: `01a12b5f-ca2a-7ff1-a131-07933705d3e8`. O objetivo nativo está ativo; este documento registra engenharia, não fornece autorização adicional.

## Contrato imutável

Os critérios G01–G17 são os bytes de `INSTRUCAO-DO-OBJETIVO.md`, SHA-256 `cfa90cac735e9a838a0c4bc593276c83757905e7c5fedcd2414e499b1dad9e08` (verificar hash efetivo antes do congelamento). Os contratos READINESS/PROFIT/WEB3/Wallet/Central e a precedência permanecem conforme o inventário e a instrução. Evidência sintética valida comportamento, jamais acesso real. Nenhuma transmissão financeira faz parte desta execução.

## Entrega executável mínima

E01 (G02/G03/G07/G10): runtime independente de Kuru, servidor de saúde/configuração, supervisor serial sem sobreposição, shutdown e retomada de histórico paper. Fonte indisponível produz hold explícito sem capital fabricado. Intervalo inicial 60 s; TTL de quote 15 s, mercado 60 s, inventário 60 s. Congelar validade no envelope e verificar no consumo. A prova G10 precisa dez amostras novas e duas janelas de 60 s, além de inferência autorizada.

E02 (G04/G05/G06): sessão browser única com revisionamento e invalidade em eventos. Conectar permanece local. Consentimento adicional, revogável, informa destinatários (backend local e OKX Web3), endereço, rede e finalidade de consulta; não autoriza Jev, assinatura ou transmissão. POST de consentimento só aceita origem local e estado consistente. Endereço não entra em logs ou histórico persistido. A sessão fica apenas em memória; restart exige novo consentimento. Contrato O5/W7 preservado fora desse fluxo adicional explicitamente separado.

E03 (G05/G06/G07/G08/G11/G12): adaptador autenticado OnchainOS, sem alterar o cliente legado de quote nem confiar unidades por flags. Envelopes por família contêm origem, endpoint, request/response status, chain, coleta/fonte, TTL, erro sanitizado e correlação. Inteiros brutos e decimals exatos; cobertura limitada; desconhecido nunca zero. Market/DEX/Balance qualificam suporte separadamente. Build real de swap gera somente proposta não assinada. Preflight semântico exige política de router/selector e decodificação verificável; contrato desconhecido permanece bloqueado. Extensões mostram estágios documentado/implementado/real/integrado/financeiramente qualificado separadamente.

E04 (G09/G10/G15): inferência da aplicação usa chave própria e autorização de consumo explicitamente configurada; chave do plugin não é reutilizada. Custos desconhecidos são null, nunca zero. Estado sanitizado sem endereço/calldata, decisão finita com hold, timeout/falha/ID inválido bloqueiam. Histórico não apresenta simulação ou projeção como resultado realizado. Execução permanece desligada sem caminho de assinatura no novo runtime.

E05 (G13/G14): painel principal de prontidão e pipeline, ações reais de refresh/retry/revogação, fontes efetivas e dependências concretas. Desktop/mobile, teclado, foco, reduced motion e textos longos. Nada de fixtures aparentando produção.

## Seams de TDD e propriedade

Seams aprovadas por delegação Jev (recibo 7572e239-2232-41a6-b4a9-62d35395c549, `approved_by=jev_delegated`, `human_response=false`): HTTP público de prontidão/consentimento; adaptador normalizado de transporte autenticado; ciclo e recuperação de journal; estado compartilhado de wallet via API pública. Testes em fatias red→green; mocks somente nas fronteiras externas.

Integrador root: `src/real/{config,runtime,http,journal,decision}.ts`, respectivos testes, `scripts/real-*.ts`, scripts de start/package, integração de página/layout/servidor e documentação. Escritor core em cópia isolada: exclusivamente `src/real/{types,core,preflight}.ts` e testes. Escritor UI em cópia isolada: exclusivamente `web/src/lib/{useOkxWallet,wallet-store,real-pipeline}.ts`, testes correspondentes e `web/src/components/RealPipeline/*`. Integrador resolve seams compartilhadas. Escritores não revertem alterações alheias.

## Verificação e dependências

Baseline HEAD `055a637f27f28cbf357cfb492534f7ed33d9b68f`, mudanças preexistentes em concurrent-baseline.json. Integração no checkout original somente após comparar hashes dos arquivos afetados. Sem commit, push ou deploy implícitos.

Credenciais Web3 não encontradas nos arquivos autorizados verificados em 2026-10-11. A chave Jev da aplicação existe; presença não comprova autorização de consumo, modelo ou acesso. Não usar segredos de plugins. Conexão wallet real exige provider e gesto; não fabricar endereço nem inferir saldo. Esses fatos não impedem construir e exercitar o software, mas impedem declarar G04/G05/G08/G09/G10/G11 completos sem prova real.

Verificação final: regressões backend/frontend afetadas, typecheck/build, runtime servido e browser nos três viewports, recuperação/revogações/expiração. Revisão independente da árvore fixa e matriz dos dezessete critérios. Critério pendente mantém objetivo ativo; limitação externa não é conclusão.
