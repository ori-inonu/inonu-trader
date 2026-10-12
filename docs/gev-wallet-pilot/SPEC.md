# SPEC — Piloto integrado GEV / OKX Wallet
Objetivo aprovado: observar a sessão da OKX Wallet e demonstrar carteira → dados → gates → decisão GEV → plano hipotético → journal → interface. Somente simulação. Baseline imutável f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c.
Fonte de aceitação: ANALISE-PROXIMO-OBJETIVO.md SHA256 8faf1e25a725b5732433a71751a83a20c3d10a2a4a67f228fddf20df9f66391b, proposta explicitamente aceita nesta conversa.
Decisões de arquitetura e seam: JEV receipt 210d5492-761c-4a5e-b164-0e6eb96289a4 (safe_loopback/public_contract); approved_by=jev_delegated, human_response=false. Advice não é autorização.
## Critérios imutáveis P1–P7
P1: journal e interface vinculam conta/rede, versão dos dados, candidatos, gates, decisão e plano ao mesmo ciclo/sessão.
P2: episódio com fontes reais disponíveis atravessa o fluxo em simulação; com candidato elegível e acesso autorizado comprovado, usa GEV real. Sem elegibilidade, hold sem inferência inventada.
P3: mudança de conta/rede, resposta atrasada, dados vencidos, custo/unidade desconhecidos, timeout e decisão inválida bloqueiam, com regressão e verificação do comportamento.
P4: nenhuma assinatura/envio/habilitação de executor. Plano e resultado hipotéticos separados de lucro real; confiança do modelo não equivale a probabilidade de ganho.
P5: falta de acesso real é dependência explícita. Fixtures qualificam o código, nunca P2 real.
P6: três passagens distintas: regressão/integração, interface desktop/mobile e invalidação, revisão independente do diff e auditoria de evidências.
P7: preservar outras sessões, worktrees, WIP e serviços; checkpoint com critérios, evidências, bloqueios.
P2 continua pendente se não houver acesso verificável; não enfraquecer seu critério para concluir o código.
## Marcos e comportamento
M1: a página compartilha uma WalletSnapshot com WalletPanelView e piloto. Account/chain/block/observedAt compõem um contexto com nonce de sessão local. Snapshot sem timestamp, lendo, desconectada ou vencida não pode iniciar ciclo. Alteração cancela e remove a decisão anterior; geração e comparação de contexto descartam respostas antigas.
M2: módulo aditivo sem import do executor/trader/config de chaves. Serviço em 127.0.0.1:3010 com allowlist de origins localhost:3011/127.0.0.1:3011, JSON limitado e uma avaliação concorrente por processo. POST /pilot/cycles aceita apenas observação, nunca instrução financeira. Uma estratégia dex_round_trip existente em X Layer (196), USDT/OKB. Outras redes continuam observação e hold por escopo. Prechecks verificam identidade, cobertura, timestamps, valores, unidades e allowance de inferência antes de construir candidatos. Usa builders, gates, estado sanitizado e validador/plan existentes. Somente elegíveis podem chegar ao modelo. Deadline geral e do modelo; validação novamente após resposta. Todos os PlanGate false, sem dependência de executor, sem dados de transação nem assinatura.
M3: painel dinâmico mostra marcos, conta mascarada, rede, fonte real/fixture/indisponível, cobertura/idade/hash dos dados, candidatos/rejeições, decisão/confiança (não win rate), plano hipotético e rastreio/journal por ciclo. Não reaproveitar readmodel histórico de outra conta como decisão da carteira atual.
## Contrato mínimo
PilotRequest: sessionId (nonce 8–80), requestId (nonce 8–80), account EVM, chainId canônico, observedAtMs inteiro positivo, block inteiro decimal, balances somente observação (não autoridade de avaliação).
PilotCycle: protocol=gev-wallet-pilot-v1; sessionId/requestId/contextKey/cycleId; maskedAccount e chain; modo simulation; source unavailable/real/fixture; dataVersion/observedAt/validUntil; knownValueUsd nullable; candidates e verdicts; decision/plan nullable; status hold/simulated; reasons; inferenceCostUsd nullable; realizedProfitUsd=null; execution=disabled.
SourceBundle: inventory vinculado à conta solicitada, unidade/cobertura qualificada, versão/hash e provenance explícitos; quoter com unidades qualificadas e custo conhecido; custo de inferência estimado finito separado de faturamento desconhecido. Fontes externas não podem decidir o modo de execução.
O entrypoint default não lê .env nem PRIVATE_KEY/OPERATOR_*; não faz requests externas. Read-only OKX exige opt-in explícito separado. Ausência de contrato de unidades ou custo => hold. Nenhum fallback sintético implícito.
Journal próprio por processo no data/pilot; endereço completo não persistido. Ciclos expirados preservam somente evidência histórica, sem plano ativo na UI.
## Exclusões e evidências
Não introduzir estratégia, scanner de todas as redes, executor live, empréstimo/alavancagem, previsão de lucro exponencial, push, commit, staging ou deploy. Não copiar credenciais/env/WIP.
TDD pela API pública: unavailable hold, full fixture dry-run, identidade, stale/future/incomplete/unknown units/cost, deadline, inválida decisão, troca/atraso/expiração UI. HTTP origins/body/métodos/concurrency. Verificação UI desktop/mobile com serviço próprio; fixtures rotuladas. Revisão readonly independente com SPEC e baseline fixos.
