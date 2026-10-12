# Cobertura contínua: checkpoint

Objetivo integral ativo e incompleto.

Conversa 01a12971-f941-7e42-8a42-fab6d44d4eb5. Worktree integradora codex/inonu-jev-tape-data-f1-f4, baseline 14cbb7bd2878eed0a930b324b0c50610be7cdab8. O turno anterior de composição de prompt não produziu engenharia. Este turno confirmou estado e implementou a validação de cobertura. Inventário observado agora: 12 worktrees Git, main 0f8afc1; o checkpoint histórico citava 14 e main14c. Preservar avanço concorrente e comparar novamente antes de integração.

SPEC SHA256 10cee5fe44e7dbde5a988d34822ee99061cb24b39341e2cefe77a4bae2439c97 permanece inalterada. Harness observado revisão45 implementation active. Seams public_chain_and_direct previamente aprovados por JEV; sem nova autorização inferida.

CoverageProof do produtor registra primeiro ACK correspondente, geração e instante monotônico final único. O builder exige identidade/época/geração correntes, socket aberto, domínio temporal finito e não negativo, ordem ack <= continuousSince, captura exatamente igual ao monotonicNowMs, duração >=60000 e perda ausente ou estritamente anterior à janela inclusiva de60000. Quietude com cobertura válida chega ao modelo; negativos específicos retornam trades_unavailable, state/decision null e zero chamadas. Este gate não certifica ausência de perda que o produtor ainda não detecta.

RED reproduzido 957da6: cobertura ausente aceita erroneamente. Primeiro rerun41ecd6 revelou erro da fixture: deps.now ausente; fixture corrigida para interface pública real now/readId/decide/choice, acrescentada assertion decision.status ok sem enfraquecer negativos. GREEN4cc59c: 1pass0fail97assertions. Regressão1e8c0a:136pass1fail por fixture slowTicker conservar observedThrough antigo; diagnóstico focado bd6be6. Fixture agora captura observedThrough no mono final e preserva assertions de expiração core/funding. Final86141e:137pass0fail1642assertions em feed/state/read/loop. Typecheck41b079 exit0; git diff --check231c4c exit0. Bun1.3.14 via adapter local, sem alegação de compressão ou ganho.

Mudanças anteriores de candles/proveniência e clocks estão presentes e passaram na mesma regressão; seus resultados históricos não equivalem a revisão independente deste candidato. Não houve staging, commit, merge, push, deploy ou operação financeira. Revisão exata completa ainda não realizada. Main não está atualizado com este delta.

SHA256 dos oito arquivos atuais:

- feed.ts: a4bb2b1a2b56c393c3a385c530a02c13302490dd4715d2fa976a28e2457d0fa8
- feed.test.ts: 9a6a9ffcff40a886e55d72c58593999ad08e719bab672a4635292f05e4e76681
- state.ts: 63d1737b1a7cc45dc43d6fe9829618e50e56ab4a998b48bfcdf53302d4504720
- state.test.ts: a70ddcd28decc03bf52addd49f36c9a7cdf046422427a4f1f6718f253918dcc3
- types.ts: 7e81029d1df9c76aa801fb7dfd59296d039a69d7a82474a58d4ba8bda0970607
- read.test.ts: 96d0c2d8abf5598d1a7fc07a6e8fbc2b118a7c5cc6c8ff540d05b2e03ae9b157
- loop.ts: 0699bd853d802fad0f55afbc7f0ed771e79f7ef8d20978dbdee8f0ebc5532d86
- loop.test.ts: a92f751c2708a368d33f451558c75da27ae4f5777e36303dcccf2a60e169b902

Próximo passo elegível F4: testes e implementação de prova por trade (timestamp fonte estrito, identidade, captura, geração, receipts), fluxo e retenção monotônicos, cap5000 com lostThrough real, gap conservador por mensagem relevante malformada, recuperação sem mensagem nova e isolamento lifecycle. Produtor ainda publica lostThrough null e continuousSince ACK mesmo após lacunas: insuficiente para concluir F4. Não enfraquecer SPEC nem antigos controles econômicos. Depois regressão/probe imutável, revisão independente completa em cópia isolada, catálogo pagamentos, integrações/evaluações reais pareadas, interface, commits/merge local e localhost exercitado. Nenhum bloqueio externo impede o trabalho local atual. Uso/custo das consultas não demonstrados permanecem desconhecidos.
