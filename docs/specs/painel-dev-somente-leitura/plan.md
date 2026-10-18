# Plano: Painel dev somente leitura para o core local

Spec: [spec.md](./spec.md)
Status: aprovado para implementação no escopo escolhido pelo dono

## Desenho

1. Criar handler Next App Router em `web/src/app/api/dev-agent/[...path]/route.dev.ts`, reconhecido somente em dev com extensão condicional `pageExtensions`. O script `web dev` deve bindar `127.0.0.1`; handler verifica `NODE_ENV`, Host loopback esperado, `Sec-Fetch-Site` (se presente, apenas `same-origin`), Origin externa, GET e query vazia/status ou `reviewPage` válido para análise antes de qualquer fetch. Upstream é constante `http://127.0.0.1:3000`; enviar somente `Origin: http://127.0.0.1:3000`, `cache: no-store`, sem redirects, timeout curto; devolver JSON não-cacheável. Erros de rede tornam-se resposta 503 genérica.
2. Adicionar ao core `GET /agent/dev-status`, com contrato mínimo `{ atMs, connected, book }`. A projeção lê só `state.get()`, `managedReadInfo`, `lastBook` e relógio local; inclui qualidade/frescor e totais do livro, mas não posições detalhadas, planos, ledger, credenciais ou configuração. Não chama `status()`, `walletView()`, `refreshAccount()`, CLI, providers, leitura de carteira ou disco.
3. O cliente do agente escolhe `/api/dev-agent` em development, independente de `NEXT_PUBLIC_API_URL`; o painel dev atualiza status e análise separadamente a cada 6 segundos e mostra snapshot desconhecido/indisponível sem preencher zeros.
4. `AgentView` mantém as proteções existentes de não solicitar conexão da extensão, wallet install/login/poll, disconnect ou resolve no modo dev. Em `NODE_ENV=development`, `/configuracoes` continua renderizando nota estática read-only em vez de `SettingsView`.
5. Testar proxy e rota com mocks que provem rejeições antes de fetch e ausência de chamada operacional. Fazer smoke de navegador com fixtures sintéticas interceptadas antes da primeira navegação; falhar diante de writes, chamadas diretas ao core fora do proxy ou origens externas. Não chamar status operacional nem APIs externas, não reiniciar o core e não alterar seu estado.

## Arquivos previstos

1. Novo `web/src/app/api/dev-agent/[...path]/route.dev.ts`, `web/next.config.ts` (excluir extensão `dev.ts` no export), `web/package.json` (bind local) e teste em `web/src/lib/dev-agent-proxy.test.ts`.
2. `src/agent/service.ts`, `src/agent/wire.ts`, `src/agent/http.ts` e testes correspondentes para a projeção segura em memória.
3. `web/src/lib/agent/client.ts`, testes de cliente, `web/src/lib/dev-agent-proxy.ts` e `web/src/components/Agent/DevelopmentReviewView.tsx`.
4. `web/src/components/Agent/AgentView.tsx`, `web/src/components/Hud/HudGate.tsx`, `web/src/components/Hud/HudView.tsx`, `web/src/components/Settings/SettingsView.tsx`, `web/src/app/configuracoes/page.tsx` e estilo HUD existente para modo read-only.
5. Novos arquivos desta especificação em `docs/specs/painel-dev-somente-leitura/`.

Não alterar o core ativo, entrypoints, configuração de risco, dados, credenciais ou arquivos reservados pelas outras worktrees.

## Riscos e mitigação

- Core pode deixar de responder: timeout curto, falha visível no painel, sem tentativa de restart.
- Proxy virar vetor de escrita ou host arbitrário: handler dev-only, origem fixa, path literal, GET estrito, sem forwarding de request.
- Interface parecer interativa apesar do proxy: proteção duplicada no cliente/handlers UI e no servidor; banner e controles inativos.
- Expor dados desnecessários: não proxyar status operacional, ledger nem endpoints de wallet; retorno do dev-status é mínimo, loopback only e sem logging de corpos ou credenciais.

## Verify

- Teste de proxy valida allowlist, query, headers, método, timeout e ausência de fetch em recusas.
- Teste de core exercita a projeção com snapshots sintéticos e espias que falham diante de CLI, provider, refresh, ledger ou I/O.
- `bun run typecheck`, `bun run test`, `bun run test:lab`, `bun run typecheck:all` e `bun run test:all`.
- Smoke visual com respostas sintéticas e interceptação em `127.0.0.1:3001`; não consulta o core ativo nem carrega dados privados. Verificar export estático sem a rota dev.
