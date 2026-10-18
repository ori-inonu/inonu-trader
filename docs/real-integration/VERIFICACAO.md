# Verificação do candidato integrado r8c

CWD: C:/Users/gabri/.codex/worktrees/okx-real-integration/jev-trader. Bun 1.3.14 e Node 24.3.0. --no-env-file e configuração explícita; segredos do original não copiados. A presença de chave da aplicação no baseline não comprova acesso ou autorização de consumo. Credenciais do plugin não preenchem o aplicativo.

Fonte congelada: 5c0949bc33e20ac9ccad02697e7ef4623ecac22a990e281c76fd7d9dea41f323. Manifesto r8c: SHA-256 0bf5458a1446a06dc6843e192682411ba6e058cbe7c0156aa7f802bf7fd867c0, 662 arquivos. AUDIT-R8.json confirma igualdade dos arquivos fonte com a cópia independente. Consolidação de docs não altera esse digest.

| Verificação | Resultado final |
| --- | --- |
| Backend, bun --no-env-file run test | Exit 0; 2101 pass, 2 skip, 0 fail; 884342 assertions; 135 arquivos; 234,22 s |
| Frontend, bun --no-env-file run test | Exit 0; 581 pass, 0 fail; 4138 assertions; 43 arquivos; 8,18 s |
| Backend e frontend, bun --no-env-file run typecheck | Ambos exit 0 |
| Frontend, bun --no-env-file run build | Exit 0; Next produção, NEXT_PUBLIC_API_URL=http://127.0.0.1:4130 |
| Supervisor produção 4130/4131 | Duas inicializações; HTTP 200 backend/Next; worker ativo; ambas saídas exit 0, portas fechadas e lock ausente |
| Navegador servido | 1440×900, 390×844, 360×800; atualização, configuração, detalhes, histórico e proveniência pública observados pelo integrador; captura com foco visível; sem overflow global observado |

VERIFICACAO.json preserva argv, CWD, duração, recibos, SHA-256 e caminhos das saídas exatas. buildApiUrl em recibos de teste é metadata do helper, não configuração do teste; somente o build prova a URL incorporada. RTK + Headroom usado, sem ganho de desempenho medido. Dois skips receipt-safety não qualificam integração externa.

Falha preservada: primeira suíte web r8 teve 580 pass/1 fail por `Timed out waiting for Edge's loopback-only DevToolsActivePort; last value: null`. A suíte completa repetida sem alteração de código ou relaxamento do teste passou. Causa não demonstrada. Console anterior 3010/3011 encontrou processos alheios; HTTP e capturas descartados, conforme CONSOLE-COLLISION-FAILED.json. Nenhum processo alheio foi encerrado.

R1–R5 corrigidos, conforme os IDs dos pareceres: R1 mantém USD desconhecido null; R2 remove patrimônio privado do payload Jev; R3 impede núcleo vazio/incompleto de permitir inferência; R4 limita journal antes do append; R5 não chama observação fixture/unverified de real. R6 do parecer r7 corrigido: tick/latest/history ocultam core vencido/relógio inválido; relógio monotônico impede estender TTL na UI. Rollback, NaN e restauração não fazem preços, valoração, RPC ou semântica vencidos parecerem prontos. RED/GREEN em R6-REGRESSION-EVIDENCE.json; verificação final e reprodução independente exercitam o código final.

CONSOLE-LIVE-R8.json, BROWSER-EVIDENCE-R8.json e cinco capturas visual/r8-*.png vinculam execução à fonte final. HTTP 200/código 0 de instruments/funding-rate/mark-price são públicos reais. Referência HTTPS de tempo mede diferença fonte/local sem mudar relógio do sistema ou assinatura v6. Hold e capital desconhecido são observados sem consentimento/credenciais. O JSON do navegador registra DOM e viewports; a sequência de teclado é relato do integrador, com foco visível na captura 390, sem reprodução independente. O catálogo de controle disponível não expõe emulação de reduced motion ou toque; G14 permanece parcial.

