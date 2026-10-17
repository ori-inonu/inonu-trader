# Tasks: Painel dev somente leitura para o core local

## T1: Handler de proxy dev seguro

- [x] Criar rota App Router com allowlist dev-only, Host loopback esperado e rejeição de Origin externa.
- [ ] Restringir proxy a GET `/agent/dev-status` e `/agent/analysis`, com query limitada e teste de que `/agent/status` não é encaminhado.
- [x] Encaminhar ao upstream constante sem query indevida, corpo, cookies ou headers do cliente; timeout, sem redirect e sem cache. Excluir rota do export estático e bindar dev em loopback.
- [x] Criar testes de permissão/negação e provar ausência de fetch em requests recusadas.

## T2: Projeção segura no core

- [x] Adicionar serviço/endpoint `GET /agent/dev-status` com apenas `atMs`, `connected` e resumo do livro em memória (frescor/qualidade e totais); sem `status()`, `walletView()`, CLI, provider, refresh ou I/O.
- [x] Testar que a projeção lê o snapshot existente, mantém stale/unavailable explícito e nunca aciona interfaces de leitura externa.
- [x] Testar a rota HTTP como GET, sem cache, recusando métodos não-GET e sem chamar `status()`.

## T3: Cliente e interface somente leitura

- [ ] Cliente dev lê o novo endpoint por meio do proxy e parseia o schema restrito.
- [ ] Painel dev mostra o resumo em cache e estados stale/unavailable com polling, sem zerar dado ausente.
- [x] Suprimir conexão de extensão e chamadas de wallet em efeitos automáticos; inibir controles/teclado de escrita na HUD.
- [x] Em dev, bloquear navegação de configurações e renderizar `/configuracoes` inerte, sem montar telas/clientes de settings, OnchainOS, Inonu ou trade.
- [x] Cobrir client e regras de read-only em testes focados.

## T4: Smoke e gates

- [ ] Validar painel no browser usando fixture sintética interceptada antes da navegação; nenhuma consulta ao status operacional, escrita, provider ou origem externa.
- [ ] Verificar que o export estático não inclui o proxy e executar os gates raiz e web.
- [ ] Atualizar o status só com evidência observada.
