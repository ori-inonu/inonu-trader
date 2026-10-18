# Reconciliação do CLI com lock ocupado — pesquisa independente

**CONFIRMADO:** o CLI real `--reconcile synthetic-held-lock-reconcile closed` modifica um ledger válido enquanto outro processo vivo mantém seu lock. Exit do CLI **0**; critério de rejeição **falhou**, portanto o probe retorna **1**. Nenhuma correção, aprovação de implementação ou qualificação financeira decorre deste resultado.

Origem: `C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader`, HEAD observado antes/depois `ff37327264d904242c57c21c8acb548a05651e82`. Conversa própria `01a12adc-473d-7381-b067-c83af7ccda31`. GPT6.1 Sol/xhigh solicitado; modelo/tier efetivos desconhecidos. O goal completo e M1–M4 permanecem inalterados e incompletos.

**Contrato literal e fontes.** [CLI:128](C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader/scripts/okx-operator.ts:128) abre o ledger antes do lock; linhas132–140 reconciliam e retornam. Linha138 chama `ledger.updateLeg`, linha139 imprime sucesso. [CLI:144](C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader/scripts/okx-operator.ts:144): `const releaseLock = live ? acquireLock(operator.lockPath) : () => {};`. [ledger:178](C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader/src/operator/ledger.ts:178) atualiza a perna e chama `save()`. [ledger:277](C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader/src/operator/ledger.ts:277) usa `openSync(path, "wx")`; linhas281–282 escrevem PID e fecham fd. O lock é propriedade lógica de processo, não um handle mantido aberto.

Hashes SHA256 integrais, idênticos na origem/cópia quando copiados e nas conferências finais:

| Fonte relativa à origem | SHA256 |
|---|---|
| scripts/okx-operator.ts | b7ccf4b784d87df3306e04da79eaae648f8db06abf60843d4e04322fd00103ef |
| src/operator/ledger.ts | 3f56974ea89b86bbf0bea90061d0797463fc5deb1062f772d8cee9f536ee02ab |
| src/operator/config.ts | 1488d245dd30e449c8bdef7472651037ab3b68fd469ddde2f854362a2c4bc3e7 |
| src/operator/ledger.test.ts | 63c8a93e343560c16461e30a891f23b2947ff67b096afc0d59a75dbb5bb3b6a7 |
| docs/research/OPERATOR-CLI-LOCK-PROBE-20261011.md | 33b6cc68d3f39459ef31a66975cbc7acff85893c8859de8432192ea12858ff74 |
| docs/research/OPERATOR-CLI-LOCK-CYCLE-DRAFT-20261011.md | 4530c955690b66823f5984b3b6f1e66be5837f4e5f088cbe68e696463edd337d |

O probe anterior, linhas7–13, relatava somente inicialização; linha23 deixava reconciliação pendente. Seu recibo externo não foi aberto. O draft, linha11, propõe literalmente: “An occupied configured lock prevents initialization and reconciliation from changing the ledger or deleting/replacing another owner's lock. Rejection is a nonzero process result with a clear diagnostic.” Continua proposta, não aceitação de projeto aprovada.

**Experimento.** Artefatos em [operator-cli-lock-reconcile-20261011-aaf75939](./operator-cli-lock-reconcile-20261011-aaf75939/source-manifest.json). Foram copiados 18 arquivos do fechamento de imports e 57 pacotes locais/3810 arquivos regulares; sem links ou instalação. `bufferutil` e `utf-8-validate` opcionais estavam ausentes; o CLI executou com `--no-addons`.

Bun **1.3.14**, revisão `0d9b296af33f2b851fcbf4df3e9ec89751734ba4`; launcher Node **v26.9.0**, Windows. Dois testes efetivamente executados confirmaram a escrita. A confirmação principal está em `trial-strict-allowlist`: ambiente literal de 26 nomes, todos correspondentes aos nomes observados no CLI; perfil/TEMP/APPDATA apontam para fixtures próprias. `MODEL=mock`, `DRY_RUN=true`, `AUTO_DEPOSIT=false`, `OPERATOR_EXECUTE=false`; sem ack, credenciais, endereços, RPC, flags live/Jev/loop. STOP defensivo existe.

