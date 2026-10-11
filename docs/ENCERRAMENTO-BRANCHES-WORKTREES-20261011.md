# Encerramento de branches e worktrees, 2026-10-11

Base observada: `main` em `f626a30` (worktree `C:/Users/gabri/jev-trader-main`, limpa). Somente refs locais; nenhum fetch, push ou remocao foi feito por este documento.

## Conclusao

Todas as 19 branches locais tem **0 commits proprios** em relacao ao `main`: tudo o que foi commitado ja esta integrado. O que falta para encerrar nao e merge de commits, e sim:

1. trabalho **nao commitado** em cinco worktrees, quatro delas com agente Codex escrevendo agora (processos `codex.exe` ativos, arquivos gravados as 14:46 a 14:49);
2. a remocao fisica de worktrees e branches ja contidas no `main`;
3. a integracao do que foi construido nesta rodada (`feature/jev-trading-desk`, abaixo).

Nada aqui apaga trabalho de agente ativo. Remover uma worktree com agente trabalhando destruiria alteracoes nao commitadas dele.

## Worktrees

| Worktree | Branch ou HEAD | Contida no main | Estado | Disposicao |
| --- | --- | --- | --- | --- |
| `jev-trader-main` | `main` f626a30 | sim | limpa | manter, e a base |
| `jev-trader-desk` | `feature/jev-trading-desk` | a integrar | nesta rodada | integrar no main |
| `jev-trader` (principal) | `feature/jev-command-center` 055a637 | sim | 18 arquivos modificados, 49 nao rastreados, **agente Codex escrevendo** | nao tocar; os diffs de UI e carteira sao identicos aos de `okx-real-integration` |
| `.codex/.../okx-real-integration` | detached 055a637 | sim | 67 itens sujos (`src/real/`, `RealPipeline`, `scripts/real-*.ts`), **agente Codex ativo** | nao tocar; e o trabalho de dados reais da instrucao G01 a G17 |
| `.codex/.../gev-wallet-pilot` | detached f626a30 | sim | `src/pilot/`, `docs/gev-wallet-pilot/`, **agente ativo** | nao tocar |
| `.codex/.../gev-wallet-pilot-ui` | detached f626a30 | sim | idem mais `gev-pilot-client.*`, **agente ativo** | nao tocar |
| `.codex/.../inonu-system-one-safety` | `codex/inonu-system-one-safety` f626a30 | sim, igual ao main | 71 documentos novos, **agente ativo** | nao tocar |
| `jev-trader-r8` | `feature/okx-operator-r8` bd8f78a | sim | 16 arquivos modificados em `src/operator` (inclui `executor.ts`, `config.ts`, `risk-gate.ts`) e `scripts/okx-operator.ts` | **revisar antes de qualquer merge**: codigo proximo de execucao, sem dono identificado |
| `.codex/.../jev-panel-integration` | `codex/jev-panel-integration` 32fbaf8 | sim | limpa, ociosa desde 13:24 | pode remover (decisao sua, e uma worktree do Codex) |
| `.claude/worktrees/agent-a8cd8353a9c2206b8` | `worktree-agent-a8cd8353a9c2206b8` 85141d1 | sim | limpa; so `data/events.jsonl` ignorado (saida de teste unitario, `mid:2`) | pode remover |
| `.claude/worktrees/agent-ac3b992be12068e8d` | `worktree-agent-ac3b992be12068e8d` 667a327 | sim | limpa; idem | pode remover |
| `jev-trader-jev` | `feature/lab-real-jev` bd8f78a | sim | limpa | pode remover |

A remocao automatica destas worktrees foi **negada pelo classificador de permissoes** desta sessao (risco de interferir em outros agentes). Nao foi contornada. Os comandos abaixo sao seguros por construcao: `git worktree remove` sem `--force` recusa se houver qualquer alteracao nao commitada.

```bash
cd /c/Users/gabri/jev-trader-main
git worktree remove "C:/Users/gabri/jev-trader/.claude/worktrees/agent-a8cd8353a9c2206b8"
git worktree remove "C:/Users/gabri/jev-trader/.claude/worktrees/agent-ac3b992be12068e8d"
git worktree remove "C:/Users/gabri/jev-trader-jev"
```

No Windows, o `node_modules` aninhado do SDK da Kuru passa de 260 caracteres e pode interromper a remocao no meio. Se isso acontecer, ative caminhos longos (`git config --system core.longpaths true`) ou apague a pasta `node_modules` da worktree com `cmd /c rmdir /s /q` e rode `git worktree prune`.

## Branches locais, todas com 0 commits proprios

Sem worktree associada (podem ser apagadas com `git branch -d`, que so apaga se estiver integrada ao `main`):