Não exercitados: conexão/gesto de carteira, envio consentido de endereço, API Web3 autenticada, inferência da aplicação, quote/build/simulação reais, toque e preferência reduced motion alterada em runtime. Regressões e v5 não comprovam esses pontos. Execução financeira OFF; G01–G17 não concluídos. Parecer final deve ser lido junto à matriz; aprovação local não é aprovação integral da meta.

Parecer independente recebido em REVIEW-R8.md (SHA-256 85340b26dce722d56bb292caea6be8a3ff480f113da2b8ee1d708d9a7599b75c): R1–R6 aprovados no recorte, nenhum novo P1/P2 comprovado. O revisor executou backend focado 162 pass/0 fail/1308 asserts e web 18 pass/0 fail/89 asserts, mais reproduções próprias de rollback/expiração. G17 e a meta integral não foram aprovados. G11 também exige adapter de produção deployment/ABI/decoder completo, além de credenciais/build real; pesquisa oficial e leituras públicas adicionais de runtime/metadados concluídas, com limitações em G11-METADATA-CONCLUSION.md. Esta referência posterior ao parecer é atualização factual do integrador, não bytes documentais novamente revisados.

Pesquisa adicional: bytecode real observado em bloco fixo nas redes196/143; metadata CBOR extraída e hash de runtime anterior conferido. IPFS timeout e Sourcify404/match null impedem qualificar ABI/source nesta investigação delimitada. Recibos e scripts arquivados; nenhuma alteração de fonte, assinatura, broadcast ou chamada autenticada. Auditoria de contraste de tokens: 13 pares passaram; escopo limitado não conclui G14. Novo parecer documental separado preserva limites da aprovação r8.

REVIEW-RESEARCH.md preserva o parecer independente do recorte documental de 81 arquivos. Produto e critérios congelados não mudaram; os testes não foram repetidos por alteração apenas de documentação. Referências finais de status adicionadas após o parecer estão diferenciadas em REVIEW-RESEARCH-LINK.json e POST-REVIEW-DOC-DELTA-R8.json. G17 integral continua pendente.

Continuação automática 1: nenhum dos 447 arquivos de produto nem os critérios mudou, conforme AUDIT-CONTINUATION-1.json. Suítes anteriores conservadas; não repetidas por aquisição/evidência documental apenas. Revalidação local atual em ACCESS-REVALIDATION-CONTINUATION-1.json e DOCTOR-CONTINUATION-1.json confirma dependências de credenciais, conexão/consentimento e consumo do aplicativo; nenhum request autenticado ou inferência do aplicativo.

BROWSER-G14-CONTINUATION-1.json preserva os resultados reais de DOM e teclado nesta nova sessão. Viewports solicitados 1440×900, 390×844 e 360×800 diferem da área client por scrollbar de 15px; não foi observado overflow global. Tab/Enter/Shift+Tab, foco posterior dentro da viewport e navegação horizontal nativa de duas tabelas foram adquiridos pelo integrador. Coleta de contraste cobre folhas de texto, incluindo offviewport, com exclusão de textos mistos nonleaf; não cobre todo o documento nem todos os estados. Oito pares ativos passam com mínimo 10.4905419447:1, recalculado independentemente offline em REVIEW-G14-CONTINUATION-1.md/json. O revisor não conseguiu acessar a superfície de navegador; isso não é reprodução independente da interação. Toque, alteração de reduced motion em runtime e foco/clipping/contraste integrais permanecem pendentes. G14 e G17 não aprovados integralmente.

CONSOLE-G14-CONTINUATION-1.json: terceira execução local exit0, recursos fechados sem força, portas liberadas e lock ausente; completeCoreCycles=0. Holds não qualificam G10. REVIEW-G14-CONTINUATION-1-LINK.json vincula cópias exatas do parecer; POST-REVIEW-DOC-DELTA-CONTINUATION-1.json distingue estas edições de status posteriores ao parecer. Meta permanece ativa e não concluída.
