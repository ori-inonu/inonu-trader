# Proposta do próximo ciclo: confiabilidade do gateway de leitura

Proposta `backend-read-reliability-20261013`, dentro do objetivo de revisar e corrigir integrações OKX Web3/Onchain OS. Não autoriza tráfego externo, pagamentos, negociação ou mudança de política financeira.

Fontes: achados OKX-01, OKX-02 e OKX-03 em `OKX-AUDIT.md`, D-c/ONC-4 da SPEC existente de configuração Onchain e contrato do cliente. Fontes client/budget/gateway conferidas contra o snapshot; nenhuma alteração nesses caminhos nas outras duas worktrees no momento da consulta. As áreas `src/onchainos`, configuração, operador, web e aprendizado em outra worktree continuam reservadas.

Entrega mínima: testes de regressão e correções apenas em `src/onchain-read/client.ts`, `client.test.ts`, `gateway.ts` e `gateway.test.ts`. O contador mensal e seu histórico não são reescritos. O gateway serializa admissão e contabilização de cada líder, após coalescing, para aplicar o teto quando despacha. O cliente revalida bloqueios na fila e mantém o deadline durante a leitura completa do corpo. Garantia de admissão local por instância de gateway, sem alegação de coordenação entre processos.

Critérios propostos para congelar no próximo ciclo:

- OR-01: teto basic=1, três chaves concorrentes, no máximo um envio; seguidores recusados ou stale; chamada enviada que falha conta uma vez, não enviada não conta, coalescing conta uma vez.
- OR-02: 429/50011 cria cooldown global e 402 bloqueia só a camada; seguidores já enfileirados são recusados antes do envio, com `sent=false`; credenciais são lidas no despacho e recuperação continua após vencimento.
- OR-03: prazo cobre fetch e corpo, inclusive 401/403 e transporte fake que ignora abort; caller termina com erro fechado e fila progride; corpo tardio não altera status, cache ou sucesso; nenhum erro assíncrono sem tratamento.
- OR-04: preservar normalização, assinatura, ajuste de relógio, cache stale e teto de usuário/background; testes offline de gateway/cliente/HTTP e typecheck pertinentes, revisão independente e integração por hash.

Jev executado: recibo `0020a147-f0f4-4e66-8bd5-d7bb4ea59315`, modelo `jev-1.13.0`, entrada 753 e saída 120 tokens, custo faturado desconhecido. Recomendações reais `serial_gateway` (confiança 1) e `refuse_at_dispatch` (0.8), `approved_by=jev_delegated`, sem resposta humana nem autoridade adicional.

Fora desta entrega: OKX-04 requer combinar prazo total do coletor com cancelamento efetivo no transporte reservado `src/onchainos`; quatro falhas do recorder/rotulagem seguem para a worktree de aprendizado que já altera `src/outcomes`. Registrar dependências com caminho e evidência, sem sobrepor proprietários. Nenhuma destas exclusões enfraquece a especificação original nem certifica o ecossistema como concluído.