Comando exato e ambiente estão no recibo: Bun absoluto com `--no-env-file --no-install --no-addons --config=<fixture>/bunfig.toml --preload=<fixture>/network-guard.ts <cópia>/scripts/okx-operator.ts --reconcile synthetic-held-lock-reconcile closed`. Shell desativado; timeout CLI10s/parent20s. Nenhum ciclo de mercado foi iniciado.

`emptyLedger()` recebeu duas pernas sintéticas completas. `parseLedger` aceitou **antes** da escrita inicial; `readLedgerFile` retornou `ready` antes do CLI, às15:57:02.852Z. PID proprietário **47088** adquiriu o lock pelo helper real e permaneceu vivo antes/depois do subprocesso síncrono. Controle de segunda aquisição rejeitou com o diagnóstico real, sem alterar o lock. CLI durou309.6434ms.

| Observação principal | Antes | Depois, ainda sob propriedade |
|---|---|---|
| Ledger SHA256 | 2959cf2f64b59c7fa75b4e8a6e7aa30ffa114802812044f3003bea03cee9009e | eef25b7aa5c44ef18f17d013c418b616ed44a028b876250f19f63b43a915c9b3 |
| Lock SHA256 | b195c2d6e3e2847512595b45de074b8aa5e4df504bbed239a260f1da429aeb47 | idêntico |
| Perna alvo | reconciliation_required | closed; note manual_reconcile_2026-10-11T15:57:03.144Z |

Stdout UTF8 exato, com LF final:

```text
perna synthetic-held-lock-reconcile (SYNTHETIC_ONLY/SYNTHETIC_ONLY) marcada como closed
```

Stderr: zero bytes. Campos não relacionados, outra perna, state e journal permaneceram iguais. Somente o proprietário liberou seu lock **após** capturar os estados. Fixtures e snapshots foram retidos; nenhuma remoção recursiva.

Recibo principal [receipt.json](./operator-cli-lock-reconcile-20261011-aaf75939/trial-strict-allowlist/receipt.json), SHA256 `07f2a4afad786a98db488c02e2a60f74d1c4818bfaf04e3f8e5b603262288a85`; launcher `7d89564ca9d08d24fc22d7986d6cf59918d1a63cf4e3ee89b537c686d4131e7a`. Scripts: probe `fecfb74aadd666e37059be1da9c6a9cd78fe89c09363559037864dd14e60b954`; guard `8c0513e37ef424a6241c0bbe86f60abdf788d2d8798b31b48215a4b5e67c0953`; launcher `9e517bb9bd62609b9f3b1e1c7e1387130578d081ffa206378fbbf22fee18f451`.

**Limitações e proposta.** O primeiro lançamento não executou o script: `--config` separado produziu exit0 vazio; controles sem imports distinguiram esse comportamento de `--config=...`, que executou. Logs originais foram preservados, sem contar o resultado vazio como sucesso. Bun acrescentou nomes de perfil ao primeiro ambiente mínimo; a confirmação com allowlist explícita eliminou essa lacuna. Guard JS instalado registrou zero tentativas nas APIs cobertas; não constitui sandbox de rede do SO. Não houve chamadas de provedor, inferência, assinatura, ordens, leitura de .env/segredos ou envio a terceiros. Não foram testados escritor simultâneo, branch `failed`, live ou reconciliação onchain.

O seam público existente é parseLedger/readLedgerFile/acquireLock/persister e subprocesso do CLI; ledger.test.ts:75–98 testa o primitivo, não a ordem do CLI. Recomenda-se revisão independente do escopo e aceitação imutável, regressão CLI inicialmente vermelha, depois implementação separada. Alternativas reais: intervalo exclusivo comum a todos os comandos escritores ou intervalo só do ledger com contrato explícito para state/journal; nenhuma escolhida/aprovada aqui.

[terminal-evidence.json](./operator-cli-lock-reconcile-20261011-aaf75939/terminal-evidence.json), SHA256 `901ef584f2533fbf2c509d2d42759ab7eec70e88ad65638c4b7759cad6d1d266`, confirma fontes/dependências, cinco relatórios anteriores, candidate e quatro arquivos concorrentes de UI preservados. A origem continua com essas quatro modificações preexistentes. Pesquisa terminal; não é aprovação de main ou revisão da própria proposta.
