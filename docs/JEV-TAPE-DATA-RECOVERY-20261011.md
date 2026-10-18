# F1–F4: recuperação e baseline verificável

Conversa real: `01a12971-f941-7e42-8a42-fab6d44d4eb5`. Objetivo integral ativo e incompleto; este documento não certifica integração financeira, estratégia lucrativa ou localhost visível.

## Recuperação em 2026-10-11, 21:40 UTC

O turno anterior respondeu ao pedido de instrução de goal, sem progresso de engenharia. Nesta retomada, os comandos `0168d9` e `0326d9` confirmaram o main limpo e a worktree isolada limpa, ambos no commit `14cbb7bd2878eed0a930b324b0c50610be7cdab8`. O inventário observado contém 14 worktrees; preservar os outros checkouts e as alterações concorrentes da raiz. Não executar merge em massa.

Worktree desta entrega: `C:/Users/gabri/.codex/worktrees/inonu-jev-tape-data-f1-f4/jev-trader`; branch `codex/inonu-jev-tape-data-f1-f4`. Harness próprio: research/active, revisão 2, integrador `codex-inonu-jev-tape-data-integrator`; nenhuma SPEC congelada. A entrega anterior F5/F6 possui aceite independente separado e não deve ser reaberta nem ampliada silenciosamente.

## Hashes físicos SHA256 no baseline

| Arquivo | SHA256 |
| --- | --- |
| src/jev-read/feed.ts | 45fb0bfbf02bfc5ae6087644cfa51e8ed8bb3f2ede0adafa1794e2788fa5b97c |
| src/jev-read/state.ts | 189540b55cb6d22cf6e26fded746f931fbba4f87eb83236f855e6743d991ff02 |
| src/jev-read/types.ts | 6a07dedb9e2535e077e6da7a50a788ecef6b7b4efa5dcfe47d614c78496e8d42 |
| src/jev-read/loop.ts | 157ce03527091e2f1a32b5462d476efcdfa6eb236a5732213ccee3c906102f0f |

## Evidência que determina o próximo passo

Leitura direta do feed em `861b9a`: confirmação de subscribe habilita tradesLive; não comprova cobertura contínua de 60 segundos. Callbacks onopen/onmessage/onerror não verificam geração/socket corrente, enquanto onclose verifica identidade. Retenção usa relógio de parede e limite de 5000 registros; descarte por capacidade não preserva evidência de perda na janela relevante. Mensagens de book/ticker renovam recebimento sem exigir timestamp do provedor. Funding permanece escalar sem identidade e instante de observação. Essas observações sustentam investigação e SPEC, não uma implementação já aprovada.

O redator Locke (`01a12ada-91d7-7ce0-b6ea-e1556d234224`) continua pendente: espera específica retornou timeout, não estado terminal. Não reiniciar por timeout. Artefato esperado: `C:/Users/gabri/.codex/worktrees/inonu-system-one-review-standards-20261011/jev-tape-data-f1-f4-spec-v2-20261011.md`. Turing deve revisar a versão efetiva antes do congelamento. Preservar os bytes do probe independente original, a exigência de relógios finais após awaits e os testes contra mascaramento de gates.

Escolha consultiva JEV `5b3822e6-a76e-40ca-9d22-154f48759448`: baseline, confiança 1, modelo jev-1.13.0, 761 tokens de entrada/44 de saída; custo faturado desconhecido. Recibo persistido pelo plugin; autoridade advisory_only. A escolha prioriza registrar baseline e continuar a investigação enquanto o mesmo redator conclui a SPEC, em vez de ampliar integração concorrente. Não representa autorização financeira ou resposta humana.

Revisão independente de Payments recebida: APPROVE apenas da pesquisa/aceitação proposta; relatório `C:/Users/gabri/.codex/worktrees/inonu-system-one-review-spec-20261011/payments-matrix-delta-independent-review-20261011.md`, SHA256 `fedd4bf8ec0ce6fe4408f7a0f2942e28a3ec903eea5f4d542a308d071996d45a`. Correção factual futura deve preservar blocked/T2-A, condicionalidade de gas e disponibilidade de escrow. Não há implementação, teste específico ou qualificação live desta correção.

## Próximo passo e limites

Receber a SPEC v2 pelo mesmo handle, conferir conteúdo/hash, obter revisão independente, confirmar seams pela delegação vigente, congelar critérios e só então executar TDD em slices verticais. Integrador possui feed/state/types/loop e testes correspondentes; read.test.ts apenas migração de fixtures. Sem alterações de comportamento de read.ts/decide.ts, sem fundos, assinatura, aprovações, push ou deploy. Não executar testes repetidos enquanto não houver novo código ou hipótese que justifique execução.

Ainda faltam no objetivo integral: completar as integrações e a economia líquida verificável, avaliações reais pareadas de simulação/shadow, interface, integração revisada das demais entregas elegíveis e verificação visual de localhost. Baseline limpo ou uma revisão limitada não satisfazem esse objetivo.
