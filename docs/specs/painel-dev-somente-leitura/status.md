# Status: Painel dev somente leitura para o core local

- Spec original: aprovada pelo dono para acompanhar o core sem ações.
- Revisão de segurança: a view de desenvolvimento atual é análise-only; não encaminhar `/agent/status`, pois sua montagem pode iniciar refresh/adoption da carteira.
- Implementada projeção `GET /agent/dev-status` estritamente em memória; nenhum snapshot de livro é explicitamente `unavailable` com valores nulos.
- Smoke sintético anterior do painel somente leitura passou; a suíte web atual também passou (3.739 testes, 0 falhas), sem equivaler a validação do dashboard conectado a dados reais.
- Health local observado por `GET http://127.0.0.1:3000/health` em 2026-10-17T02:51:05Z: HTTP 200, `ok=true`, `app=inonu-trader`, `version=0.0.2`, `uptimeMs=128117302`.
- A resposta de health não inclui commit/build ID. A branch atual é `autoresearch/quero-que-voc-crie-m-tricar-e-ciclos-de-melhoria-20261016`, HEAD `c7fd85d`; worktree ainda tem 0 staged, 93 unstaged e 21 untracked. Portanto, o processo responde, mas não é possível provar que serve este HEAD; não houve commit, deploy ou restart nesta tarefa.
- O teste de health é local e não verifica produção. Nenhuma chamada a wallet, credencial, provider, modelo, RPC ou API externa foi feita.
