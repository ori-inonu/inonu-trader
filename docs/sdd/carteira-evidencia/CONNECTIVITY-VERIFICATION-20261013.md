# Verificação da carteira conectada ao radar

Conversa: `01a136cd-3af3-7361-bd23-c23a6aeece97`. Integrador: `root-audit-01a136cd`. Baseline Git: `c56a3e78102d85a46826a4b5601921970dee432f`, com alterações preexistentes preservadas. Nenhum staging, commit, push ou trade foi realizado nesta entrega.

## Critérios e candidato

Critérios imutáveis: [CONNECTIVITY-SPEC-20261013.md](CONNECTIVITY-SPEC-20261013.md), SHA-256 `1fb32f0a612e25bd6df3080167718b893aaec01123f5a4bb10d9d78e31fb2913`. A aprovação técnica de escopo está em [CONNECTIVITY-SCOPE-REVIEW-20261013.json](CONNECTIVITY-SCOPE-REVIEW-20261013.json); não concede autorização financeira.

Manifesto dos 12 arquivos integrados: `C:/Users/gabri/.codex/tmp/portfolio-connectivity-01a136cd/review-workspace/MANIFEST.json`, SHA-256 `cb048a3722a45f8d8ca8d9340e0751853407530c7f7ea02d100528f5f4b8d6e8`. Revisão executada em cópia isolada pelo agente `settings_review`, diferente dos escritores.

## Comportamento implementado

- Uma única leitura de carteira na doca, com patrimônio e todas as posições antes da consulta Jev. Valor ausente permanece desconhecido.
- Conexão válida e mudança de escopo iniciam uma leitura; atualizar e cancelar permanecem disponíveis. Respostas de identidades anteriores são descartadas.
- Solana atualiza o escopo mostrado sem confundir o alvo da leitura com a rede EVM da extensão. A cobertura EVM permanece declarada, sem alegação de cobertura integral.
- O candidato do radar entra na preparação quando sua rede e o limite de seis ativos permitem. Exclusões e limites têm explicação.
- Consentimento e validade de 60 segundos vinculam a consulta à leitura atual. O modelo não é chamado automaticamente.
- A decisão mostra as evidências utilizadas e as lacunas, sem converter fluxo comprador em probabilidade de lucro ou declarar retorno líquido desconhecido.

## Regressão e execução local

O primeiro parecer encontrou uma regressão EVM: uma notificação de estado sem mudança de identidade invalidava a leitura pendente. Foi reproduzida com o store real e saldo nativo diferido: 20 testes passaram e 1 falhou. A correção observa a revisão já publicada pelo store; após a correção, 33 testes passaram e nenhum falhou. Evidências exatas do auxiliar estão em `C:/Users/gabri/.codex/tmp/portfolio-connectivity-01a136cd/controller-workspace/verification/`.

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| Bun 1.3.14, `--no-env-file test ./src/lib/wallet ./src/lib/inonu/portfolio-solana.test.ts`, em `web/` | 365 passaram, 0 falharam, 2.094 assertions, 24 arquivos, exit 0 | `UI-GREEN3.log`, SHA-256 `a0d5cb066ac51662cca6d6a17851ef31c46afc83e4af03d1f3f009cd6ada5f4c` |
| TypeScript, `tsc --noEmit` | exit 0 | `TYPECHECK3.json`, SHA-256 `9d8263e59e7b6cacdb1a08575380e11d12223a3d48c7dcbdbbaf71314d9997ce` |
| Exportação desktop, `INONU_EXPORT=1`, `INONU_EXPORT_DIR=out-inonu`, `NEXT_PUBLIC_INONU_APP=1` | build exit 0, 8 páginas geradas | `BUILD-DESKTOP3.log`, SHA-256 `fd75ebd762cd5ee5a468491ceddd4bcfb5e4afd19c3e8c8d017f6f4b5f7d9554` |
| Revisor independente, mesmo comando Bun no candidato isolado | 365 passaram, 0 falharam, 2.094 assertions | parecer final independente |

Os arquivos de evidência acima ficam em `C:/Users/gabri/.codex/tmp/portfolio-connectivity-01a136cd/`. A integração RTK/Headroom foi utilizada; o adaptador declarou `command_not_allowlisted`, preservando a saída sem compressão. O build apresentou apenas o aviso não fatal de localStorage experimental sem arquivo configurado.