```bash
cd /c/Users/gabri/jev-trader-main
git branch -d codex/inonu-trader-preparation feature/central-ui feature/derivatives-and-live-qualification \
  feature/jev-decision-lab feature/onchainos-data-clients feature/onchainos-inventory feature/policy-envelope \
  hermes/release-v0.0.2 hermes/release-v0.0.2-ready hermes/release-v0.0.2-receipt-safety integration/v0.0.2
```

Depois de remover as worktrees acima: `worktree-agent-a8cd8353a9c2206b8`, `worktree-agent-ac3b992be12068e8d`, `feature/lab-real-jev`, `codex/jev-panel-integration`. Ficam por ultimo, depois que os agentes Codex terminarem: `feature/jev-command-center`, `feature/okx-operator-r8`, `codex/inonu-system-one-safety`. As refs remotas `origin/codex/inonu-trader-ui` e `origin/codex/okx-readonly` ja estao integradas no historico do main e nao precisam de acao.

## O que impede dados reais hoje (achados desta rodada)

1. **Nao havia produtor de decisao real.** O backend na porta 3000 era um servidor de preview do Codex (`local-readonly-preview`, modelo `mock`, `latest:null`). Sem produtor, toda a interface mostra "Indisponivel".
2. **Relogio local 69,5 s atrasado em relacao a OKX** (medido tres vezes, ida e volta de 0,3 s). O gate de frescor rejeita carimbos no futuro, entao mark price e funding viravam `null`, nenhum candidato ficava elegivel e o Jev nunca era consultado. O agente de `okx-real-integration` registrou o mesmo desvio em `CLOCK-EVIDENCE.json` (69569,5 ms) mas nao corrigiu o codigo. Corrigido aqui sem afrouxar o gate (`src/system-one/clock.ts`). Ajustar a hora do Windows e configuracao do sistema e continua recomendado: `w32tm /resync` como administrador.
3. **A decisao de alavancagem do System One continua corretamente em "manter".** Com o relogio corrigido, mark e funding chegam, mas o `main` endureceu a regra: capital configurado nao e patrimonio (`inventory_value_incomplete`). Candidatos so ficam elegiveis com inventario observado, o que depende do fluxo de consentimento da carteira (contrato O5/W7) ou da API Web3 da OKX.
4. **OnchainOS Web3 (cotacao DEX, saldos por API) exige as credenciais** `OKX_WEB3_API_KEY`, `OKX_WEB3_API_SECRET` e `OKX_WEB3_API_PASSPHRASE`, previstas em `data/onchainos.env`. Esse arquivo nao existe e nenhum `.env` do projeto tem variaveis `OKX_*` (verificado so pelos nomes, sem ler valores). Esta bloqueado e a interface diz isso, com o proximo passo, em vez de mostrar dado de exemplo.
5. **Limites reais dos dados publicos da OKX**, medidos ao vivo: o canal `books` envia sempre `checksum: 0` (a integridade do livro vem da cadeia de `seqId`, sem quebras em 49 de 49 atualizacoes), e o livro de 400 niveis alcanca so cerca de 15 a 24 bps de cada lado no BTC-USDT. Janelas de profundidade que o livro nao alcanca ficam `null` na mesa, nunca viram um numero truncado.

## O que esta rodada entregou (branch `feature/jev-trading-desk`)

- `fix(system-one)`: frescor avaliado no relogio corrigido pela OKX.
- `feat(jev-read)`: o Jev real (`jev-1.13.0`) le a fita da OKX e diz comprar, vender ou manter, de forma consultiva. Verificado ao vivo: BTC-USDT vendeu com peso de 0,63 a 0,81, MON-USDT manteve, cerca de 300 ms e 900 tokens por decisao. Nunca assina nem envia; sem dado fresco nao consulta o modelo.
- Mesa de operacoes em tela cheia, sem rolagem, com paineis em 2.5D e 3D (`/mesa`), alimentada pelo WebSocket publico da OKX direto no navegador (sem credencial, funciona tambem no demo da Vercel).

## Decisoes que precisam de voce

1. Aprovar a remocao das tres worktrees limpas do Claude (e, se quiser, `jev-panel-integration`) e a exclusao das branches acima.
2. Revisar as 16 edicoes sujas de `jev-trader-r8` (executor e config do operador) antes de integrar ou descartar.
3. Dizer se o produtor do Jev pode rodar continuamente. Custo medido: cerca de 900 tokens por leitura; a 12 s de intervalo sao 7.200 leituras por dia, cerca de 6,5 milhoes de tokens, ou aproximadamente US$ 0,27 por dia com o `JEV_USD_PER_MTOK=0.042` do projeto. O trader Kuru por bloco (3 decisoes por segundo) e outra ordem de grandeza e nao foi iniciado.
4. Quando os agentes Codex terminarem, integrar `okx-real-integration` (runtime `src/real/`) sobre este main; a UI dele (`RealPipeline`, `page.tsx`) conflita com a nova mesa e precisa de reconciliacao.