## Runtime e limite da prova no navegador

O processo Bun em `47321` iniciou antes das alterações atuais no backend e não recarrega módulos automaticamente. Uma tentativa no processo antigo mostrou resposta inválida, sem entrada de consulta de carteira no ledger. Ela não comprova uma resposta do candidato atual.

A revisão automática rejeitou a tentativa de substituir o processo antigo com a razão `blocked by policy`; nenhuma parada foi executada. Foi iniciado um processo local separado, oculto, em **http://127.0.0.1:47322/**, PID `28592`, usando o código atual, o mesmo diretório de dados e o cofre existente. O processo antigo foi preservado.

Em `2026-10-13T21:45:55Z`, `/health` confirmou `ok:true`, versão `0.0.2`, início `1791927325156`; `/inonu/status` confirmou modelo configurado e nenhuma consulta em execução. O ledger contém apenas duas consultas antigas de modo `ativo`, ambas com custo USD desconhecido. Não contém consulta atual de modo `carteira`. Registro sanitizado `RUNTIME-CURRENT.json`, SHA-256 `f30060572eafbf6bc541470cdace4973b5194d4d9608e788aa452811d523dea5`.

A página atual abriu e mostrou a carteira no escopo Solana. O comando Conectar Solana abriu uma confirmação da OKX Wallet. A ferramenta de navegador bloqueou a página `chrome-extension://`; não foi usado outro mecanismo para contornar o bloqueio. Foi solicitada apenas a confirmação humana dessa conexão. A conexão expirou sem resposta. A captura mostra `Não conectada`, `Solana` e o aviso de tempo excedido.

Captura: `C:/Users/gabri/.codex/visualizations/2026/10/13/01a136cd-3af3-7361-bd23-c23a6aeece97/wallet-decisions-pending.png`, SHA-256 `12608d14d39c32a68ef13f371391212ca636cdef3d56075d4ac55250f7dd2ab4`.

**Pendente:** confirmar a conexão na extensão, observar a leitura automática dos cinco ativos no runtime atual, atualizar se necessário e executar uma consulta Jev com a autorização já recebida. A autorização cobre rede Solana, contratos e saldos para TypeSafe/Jev, excluindo endereço, preços e patrimônio. Não repetir uma chamada paga automaticamente, não assinar nem executar ordens. Registrar resultado real, uso e custo conhecido ou `null`. A entrega live completa não é certificada enquanto essa dependência permanecer.

## Cobertura honesta

WAL-01 a WAL-05 possuem evidência de implementação e regressão nos seams públicos. WAL-06 possui testes, TypeScript, exportação desktop e inspeção do estado desconectado atual. A prova de conexão, leitura e resposta Jev no runtime atual continua pendente. Testes sintéticos, fonte revisada e botão preparado não demonstram lucro, ML treinado, cobertura de todas as redes ou operação autônoma.

## Atualização observada no ciclo ABSTENTION, 2026-10-14T00:26Z

O estado desconectado descrito acima é histórico. A página em 47322 foi recarregada com o export atual, conectou Solana e iniciou a leitura automaticamente. `Atualizar carteira` também concluiu no navegador: 14 de 14 ativos, rede Solana e origem OKX OnchainOS pelo servidor local, sem o erro de conexão relatado. Após 60 s, `Atualizar para analisar` apareceu corretamente. Essa observação supera a pendência de conexão e leitura, sem certificar uma consulta nova ao modelo.

Uma exportação intermediária sem `NEXT_PUBLIC_API_URL` vazio havia embutido a origem de fallback 3000. Reexportar com `WEB_EXPORT_ENV` canônico corrigiu a origem servida. O processo 47322 não precisou ser parado. A autorização da consulta anterior já foi utilizada; nenhuma nova consulta privada, assinatura ou ordem foi executada nesta verificação.

O painel, `holdings-session.ts` e seus testes receberam mudanças concorrentes documentadas em [COORDENACAO-CLAUDE-20261013.md](COORDENACAO-CLAUDE-20261013.md), seção 6; por isso o antigo manifesto de 12 arquivos não representa sozinho a árvore atual. Os checks atuais da UI passaram: 658 testes, 3284 asserts, TypeScript e export desktop. Detalhes, hashes, captura e limites estão em [ABSTENTION-VERIFICATION-20261013.md](ABSTENTION-VERIFICATION-20261013.md).
